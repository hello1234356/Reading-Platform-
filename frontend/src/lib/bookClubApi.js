import { requireSupabase } from "./supabase";
import { getPublicDisplayName } from "./identity";
import { requireModeratedContent } from "./moderationApi";
import { getPreferredGoogleBooksCoverUrl } from "./googleBooks";

function cleanTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return [
    ...new Set(
      tags
        .map((tag) => String(tag).trim())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

function getInternalBookId(book) {
  return book?.bookId || book?.id || "";
}

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function getProviderIdentity(book, normalizedIsbn = "") {
  if (book?.source === "google_books" && book.googleBooksId) {
    return {
      source: "google_books",
      externalId: String(book.googleBooksId),
    };
  }

  if (book?.source === "open_library") {
    const externalId = book.openLibraryKey || book.editionKey || "";

    if (externalId) {
      return {
        source: "open_library",
        externalId: String(externalId),
      };
    }
  }

  if (book?.source === "isbn_work" && normalizedIsbn) {
    return {
      source: "isbn_work",
      externalId: normalizedIsbn,
    };
  }

  return null;
}

function mapMember(row) {
  return {
    userId: row.user_id,
    joinedAt: row.joined_at,
    name: getPublicDisplayName(row.profiles),
    avatarUrl: row.profiles?.avatar_url || "",
  };
}

function mapClub(row, currentUserId = null) {
  const members = Array.isArray(row.club_members)
    ? row.club_members.map(mapMember)
    : [];

  const joined = currentUserId
    ? members.some(
        (member) =>
          String(member.userId) === String(currentUserId),
      )
    : false;

  return {
    id: row.id,
    bookId: row.book_id,
    creatorId: row.creator_id,

    title: row.title || "",
    description: row.description || "",
    duration: row.duration || "",
    membersWanted: Number(row.members_wanted ?? 0),
    lastActivityAt:
      row.last_activity_at ||
      row.updated_at ||
      row.created_at,
    archivedAt: row.archived_at || null,
    archivedReason: row.archived_reason || "",

    tags: Array.isArray(row.tags) ? row.tags : [],
    customCoverUrl: row.cover_url || "",

    bookTitle: row.books?.title || "Untitled",
    author: row.books?.author || "Unknown author",
    isbn: row.books?.isbn || "",
    bookCoverUrl: getPreferredGoogleBooksCoverUrl(
      row.books?.cover_url,
      row.books?.isbn,
    ),

    coverUrl: getPreferredGoogleBooksCoverUrl(
      row.cover_url || row.books?.cover_url,
      row.books?.isbn,
    ),

    creatorName: getPublicDisplayName(row.creator_profile),
    creatorAvatarUrl:
      row.creator_profile?.avatar_url || "",

    members,
    memberCount: members.length,
    isJoined: joined,
    isCreator: currentUserId
      ? String(row.creator_id) === String(currentUserId)
      : false,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScheduleStage(row) {
  return {
    id: row.id,
    clubId: row.club_id,
    position: Number(row.position),
    title: row.title || "",
    chapters: row.chapters || "",
    description: row.description || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClubPost(row) {
  return {
    id: row.id,
    clubId: row.club_id,
    userId: row.user_id,
    message: row.message || "",
    authorName: getPublicDisplayName(row.profiles),
    authorAvatarUrl: row.profiles?.avatar_url || "",
    createdAt: row.created_at,
  };
}

const CLUB_SELECT = `
  id,
  book_id,
  creator_id,
  title,
  description,
  duration,
  members_wanted,
  tags,
  cover_url,
  last_activity_at,
  archived_at,
  archived_reason,
  created_at,
  updated_at,

  books!book_clubs_book_id_fkey (
    id,
    title,
    author,
    isbn,
    cover_url
  ),

  creator_profile:profiles!book_clubs_creator_id_fkey (
    id,
    full_name,
    username,
    avatar_url
  ),

  club_members (
    user_id,
    joined_at,

    profiles!club_members_user_id_fkey (
      id,
      full_name,
      username,
      avatar_url
    )
  )
`;

const SCHEDULE_SELECT = `
  id,
  club_id,
  position,
  title,
  chapters,
  description,
  created_at,
  updated_at
`;

const CLUB_POST_SELECT = `
  id,
  club_id,
  user_id,
  message,
  created_at,

  profiles!club_posts_user_id_fkey (
    id,
    full_name,
    username,
    avatar_url
  )
`;

export async function getBookClubs(
  currentUserId = null,
) {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("book_clubs")
    .select(CLUB_SELECT)
    .is("archived_at", null)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  return (data || []).map((row) =>
    mapClub(row, currentUserId),
  );
}

export async function getBookClubById({
  clubId,
  currentUserId = null,
}) {
  if (!clubId) {
    throw new Error("The club ID is missing.");
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("book_clubs")
    .select(CLUB_SELECT)
    .eq("id", clubId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapClub(data, currentUserId);
}

async function findOrCreateBook(selectedBook) {
  const supabase = requireSupabase();
  const internalBookId = getInternalBookId(selectedBook);
  const isbn = normalizeIsbn(selectedBook?.isbn);
  const providerIdentity = getProviderIdentity(selectedBook, isbn);

  if (internalBookId) {
    const { data: existingBookById, error: searchByIdError } =
      await supabase
        .from("books")
        .select("id, title, author, isbn, cover_url")
        .eq("id", internalBookId)
        .maybeSingle();

    if (searchByIdError) {
      throw searchByIdError;
    }

    if (existingBookById) {
      return existingBookById;
    }
  }

  if (providerIdentity) {
    const { data: existingBookByProvider, error: searchByProviderError } =
      await supabase
        .from("books")
        .select("id, title, author, isbn, cover_url, source, external_id")
        .eq("source", providerIdentity.source)
        .eq("external_id", providerIdentity.externalId)
        .maybeSingle();

    if (searchByProviderError) {
      throw searchByProviderError;
    }

    if (existingBookByProvider) {
      return existingBookByProvider;
    }
  }

  if (isbn) {
    const { data: existingBook, error: searchError } = await supabase
      .from("books")
      .select("id, title, author, isbn, cover_url")
      .eq("isbn", isbn)
      .maybeSingle();

    if (searchError) {
      throw searchError;
    }

    if (existingBook) {
      return existingBook;
    }
  }

  if (!providerIdentity && !isbn) {
    throw new Error(
      "This book is not in LitShelf yet and has no stable provider identity or ISBN. Choose another edition for now.",
    );
  }

  if (!providerIdentity) {
    throw new Error(
      "This ISBN-only book is not in LitShelf yet. Add it from a supported provider result first.",
    );
  }

  const { data: createdBook, error: insertError } = await supabase.rpc(
    "materialize_approved_book",
    { p_source: providerIdentity.source, p_external_id: providerIdentity.externalId },
  );
  if (insertError) throw insertError;
  return createdBook;
}

export async function createBookClub({
  userId,
  selectedBook,
  title,
  description,
  duration,
  membersWanted,
  tags = [],
  coverUrl = null,
  schedule = [],
}) {
  if (!userId) {
    throw new Error(
      "You must be logged in to create a club.",
    );
  }

  const cleanedTitle = title?.trim();
  const cleanedDescription = description?.trim();
  const cleanedDuration = duration?.trim();
  const numericMembersWanted = Number(membersWanted);

  if (!cleanedTitle) {
    throw new Error("Please enter a club name.");
  }

  if (!cleanedDescription) {
    throw new Error(
      "Please enter a club description.",
    );
  }

  if (!cleanedDuration) {
    throw new Error(
      "Please enter the club duration.",
    );
  }

  if (
    !Number.isInteger(numericMembersWanted) ||
    numericMembersWanted < 1
  ) {
    throw new Error(
      "The desired member count must be at least 1.",
    );
  }

  const supabase = requireSupabase();
  const book = await findOrCreateBook(selectedBook);
  const { data: createdClub, error: clubError } =
    await supabase
      .from("book_clubs")
      .insert({
        book_id: book.id,
        creator_id: userId,
        title: cleanedTitle,
        description: cleanedDescription,
        duration: cleanedDuration,
        members_wanted: numericMembersWanted,
        tags: cleanTags(tags),
        cover_url: coverUrl || null,
      })
      .select(CLUB_SELECT)
      .single();

  if (clubError) {
    throw clubError;
  }

  const { error: membershipError } = await supabase
    .from("club_members")
    .insert({
      club_id: createdClub.id,
      user_id: userId,
    });

  if (membershipError) {
    await supabase
      .from("book_clubs")
      .delete()
      .eq("id", createdClub.id);

    throw membershipError;
  }

  const scheduleRows = schedule
    .map((stage, index) => ({
      club_id: createdClub.id,
      position: index + 1,
      title:
        stage.title?.trim() ||
        `Stage ${index + 1}`,
      chapters:
        stage.chapters?.trim() || null,
      description:
        stage.description?.trim() || null,
    }))
    .filter(
      (stage) =>
        stage.title ||
        stage.chapters ||
        stage.description,
    );

  if (scheduleRows.length > 0) {
    const { error: scheduleError } =
      await supabase
        .from("club_schedule")
        .insert(scheduleRows);

    if (scheduleError) {
      await supabase
        .from("book_clubs")
        .delete()
        .eq("id", createdClub.id);

      throw scheduleError;
    }
  }

  return getBookClubById({
    clubId: createdClub.id,
    currentUserId: userId,
  });
}

export async function joinBookClub({
  clubId,
  userId,
}) {
  if (!clubId) {
    throw new Error("The club ID is missing.");
  }

  if (!userId) {
    throw new Error(
      "You must be logged in to join a club.",
    );
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("club_members")
    .upsert(
      {
        club_id: clubId,
        user_id: userId,
      },
      {
        onConflict: "club_id,user_id",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    throw error;
  }
}

export async function recordClubActivity({
  clubId,
  userId,
  eventType,
}) {
  if (!clubId || !userId || !eventType) {
    return;
  }

  const supabase = requireSupabase();

  const { error } = await supabase.rpc(
    "record_club_activity",
    {
      target_club_id: clubId,
      target_user_id: userId,
      target_event_type: eventType,
    },
  );

  if (error) {
    throw error;
  }
}

export async function archiveInactiveBookClubs(inactiveDays = 7) {
  const supabase = requireSupabase();

  const { data, error } = await supabase.rpc(
    "archive_inactive_book_clubs",
    {
      inactive_days: inactiveDays,
    },
  );

  if (error) {
    throw error;
  }

  return Number(data) || 0;
}

export async function leaveBookClub({
  clubId,
  userId,
}) {
  if (!clubId || !userId) {
    throw new Error(
      "The club or user is missing.",
    );
  }

  const supabase = requireSupabase();

  const { data: club, error: clubError } =
    await supabase
      .from("book_clubs")
      .select("creator_id")
      .eq("id", clubId)
      .maybeSingle();

  if (clubError) {
    throw clubError;
  }

  if (
    club &&
    String(club.creator_id) === String(userId)
  ) {
    throw new Error(
      "The club host cannot leave their own club. Delete the club instead.",
    );
  }

  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function deleteBookClub({
  clubId,
  userId,
}) {
  if (!clubId || !userId) {
    throw new Error(
      "The club or user is missing.",
    );
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("book_clubs")
    .delete()
    .eq("id", clubId)
    .eq("creator_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "Only the club host can delete this club.",
    );
  }
}

export async function updateBookClub({
  clubId,
  userId,
  title,
  description,
  duration,
  membersWanted,
  tags = [],
  coverUrl = null,
}) {
  if (!clubId || !userId) {
    throw new Error(
      "The club or user is missing.",
    );
  }

  const cleanedTitle = title?.trim();
  const cleanedDescription = description?.trim();
  const cleanedDuration = duration?.trim();
  const numericMembersWanted = Number(membersWanted);

  if (!cleanedTitle) {
    throw new Error("Please enter a club name.");
  }

  if (!cleanedDescription) {
    throw new Error(
      "Please enter a club description.",
    );
  }

  if (!cleanedDuration) {
    throw new Error(
      "Please enter the club duration.",
    );
  }

  if (
    !Number.isInteger(numericMembersWanted) ||
    numericMembersWanted < 1
  ) {
    throw new Error(
      "The desired member count must be at least 1.",
    );
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("book_clubs")
    .update({
      title: cleanedTitle,
      description: cleanedDescription,
      duration: cleanedDuration,
      members_wanted: numericMembersWanted,
      tags: cleanTags(tags),
      cover_url: coverUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clubId)
    .eq("creator_id", userId)
    .select(CLUB_SELECT)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "Only the club host can edit this club.",
    );
  }

  return mapClub(data, userId);
}

export async function getClubSchedule(clubId) {
  if (!clubId) {
    throw new Error("The club ID is missing.");
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("club_schedule")
    .select(SCHEDULE_SELECT)
    .eq("club_id", clubId)
    .order("position", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data || []).map(mapScheduleStage);
}

export async function replaceClubSchedule({
  clubId,
  userId,
  stages,
}) {
    if (!userId) {
  throw new Error(
    "You must be logged in to edit the schedule.",
  );
}
  if (!clubId) {
    throw new Error("The club ID is missing.");
  }

  if (!Array.isArray(stages)) {
    throw new Error(
      "The schedule must be an array.",
    );
  }

  const supabase = requireSupabase();
  const { data: club, error: clubError } =
    await supabase
        .from("book_clubs")
        .select("creator_id")
        .eq("id", clubId)
        .maybeSingle();

    if (clubError) {
    throw clubError;
    }

    if (
    !club ||
    String(club.creator_id) !== String(userId)
    ) {
    throw new Error(
        "Only the club host can edit the schedule.",
    );
    }

  const { error: deleteError } = await supabase
    .from("club_schedule")
    .delete()
    .eq("club_id", clubId);

  if (deleteError) {
    throw deleteError;
  }

  const rows = stages
    .map((stage, index) => ({
      club_id: clubId,
      position: index + 1,
      title:
        stage.title?.trim() ||
        `Stage ${index + 1}`,
      chapters:
        stage.chapters?.trim() || null,
      description:
        stage.description?.trim() || null,
    }))
    .filter(
      (stage) =>
        stage.title ||
        stage.chapters ||
        stage.description,
    );

  if (rows.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("club_schedule")
    .insert(rows)
    .select(SCHEDULE_SELECT)
    .order("position", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data || []).map(mapScheduleStage);
}

export async function getClubPosts(clubId) {
  if (!clubId) {
    throw new Error("The club ID is missing.");
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("club_posts")
    .select(CLUB_POST_SELECT)
    .eq("club_id", clubId)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data || []).map(mapClubPost);
}

export async function createClubPost({
  clubId,
  userId,
  message,
  allowModerationWarning = false,
}) {
  if (!clubId) {
    throw new Error("The club ID is missing.");
  }

  if (!userId) {
    throw new Error(
      "You must be logged in to post.",
    );
  }

  const moderation = await requireModeratedContent({
    text: message,
    contextType: "club_message",
    allowWarningOverride: allowModerationWarning,
  });

  const cleanedMessage = moderation.approvedText;
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("club_posts")
    .insert({
      club_id: clubId,
      user_id: userId,
      message: cleanedMessage,
    })
    .select(CLUB_POST_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapClubPost(data);
}

export async function reportClubMessageModeration({
  clubId,
  postId,
  userId,
  originalMessage,
  filteredMessage,
  matchedTerms,
  severity,
  strikeCount,
}) {
  if (!clubId || !postId || !userId) {
    return;
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("club_message_moderation_reports")
    .insert({
      club_id: clubId,
      post_id: postId,
      user_id: userId,
      original_message: originalMessage,
      filtered_message: filteredMessage,
      matched_terms: matchedTerms,
      severity,
      strike_count: strikeCount,
    });

  if (error) {
    throw error;
  }
}

export async function deleteClubPost({
  postId,
  userId,
}) {
  if (!postId || !userId) {
    throw new Error(
      "The post or user is missing.",
    );
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("club_posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

import { requireSupabase } from "./supabase";

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

function getProfileName(profile) {
  return (
    profile?.full_name?.trim() ||
    profile?.username?.trim() ||
    "Tsinglan Reader"
  );
}

function mapMember(row) {
  return {
    userId: row.user_id,
    joinedAt: row.joined_at,
    name: getProfileName(row.profiles),
    username: row.profiles?.username || "",
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

    tags: Array.isArray(row.tags) ? row.tags : [],
    customCoverUrl: row.cover_url || "",

    bookTitle: row.books?.title || "Untitled",
    author: row.books?.author || "Unknown author",
    isbn: row.books?.isbn || "",
    bookCoverUrl: row.books?.cover_url || "",

    coverUrl:
      row.cover_url ||
      row.books?.cover_url ||
      "",

    creatorName: getProfileName(row.creator_profile),
    creatorUsername:
      row.creator_profile?.username || "",
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
    authorName: getProfileName(row.profiles),
    authorUsername: row.profiles?.username || "",
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
  if (!selectedBook?.isbn) {
    throw new Error("Please select an ISBN-backed book.");
  }

  const supabase = requireSupabase();
  const isbn = String(selectedBook.isbn).trim();

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

  const { data: createdBook, error: insertError } = await supabase
    .from("books")
    .insert({
      title: selectedBook.title?.trim() || "Untitled",
      author: selectedBook.author?.trim() || "Unknown author",
      isbn,
      cover_url: selectedBook.coverUrl || null,
    })
    .select("id, title, author, isbn, cover_url")
    .single();

  if (insertError) {
    throw insertError;
  }

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
}) {
  if (!clubId) {
    throw new Error("The club ID is missing.");
  }

  if (!userId) {
    throw new Error(
      "You must be logged in to post.",
    );
  }

  const cleanedMessage = message?.trim();

  if (!cleanedMessage) {
    throw new Error(
      "Please write a message first.",
    );
  }

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
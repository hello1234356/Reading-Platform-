function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export const BLOCKED_BOOK_CATEGORY_MESSAGE =
  "This book category is currently unavailable. Stay tuned for future updates.";

const blockedCategoryPatterns = [
  /\b(?:world|american|british|chinese|european|asian|african|ancient|medieval|modern|military|social|cultural|oral)\s+histor(?:y|ies|ical|ically)\b/i,
  /\bhistor(?:y|ies|ical|ically|ian|ians|iography|iographies|iographic|ic|icism)\b/i,
  /\b(?:dynast(?:y|ies)|empire|imperial|colonial|colonialism|postcolonial|revolution|revolutionary|civil\s+war|cold\s+war|world\s+war|warfare|battle|battles|soldier|military|army|navy|air\s+force|holocaust|genocide|occupation|invasion|treaty|archive|archives|archaeology|ancient\s+civilization)\b/i,
  /\b(?:politic(?:s|al|ally|ian|ians|ized|ised|ization|isation)?|geopolitic(?:s|al|ally)?|government|governmental|governance|civics?|statecraft|diplomacy|diplomatic|diplomats?|propaganda|ideology|ideologies|ideological|ideologically|election(?:s|eering)?|campaign|campaigns|policy|policies|public\s+policy|law|legal|constitution|constitutional|constitutionally|legislation|legislative|legislator|legislators|parliament|parliamentary|congress|congressional|senate|senatorial|democracy|democratic|democratically|republican|communis[mt]|communist|socialis[mt]|socialist|capitalis[mt]|capitalist|marxis[mt]|marxist|mao(?:ism|ist)?|lenin(?:ism|ist)?|fascis[mt]|fascist|authoritarian|authoritarianism|totalitarian|totalitarianism|nationalis[mt]|nationalist|activis[mt]|activist|human\s+rights|civil\s+rights|foreign\s+relations|international\s+relations|political\s+science)\b/i,
  /\b(?:religion|religions|religious|spirituality|spiritual|theology|theological|scripture|scriptures|sacred|faith|faiths|worship|church|temple|mosque|synagogue|cathedral|monastery|prayer|sermon|clergy|priest|pastor|rabbi|imam|monk|nun|saint|saints|missionary|missions|mythology|mythological|creationism)\b/i,
  /\b(?:christian(?:ity)?|catholic(?:ism)?|protestant(?:ism)?|orthodox\s+church|evangelical|mormon(?:ism)?|islam(?:ic)?|muslim|judaism|jewish|buddh(?:a|ism|ist)|hindu(?:ism)?|sikh(?:ism)?|tao(?:ism|ist)|dao(?:ism|ist)|confucian(?:ism)?|shinto(?:ism)?|pagan(?:ism)?|wicca|bible|biblical(?:ly)?|gospels?|quran(?:ic)?|koran(?:ic)?|torah|talmud(?:ic)?|hadith|sutras?|vedas?|bhagavad\s+gita|karma|nirvana)\b/i,
  /\b(?:biograph(?:y|ies|ical)|autobiograph(?:y|ies|ical)|memoir|memoirs|true\s+story|current\s+affairs|social\s+science|sociology|anthropology|economics|public\s+affairs|non[-\s]?fiction|nonfiction)\b/i,
  /\/subjects?\/[^/]*(?:histor|politic|government|religio|theolog|war|military|biograph|memoir|nonfiction)[^/]*/i,
];

export function isBlockedOpenLibraryCategoryText(text) {
  const normalizedText = String(text || "").trim();

  if (!normalizedText) {
    return false;
  }

  return blockedCategoryPatterns.some((pattern) =>
    pattern.test(normalizedText),
  );
}

export function isBlockedOpenLibraryResult(result) {
  const searchableText = [
    result?.title,
    ...(result?.author_name || []),
    ...(result?.publisher || []),
    ...(result?.subject || []),
    ...(result?.subject_facet || []),
    ...(result?.person || []),
    ...(result?.place || []),
    ...(result?.time || []),
    ...(result?.lcc || []),
    ...(result?.ddc || []),
    ...(result?.ia_collection_s || []),
    ...(result?.seed || []),
  ].join(" ");

  return isBlockedOpenLibraryCategoryText(searchableText);
}

export function filterOpenLibraryResults(results = []) {
  const allowedResults = [];
  let blockedCount = 0;

  results.forEach((result) => {
    if (isBlockedOpenLibraryResult(result)) {
      blockedCount += 1;
      return;
    }

    allowedResults.push(result);
  });

  return {
    allowedResults,
    blockedCount,
  };
}

function normalizeDescription(description) {
  if (!description) return "";
  if (typeof description === "string") return description;
  return description.value || "";
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Open Library could not load this book.");
  }

  return response.json();
}

async function fetchWorkFromEdition(isbn) {
  const normalizedIsbn = normalizeIsbn(isbn);

  if (!normalizedIsbn) return null;

  const edition = await fetchJson(
    `https://openlibrary.org/isbn/${encodeURIComponent(normalizedIsbn)}.json`,
  );
  const workKey = edition.works?.[0]?.key;

  if (!workKey) {
    return {
      title: edition.title,
      description: normalizeDescription(edition.description),
      coverUrl: edition.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg`
        : "",
    };
  }

  const work = await fetchJson(`https://openlibrary.org${workKey}.json`);

  return {
    title: work.title || edition.title,
    description:
      normalizeDescription(work.description) ||
      normalizeDescription(edition.description),
    coverUrl: work.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg`
      : edition.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg`
        : "",
  };
}

async function fetchWorkFromKey(openLibraryKey) {
  if (!openLibraryKey) return null;

  const normalizedKey = openLibraryKey.startsWith("/")
    ? openLibraryKey
    : `/${openLibraryKey}`;
  const data = await fetchJson(`https://openlibrary.org${normalizedKey}.json`);

  return {
    title: data.title,
    description: normalizeDescription(data.description),
    coverUrl: data.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
      : "",
  };
}

export async function getOpenLibraryBookDetails(book) {
  const baseDetails = {
    title: book?.title || "Untitled",
    author: book?.author || "Unknown author",
    isbn: book?.isbn || "",
    coverUrl: book?.coverUrl || "",
    description: book?.description || "",
  };

  try {
    const openLibraryDetails = book?.isbn
      ? await fetchWorkFromEdition(book.isbn)
      : await fetchWorkFromKey(book?.openLibraryKey);

    if (!openLibraryDetails) return baseDetails;

    return {
      ...baseDetails,
      title: openLibraryDetails.title || baseDetails.title,
      coverUrl: openLibraryDetails.coverUrl || baseDetails.coverUrl,
      description:
        openLibraryDetails.description ||
        baseDetails.description ||
        "Open Library does not have an official description for this edition yet.",
    };
  } catch (error) {
    return {
      ...baseDetails,
      error: error.message || "Open Library could not load this book.",
      description:
        baseDetails.description ||
        "Open Library does not have an official description for this edition yet.",
    };
  }
}

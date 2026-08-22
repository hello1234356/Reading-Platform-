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
];

export function isBlockedGoogleBooksCategoryText(text) {
  const normalizedText = String(text || "").trim();
  return normalizedText
    ? blockedCategoryPatterns.some((pattern) => pattern.test(normalizedText))
    : false;
}

export function isBlockedGoogleBooksResult(result) {
  const info = result?.volumeInfo || {};
  return isBlockedGoogleBooksCategoryText([
    info.title,
    info.subtitle,
    ...(info.authors || []),
    info.publisher,
    ...(info.categories || []),
    info.description,
  ].join(" "));
}

export function filterGoogleBooksResults(results = []) {
  const allowedResults = [];
  let blockedCount = 0;

  results.forEach((result) => {
    if (isBlockedGoogleBooksResult(result)) blockedCount += 1;
    else allowedResults.push(result);
  });

  return { allowedResults, blockedCount };
}

function getApiKey() {
  return import.meta.env.VITE_GOOGLE_BOOKS_API_KEY?.trim() || "";
}

function withApiKey(url) {
  const key = getApiKey();
  if (key) url.searchParams.set("key", key);
  return url;
}

async function throwGoogleBooksError(response) {
  let apiMessage = "";

  try {
    const body = await response.json();
    apiMessage = body?.error?.message || "";
  } catch {
    // The status code still gives us enough information for a useful error.
  }

  if (response.status === 429) {
    throw new Error(
      "Google Books search quota is unavailable. Add a Google Books API key to VITE_GOOGLE_BOOKS_API_KEY or check that key's quota.",
    );
  }

  if (response.status === 400 || response.status === 403) {
    throw new Error(
      apiMessage || "Google Books rejected the API key. Check its API and website restrictions.",
    );
  }

  throw new Error(apiMessage || "Google Books could not complete the request.");
}

function secureImageUrl(url = "") {
  return url.replace(/^http:/, "https:");
}

const bookLookupCache = new Map();

function normalizeDescription(description = "") {
  const value = String(description).trim();
  if (!value) return "";

  const withParagraphBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n");

  if (typeof DOMParser === "undefined") {
    return withParagraphBreaks
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }

  const document = new DOMParser().parseFromString(withParagraphBreaks, "text/html");
  return (document.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getGoogleBooksCoverUrl(isbn, zoom = 2) {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!normalizedIsbn) return "";
  return `https://books.google.com/books/content?id=ISBN${encodeURIComponent(normalizedIsbn)}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
}

export function getPreferredGoogleBooksCoverUrl(coverUrl, isbn, zoom = 2) {
  const storedCoverUrl = String(coverUrl || "").trim();

  if (storedCoverUrl) {
    return secureImageUrl(storedCoverUrl);
  }

  return getGoogleBooksCoverUrl(isbn, zoom);
}

export function mapGoogleBooksResult(result) {
  const info = result?.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const isbn =
    identifiers.find(({ type }) => type === "ISBN_13")?.identifier ||
    identifiers.find(({ type }) => type === "ISBN_10")?.identifier ||
    "";

  return {
    googleBooksId: result?.id || "",
    isbn: normalizeIsbn(isbn),
    title: info.title || "Untitled",
    author: info.authors?.join(", ") || "Unknown author",
    firstPublished: info.publishedDate?.slice(0, 4) || null,
    coverUrl: secureImageUrl(
      info.imageLinks?.thumbnail ||
      info.imageLinks?.smallThumbnail ||
      getGoogleBooksCoverUrl(isbn),
    ),
    description: normalizeDescription(info.description),
  };
}

function detectSearchLanguage(searchTerm) {
  const query = String(searchTerm || "").trim();

  // An ISBN identifies an edition, so a language restriction could hide the
  // exact book the user selected.
  if (!query || /^isbn:/i.test(query)) return "";

  if (/[぀-ヿ]/u.test(query)) return "ja";
  if (/[가-힯]/u.test(query)) return "ko";
  if (/[一-鿿]/u.test(query)) return "zh";
  if (/[Ѐ-ӿ]/u.test(query)) return "ru";
  if (/[؀-ۿ]/u.test(query)) return "ar";
  if (/[֐-׿]/u.test(query)) return "he";
  if (/[Ͱ-Ͽ]/u.test(query)) return "el";
  if (/[฀-๿]/u.test(query)) return "th";
  if (/[ऀ-ॿ]/u.test(query)) return "hi";
  if (/[äöüß]/iu.test(query)) return "de";
  if (/[ñ¿¡]/iu.test(query)) return "es";
  if (/[ãõ]/iu.test(query)) return "pt";
  if (/[àâæçéèêëîïôœùûüÿ]/iu.test(query)) return "fr";

  // Plain Latin book searches in this app are usually English. Queries with
  // clear markers for another language are handled above.
  if (/^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u.test(query)) return "en";

  return "";
}

export async function searchGoogleBooks(searchTerm, maxResults = 20) {
  if (!getApiKey()) {
    throw new Error(
      "Google Books search needs an API key. Add VITE_GOOGLE_BOOKS_API_KEY to frontend/.env.local, then restart the app.",
    );
  }

  const url = withApiKey(new URL("https://www.googleapis.com/books/v1/volumes"));
  const searchLanguage = detectSearchLanguage(searchTerm);
  url.searchParams.set("q", searchTerm);
  url.searchParams.set("printType", "books");
  if (searchLanguage) url.searchParams.set("langRestrict", searchLanguage);
  url.searchParams.set("maxResults", String(maxResults));

  const response = await fetch(url);
  if (!response.ok) await throwGoogleBooksError(response);
  const data = await response.json();
  return data.items || [];
}

async function fetchGoogleBook(book) {
  const lookupKey = book?.googleBooksId
    ? `volume:${book.googleBooksId}`
    : book?.isbn
      ? `isbn:${normalizeIsbn(book.isbn)}`
      : "";

  if (lookupKey && bookLookupCache.has(lookupKey)) {
    return bookLookupCache.get(lookupKey);
  }

  const lookup = fetchGoogleBookWithoutCache(book);

  if (lookupKey) {
    bookLookupCache.set(lookupKey, lookup);
    lookup.catch(() => bookLookupCache.delete(lookupKey));
  }

  return lookup;
}

async function fetchGoogleBookWithoutCache(book) {
  if (book?.googleBooksId) {
    const url = withApiKey(new URL(
      `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(book.googleBooksId)}`,
    ));
    const response = await fetch(url);
    if (!response.ok) await throwGoogleBooksError(response);
    return response.json();
  }

  if (book?.isbn) {
    const results = await searchGoogleBooks(`isbn:${normalizeIsbn(book.isbn)}`, 1);
    return results[0] || null;
  }

  return null;
}

export async function getGoogleBooksBookDetails(book) {
  const baseDetails = {
    title: book?.title || "Untitled",
    author: book?.author || "Unknown author",
    isbn: book?.isbn || "",
    coverUrl: getPreferredGoogleBooksCoverUrl(
      book?.coverUrl,
      book?.isbn,
    ),
    description: book?.description || "",
    googleBooksId: book?.googleBooksId || "",
  };

  try {
    const result = await fetchGoogleBook(book);
    if (!result) return baseDetails;
    const details = mapGoogleBooksResult(result);
    return {
      ...baseDetails,
      title: details.title || baseDetails.title,
      author: details.author || baseDetails.author,
      isbn: details.isbn || baseDetails.isbn,
      googleBooksId: details.googleBooksId || baseDetails.googleBooksId,
      coverUrl: details.coverUrl || baseDetails.coverUrl,
      description: details.description || baseDetails.description ||
        "Google Books does not have an official description for this edition yet.",
    };
  } catch (error) {
    return {
      ...baseDetails,
      error: error.message || "Google Books could not load this book.",
      description: baseDetails.description ||
        "Google Books does not have an official description for this edition yet.",
    };
  }
}

export async function enrichBooksWithGoogleBooks(books = []) {
  return Promise.all(
    books.map(async (book) => {
      if (!book?.isbn && !book?.googleBooksId) return book;

      const details = await getGoogleBooksBookDetails(book);
      return {
        ...book,
        googleBooksId: details.googleBooksId || book.googleBooksId || "",
        title: details.title || book.title,
        author: details.author || book.author,
        coverUrl: details.coverUrl || book.coverUrl || "",
        description: details.description || book.description || "",
      };
    }),
  );
}

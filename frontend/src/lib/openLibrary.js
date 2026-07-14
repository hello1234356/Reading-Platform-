function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
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

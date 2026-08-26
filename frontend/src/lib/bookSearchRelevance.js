const INTENT_PREFIX = /^(?:books?|novels?|stories)\s+(?:about|on)\b/i;

export function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTitleForComparison(value = "") {
  return normalizeSearchText(value)
    .replace(/^(the|a|an)\s+/i, "")
    .trim();
}

export function isTitleLikeSearch(query = "") {
  const normalized = normalizeSearchText(query);
  return Boolean(normalized) && !INTENT_PREFIX.test(normalized) &&
    !/^(?:author|inauthor|subject|isbn)\s*:/i.test(normalized) &&
    normalized.split(" ").length <= 7;
}

export function scoreBookSearchResult(query, book = {}) {
  const normalizedQuery = normalizeSearchText(query);
  const title = normalizeSearchText(book.title || book.book);
  const author = normalizeSearchText(
    book.author || book.authors?.join(" ")
  );

  if (!normalizedQuery || !title) return 0;

  const comparisonQuery = normalizeTitleForComparison(normalizedQuery);
  const comparisonTitle = normalizeTitleForComparison(title);

  const tokens = comparisonQuery.split(" ").filter(Boolean);
  const titleTokens = new Set(comparisonTitle.split(" "));
  const authorTokens = new Set(author.split(" "));

  const allTitleTokens = tokens.every((token) =>
    titleTokens.has(token)
  );

  const allCombinedTokens = tokens.every(
    (token) =>
      titleTokens.has(token) || authorTokens.has(token)
  );

  let score = 0;

  // Title relevance
  if (comparisonTitle === comparisonQuery) {
    score = 1000;
  } else if (comparisonTitle.startsWith(`${comparisonQuery} `)) {
    score = 900;
  } else if (comparisonTitle.includes(comparisonQuery)) {
    score = 850;
  } else if (allTitleTokens) {
    score = 750;
  } else if (
    author === normalizedQuery ||
    author.includes(normalizedQuery)
  ) {
    score = 650;
  } else if (allCombinedTokens) {
    score = 500;
  } else {
    const titleMatches = tokens.filter((token) =>
      titleTokens.has(token)
    ).length;

    const authorMatches = tokens.filter((token) =>
      authorTokens.has(token)
    ).length;

    score =
      Math.round((titleMatches / tokens.length) * 300) +
      Math.round((authorMatches / tokens.length) * 100);
  }

  return score;
}

function scoreBookMetadataQuality(book = {}) {
  let score = 0;

  const rawAuthor = String(
    book.author || book.authors?.join(" ") || ""
  ).trim();

  const hasRealAuthor =
    rawAuthor &&
    !/^unknown author$/i.test(rawAuthor);

  if (hasRealAuthor) score += 80;
  else score -= 120;

  if (book.coverUrl) score += 25;
  if (book.isbn) score += 15;
  if (book.publisher) score += 10;
  if (book.description) score += 20;

  return score;
}

export function rankBookSearchResults(query, results = [], limit = 20) {
  const titleLike = isTitleLikeSearch(query);

  return results
    .map((book, providerIndex) => ({
      book,
      providerIndex,
      relevanceScore: scoreBookSearchResult(query, book),
      metadataScore: scoreBookMetadataQuality(book),
    }))
    .filter(({ relevanceScore }) =>
      !titleLike || relevanceScore >= 300
    )
    .sort((left, right) =>
      right.relevanceScore - left.relevanceScore ||
      right.metadataScore - left.metadataScore ||
      left.providerIndex - right.providerIndex
    )
    .slice(0, limit)
    .map(({ book, relevanceScore, providerIndex }) => ({
      ...book,
      searchRelevanceScore: relevanceScore,
      providerRank: providerIndex,
    }));
}

export function createLatestRequestGate() {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    isCurrent(requestGeneration) {
      return requestGeneration === generation;
    },
  };
}

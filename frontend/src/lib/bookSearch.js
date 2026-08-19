import {
  filterGoogleBooksResults,
  mapGoogleBooksResult,
  searchGoogleBooks,
} from "./googleBooks";
import { isLikelyIsbn, searchIsbnWorkBooks } from "./isbnWorkBooks";

export function isChineseBookSearch(searchTerm) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(
    String(searchTerm || ""),
  );
}

export async function searchBooksByQueryLanguage(searchTerm, limit = 20) {
  if (isChineseBookSearch(searchTerm) || isLikelyIsbn(searchTerm)) {
    const isbnWorkResults = await searchIsbnWorkBooks(searchTerm, limit);
    if (isbnWorkResults.results.length > 0 || isChineseBookSearch(searchTerm)) {
      return isbnWorkResults;
    }
  }

  const googleResults = await searchGoogleBooks(searchTerm, limit);
  const { allowedResults, blockedCount } =
    filterGoogleBooksResults(googleResults);
  return {
    results: allowedResults.map((result) => ({
      ...mapGoogleBooksResult(result),
      source: "google_books",
    })),
    blockedCount,
  };
}

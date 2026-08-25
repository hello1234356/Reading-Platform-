export function detectSearchLanguage(searchTerm) {
  const query = String(searchTerm || "").trim();
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
  if (/^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u.test(query)) return "en";
  return "";
}

export function buildGoogleBooksSearchUrl(searchTerm, maxResults = 20, apiKey = "") {
  const searchLanguage = detectSearchLanguage(searchTerm);
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  const normalizedApiKey = String(apiKey || "").trim();
  if (normalizedApiKey) url.searchParams.set("key", normalizedApiKey);
  url.searchParams.set("q", String(searchTerm || "").trim());
  url.searchParams.set("printType", "books");
  if (searchLanguage) url.searchParams.set("langRestrict", searchLanguage);
  url.searchParams.set("maxResults", String(maxResults));
  return url;
}

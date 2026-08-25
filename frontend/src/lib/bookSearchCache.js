import { requireSupabase } from "./supabase.js";

const memoryCache = new Map();
const inFlightSearches = new Map();

export function clearBookSearchMemoryCache() {
  memoryCache.clear();
  inFlightSearches.clear();
}

export function normalizeBookSearchQuery(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

function getCacheKey(provider, normalizedQuery) {
  return `${provider}:${normalizedQuery}`;
}

function normalizeCachedPayload(payload, limit) {
  const results = Array.isArray(payload?.results)
    ? payload.results.slice(0, limit)
    : [];

  return {
    results,
    blockedCount: Number(payload?.blockedCount) || 0,
  };
}

export async function readSharedBookSearchCache(provider, searchTerm, limit = 20) {
  const normalizedQuery = normalizeBookSearchQuery(searchTerm);
  if (!normalizedQuery) return null;

  const cacheKey = getCacheKey(provider, normalizedQuery);
  const memoryEntry = memoryCache.get(cacheKey);

  if (memoryEntry?.expiresAt > Date.now()) {
    return normalizeCachedPayload(memoryEntry.payload, limit);
  }

  if (memoryEntry) memoryCache.delete(cacheKey);

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("book_search_cache")
    .select("result_json, expires_at")
    .eq("provider", provider)
    .eq("normalized_query", normalizedQuery)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const payload = normalizeCachedPayload(data.result_json, 20);
  memoryCache.set(cacheKey, {
    payload,
    expiresAt: new Date(data.expires_at).getTime(),
  });

  return normalizeCachedPayload(payload, limit);
}

export async function writeSharedBookSearchCache(
  provider,
  searchTerm,
  payload,
) {
  const normalizedQuery = normalizeBookSearchQuery(searchTerm);
  if (!normalizedQuery) return null;

  const normalizedPayload = normalizeCachedPayload(payload, 20);
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("cache_book_search", {
    p_normalized_query: normalizedQuery,
    p_provider: provider,
    p_result_json: normalizedPayload,
  });

  if (error) throw error;

  const cacheKey = getCacheKey(provider, normalizedQuery);
  const expiresAt = new Date(data?.expires_at || 0).getTime();
  memoryCache.set(cacheKey, {
    payload: normalizedPayload,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > Date.now()
      ? expiresAt
      : Date.now() + 5 * 60 * 1000,
  });

  return data;
}

export function getOrCreateProviderSearch(provider, searchTerm, factory) {
  const normalizedQuery = normalizeBookSearchQuery(searchTerm);
  const cacheKey = getCacheKey(provider, normalizedQuery);

  if (inFlightSearches.has(cacheKey)) {
    return inFlightSearches.get(cacheKey);
  }

  const request = Promise.resolve().then(factory);
  inFlightSearches.set(cacheKey, request);
  const clearInFlight = () => {
    if (inFlightSearches.get(cacheKey) === request) {
      inFlightSearches.delete(cacheKey);
    }
  };
  void request.then(clearInFlight, clearInFlight);

  return request;
}

export async function searchWithSharedCache({
  provider,
  searchTerm,
  limit = 20,
  fetchResults,
  readCache = readSharedBookSearchCache,
  writeCache = writeSharedBookSearchCache,
  bypassProviderCache = false,
  onCacheDiagnostic = () => {},
}) {
  const executeSearch = async () => {
    if (!bypassProviderCache) {
      try {
        const cached = await readCache(provider, searchTerm, limit);
        if (cached) {
          onCacheDiagnostic({ provider, query: normalizeBookSearchQuery(searchTerm),
            cacheHit: true, resultCount: cached.results.length,
            actualProviderFetchPerformed: false });
          return { ...cached, cacheHit: true, actualProviderFetchPerformed: false };
        }
      } catch (error) {
        console.error("Shared book search cache read failed:", error);
      }
    }

    let fetched;
    try {
      fetched = await fetchResults();
    } catch (error) {
      onCacheDiagnostic({ provider, query: normalizeBookSearchQuery(searchTerm),
        cacheHit: false, resultCount: 0,
        actualProviderFetchPerformed: error?.actualProviderFetchPerformed !== false,
        bypassProviderCache });
      throw error;
    }
    const payload = normalizeCachedPayload(fetched, limit);
    onCacheDiagnostic({ provider, query: normalizeBookSearchQuery(searchTerm),
      cacheHit: false, resultCount: payload.results.length,
      actualProviderFetchPerformed: true, bypassProviderCache });

    try {
      await writeCache(provider, searchTerm, payload);
    } catch (error) {
      // Anonymous users and temporary cache failures must not break search.
      console.error("Shared book search cache write failed:", error);
    }

    return { ...payload, cacheHit: false, actualProviderFetchPerformed: true };
  };

  return bypassProviderCache
    ? executeSearch()
    : getOrCreateProviderSearch(provider, searchTerm, executeSearch);
}

export async function searchGoogleWithQuotaFallback({
  searchGoogle,
  searchOpenLibrary,
  isQuotaError,
  onFallback = () => {},
}) {
  try {
    return await searchGoogle();
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    onFallback(error);
    return searchOpenLibrary();
  }
}

export async function searchCatalogAndExternal({ searchCatalog, searchExternal, mergeResults }) {
  const catalog = await searchCatalog();
  const external = await searchExternal();
  return {
    results: mergeResults(external.results, catalog.results),
    blockedCount: external.blockedCount || 0,
    catalog,
    external,
  };
}

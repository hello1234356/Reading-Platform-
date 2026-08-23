export async function searchGoogleWithQuotaFallback({
  searchGoogle,
  searchOpenLibrary,
  isQuotaError,
}) {
  try {
    return await searchGoogle();
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    return searchOpenLibrary();
  }
}

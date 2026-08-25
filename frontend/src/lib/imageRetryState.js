export function getNextImageErrorState(src, attempts) {
  const nextAttempts = Number(attempts) + 1;
  return {
    src,
    attempts: nextAttempts,
    failed: nextAttempts >= 2,
    finalFailure: nextAttempts >= 2,
  };
}

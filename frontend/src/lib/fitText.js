export function findLargestFittingFontSize({ minSize, maxSize, wrapMinSize = minSize, fits }) {
  const minimum = Math.max(1, Math.floor(Number(minSize) || 1));
  const maximum = Math.max(minimum, Math.floor(Number(maxSize) || minimum));
  if (!fits(minimum)) {
    const wrapMinimum = Math.max(1, Math.min(minimum, Math.floor(Number(wrapMinSize) || minimum)));
    let wrapSize = minimum;
    while (wrapSize > wrapMinimum && !fits(wrapSize, 2)) wrapSize -= 1;
    return { fontSize: wrapSize, needsWrap: true };
  }

  let low = minimum;
  let high = maximum;
  let best = minimum;
  while (low <= high) {
    const candidate = Math.floor((low + high) / 2);
    if (fits(candidate, 1)) {
      best = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }
  return { fontSize: best, needsWrap: false };
}

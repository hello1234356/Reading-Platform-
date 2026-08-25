export function getNotificationPanelHeight(
  panelTop,
  viewportBottom,
  safeMargin = 12,
  maximumHeight = 560,
) {
  const availableHeight = Math.max(0, Math.floor(viewportBottom - panelTop - safeMargin));
  return Math.min(maximumHeight, availableHeight);
}

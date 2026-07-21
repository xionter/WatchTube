export function normalizePickerSearchQuery(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase();
}

export function matchesPlaylistSearch(playlist, query) {
  if (!query) {
    return true;
  }

  return (
    matchesPickerSearchTitle(playlist.title, query) ||
    matchesPickerSearchId(playlist.playlistId, query)
  );
}

export function matchesPickerSearchTitle(value, query) {
  if (!query) {
    return true;
  }

  const normalizedTitle = String(value || "").toLocaleLowerCase();
  const words = normalizedTitle.match(/[\p{L}\p{N}]+/gu) || [];
  const queryWords = query.match(/[\p{L}\p{N}]+/gu) || [];

  return queryWords.every((queryWord) =>
    words.some((word) => word.startsWith(queryWord)),
  );
}

export function matchesPickerSearchId(value, query) {
  return (
    !query ||
    String(value || "")
      .toLocaleLowerCase()
      .startsWith(query)
  );
}

export function shouldShowSubscriptionsInPicker(query) {
  return matchesPickerSearchTitle("subscriptions", query);
}

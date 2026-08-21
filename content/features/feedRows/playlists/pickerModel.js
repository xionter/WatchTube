import * as constants from "../../../core/constants.js";

import {
  matchesPlaylistSearch,
  normalizePickerSearchQuery,
  shouldShowSubscriptionsInPicker,
} from "./search.js";

export function buildPlaylistPickerModel({
  availablePlaylists,
  settings,
  query,
}) {
  const normalizedQuery = normalizePickerSearchQuery(query);
  const storedPlaylistsById = getStoredPlaylistsById(settings.playlists);
  const items = [];

  if (shouldShowSubscriptionsInPicker(normalizedQuery)) {
    items.push({
      type: "subscriptions",
      title: "Subscriptions",
      state: settings.showSubscriptions ? "enabled" : "disabled",
      stateText: settings.showSubscriptions ? "Enabled" : "Disabled",
      enabled: settings.showSubscriptions,
    });
  }

  for (const playlist of availablePlaylists) {
    if (!matchesPlaylistSearch(playlist, normalizedQuery)) {
      continue;
    }

    const storedPlaylist = storedPlaylistsById.get(playlist.playlistId);
    const isEnabled = Boolean(storedPlaylist?.enabled);
    const isStored = Boolean(storedPlaylist);

    items.push({
      type: "playlist",
      playlistId: playlist.playlistId,
      title: playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
      state: isEnabled ? "enabled" : isStored ? "disabled" : "new",
      stateText: isEnabled ? "Enabled" : isStored ? "Disabled" : "",
      isEnabled,
      isStored,
    });
  }

  return {
    query: normalizedQuery,
    items,
    emptyText: items.length
      ? ""
      : normalizedQuery
        ? "No matching playlists."
        : "No playlists found.",
  };
}

function getStoredPlaylistsById(playlists) {
  const storedPlaylistsById = new Map();

  for (const playlist of playlists) {
    if (
      playlist?.playlistId &&
      !storedPlaylistsById.has(playlist.playlistId)
    ) {
      storedPlaylistsById.set(playlist.playlistId, playlist);
    }
  }

  return storedPlaylistsById;
}

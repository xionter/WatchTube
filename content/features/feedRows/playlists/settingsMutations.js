import * as constants from "../../../core/constants.js";
import * as settingsStore from "../../../core/settings.js";

export function hasEnabledPlaylist(settings, playlistId) {
  return settings.playlists.some(
    (playlist) => playlist.playlistId === playlistId && playlist.enabled,
  );
}

export function addOrEnablePlaylist(settings, { playlistId, title }) {
  const playlist = settingsStore.createPlaylist({
    playlistId,
    title,
    enabled: true,
  });
  const existingPlaylist = settings.playlists.find(
    (entry) => entry.playlistId === playlistId,
  );
  const playlistRowId = settingsStore.getPlaylistRowId(playlist.playlistId);
  const playlists = existingPlaylist
    ? settings.playlists.map((entry) =>
        entry.playlistId === playlistId
          ? {
              ...entry,
              title,
              enabled: true,
            }
          : entry,
      )
    : [...settings.playlists, playlist];

  return {
    ...settings,
    playlists,
    rowOrder: appendRowId(settings.rowOrder, playlistRowId),
  };
}

export function setPlaylistEnabled(settings, { playlistId, enabled }) {
  const playlistRowId = settingsStore.getPlaylistRowId(playlistId);

  return {
    ...settings,
    playlists: settings.playlists.map((playlist) =>
      playlist.playlistId === playlistId
        ? {
            ...playlist,
            enabled,
          }
        : playlist,
    ),
    rowOrder: appendRowId(settings.rowOrder, playlistRowId),
  };
}

export function setSubscriptionsEnabled(settings, enabled) {
  return {
    ...settings,
    showSubscriptions: enabled,
    rowOrder: appendRowId(settings.rowOrder, constants.SUBSCRIPTIONS_ROW_ID),
  };
}

function appendRowId(rowOrder, rowId) {
  return rowOrder.includes(rowId) ? rowOrder : [...rowOrder, rowId];
}

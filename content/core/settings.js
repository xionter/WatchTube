import * as constants from "./constants.js";

export async function readSettings() {
  const stored = await chrome.storage.local.get(constants.SETTINGS_KEY);

  return normalizeSettings(stored[constants.SETTINGS_KEY]);
}

export async function writeSettings(settings) {
  const normalized = normalizeSettings(settings);

  await chrome.storage.local.set({
    [constants.SETTINGS_KEY]: normalized,
  });

  return normalized;
}

export function normalizeSettings(rawSettings = {}) {
  const settings = isObject(rawSettings) ? rawSettings : {};

  return {
    darkTheme: readBooleanSetting(
      settings.darkTheme,
      constants.DEFAULT_SETTINGS.darkTheme,
    ),
    showSubscriptions: readBooleanSetting(
      settings.showSubscriptions,
      constants.DEFAULT_SETTINGS.showSubscriptions,
    ),
    hideShorts: readBooleanSetting(
      settings.hideShorts,
      constants.DEFAULT_SETTINGS.hideShorts,
    ),
    playlists: normalizePlaylists(settings),
  };
}

export function createPlaylist({
  playlistId,
  title = constants.DEFAULT_PLAYLIST_TITLE,
  enabled = true,
} = {}) {
  const normalizedPlaylistId = String(playlistId || "").trim();

  if (!normalizedPlaylistId) {
    return null;
  }

  return {
    id: normalizedPlaylistId,
    playlistId: normalizedPlaylistId,
    title: normalizePlaylistTitle(title),
    url: buildPlaylistUrl(normalizedPlaylistId),
    enabled: Boolean(enabled),
  };
}

export function extractPlaylistId(value) {
  const input = String(value || "").trim();

  if (!input) {
    return "";
  }

  const urlCandidates = [input, normalizeUrlCandidate(input)];

  for (const candidate of urlCandidates) {
    if (!candidate) {
      continue;
    }

    try {
      const url = new URL(candidate);
      const playlistId = url.searchParams.get("list")?.trim() || "";

      if (playlistId) {
        return playlistId;
      }
    } catch {}
  }

  const matchedPlaylistId = input.match(/(?:^|[?&])list=([^&]+)/)?.[1] || "";

  return decodePlaylistId(matchedPlaylistId);
}

export function buildPlaylistUrl(playlistId) {
  return `${constants.PLAYLIST_URL}?list=${encodeURIComponent(playlistId)}`;
}

function normalizePlaylists(settings) {
  if (Array.isArray(settings.playlists)) {
    return dedupePlaylists(settings.playlists.map(normalizePlaylist).filter(Boolean));
  }

  return [
    createPlaylist({
      playlistId: constants.WATCH_LATER_PLAYLIST_ID,
      title: constants.WATCH_LATER_TITLE,
      enabled: settings.showWatchLater !== false,
    }),
  ];
}

function normalizePlaylist(playlist) {
  if (!isObject(playlist)) {
    return null;
  }

  return createPlaylist({
    playlistId: playlist.playlistId || playlist.id,
    title: playlist.title,
    enabled: playlist.enabled !== false,
  });
}

function dedupePlaylists(playlists) {
  const seenPlaylistIds = new Set();
  const deduped = [];

  for (const playlist of playlists) {
    if (!playlist || seenPlaylistIds.has(playlist.playlistId)) {
      continue;
    }

    seenPlaylistIds.add(playlist.playlistId);
    deduped.push(playlist);
  }

  return deduped;
}

function normalizePlaylistTitle(title) {
  return String(title || "").trim() || constants.DEFAULT_PLAYLIST_TITLE;
}

function readBooleanSetting(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeUrlCandidate(input) {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }

  if (input.startsWith("/")) {
    return `https://www.youtube.com${input}`;
  }

  if (input.startsWith("www.youtube.com")) {
    return `https://${input}`;
  }

  return "";
}

function decodePlaylistId(value) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return String(value || "").trim();
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

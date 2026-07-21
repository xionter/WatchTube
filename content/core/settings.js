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
  const playlists = normalizePlaylists(settings);

  return {
    enabled: readBooleanSetting(
      settings.enabled,
      constants.DEFAULT_SETTINGS.enabled,
    ),
    darkTheme: readBooleanSetting(
      settings.darkTheme,
      constants.DEFAULT_SETTINGS.darkTheme,
    ),
    showSubscriptions: readBooleanSetting(
      settings.showSubscriptions,
      constants.DEFAULT_SETTINGS.showSubscriptions,
    ),
    subscriptionsUnwatchedOnly: readBooleanSetting(
      settings.subscriptionsUnwatchedOnly,
      constants.DEFAULT_SETTINGS.subscriptionsUnwatchedOnly,
    ),
    hideShorts: readBooleanSetting(
      settings.hideShorts,
      constants.DEFAULT_SETTINGS.hideShorts,
    ),
    playlists,
    rowOrder: normalizeRowOrder(settings, playlists),
  };
}

export function createPlaylist({
  playlistId,
  title = constants.DEFAULT_PLAYLIST_TITLE,
  enabled = true,
  unwatchedOnly = true,
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
    unwatchedOnly: Boolean(unwatchedOnly),
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

  if (matchedPlaylistId) {
    return decodePlaylistId(matchedPlaylistId);
  }

  if (isStandalonePlaylistId(input)) {
    return input;
  }

  return "";
}

export function buildPlaylistUrl(playlistId) {
  return `${constants.PLAYLIST_URL}?list=${encodeURIComponent(playlistId)}`;
}

export function getPlaylistRowId(playlistId) {
  return `${constants.PLAYLIST_ROW_PREFIX}${playlistId}`;
}

export function getPlaylistIdFromRowId(rowId) {
  const value = String(rowId || "");

  return value.startsWith(constants.PLAYLIST_ROW_PREFIX)
    ? value.slice(constants.PLAYLIST_ROW_PREFIX.length)
    : "";
}

function normalizePlaylists(settings) {
  if (Array.isArray(settings.playlists)) {
    return dedupePlaylists(
      settings.playlists.map(normalizePlaylist).filter(Boolean),
    );
  }

  return [
    createPlaylist({
      playlistId: constants.WATCH_LATER_PLAYLIST_ID,
      title: constants.WATCH_LATER_TITLE,
      enabled: settings.showWatchLater !== false,
      unwatchedOnly: true,
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
    unwatchedOnly: playlist.unwatchedOnly !== false,
  });
}

function normalizeRowOrder(settings, playlists) {
  const validRowIds = new Set([
    ...playlists.map((playlist) => getPlaylistRowId(playlist.playlistId)),
    constants.SUBSCRIPTIONS_ROW_ID,
  ]);
  const rowOrder = [];

  if (Array.isArray(settings.rowOrder)) {
    for (const rowId of settings.rowOrder) {
      const normalizedRowId = String(rowId || "").trim();

      if (
        !validRowIds.has(normalizedRowId) ||
        rowOrder.includes(normalizedRowId)
      ) {
        continue;
      }

      rowOrder.push(normalizedRowId);
    }
  }

  for (const playlist of playlists) {
    const rowId = getPlaylistRowId(playlist.playlistId);

    if (!rowOrder.includes(rowId)) {
      rowOrder.push(rowId);
    }
  }

  if (!rowOrder.includes(constants.SUBSCRIPTIONS_ROW_ID)) {
    rowOrder.push(constants.SUBSCRIPTIONS_ROW_ID);
  }

  return rowOrder;
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

function isStandalonePlaylistId(value) {
  return /^(LL|WL|FL|RD[A-Za-z0-9_-]*|UU[A-Za-z0-9_-]{20,}|PL[A-Za-z0-9_-]{10,}|OLAK5uy[A-Za-z0-9_-]+)$/.test(
    value,
  );
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

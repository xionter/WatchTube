import * as constants from "../../../core/constants.js";
import * as api from "./api.js";

export async function readSettings() {
  const stored = await chrome.storage.local.get(constants.SETTINGS_KEY);

  return {
    ...constants.DEFAULT_SETTINGS,
    ...(stored[constants.SETTINGS_KEY] || {}),
  };
}

export async function getWatchLaterVideos() {
  const now = Date.now();
  const stored = await chrome.storage.local.get(constants.CACHE_KEY);
  const cache = stored[constants.CACHE_KEY];

  if (
    cache &&
    cache.version === constants.CACHE_VERSION &&
    Array.isArray(cache.items) &&
    cache.items.length &&
    now - cache.updatedAt < constants.CACHE_TTL_MS
  ) {
    return cache.items;
  }

  try {
    const items = await api.fetchWatchLater();

    await chrome.storage.local.set({
      [constants.CACHE_KEY]: {
        version: constants.CACHE_VERSION,
        items,
        updatedAt: now,
      },
    });

    return items;
  } catch (error) {
    console.warn("WatchTube: failed to refresh Watch Later", error);

    return cache && Array.isArray(cache.items) ? cache.items : [];
  }
}

import * as constants from "../../../core/constants.js";
import * as api from "./api.js";
import * as cache from "../../../core/cache.js";
import * as account from "../../../core/account.js";

export async function readSettings() {
  const stored = await chrome.storage.local.get(constants.SETTINGS_KEY);

  return {
    ...constants.DEFAULT_SETTINGS,
    ...(stored[constants.SETTINGS_KEY] || {}),
  };
}

export async function getWatchLaterVideos() {
  if (!account.isSignedIn()) {
    return [];
  }

  return cache.getCached({
    key: cache.buildAccountCacheKey(constants.CACHE_KEY),
    ttl: constants.CACHE_TTL_MS,
    version: constants.CACHE_VERSION,
    fetcher: api.fetchWatchLater,
  });
}

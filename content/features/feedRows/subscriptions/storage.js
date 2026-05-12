import * as constants from "../../../core/constants.js";
import * as api from "./api.js";

const CACHE_KEY = "watchTubeSubscriptionsCache";

export async function getSubscriptionVideos() {
  const now = Date.now();

  const stored = await chrome.storage.local.get(CACHE_KEY);

  const cache = stored[CACHE_KEY];

  if (
    cache &&
    Array.isArray(cache.items) &&
    cache.items.length &&
    now - cache.updatedAt < constants.CACHE_TTL_MS
  ) {
    return cache.items;
  }

  try {
    const items = await api.fetchSubscriptionVideos();

    await chrome.storage.local.set({
      [CACHE_KEY]: {
        items,
        updatedAt: now,
      },
    });

    return items;
  } catch (error) {
    console.warn("WatchTube: failed to refresh subscriptions", error);

    return cache?.items || [];
  }
}

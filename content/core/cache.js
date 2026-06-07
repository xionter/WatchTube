import * as account from "./account.js";

export function buildAccountCacheKey(prefix) {
  return `${prefix}:${account.getCurrentAccountKey()}`;
}

export async function getCached({ key, ttl, version, fetcher, force = false }) {
  const now = Date.now();

  const stored = await chrome.storage.local.get(key);

  const cache = stored[key];

  const isValid =
    !force &&
    cache &&
    Array.isArray(cache.items) &&
    now - cache.updatedAt < ttl &&
    cache.version === version;

  if (isValid) {
    return cache.items;
  }

  try {
    const items = await fetcher();

    await chrome.storage.local.set({
      [key]: {
        version,
        items,
        updatedAt: now,
      },
    });

    return items;
  } catch (error) {
    console.warn("WatchTube: failed to refresh cached feed data", error);

    return cache?.version === version ? cache?.items || [] : [];
  }
}

import * as account from "./account.js";

export function buildAccountCacheKey(prefix) {
  return `${prefix}:${account.getCurrentAccountKey()}`;
}

export async function getCached({ key, ttl, version, fetcher }) {
  const now = Date.now();

  const stored = await chrome.storage.local.get(key);

  const cache = stored[key];

  const isValid =
    cache &&
    Array.isArray(cache.items) &&
    cache.items.length &&
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
    return cache?.items || [];
  }
}

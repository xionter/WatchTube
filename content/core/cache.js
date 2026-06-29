import * as account from "./account.js";

export function buildAccountCacheKey(prefix) {
  return `${prefix}:${account.getCurrentAccountKey()}`;
}

export function buildScopedAccountCacheKey(prefix, scope) {
  return `${prefix}:${account.getCurrentAccountKey()}:${encodeURIComponent(String(scope))}`;
}

export async function getCached({
  key,
  ttl,
  version,
  fetcher,
  force = false,
  fallbackValue = [],
}) {
  const now = Date.now();

  const stored = await chrome.storage.local.get(key);

  const cache = stored[key];
  const isCacheRecord = Boolean(cache) && typeof cache === "object";

  const isValid =
    !force &&
    isCacheRecord &&
    Object.hasOwn(cache, "items") &&
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

    if (isCacheRecord && cache.version === version && Object.hasOwn(cache, "items")) {
      return cache.items;
    }

    return fallbackValue;
  }
}

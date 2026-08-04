import * as account from "./account.js";

export function buildAccountCacheKey(prefix) {
  return `${prefix}:${account.getCurrentAccountKey()}`;
}

export function buildScopedAccountCacheKey(prefix, scope) {
  return `${prefix}:${account.getCurrentAccountKey()}:${encodeURIComponent(String(scope))}`;
}

export function createCacheRecord(items, { version, updatedAt = Date.now() }) {
  return {
    version,
    items,
    updatedAt,
  };
}

export function readCacheRecord(record, { ttl, version, force = false } = {}) {
  const now = Date.now();
  const isCacheRecord = Boolean(record) && typeof record === "object";
  const hasItems = isCacheRecord && Object.hasOwn(record, "items");
  const versionMatches = isCacheRecord && record.version === version;

  if (!hasItems || !versionMatches) {
    return {
      items: null,
      hasValue: false,
      isFresh: false,
    };
  }

  return {
    items: record.items,
    hasValue: true,
    isFresh: !force && now - record.updatedAt < ttl,
    updatedAt: record.updatedAt,
  };
}

export async function readCachedRecords(keys, { ttl, version, force = false }) {
  const stored = await chrome.storage.local.get(keys);
  const results = new Map();

  for (const key of keys) {
    results.set(
      key,
      readCacheRecord(stored[key], {
        ttl,
        version,
        force,
      }),
    );
  }

  return results;
}

export async function writeCachedRecord(key, items, { version }) {
  await chrome.storage.local.set({
    [key]: createCacheRecord(items, {
      version,
    }),
  });

  return items;
}

export async function getCached({
  key,
  ttl,
  version,
  fetcher,
  force = false,
  fallbackValue = [],
}) {
  const stored = await chrome.storage.local.get(key);
  const cache = readCacheRecord(stored[key], {
    ttl,
    version,
    force,
  });

  if (cache.isFresh) {
    return cache.items;
  }

  try {
    const items = await fetcher();

    await writeCachedRecord(key, items, {
      version,
    });

    return items;
  } catch (error) {
    console.warn("WatchTube: failed to refresh cached feed data", error);

    if (cache.hasValue) {
      return cache.items;
    }

    return fallbackValue;
  }
}

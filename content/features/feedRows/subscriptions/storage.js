import * as constants from "../../../core/constants.js";
import * as api from "./api.js";
import * as cache from "../../../core/cache.js";
import * as account from "../../../core/account.js";

const CACHE_KEY = "watchTubeSubscriptionsCache";

export async function getSubscriptionVideos({ force = false } = {}) {
  if (!account.isSignedIn()) {
    return [];
  }

  return cache.getCached({
    key: cache.buildAccountCacheKey(CACHE_KEY),
    ttl: constants.SUBSCRIPTIONS_CACHE_TTL_MS,
    version: constants.CACHE_VERSION,
    fetcher: api.fetchSubscriptionVideos,
    force,
  });
}

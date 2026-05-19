import * as constants from "../../../core/constants.js";
import * as api from "./api.js";
import * as cache from "../../../core/cache.js";

const CACHE_KEY = "watchTubeSubscriptionsCache";

export async function getSubscriptionVideos() {
  return cache.getCached({
    key: cache.buildAccountCacheKey(CACHE_KEY),
    ttl: constants.CACHE_TTL_MS,
    version: constants.CACHE_VERSION,
    fetcher: api.fetchSubscriptionVideos,
  });
}

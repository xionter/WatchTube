export const DEFAULT_SETTINGS = {
  showWatchLater: true,
  showSubscriptions: true,
  hideShorts: false,
};

export const WATCH_LATER_URL = "https://www.youtube.com/playlist?list=WL";
export const SUBSCRIPTIONS_URL = "https://www.youtube.com/feed/subscriptions";
export const SETTINGS_KEY = "watchTubeSettings";
export const CACHE_KEY = "watchTubeCache";
export const STYLE_ID = "watchtube-style";

export const CACHE_VERSION = 5;
export const CACHE_TTL_MS = 30 * 60 * 1000;
export const SUBSCRIPTIONS_CACHE_TTL_MS = 30 * 1000;
export const MAX_FIRST_ROW_VIDEOS = 3;

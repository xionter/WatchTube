export const WATCH_LATER_PLAYLIST_ID = "WL";
export const WATCH_LATER_TITLE = "Watch Later";
export const DEFAULT_PLAYLIST_TITLE = "Playlist";
export const PLAYLIST_URL = "https://www.youtube.com/playlist";
export const WATCH_LATER_URL = `${PLAYLIST_URL}?list=${WATCH_LATER_PLAYLIST_ID}`;
export const SUBSCRIPTIONS_URL = "https://www.youtube.com/feed/subscriptions";
export const SETTINGS_KEY = "watchTubeSettings";
export const PLAYLISTS_CACHE_KEY = "watchTubePlaylistCache";
export const SUBSCRIPTIONS_CACHE_KEY = "watchTubeSubscriptionsCache";
export const STYLE_ID = "watchtube-style";

export const DEFAULT_PLAYLIST = Object.freeze({
  id: WATCH_LATER_PLAYLIST_ID,
  playlistId: WATCH_LATER_PLAYLIST_ID,
  title: WATCH_LATER_TITLE,
  url: WATCH_LATER_URL,
  enabled: true,
});

export const DEFAULT_SETTINGS = Object.freeze({
  darkTheme: true,
  showSubscriptions: true,
  hideShorts: false,
  playlists: [DEFAULT_PLAYLIST],
});

export const CACHE_VERSION = 6;
export const CACHE_TTL_MS = 30 * 60 * 1000;
export const SUBSCRIPTIONS_CACHE_TTL_MS = 30 * 1000;
export const MAX_FIRST_ROW_VIDEOS = 3;

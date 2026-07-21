export const WATCH_LATER_PLAYLIST_ID = "WL";
export const WATCH_LATER_TITLE = "Watch Later";
export const LIKED_VIDEOS_PLAYLIST_ID = "LL";
export const LIKED_VIDEOS_TITLE = "Liked videos";
export const DEFAULT_PLAYLIST_TITLE = "Playlist";
export const PLAYLIST_URL = "https://www.youtube.com/playlist";
export const WATCH_LATER_URL = `${PLAYLIST_URL}?list=${WATCH_LATER_PLAYLIST_ID}`;
export const SUBSCRIPTIONS_URL = "https://www.youtube.com/feed/subscriptions";
export const SETTINGS_KEY = "watchTubeSettings";
export const EDIT_MODE_REQUEST_KEY = "watchTubeEditModeRequest";
export const PLAYLISTS_CACHE_KEY = "watchTubePlaylistCache";
export const SUBSCRIPTIONS_CACHE_KEY = "watchTubeSubscriptionsCache";
export const STYLE_ID = "watchtube-style";
export const PLAYLIST_ROW_PREFIX = "playlist:";
export const SUBSCRIPTIONS_ROW_ID = "subscriptions";

export const DEFAULT_PLAYLIST = Object.freeze({
  id: WATCH_LATER_PLAYLIST_ID,
  playlistId: WATCH_LATER_PLAYLIST_ID,
  title: WATCH_LATER_TITLE,
  url: WATCH_LATER_URL,
  enabled: true,
  unwatchedOnly: true,
});

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  darkTheme: true,
  showSubscriptions: true,
  subscriptionsUnwatchedOnly: true,
  hideShorts: false,
  playlists: [DEFAULT_PLAYLIST],
  rowOrder: [
    `${PLAYLIST_ROW_PREFIX}${WATCH_LATER_PLAYLIST_ID}`,
    SUBSCRIPTIONS_ROW_ID,
  ],
});

export const CACHE_VERSION = 7;
export const CACHE_TTL_MS = 30 * 60 * 1000;
export const SUBSCRIPTIONS_CACHE_TTL_MS = 30 * 1000;
export const MAX_FIRST_ROW_VIDEOS = 3;

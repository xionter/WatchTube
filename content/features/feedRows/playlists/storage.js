import * as constants from "../../../core/constants.js";
import * as api from "./api.js";
import * as cache from "../../../core/cache.js";

export async function getPlaylistData({ playlist, force = false } = {}) {
  const fallbackValue = {
    title: playlist?.title || constants.DEFAULT_PLAYLIST_TITLE,
    videos: [],
  };

  if (!playlist?.playlistId) {
    return fallbackValue;
  }

  return cache.getCached({
    key: cache.buildScopedAccountCacheKey(
      constants.PLAYLISTS_CACHE_KEY,
      playlist.playlistId,
    ),
    ttl: constants.CACHE_TTL_MS,
    version: constants.CACHE_VERSION,
    fetcher: () => api.fetchPlaylist(playlist),
    force,
    fallbackValue,
  });
}

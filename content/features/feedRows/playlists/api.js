import * as constants from "../../../core/constants.js";
import * as parser from "./parser.js";
import { hasWatchProgressMarker } from "../subscriptions/parser.js";

const CHANNEL_AVATAR_PROMISES = new Map();
const PLAYLIST_LIBRARY_URLS = [
  "https://www.youtube.com/feed/you",
  "https://www.youtube.com/feed/library",
];

export async function fetchPlaylist(playlist) {
  const playlistUrl = playlist?.url || buildPlaylistUrl(playlist?.playlistId);
  const response = await fetch(playlistUrl, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Playlist request failed with status ${response.status}`);
  }

  const html = await response.text();
  const json = parser.extractInitialData(html);
  const contents = parser.findPlaylistVideos(json);
  const videos = [];

  for (const item of contents) {
    const video = item?.playlistVideoRenderer || item;

    if (!video?.videoId) {
      continue;
    }

    const extractedVideo = parser.extractVideo(video);

    if (extractedVideo) {
      videos.push({
        ...extractedVideo,
        hasWatchProgress: hasWatchProgressMarker(video),
      });
    }
  }

  return {
    title: parser.extractPlaylistTitle(json, html),
    videos,
  };
}

export async function fetchAvailablePlaylists() {
  const candidates = [
    createAvailablePlaylist(
      constants.WATCH_LATER_PLAYLIST_ID,
      constants.WATCH_LATER_TITLE,
    ),
    createAvailablePlaylist(
      constants.LIKED_VIDEOS_PLAYLIST_ID,
      constants.LIKED_VIDEOS_TITLE,
    ),
  ];

  for (const url of PLAYLIST_LIBRARY_URLS) {
    try {
      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const json = parser.extractInitialData(html);

      candidates.push(...parser.findAvailablePlaylists(json, html));
    } catch (error) {
      console.warn("WatchTube: failed to load playlist candidates", error);
    }
  }

  return dedupeAvailablePlaylists(candidates);
}

export async function getChannelAvatarUrl(channelUrl) {
  if (!channelUrl) {
    return "";
  }

  if (!CHANNEL_AVATAR_PROMISES.has(channelUrl)) {
    CHANNEL_AVATAR_PROMISES.set(channelUrl, fetchChannelAvatarUrl(channelUrl));
  }

  return CHANNEL_AVATAR_PROMISES.get(channelUrl);
}

async function fetchChannelAvatarUrl(channelUrl) {
  try {
    const response = await fetch(channelUrl, {
      credentials: "include",
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const json = parser.extractInitialData(html);

    return parser.findChannelAvatarUrl(json);
  } catch (error) {
    console.warn("WatchTube: failed to load channel avatar", error);

    return "";
  }
}

function buildPlaylistUrl(playlistId) {
  return `${constants.PLAYLIST_URL}?list=${encodeURIComponent(String(playlistId || ""))}`;
}

function createAvailablePlaylist(playlistId, title) {
  return {
    playlistId,
    title,
    url: buildPlaylistUrl(playlistId),
  };
}

function dedupeAvailablePlaylists(playlists) {
  const seenPlaylistIds = new Set();
  const deduped = [];

  for (const playlist of playlists) {
    if (!playlist?.playlistId || seenPlaylistIds.has(playlist.playlistId)) {
      continue;
    }

    seenPlaylistIds.add(playlist.playlistId);
    deduped.push({
      playlistId: playlist.playlistId,
      title: playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
      url: playlist.url || buildPlaylistUrl(playlist.playlistId),
    });
  }

  return deduped;
}

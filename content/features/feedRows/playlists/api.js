import * as constants from "../../../core/constants.js";
import * as parser from "./parser.js";
import { hasWatchProgressMarker } from "../subscriptions/parser.js";

const CHANNEL_AVATAR_PROMISES = new Map();

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
    const video = item?.playlistVideoRenderer;

    if (!video?.videoId || hasWatchProgressMarker(video)) {
      continue;
    }

    const extractedVideo = parser.extractVideo(video);

    if (extractedVideo) {
      videos.push(extractedVideo);
    }
  }

  return {
    title: parser.extractPlaylistTitle(json, html),
    videos,
  };
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

import * as constants from "../../../core/constants.js";
import * as parser from "./parser.js";
import { hasWatchProgressMarker } from "../subscriptions/parser.js";

const CHANNEL_AVATAR_PROMISES = new Map();
const PLAYLIST_LIBRARY_URLS = [
  "https://www.youtube.com/feed/you",
  "https://www.youtube.com/feed/library",
];
const INNERTUBE_BROWSE_URL = "https://www.youtube.com/youtubei/v1/browse";

export async function fetchPlaylist(playlist) {
  return fetchPlaylistInitial(playlist);
}

export async function fetchPlaylistInitial(playlist) {
  const playlistUrl = playlist?.url || buildPlaylistUrl(playlist?.playlistId);
  const response = await fetch(playlistUrl, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Playlist request failed with status ${response.status}`);
  }

  const html = await response.text();
  const json = parser.extractInitialData(html);
  const config = parser.extractYtConfig(html);
  const continuation = parser.findPlaylistContinuation(json);

  return {
    title: parser.extractPlaylistTitle(json, html),
    videos: extractVideos(parser.findPlaylistVideos(json), playlist?.playlistId),
    continuation,
    context: parser.extractInnertubeContext(config),
    apiKey: parser.extractInnertubeApiKey(config),
    isComplete: !continuation,
  };
}

export async function fetchPlaylistContinuation({ continuation, context, apiKey, playlistId = "" }) {
  if (!continuation) {
    return {
      videos: [],
      continuation: "",
      isComplete: true,
    };
  }

  if (!apiKey) {
    throw new Error("Playlist continuation request is missing an API key");
  }

  const url = new URL(INNERTUBE_BROWSE_URL);

  url.searchParams.set("prettyPrint", "false");

  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      context,
      continuation,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Playlist continuation request failed with status ${response.status}`,
    );
  }

  const json = await response.json();
  const nextContinuation = parser.findPlaylistContinuation(json);
  const videos = extractVideos(parser.findContinuationVideos(json), playlistId);

  if (
    !videos.length &&
    !nextContinuation &&
    !parser.hasPlaylistContinuationContainer(json)
  ) {
    throw new Error(
      "Playlist continuation response did not contain playlist items",
    );
  }

  return {
    videos,
    continuation: nextContinuation,
    context,
    apiKey,
    isComplete: !nextContinuation,
  };
}

export function mergePlaylistData(baseData, continuationData, { maxVideos }) {
  const videos = dedupeVideos([
    ...(Array.isArray(baseData?.videos) ? baseData.videos : []),
    ...(Array.isArray(continuationData?.videos) ? continuationData.videos : []),
  ]).slice(0, maxVideos);
  const hitLimit = videos.length >= maxVideos;
  const continuation = hitLimit ? "" : continuationData?.continuation || "";

  return {
    ...baseData,
    videos,
    continuation,
    context: continuationData?.context || baseData?.context || null,
    apiKey: continuationData?.apiKey || baseData?.apiKey || "",
    isComplete: hitLimit || !continuation,
    expandedAt: Date.now(),
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

function extractVideos(contents, playlistId = "") {
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
        playlistId,
        hasWatchProgress: hasWatchProgressMarker(video),
      });
    }
  }

  return dedupeVideos(videos);
}

function dedupeVideos(videos) {
  const seenUrls = new Set();
  const deduped = [];

  for (const video of videos) {
    if (!video?.url || seenUrls.has(video.url)) {
      continue;
    }

    seenUrls.add(video.url);
    deduped.push(video);
  }

  return deduped;
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

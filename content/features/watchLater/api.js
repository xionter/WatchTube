import * as constants from "../../core/constants.js";
import * as utils from "../../core/utils.js";
import * as parser from "./parser.js";

const CHANNEL_AVATAR_PROMISES = new Map();

export async function fetchWatchLater() {
  const response = await fetch(constants.WATCH_LATER_URL, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Watch Later request failed with status ${response.status}`,
    );
  }

  const html = await response.text();

  const json = parser.extractInitialData(html);

  const tabs = utils.getValue(
    json,
    ["contents", "twoColumnBrowseResultsRenderer", "tabs"],
    [],
  );

  const contents = utils.getValue(
    tabs[0],
    [
      "tabRenderer",
      "content",
      "sectionListRenderer",
      "contents",
      0,
      "itemSectionRenderer",
      "contents",
      0,
      "playlistVideoListRenderer",
      "contents",
    ],
    [],
  );

  const videos = [];

  for (const item of contents) {
    const video = item.playlistVideoRenderer;

    if (!video || !video.videoId) {
      continue;
    }

    videos.push({
      title: utils.getValue(
        video,
        ["title", "runs", 0, "text"],
        "Без названия",
      ),

      url: `https://www.youtube.com/watch?v=${video.videoId}`,

      channel: utils.getValue(
        video,
        ["shortBylineText", "runs", 0, "text"],
        "YouTube",
      ),

      channelUrl: parser.getChannelUrl(video),

      thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
    });
  }

  return videos;
}

export async function getChannelAvatarUrl(channelUrl) {
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

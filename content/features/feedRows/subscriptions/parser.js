import * as utils from "../../../core/utils.js";

export function extractInitialData(html) {
  const patterns = [
    /var ytInitialData\s*=\s*(.*?);<\/script>/s,
    /window\["ytInitialData"\]\s*=\s*(.*?);<\/script>/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return JSON.parse(match[1]);
    }
  }

  throw new Error("ytInitialData not found");
}

export function findVideoRenderers(json) {
  const tabs = utils.getValue(
    json,
    ["contents", "twoColumnBrowseResultsRenderer", "tabs"],
    [],
  );

  const selectedTab = tabs.find(
    (tab) => tab?.tabRenderer?.selected,
  );

  return utils.getValue(
    selectedTab,
    [
      "tabRenderer",
      "content",
      "richGridRenderer",
      "contents",
    ],
    [],
  );
}

export function extractVideo(item) {
  const video = item?.richItemRenderer?.content?.videoRenderer;

  if (!video?.videoId) {
    return null;
  }

  return {
    title: utils.getValue(
      video,
      ["title", "runs", 0, "text"],
      "Untitled",
    ),

    url: `https://www.youtube.com/watch?v=${video.videoId}`,

    channel: utils.getValue(
      video,
      ["ownerText", "runs", 0, "text"],
      "YouTube",
    ),

    channelUrl: getChannelUrl(video),

    thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
  };
}

function getChannelUrl(video) {
  const endpoint = utils.getValue(
    video,
    ["ownerText", "runs", 0, "navigationEndpoint"],
    null,
  );

  const path =
    utils.getValue(
      endpoint,
      ["commandMetadata", "webCommandMetadata", "url"],
      "",
    ) ||
    utils.getValue(
      endpoint,
      ["browseEndpoint", "canonicalBaseUrl"],
      "",
    );

  return utils.normalizeYouTubeUrl(path);
}

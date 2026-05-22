import * as utils from "../../../core/utils.js";

export function extractInitialData(html) {
  const markers = ["var ytInitialData = ", 'window["ytInitialData"] = '];

  for (const marker of markers) {
    const start = html.indexOf(marker);

    if (start === -1) {
      continue;
    }

    const jsonStart = start + marker.length;

    const scriptEnd = html.indexOf("</script>", jsonStart);

    if (scriptEnd === -1) {
      continue;
    }

    let jsonText = html.slice(jsonStart, scriptEnd).trim();

    if (jsonText.endsWith(";")) {
      jsonText = jsonText.slice(0, -1);
    }

    return JSON.parse(jsonText);
  }

  throw new Error("ytInitialData not found");
}

export function findVideoRenderers(json) {
  const contents = findRichGridContents(json);

  const results = [];

  for (const item of contents) {
    const richItem = item?.richItemRenderer;

    if (!richItem) {
      continue;
    }

    const videoRenderer = richItem.content?.videoRenderer;

    if (videoRenderer?.videoId) {
      results.push(videoRenderer);
      continue;
    }

    const lockup = richItem.content?.lockupViewModel;

    if (
      lockup?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" &&
      lockup?.contentId
    ) {
      const metadata = lockup.metadata?.lockupMetadataViewModel;

      const channelCommand = findBrowseEndpoint(metadata);

      results.push({
        videoId: lockup.contentId,

        title: {
          runs: [
            {
              text: metadata?.title?.content || "Untitled",
            },
          ],
        },

        ownerText: {
          runs: [
            {
              text:
                metadata?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
                  ?.metadataParts?.[0]?.text?.content || "YouTube",

              navigationEndpoint: channelCommand || null,
            },
          ],
        },

        avatar:
          metadata?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel
            ?.image?.sources?.[0]?.url || "",

        navigationEndpoint: {
          commandMetadata: {
            webCommandMetadata: {
              url: `/watch?v=${lockup.contentId}`,
            },
          },
        },

        hasWatchProgress: hasWatchProgressMarker(lockup),
      });
    }
  }

  return results;
}

export function extractRenderedVideos(html) {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const document = new DOMParser().parseFromString(html, "text/html");

  if (!isSubscriptionsDocument(document, html)) {
    return null;
  }

  const cards = [...document.querySelectorAll("ytd-rich-item-renderer")];

  return {
    sawCards: cards.length > 0,
    videos: cards.map(extractRenderedVideo).filter(Boolean),
  };
}

function isSubscriptionsDocument(document, html) {
  const title = document.querySelector("title")?.textContent || "";

  return title.includes("Subscriptions") || html.includes("FEsubscriptions");
}

function extractRenderedVideo(item) {
  const host = item.querySelector('[class*="ytLockupViewModelHost"]');
  const videoId = getRenderedVideoId(host);

  if (!videoId || hasRenderedWatchProgress(item)) {
    return null;
  }

  const titleElement = item.querySelector(".ytLockupMetadataViewModelTitle");
  const channelElement = item.querySelector(
    ".ytContentMetadataViewModelMetadataRow a[href]",
  );

  const title =
    item.querySelector("h3[title]")?.getAttribute("title") ||
    getRenderedTitleFromAria(titleElement) ||
    "Untitled";

  return {
    title,

    url: `https://www.youtube.com/watch?v=${videoId}`,

    channel: channelElement?.textContent?.trim() || "YouTube",

    channelUrl: utils.normalizeYouTubeUrl(
      channelElement?.getAttribute("href") || "",
    ),

    thumbnail: getRenderedThumbnail(item, videoId),

    avatar: getRenderedAvatar(item),
  };
}

function getRenderedVideoId(host) {
  if (!host) {
    return "";
  }

  const idClass = [...host.classList].find((className) =>
    className.startsWith("content-id-"),
  );

  return idClass?.replace("content-id-", "") || "";
}

function hasRenderedWatchProgress(item) {
  return Boolean(
    item.querySelector(
      [
        "yt-thumbnail-overlay-progress-bar-view-model",
        ".ytThumbnailOverlayProgressBarHost",
        "[class*='WatchedProgressBar']",
      ].join(","),
    ) || item.querySelector('a[href*="&t="], a[href*="?t="]'),
  );
}

function getRenderedTitleFromAria(element) {
  const label = element?.getAttribute("aria-label") || "";

  return label.replace(/\s+\d+\s+(seconds?|minutes?|hours?).*$/i, "").trim();
}

function getRenderedThumbnail(item, videoId) {
  const src =
    item
      .querySelector(".ytThumbnailViewModelImage img[src]")
      ?.getAttribute("src") || "";

  return src || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function getRenderedAvatar(item) {
  return (
    item
      .querySelector(".ytLockupMetadataViewModelAvatar img[src]")
      ?.getAttribute("src") || ""
  );
}

export function hasWatchProgressMarker(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (value.hasWatchProgress === true) {
    return true;
  }

  if (
    Object.hasOwn(value, "thumbnailOverlayResumePlaybackRenderer") ||
    Object.hasOwn(value, "thumbnailOverlayProgressBarRenderer") ||
    Object.hasOwn(value, "thumbnailOverlayProgressBarViewModel")
  ) {
    return true;
  }

  if (hasPositivePercentDurationWatched(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasWatchProgressMarker(item));
  }

  return Object.values(value).some((child) => hasWatchProgressMarker(child));
}

function hasPositivePercentDurationWatched(value) {
  if (!Object.hasOwn(value, "percentDurationWatched")) {
    return false;
  }

  const percent = Number(value.percentDurationWatched);

  return Number.isFinite(percent) && percent > 0;
}

function findRichGridContents(json) {
  const tabs =
    utils.getValue(
      json,
      ["contents", "twoColumnBrowseResultsRenderer", "tabs"],
      [],
    ) || [];

  const selectedTab = tabs.find((tab) => tab?.tabRenderer?.selected);

  return (
    getTabRichGridContents(selectedTab) ||
    tabs.map(getTabRichGridContents).find((contents) => contents?.length) ||
    []
  );
}

function getTabRichGridContents(tab) {
  return utils.getValue(
    tab,
    ["tabRenderer", "content", "richGridRenderer", "contents"],
    null,
  );
}

export function isSubscriptionsInitialData(json) {
  const browseId =
    utils.getValue(
      json,
      [
        "contents",
        "twoColumnBrowseResultsRenderer",
        "tabs",
        0,
        "tabRenderer",
        "endpoint",
        "browseEndpoint",
        "browseId",
      ],
      "",
    ) ||
    utils.getValue(json, ["header", "feedTabbedHeaderRenderer", "title"], "");

  if (browseId === "FEsubscriptions") {
    return true;
  }

  return findBrowseId(json, "FEsubscriptions");
}

function findBrowseId(value, expectedBrowseId) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (value.browseId === expectedBrowseId) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => findBrowseId(item, expectedBrowseId));
  }

  return Object.values(value).some((child) =>
    findBrowseId(child, expectedBrowseId),
  );
}

function findBrowseEndpoint(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (value.browseEndpoint || value.commandMetadata?.webCommandMetadata?.url) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBrowseEndpoint(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (const child of Object.values(value)) {
    const found = findBrowseEndpoint(child);

    if (found) {
      return found;
    }
  }

  return null;
}

export function extractVideo(video) {
  if (!video?.videoId) {
    return null;
  }

  return {
    title: utils.getValue(video, ["title", "runs", 0, "text"], "Untitled"),

    url: `https://www.youtube.com/watch?v=${video.videoId}`,

    channel: utils.getValue(video, ["ownerText", "runs", 0, "text"], "YouTube"),

    channelUrl: getChannelUrl(video),

    thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,

    avatar: video.avatar || getAvatarUrl(video),
  };
}

function getChannelUrl(video) {
  let endpoint = utils.getValue(
    video,
    ["ownerText", "runs", 0, "navigationEndpoint"],
    null,
  );

  if (!endpoint) {
    return "";
  }

  if (endpoint.innertubeCommand) {
    endpoint = endpoint.innertubeCommand;
  }

  const canonical = utils.getValue(
    endpoint,
    ["browseEndpoint", "canonicalBaseUrl"],
    "",
  );

  if (canonical) {
    return utils.normalizeYouTubeUrl(canonical);
  }

  const commandUrl = utils.getValue(
    endpoint,
    ["commandMetadata", "webCommandMetadata", "url"],
    "",
  );

  if (commandUrl) {
    return utils.normalizeYouTubeUrl(commandUrl);
  }

  const browseId = utils.getValue(endpoint, ["browseEndpoint", "browseId"], "");

  if (browseId.startsWith("UC")) {
    return `https://www.youtube.com/channel/${browseId}`;
  }

  return "";
}

export function getAvatarUrl(video) {
  const thumbnails = utils.getValue(
    video,
    [
      "channelThumbnailSupportedRenderers",
      "channelThumbnailWithLinkRenderer",
      "thumbnail",
      "thumbnails",
    ],
    [],
  );

  return thumbnails[0]?.url || "";
}

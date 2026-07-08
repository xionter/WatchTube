import * as constants from "../../../core/constants.js";
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

export function extractPlaylistTitle(json, html = "") {
  const candidateTitle =
    [
      utils.getValue(json, ["metadata", "playlistMetadataRenderer", "title"], ""),
      utils.getValue(
        json,
        ["header", "playlistHeaderRenderer", "title", "simpleText"],
        "",
      ),
      utils.getValue(json, ["header", "playlistHeaderRenderer", "title", "runs", 0, "text"], ""),
      utils.getValue(
        json,
        [
          "sidebar",
          "playlistSidebarRenderer",
          "items",
          0,
          "playlistSidebarPrimaryInfoRenderer",
          "title",
          "runs",
          0,
          "text",
        ],
        "",
      ),
      utils.getValue(json, ["microformat", "microformatDataRenderer", "title"], ""),
    ].find((title) => String(title || "").trim()) || "";

  if (candidateTitle) {
    return candidateTitle.trim();
  }

  return extractTitleFromHtml(html);
}

export function findPlaylistVideos(json) {
  const tabs =
    utils.getValue(
      json,
      ["contents", "twoColumnBrowseResultsRenderer", "tabs"],
      [],
    ) || [];

  const selectedTab = tabs.find((tab) => tab?.tabRenderer?.selected) || tabs[0];

  const contents =
    utils.getValue(
      selectedTab,
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
    ) || [];

  if (contents.length) {
    return contents;
  }

  const playlistVideos = [];
  collectPlaylistVideos(json, playlistVideos);

  if (playlistVideos.length) {
    return playlistVideos;
  }

  const lockupVideos = [];
  collectLockupVideos(json, lockupVideos);

  return lockupVideos;
}

export function extractVideo(video) {
  if (!video?.videoId) {
    return null;
  }

  return {
    title:
      utils.getValue(video, ["title", "runs", 0, "text"], "") ||
      utils.getValue(video, ["title", "simpleText"], "") ||
      "Untitled",
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    channel:
      utils.getValue(video, ["shortBylineText", "runs", 0, "text"], "") ||
      utils.getValue(video, ["ownerText", "runs", 0, "text"], "") ||
      "YouTube",
    channelUrl: getChannelUrl(video),
    thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
    avatar: video.avatar || getAvatarUrl(video),
  };
}

export function getChannelUrl(video) {
  let endpoint =
    utils.getValue(
      video,
      ["shortBylineText", "runs", 0, "navigationEndpoint"],
      null,
    ) ||
    utils.getValue(video, ["ownerText", "runs", 0, "navigationEndpoint"], null);

  if (endpoint?.innertubeCommand) {
    endpoint = endpoint.innertubeCommand;
  }

  const path =
    utils.getValue(
      endpoint,
      ["commandMetadata", "webCommandMetadata", "url"],
      "",
    ) || utils.getValue(endpoint, ["browseEndpoint", "canonicalBaseUrl"], "");

  return utils.normalizeYouTubeUrl(path);
}

function collectPlaylistVideos(value, results) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (value.playlistVideoRenderer?.videoId) {
    results.push(value);

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPlaylistVideos(item, results);
    }

    return;
  }

  for (const child of Object.values(value)) {
    collectPlaylistVideos(child, results);
  }
}

function collectLockupVideos(value, results) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (
    value.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" &&
    value.contentId
  ) {
    results.push(createVideoFromLockup(value));

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLockupVideos(item, results);
    }

    return;
  }

  for (const child of Object.values(value)) {
    collectLockupVideos(child, results);
  }
}

function createVideoFromLockup(lockup) {
  const metadata = lockup.metadata?.lockupMetadataViewModel;
  const channelCommand = findBrowseEndpoint(metadata);

  return {
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
      metadata?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image
        ?.sources?.[0]?.url || "",

    hasWatchProgress: hasLockupWatchProgress(lockup),
  };
}

function hasLockupWatchProgress(lockup) {
  return Boolean(
    lockup.thumbnail?.thumbnailViewModel?.overlays?.some(
      (overlay) =>
        overlay.thumbnailOverlayProgressBarViewModel ||
        overlay.thumbnailOverlayResumePlaybackRenderer,
    ),
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

export function findChannelAvatarUrl(json) {
  const candidateGroups = [
    utils.getValue(
      json,
      ["metadata", "channelMetadataRenderer", "avatar", "thumbnails"],
      [],
    ),
    utils.getValue(
      json,
      ["microformat", "microformatDataRenderer", "thumbnail", "thumbnails"],
      [],
    ),
    utils.getValue(
      json,
      ["header", "c4TabbedHeaderRenderer", "avatar", "thumbnails"],
      [],
    ),
    utils.getValue(
      json,
      [
        "header",
        "pageHeaderRenderer",
        "content",
        "pageHeaderViewModel",
        "image",
        "decoratedAvatarViewModel",
        "avatar",
        "avatarViewModel",
        "image",
        "sources",
      ],
      [],
    ),
    utils.getValue(
      json,
      [
        "header",
        "pageHeaderRenderer",
        "content",
        "pageHeaderViewModel",
        "image",
        "avatarViewModel",
        "image",
        "sources",
      ],
      [],
    ),
  ];

  for (const candidates of candidateGroups) {
    const url = selectLargestImageUrl(candidates);

    if (url) {
      return url;
    }
  }

  return findNestedAvatarUrl(json);
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

function extractTitleFromHtml(html) {
  if (!html) {
    return constants.DEFAULT_PLAYLIST_TITLE;
  }

  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    const title = cleanPageTitle(document.querySelector("title")?.textContent || "");

    if (title) {
      return title;
    }
  }

  const titleMatch = html.match(/<title>(.*?)<\/title>/i);

  return cleanPageTitle(titleMatch?.[1] || "") || constants.DEFAULT_PLAYLIST_TITLE;
}

function cleanPageTitle(title) {
  return String(title || "")
    .replace(/\s*-\s*YouTube\s*$/i, "")
    .trim();
}

function selectLargestImageUrl(candidates) {
  if (!Array.isArray(candidates)) {
    return "";
  }

  const image = candidates
    .filter((candidate) => candidate?.url)
    .sort((left, right) => {
      return (right.width || 0) - (left.width || 0);
    })[0];

  return image?.url || "";
}

function findNestedAvatarUrl(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findNestedAvatarUrl(item);

      if (url) {
        return url;
      }
    }

    return "";
  }

  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().includes("avatar")) {
      const url =
        selectLargestImageUrl(child?.thumbnails) ||
        selectLargestImageUrl(child?.image?.sources) ||
        selectLargestImageUrl(child?.avatarViewModel?.image?.sources) ||
        findNestedAvatarUrl(child);

      if (url) {
        return url;
      }
    }
  }

  for (const child of Object.values(value)) {
    const url = findNestedAvatarUrl(child);

    if (url) {
      return url;
    }
  }

  return "";
}

import * as utils from "../../../core/utils.js";

export function extractInitialData(html) {
  const patterns = [
    /var ytInitialData\s*=\s*(\{.*?\})\s*;<\/script>/s,
    /window\["ytInitialData"\]\s*=\s*(\{.*?\})\s*;<\/script>/s,
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
  const results = [];

  walk(json, (value) => {
    const richItem = value?.richItemRenderer;

    const videoRenderer =
      richItem?.content?.videoRenderer || value?.videoRenderer;

    if (videoRenderer?.videoId) {
      results.push(videoRenderer);

      return;
    }

    const lockup = richItem?.content?.lockupViewModel;

    if (
      lockup?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" &&
      lockup?.contentId
    ) {
      const metadata = lockup.metadata?.lockupMetadataViewModel;

      const channelCommand = findBrowseEndpoint(metadata);
      console.log("LOCKUP METADATA", metadata);
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
      });
    }
  });

  return results;
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

function walk(value, callback) {
  if (!value || typeof value !== "object") {
    return;
  }

  callback(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, callback);
    }

    return;
  }

  for (const child of Object.values(value)) {
    walk(child, callback);
  }
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

import * as utils from "../../../core/utils.js";

export function extractInitialData(html) {
  const markers = [
    "var ytInitialData = ",
    'window["ytInitialData"] = ',
  ];

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
      });
    }
  }

  return results;
}

function findRichGridContents(json) {
  return (
    utils.getValue(
      json,
      [
        "contents",
        "twoColumnBrowseResultsRenderer",
        "tabs",
        0,
        "tabRenderer",
        "content",
        "richGridRenderer",
        "contents",
      ],
      [],
    ) || []
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

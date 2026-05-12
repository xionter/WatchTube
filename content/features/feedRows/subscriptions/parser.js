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
      results.push({
        videoId: lockup.contentId,

        title: {
          runs: [
            {
              text:
                lockup.metadata?.lockupMetadataViewModel?.title?.content ||
                "Untitled",
            },
          ],
        },

        ownerText: {
          runs: [
            {
              text:
                lockup.metadata?.lockupMetadataViewModel?.metadata
                  ?.contentMetadataViewModel?.metadataRows?.[0]
                  ?.metadataParts?.[0]?.text?.content || "YouTube",

              navigationEndpoint: {
                commandMetadata: {
                  webCommandMetadata: {
                    url:
                      lockup.rendererContext?.commandContext?.onTap
                        ?.innertubeCommand?.browseEndpoint?.canonicalBaseUrl ||
                      "",
                  },
                },
              },
            },
          ],
        },

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
    ) || utils.getValue(endpoint, ["browseEndpoint", "canonicalBaseUrl"], "");

  return utils.normalizeYouTubeUrl(path);
}

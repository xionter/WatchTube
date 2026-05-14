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
                        },
                    ],
                },

                directChannelUrl: findRenderedChannelUrl(lockup.contentId),
                avatar: findRenderedAvatar(lockup.contentId),
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
    
    console.log(video);
    return {
        title: utils.getValue(video, ["title", "runs", 0, "text"], "Untitled"),

        url: `https://www.youtube.com/watch?v=${video.videoId}`,

        channel: utils.getValue(video, ["ownerText", "runs", 0, "text"], "YouTube"),

        channelUrl: video.directChannelUrl
        ? utils.normalizeYouTubeUrl(video.directChannelUrl)
        : getChannelUrl(video),

        thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        avatar: video.avatar || getAvatarUrl(video),
    };
}

function getChannelUrl(video) {
    const endpoint = utils.getValue(
        video,
        ["ownerText", "runs", 0, "navigationEndpoint"],
        null,
    );

    const commandUrl = utils.getValue(
        endpoint,
        ["commandMetadata", "webCommandMetadata", "url"],
        "",
    );

    const browseUrl = utils.getValue(
        endpoint,
        ["browseEndpoint", "canonicalBaseUrl"],
        "",
    );

    return utils.normalizeYouTubeUrl(commandUrl || browseUrl);
}

function findRenderedChannelUrl(videoId) {
    const anchor = document.querySelector(
        `.content-id-${videoId} a[href^="/@"],
         .content-id-${videoId} a[href^="/channel/"]`,
    );

    return anchor?.getAttribute("href") || "";
}

function findRenderedAvatar(videoId) {
    const image = document.querySelector(
        `.content-id-${videoId} yt-avatar-shape img,
         .content-id-${videoId} #avatar img`,
    );

    return image?.src || "";
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

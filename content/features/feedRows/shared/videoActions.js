export const VIDEO_ACTION_REQUEST_EVENT = "watchtube:video-action-request";
export const VIDEO_ACTION_RESPONSE_EVENT = "watchtube:video-action-response";
export const VIDEO_ACTION_QUEUE = "queue";
export const VIDEO_ACTION_WATCH_LATER = "watchLater";

const QUEUE_LIST_TYPE = "PLAYLIST_EDIT_LIST_TYPE_QUEUE";
const WATCH_LATER_PLAYLIST_ID = "WL";

export function encodeVideoActionBridgeDetail(detail) {
  return JSON.stringify(detail || {});
}

export function decodeVideoActionBridgeDetail(detail) {
  if (!detail) {
    return {};
  }

  if (typeof detail === "string") {
    try {
      return JSON.parse(detail);
    } catch {
      return {};
    }
  }

  if (typeof detail === "object") {
    return detail;
  }

  return {};
}

export function buildVideoMenuActions(video) {
  const videoId = getVideoId(video);
  const actions = [];

  if (videoId) {
    actions.push(
      {
        id: VIDEO_ACTION_QUEUE,
        label: "Add to queue",
        icon: "queue",
        videoId,
      },
      {
        id: VIDEO_ACTION_WATCH_LATER,
        label: "Save to Watch later",
        icon: "watchLater",
        videoId,
      },
    );
  }

  if (video?.url) {
    actions.push({
      id: "share",
      label: "Share",
      icon: "share",
    });
  }

  return actions;
}

export function getVideoId(video) {
  const explicitVideoId = String(video?.videoId || "").trim();

  if (explicitVideoId) {
    return explicitVideoId;
  }

  return extractVideoIdFromUrl(video?.url);
}

export function extractVideoIdFromUrl(url) {
  if (!url) {
    return "";
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(String(url), "https://www.youtube.com");
  } catch {
    return "";
  }

  const watchVideoId = parsedUrl.searchParams.get("v");

  if (watchVideoId) {
    return watchVideoId.trim();
  }

  if (parsedUrl.hostname === "youtu.be") {
    return parsedUrl.pathname.replace(/^\/+/, "").split("/")[0]?.trim() || "";
  }

  const pathMatch = parsedUrl.pathname.match(
    /^\/(?:shorts|embed|v)\/([^/?#]+)/,
  );

  return pathMatch?.[1]?.trim() || "";
}

export function buildYouTubeQueueCommand(videoId) {
  const normalizedVideoId = String(videoId || "").trim();

  if (!normalizedVideoId) {
    return null;
  }

  return {
    signalServiceEndpoint: {
      signal: "CLIENT_SIGNAL",
      actions: [
        {
          addToPlaylistCommand: {
            openMiniplayer: true,
            videoId: normalizedVideoId,
            listType: QUEUE_LIST_TYPE,
            onCreateListCommand: {
              clickTrackingParams: "",
              commandMetadata: {
                webCommandMetadata: {
                  sendPost: true,
                  apiUrl: "/youtubei/v1/playlist/create",
                },
              },
              createPlaylistServiceEndpoint: {
                videoIds: [normalizedVideoId],
                params: "CAQ=",
              },
            },
            videoIds: [normalizedVideoId],
          },
        },
      ],
    },
  };
}

export function buildYouTubeWatchLaterCommand(videoId) {
  const normalizedVideoId = String(videoId || "").trim();

  if (!normalizedVideoId) {
    return null;
  }

  return {
    commandMetadata: {
      webCommandMetadata: {
        sendPost: true,
        apiUrl: "/youtubei/v1/browse/edit_playlist",
      },
    },
    playlistEditEndpoint: {
      playlistId: WATCH_LATER_PLAYLIST_ID,
      actions: [
        {
          addedVideoId: normalizedVideoId,
          action: "ACTION_ADD_VIDEO",
        },
      ],
    },
  };
}

export function buildYouTubeVideoActionCommand({ action, videoId }) {
  if (action === VIDEO_ACTION_QUEUE) {
    return buildYouTubeQueueCommand(videoId);
  }

  if (action === VIDEO_ACTION_WATCH_LATER) {
    return buildYouTubeWatchLaterCommand(videoId);
  }

  return null;
}

export async function shareVideoLink({
  video,
  navigatorApi = globalThis.navigator,
  copyText,
} = {}) {
  const shareData = {
    title: video?.title || "YouTube video",
    url: video?.url || "",
  };

  if (navigatorApi?.share) {
    try {
      if (!navigatorApi.canShare || navigatorApi.canShare(shareData)) {
        await navigatorApi.share(shareData);

        return "native";
      }
    } catch (error) {
      if (isShareAbortError(error)) {
        return "cancelled";
      }
    }
  }

  if (shareData.url && copyText) {
    await copyText(shareData.url);

    return "clipboard";
  }

  return "none";
}

export function isShareAbortError(error) {
  return error?.name === "AbortError";
}

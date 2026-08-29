import {
  buildYouTubeVideoActionCommand,
  decodeVideoActionBridgeDetail,
  encodeVideoActionBridgeDetail,
  VIDEO_ACTION_REQUEST_EVENT,
  VIDEO_ACTION_RESPONSE_EVENT,
} from "./features/feedRows/shared/videoActions.js";

const BRIDGE_INSTALLED_KEY = "__watchTubeVideoActionBridgeInstalled";

export function findYouTubeCommandResolver(root = document) {
  for (const selector of [
    "ytd-app",
    "ytd-popup-container",
    "ytd-page-manager",
  ]) {
    const resolver = root.querySelector?.(selector);

    if (typeof resolver?.resolveCommand === "function") {
      return resolver;
    }
  }

  return null;
}

export function performYouTubeVideoAction(
  { action, videoId, playlistId },
  root = document,
) {
  const command = buildYouTubeVideoActionCommand({ action, videoId, playlistId });

  if (!command) {
    return {
      ok: false,
      error: "Unsupported video action",
    };
  }

  const resolver = findYouTubeCommandResolver(root);

  if (!resolver) {
    return {
      ok: false,
      error: "YouTube command resolver not found",
    };
  }

  try {
    resolver.resolveCommand(command);

    return {
      ok: true,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "YouTube video action failed",
    };
  }
}

export function installVideoActionBridge(root = document) {
  if (globalThis[BRIDGE_INSTALLED_KEY]) {
    return false;
  }

  globalThis[BRIDGE_INSTALLED_KEY] = true;

  root.addEventListener(VIDEO_ACTION_REQUEST_EVENT, (event) => {
    const detail = decodeVideoActionBridgeDetail(event.detail);
    const result = performYouTubeVideoAction(
      {
        action: detail.action,
        videoId: detail.videoId,
        playlistId: detail.playlistId,
      },
      root,
    );

    root.dispatchEvent(
      new CustomEvent(VIDEO_ACTION_RESPONSE_EVENT, {
        detail: encodeVideoActionBridgeDetail({
          requestId: detail.requestId || "",
          ...result,
        }),
      }),
    );
  });

  return true;
}

if (typeof document !== "undefined") {
  installVideoActionBridge(document);
}

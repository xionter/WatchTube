import { describe, expect, it, vi } from "vitest";

import {
  buildVideoMenuActions,
  buildYouTubeQueueCommand,
  buildYouTubeVideoActionCommand,
  buildYouTubeWatchLaterCommand,
  decodeVideoActionBridgeDetail,
  encodeVideoActionBridgeDetail,
  extractVideoIdFromUrl,
  getVideoId,
  isShareAbortError,
  shareVideoLink,
  VIDEO_ACTION_QUEUE,
  VIDEO_ACTION_WATCH_LATER,
} from "./videoActions.js";

describe("video action helpers", () => {
  it("prefers an explicit video id", () => {
    expect(
      getVideoId({
        videoId: "abc123",
        url: "https://www.youtube.com/watch?v=from-url",
      }),
    ).toBe("abc123");
  });

  it("extracts video ids from common YouTube URLs", () => {
    expect(extractVideoIdFromUrl("/watch?v=abc123&list=WL")).toBe("abc123");
    expect(extractVideoIdFromUrl("https://youtu.be/short-link")).toBe(
      "short-link",
    );
    expect(extractVideoIdFromUrl("/shorts/short123")).toBe("short123");
    expect(extractVideoIdFromUrl("/embed/embed123")).toBe("embed123");
  });

  it("builds the YouTube add-to-queue command", () => {
    expect(buildYouTubeQueueCommand("abc123")).toEqual({
      signalServiceEndpoint: {
        signal: "CLIENT_SIGNAL",
        actions: [
          {
            addToPlaylistCommand: {
              openMiniplayer: true,
              videoId: "abc123",
              listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
              onCreateListCommand: {
                clickTrackingParams: "",
                commandMetadata: {
                  webCommandMetadata: {
                    sendPost: true,
                    apiUrl: "/youtubei/v1/playlist/create",
                  },
                },
                createPlaylistServiceEndpoint: {
                  videoIds: ["abc123"],
                  params: "CAQ=",
                },
              },
              videoIds: ["abc123"],
            },
          },
        ],
      },
    });
  });

  it("does not build queue commands without a video id", () => {
    expect(buildYouTubeQueueCommand("")).toBeNull();
  });

  it("builds the final compact video menu actions", () => {
    const actions = buildVideoMenuActions({
      videoId: "abc123",
      title: "Video",
      url: "https://www.youtube.com/watch?v=abc123",
      channelUrl: "https://www.youtube.com/@channel",
    });

    expect(actions.map((action) => action.label)).toEqual([
      "Add to queue",
      "Save to Watch later",
      "Share",
    ]);
    expect(actions.map((action) => action.label)).not.toContain("Open video");
    expect(actions.map((action) => action.label)).not.toContain("Open channel");
    expect(actions.map((action) => action.label)).not.toContain(
      "Copy video link",
    );
  });

  it("builds the YouTube save-to-watch-later command", () => {
    expect(buildYouTubeWatchLaterCommand("abc123")).toEqual({
      commandMetadata: {
        webCommandMetadata: {
          sendPost: true,
          apiUrl: "/youtubei/v1/browse/edit_playlist",
        },
      },
      playlistEditEndpoint: {
        playlistId: "WL",
        actions: [
          {
            addedVideoId: "abc123",
            action: "ACTION_ADD_VIDEO",
          },
        ],
      },
    });
  });

  it("routes supported YouTube video action commands", () => {
    expect(
      buildYouTubeVideoActionCommand({
        action: VIDEO_ACTION_QUEUE,
        videoId: "abc123",
      }),
    ).toEqual(buildYouTubeQueueCommand("abc123"));
    expect(
      buildYouTubeVideoActionCommand({
        action: VIDEO_ACTION_WATCH_LATER,
        videoId: "abc123",
      }),
    ).toEqual(buildYouTubeWatchLaterCommand("abc123"));
    expect(
      buildYouTubeVideoActionCommand({
        action: "share",
        videoId: "abc123",
      }),
    ).toBeNull();
  });

  it("identifies cancelled native shares", () => {
    expect(isShareAbortError({ name: "AbortError" })).toBe(true);
    expect(isShareAbortError({ name: "NotAllowedError" })).toBe(false);
  });

  it("uses native sharing when available", async () => {
    const share = vi.fn(async () => {});
    const copyText = vi.fn();

    await expect(
      shareVideoLink({
        video: {
          title: "Video",
          url: "https://www.youtube.com/watch?v=abc123",
        },
        navigatorApi: {
          canShare: () => true,
          share,
        },
        copyText,
      }),
    ).resolves.toBe("native");
    expect(share).toHaveBeenCalledWith({
      title: "Video",
      url: "https://www.youtube.com/watch?v=abc123",
    });
    expect(copyText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when native sharing is unsupported", async () => {
    const copyText = vi.fn(async () => {});

    await expect(
      shareVideoLink({
        video: {
          title: "Video",
          url: "https://www.youtube.com/watch?v=abc123",
        },
        navigatorApi: {},
        copyText,
      }),
    ).resolves.toBe("clipboard");
    expect(copyText).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc123",
    );
  });

  it("does not copy when native sharing is cancelled", async () => {
    const copyText = vi.fn();

    await expect(
      shareVideoLink({
        video: {
          title: "Video",
          url: "https://www.youtube.com/watch?v=abc123",
        },
        navigatorApi: {
          share: vi.fn(async () => {
            throw new DOMException("Cancelled", "AbortError");
          }),
        },
        copyText,
      }),
    ).resolves.toBe("cancelled");
    expect(copyText).not.toHaveBeenCalled();
  });

  it("serializes video action bridge payloads across script contexts", () => {
    const detail = {
      requestId: "request-1",
      videoId: "abc123",
    };

    expect(
      decodeVideoActionBridgeDetail(encodeVideoActionBridgeDetail(detail)),
    ).toEqual(detail);
    expect(decodeVideoActionBridgeDetail("{")).toEqual({});
  });
});

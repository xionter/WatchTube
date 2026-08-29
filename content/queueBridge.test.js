import { describe, expect, it, vi } from "vitest";

import {
  findYouTubeCommandResolver,
  performYouTubeVideoAction,
} from "./queueBridge.js";
import {
  VIDEO_ACTION_QUEUE,
  VIDEO_ACTION_REMOVE_FROM_PLAYLIST,
  VIDEO_ACTION_WATCH_LATER,
} from "./features/feedRows/shared/videoActions.js";

function createRootWithResolver(resolver) {
  return {
    querySelector: vi.fn((selector) =>
      selector === "ytd-app" ? resolver : null,
    ),
  };
}

describe("YouTube video action bridge", () => {
  it("finds a YouTube command resolver", () => {
    const resolver = {
      resolveCommand: vi.fn(),
    };
    const root = createRootWithResolver(resolver);

    expect(findYouTubeCommandResolver(root)).toBe(resolver);
  });

  it("sends the add-to-queue command to YouTube", () => {
    const resolver = {
      resolveCommand: vi.fn(),
    };
    const root = createRootWithResolver(resolver);

    expect(
      performYouTubeVideoAction(
        {
          action: VIDEO_ACTION_QUEUE,
          videoId: "abc123",
        },
        root,
      ),
    ).toEqual({
      ok: true,
      error: "",
    });
    expect(resolver.resolveCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        signalServiceEndpoint: expect.any(Object),
      }),
    );
  });

  it("sends the save-to-watch-later command to YouTube", () => {
    const resolver = {
      resolveCommand: vi.fn(),
    };
    const root = createRootWithResolver(resolver);

    expect(
      performYouTubeVideoAction(
        {
          action: VIDEO_ACTION_WATCH_LATER,
          videoId: "abc123",
        },
        root,
      ),
    ).toEqual({
      ok: true,
      error: "",
    });
    expect(resolver.resolveCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistEditEndpoint: expect.objectContaining({
          playlistId: "WL",
        }),
      }),
    );
  });

  it("sends the remove-from-playlist command to YouTube", () => {
    const resolver = { resolveCommand: vi.fn() };
    const root = createRootWithResolver(resolver);

    expect(
      performYouTubeVideoAction(
        {
          action: VIDEO_ACTION_REMOVE_FROM_PLAYLIST,
          videoId: "abc123",
          playlistId: "PL123",
        },
        root,
      ),
    ).toEqual({ ok: true, error: "" });
    expect(resolver.resolveCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistEditEndpoint: expect.objectContaining({
          playlistId: "PL123",
          actions: [
            {
              removedVideoId: "abc123",
              action: "ACTION_REMOVE_VIDEO",
            },
          ],
        }),
      }),
    );
  });

  it("reports missing YouTube command resolver", () => {
    expect(
      performYouTubeVideoAction(
        {
          action: VIDEO_ACTION_QUEUE,
          videoId: "abc123",
        },
        {
          querySelector: vi.fn(() => null),
        },
      ),
    ).toEqual({
      ok: false,
      error: "YouTube command resolver not found",
    });
  });

  it("reports unsupported YouTube video actions", () => {
    expect(
      performYouTubeVideoAction(
        {
          action: "share",
          videoId: "abc123",
        },
        createRootWithResolver({
          resolveCommand: vi.fn(),
        }),
      ),
    ).toEqual({
      ok: false,
      error: "Unsupported video action",
    });
  });
});

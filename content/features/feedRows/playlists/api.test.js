import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPlaylistContinuation, mergePlaylistData } from "./api.js";

function video(id) {
  return {
    title: id,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

describe("playlist api data merging", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("dedupes continuation videos and preserves next continuation", () => {
    vi.setSystemTime(1_000);

    expect(
      mergePlaylistData(
        {
          title: "Playlist",
          videos: [video("a"), video("b")],
          continuation: "OLD",
          context: { client: { clientName: "WEB" } },
          apiKey: "API",
          isComplete: false,
        },
        {
          videos: [video("b"), video("c")],
          continuation: "NEXT",
          context: { client: { clientName: "WEB" } },
          apiKey: "API",
          isComplete: false,
        },
        {
          maxVideos: 10,
        },
      ),
    ).toEqual({
      title: "Playlist",
      videos: [video("a"), video("b"), video("c")],
      continuation: "NEXT",
      context: { client: { clientName: "WEB" } },
      apiKey: "API",
      isComplete: false,
      expandedAt: 1_000,
    });
  });

  it("marks data complete when max video cap is reached", () => {
    vi.setSystemTime(2_000);

    expect(
      mergePlaylistData(
        {
          title: "Playlist",
          videos: [video("a")],
          continuation: "OLD",
          context: {},
          apiKey: "",
          isComplete: false,
        },
        {
          videos: [video("b"), video("c")],
          continuation: "NEXT",
        },
        {
          maxVideos: 2,
        },
      ),
    ).toMatchObject({
      videos: [video("a"), video("b")],
      continuation: "",
      isComplete: true,
      expandedAt: 2_000,
    });
  });
});

describe("playlist continuation requests", () => {
  it("rejects continuation requests without an API key", async () => {
    await expect(
      fetchPlaylistContinuation({
        continuation: "TOKEN",
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "1.2.3",
          },
        },
        apiKey: "",
      }),
    ).rejects.toThrow("API key");
  });

  it("rejects malformed empty continuation responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          responseContext: {},
        }),
      })),
    );

    await expect(
      fetchPlaylistContinuation({
        continuation: "TOKEN",
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "1.2.3",
          },
        },
        apiKey: "API",
      }),
    ).rejects.toThrow("playlist items");
  });
});

import { describe, expect, it } from "vitest";

import * as constants from "./constants.js";
import {
  extractPlaylistId,
  getPlaylistRowId,
  normalizeSettings,
} from "./settings.js";

describe("settings normalization", () => {
  it("dedupes row order, removes invalid entries, and appends missing active rows", () => {
    const settings = normalizeSettings({
      playlists: [
        {
          playlistId: "PLA1234567890",
          title: "Alpha",
          enabled: true,
        },
        {
          playlistId: "PLB1234567890",
          title: "Beta",
          enabled: true,
        },
      ],
      rowOrder: [
        "missing",
        getPlaylistRowId("PLB1234567890"),
        getPlaylistRowId("PLB1234567890"),
      ],
    });

    expect(settings.rowOrder).toEqual([
      getPlaylistRowId("PLB1234567890"),
      getPlaylistRowId("PLA1234567890"),
      constants.SUBSCRIPTIONS_ROW_ID,
    ]);
  });

  it("keeps default Watch Later compatibility for legacy settings", () => {
    const settings = normalizeSettings({
      showWatchLater: false,
      rowOrder: [],
    });

    expect(settings.playlists).toEqual([
      expect.objectContaining({
        playlistId: constants.WATCH_LATER_PLAYLIST_ID,
        enabled: false,
      }),
    ]);
    expect(settings.rowOrder).toEqual([
      getPlaylistRowId(constants.WATCH_LATER_PLAYLIST_ID),
      constants.SUBSCRIPTIONS_ROW_ID,
    ]);
  });

  it("extracts playlist ids from common YouTube playlist inputs", () => {
    expect(extractPlaylistId("/playlist?list=PL12345678901")).toBe(
      "PL12345678901",
    );
    expect(
      extractPlaylistId(
        "https://www.youtube.com/watch?v=abc&list=PL12345678901",
      ),
    ).toBe("PL12345678901");
    expect(extractPlaylistId("PL12345678901")).toBe("PL12345678901");
  });
});

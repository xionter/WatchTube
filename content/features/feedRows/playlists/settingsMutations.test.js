import { describe, expect, it } from "vitest";

import * as constants from "../../../core/constants.js";
import * as settingsStore from "../../../core/settings.js";

import {
  addOrEnablePlaylist,
  hasEnabledPlaylist,
  setPlaylistEnabled,
  setSubscriptionsEnabled,
} from "./settingsMutations.js";

const baseSettings = {
  enabled: true,
  darkTheme: true,
  showSubscriptions: false,
  subscriptionsUnwatchedOnly: true,
  hideShorts: false,
  playlists: [
    {
      playlistId: "PLA",
      id: "PLA",
      title: "Alpha",
      url: "https://www.youtube.com/playlist?list=PLA",
      enabled: true,
      unwatchedOnly: true,
    },
  ],
  rowOrder: [settingsStore.getPlaylistRowId("PLA")],
};

describe("playlist settings mutations", () => {
  it("detects enabled playlists", () => {
    expect(hasEnabledPlaylist(baseSettings, "PLA")).toBe(true);
    expect(hasEnabledPlaylist(baseSettings, "PLB")).toBe(false);
    expect(
      hasEnabledPlaylist(
        {
          ...baseSettings,
          playlists: [{ ...baseSettings.playlists[0], enabled: false }],
        },
        "PLA",
      ),
    ).toBe(false);
  });

  it("adds a new enabled playlist and row id", () => {
    const settings = addOrEnablePlaylist(baseSettings, {
      playlistId: "PLB",
      title: "Beta",
    });

    expect(settings.playlists.map((playlist) => playlist.playlistId)).toEqual([
      "PLA",
      "PLB",
    ]);
    expect(settings.playlists[1]).toMatchObject({
      playlistId: "PLB",
      title: "Beta",
      enabled: true,
      unwatchedOnly: true,
    });
    expect(settings.rowOrder).toEqual([
      settingsStore.getPlaylistRowId("PLA"),
      settingsStore.getPlaylistRowId("PLB"),
    ]);
  });

  it("reenables an existing playlist without duplicating row order", () => {
    const settings = addOrEnablePlaylist(
      {
        ...baseSettings,
        playlists: [
          {
            ...baseSettings.playlists[0],
            title: "Old Alpha",
            enabled: false,
            unwatchedOnly: false,
          },
        ],
      },
      {
        playlistId: "PLA",
        title: "New Alpha",
      },
    );

    expect(settings.playlists).toHaveLength(1);
    expect(settings.playlists[0]).toMatchObject({
      title: "New Alpha",
      enabled: true,
      unwatchedOnly: false,
    });
    expect(settings.rowOrder).toEqual([settingsStore.getPlaylistRowId("PLA")]);
  });

  it("sets playlist enabled state and appends missing row id", () => {
    const settings = setPlaylistEnabled(
      {
        ...baseSettings,
        rowOrder: [],
      },
      {
        playlistId: "PLA",
        enabled: false,
      },
    );

    expect(settings.playlists[0].enabled).toBe(false);
    expect(settings.rowOrder).toEqual([settingsStore.getPlaylistRowId("PLA")]);
  });

  it("sets subscriptions enabled state and appends the subscriptions row id", () => {
    const settings = setSubscriptionsEnabled(baseSettings, true);

    expect(settings.showSubscriptions).toBe(true);
    expect(settings.rowOrder).toEqual([
      settingsStore.getPlaylistRowId("PLA"),
      constants.SUBSCRIPTIONS_ROW_ID,
    ]);
  });
});

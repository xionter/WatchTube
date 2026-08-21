import { describe, expect, it } from "vitest";

import { buildPlaylistPickerModel } from "./pickerModel.js";

const settings = {
  showSubscriptions: true,
  playlists: [
    {
      playlistId: "PLA",
      title: "Stored Alpha",
      enabled: true,
    },
    {
      playlistId: "PLB",
      title: "Stored Beta",
      enabled: false,
    },
  ],
};

const availablePlaylists = [
  {
    playlistId: "PLA",
    title: "Alpha",
  },
  {
    playlistId: "PLB",
    title: "Beta",
  },
  {
    playlistId: "PLC",
    title: "Calculus",
  },
];

describe("playlist picker model", () => {
  it("includes subscriptions and matching playlists for an empty query", () => {
    const model = buildPlaylistPickerModel({
      availablePlaylists,
      settings,
      query: "",
    });

    expect(model.emptyText).toBe("");
    expect(model.items.map((item) => item.type)).toEqual([
      "subscriptions",
      "playlist",
      "playlist",
      "playlist",
    ]);
  });

  it("uses enabled, disabled, and new states for playlist items", () => {
    const model = buildPlaylistPickerModel({
      availablePlaylists,
      settings,
      query: "",
    });

    expect(model.items.slice(1).map((item) => item.state)).toEqual([
      "enabled",
      "disabled",
      "new",
    ]);
    expect(model.items.slice(1).map((item) => item.stateText)).toEqual([
      "Enabled",
      "Disabled",
      "",
    ]);
  });

  it("uses the first stored playlist when duplicate ids are present", () => {
    const model = buildPlaylistPickerModel({
      availablePlaylists: [
        {
          playlistId: "PLA",
          title: "Alpha",
        },
      ],
      settings: {
        ...settings,
        playlists: [
          {
            playlistId: "PLA",
            title: "Stored Alpha",
            enabled: false,
          },
          {
            playlistId: "PLA",
            title: "Duplicate Alpha",
            enabled: true,
          },
        ],
      },
      query: "",
    });

    expect(model.items[1]).toMatchObject({
      playlistId: "PLA",
      state: "disabled",
      stateText: "Disabled",
    });
  });

  it("filters by normalized prefix query", () => {
    const model = buildPlaylistPickerModel({
      availablePlaylists,
      settings,
      query: " ca ",
    });

    expect(model.query).toBe("ca");
    expect(model.items).toEqual([
      expect.objectContaining({
        type: "playlist",
        playlistId: "PLC",
        title: "Calculus",
      }),
    ]);
  });

  it("reports a no-results message for non-empty queries", () => {
    const model = buildPlaylistPickerModel({
      availablePlaylists,
      settings,
      query: "zzz",
    });

    expect(model.items).toEqual([]);
    expect(model.emptyText).toBe("No matching playlists.");
  });

  it("keeps subscriptions visible when no playlists are available", () => {
    const model = buildPlaylistPickerModel({
      availablePlaylists: [],
      settings: {
        ...settings,
        showSubscriptions: false,
      },
      query: "",
    });

    expect(model.items).toEqual([
      {
        type: "subscriptions",
        title: "Subscriptions",
        state: "disabled",
        stateText: "Disabled",
        enabled: false,
      },
    ]);
    expect(model.emptyText).toBe("");
  });
});

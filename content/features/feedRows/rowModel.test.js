import { describe, expect, it } from "vitest";

import * as constants from "../../core/constants.js";
import * as settingsStore from "../../core/settings.js";

import {
  buildFeedRowDescriptors,
  buildFeedRowRecord,
  buildFeedRowRecords,
  filterVideosByWatchState,
  getActiveRowIds,
  swapRowIds,
} from "./rowModel.js";

const playlistA = {
  playlistId: "PLA",
  title: "Alpha",
  enabled: true,
  unwatchedOnly: true,
};
const playlistB = {
  playlistId: "PLB",
  title: "Beta",
  enabled: true,
  unwatchedOnly: false,
};

function video(id, hasWatchProgress = false) {
  return { id, url: `https://youtube.test/watch?v=${id}`, hasWatchProgress };
}

describe("feed row model", () => {
  it("builds ordered playlist and subscription records", () => {
    const records = buildFeedRowRecords({
      settings: {
        playlists: [playlistA, playlistB],
        showSubscriptions: true,
        subscriptionsUnwatchedOnly: true,
        rowOrder: [
          constants.SUBSCRIPTIONS_ROW_ID,
          settingsStore.getPlaylistRowId("PLB"),
          settingsStore.getPlaylistRowId("PLA"),
        ],
      },
      playlistRows: [
        {
          playlist: playlistA,
          data: {
            title: "Fetched Alpha",
            videos: [video("a1"), video("a2", true)],
          },
        },
        {
          playlist: playlistB,
          data: { title: "", videos: [video("b1"), video("b2", true)] },
        },
      ],
      subscriptionVideos: [video("s1"), video("s2", true)],
    });

    expect(records.map((record) => record.rowId)).toEqual([
      constants.SUBSCRIPTIONS_ROW_ID,
      settingsStore.getPlaylistRowId("PLB"),
      settingsStore.getPlaylistRowId("PLA"),
    ]);
    expect(records[0].videos).toEqual([video("s1")]);
    expect(records[1].title).toBe("Beta");
    expect(records[1].videos).toEqual([video("b1"), video("b2", true)]);
    expect(records[2].title).toBe("Fetched Alpha");
    expect(records[2].videos).toEqual([video("a1")]);
  });

  it("appends records missing from rowOrder after ordered records", () => {
    const records = buildFeedRowRecords({
      settings: {
        playlists: [playlistA, playlistB],
        showSubscriptions: false,
        subscriptionsUnwatchedOnly: true,
        rowOrder: [settingsStore.getPlaylistRowId("PLB")],
      },
      playlistRows: [
        { playlist: playlistA, data: { videos: [] } },
        { playlist: playlistB, data: { videos: [] } },
      ],
      subscriptionVideos: [],
    });

    expect(records.map((record) => record.rowId)).toEqual([
      settingsStore.getPlaylistRowId("PLB"),
      settingsStore.getPlaylistRowId("PLA"),
    ]);
  });

  it("ignores missing and duplicate row ids while preserving fallback append order", () => {
    const records = buildFeedRowRecords({
      settings: {
        playlists: [playlistA, playlistB],
        showSubscriptions: true,
        subscriptionsUnwatchedOnly: true,
        rowOrder: [
          "missing",
          settingsStore.getPlaylistRowId("PLB"),
          settingsStore.getPlaylistRowId("PLB"),
        ],
      },
      playlistRows: [
        { playlist: playlistA, data: { videos: [] } },
        { playlist: playlistB, data: { videos: [] } },
      ],
      subscriptionVideos: [],
    });

    expect(records.map((record) => record.rowId)).toEqual([
      settingsStore.getPlaylistRowId("PLB"),
      settingsStore.getPlaylistRowId("PLA"),
      constants.SUBSCRIPTIONS_ROW_ID,
    ]);
  });

  it("filters watched videos only when requested", () => {
    const videos = [video("a"), video("b", true)];

    expect(filterVideosByWatchState(videos, false)).toBe(videos);
    expect(filterVideosByWatchState(videos, true)).toEqual([video("a")]);
  });

  it("builds ordered active row descriptors without fetched data", () => {
    const descriptors = buildFeedRowDescriptors({
      playlists: [playlistA, { ...playlistB, enabled: false }],
      showSubscriptions: true,
      subscriptionsUnwatchedOnly: false,
      rowOrder: [
        settingsStore.getPlaylistRowId("PLB"),
        constants.SUBSCRIPTIONS_ROW_ID,
        settingsStore.getPlaylistRowId("PLA"),
      ],
    });

    expect(descriptors).toEqual([
      {
        rowId: constants.SUBSCRIPTIONS_ROW_ID,
        type: "subscriptions",
        title: "Subscriptions",
        unwatchedOnly: false,
      },
      {
        rowId: settingsStore.getPlaylistRowId("PLA"),
        type: "playlist",
        playlist: playlistA,
        unwatchedOnly: true,
      },
    ]);
  });

  it("appends active descriptors that are missing from rowOrder", () => {
    const descriptors = buildFeedRowDescriptors({
      playlists: [playlistA, playlistB],
      showSubscriptions: true,
      subscriptionsUnwatchedOnly: true,
      rowOrder: [settingsStore.getPlaylistRowId("PLB")],
    });

    expect(descriptors.map((descriptor) => descriptor.rowId)).toEqual([
      settingsStore.getPlaylistRowId("PLB"),
      settingsStore.getPlaylistRowId("PLA"),
      constants.SUBSCRIPTIONS_ROW_ID,
    ]);
  });

  it("builds a single playlist row record from descriptor data", () => {
    const descriptor = buildFeedRowDescriptors({
      playlists: [playlistA],
      showSubscriptions: false,
      subscriptionsUnwatchedOnly: true,
      rowOrder: [settingsStore.getPlaylistRowId("PLA")],
    })[0];

    expect(
      buildFeedRowRecord({
        descriptor,
        data: {
          title: "Fetched Alpha",
          videos: [video("a1"), video("a2", true)],
        },
      }),
    ).toEqual({
      rowId: settingsStore.getPlaylistRowId("PLA"),
      type: "playlist",
      playlist: playlistA,
      title: "Fetched Alpha",
      videos: [video("a1")],
      unwatchedOnly: true,
    });
  });

  it("builds a single subscriptions row record from descriptor data", () => {
    const descriptor = buildFeedRowDescriptors({
      playlists: [],
      showSubscriptions: true,
      subscriptionsUnwatchedOnly: true,
      rowOrder: [constants.SUBSCRIPTIONS_ROW_ID],
    })[0];

    expect(
      buildFeedRowRecord({
        descriptor,
        data: [video("s1"), video("s2", true)],
      }),
    ).toEqual({
      rowId: constants.SUBSCRIPTIONS_ROW_ID,
      type: "subscriptions",
      title: "Subscriptions",
      videos: [video("s1")],
      unwatchedOnly: true,
    });
  });

  it("returns only enabled active row ids", () => {
    expect(
      getActiveRowIds({
        playlists: [playlistA, { ...playlistB, enabled: false }],
        showSubscriptions: true,
        rowOrder: [
          settingsStore.getPlaylistRowId("PLB"),
          constants.SUBSCRIPTIONS_ROW_ID,
          settingsStore.getPlaylistRowId("PLA"),
        ],
      }),
    ).toEqual([
      constants.SUBSCRIPTIONS_ROW_ID,
      settingsStore.getPlaylistRowId("PLA"),
    ]);
  });

  it("swaps row ids without mutating the source order", () => {
    const rowOrder = ["a", "b", "c"];

    expect(swapRowIds(rowOrder, "a", "c")).toEqual(["c", "b", "a"]);
    expect(rowOrder).toEqual(["a", "b", "c"]);
    expect(swapRowIds(rowOrder, "a", "missing")).toEqual(rowOrder);
  });
});

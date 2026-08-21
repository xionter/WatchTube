import * as constants from "../../core/constants.js";
import * as settingsStore from "../../core/settings.js";

export function buildFeedRowRecords({
  settings,
  playlistRows,
  subscriptionVideos,
}) {
  const recordsByRowId = new Map();

  for (const { playlist, data } of playlistRows) {
    const record = buildPlaylistRowRecord({
      rowId: settingsStore.getPlaylistRowId(playlist.playlistId),
      playlist,
      data,
      unwatchedOnly: playlist.unwatchedOnly,
    });

    recordsByRowId.set(record.rowId, record);
  }

  if (settings.showSubscriptions) {
    recordsByRowId.set(
      constants.SUBSCRIPTIONS_ROW_ID,
      buildSubscriptionsRowRecord({
        subscriptionVideos,
        unwatchedOnly: settings.subscriptionsUnwatchedOnly,
      }),
    );
  }

  return orderByRowIds(recordsByRowId, settings.rowOrder);
}

export function buildFeedRowDescriptors(settings) {
  const descriptorsByRowId = new Map();

  for (const playlist of settings.playlists.filter(
    (playlist) => playlist.enabled,
  )) {
    const rowId = settingsStore.getPlaylistRowId(playlist.playlistId);

    descriptorsByRowId.set(rowId, {
      rowId,
      type: "playlist",
      playlist,
      unwatchedOnly: playlist.unwatchedOnly,
    });
  }

  if (settings.showSubscriptions) {
    descriptorsByRowId.set(constants.SUBSCRIPTIONS_ROW_ID, {
      rowId: constants.SUBSCRIPTIONS_ROW_ID,
      type: "subscriptions",
      title: "Subscriptions",
      unwatchedOnly: settings.subscriptionsUnwatchedOnly,
    });
  }

  return orderByRowIds(descriptorsByRowId, settings.rowOrder);
}

export function buildFeedRowRecord({ descriptor, data }) {
  if (descriptor.type === "subscriptions") {
    return buildSubscriptionsRowRecord({
      subscriptionVideos: data,
      unwatchedOnly: descriptor.unwatchedOnly,
    });
  }

  return buildPlaylistRowRecord({
    rowId: descriptor.rowId,
    playlist: descriptor.playlist,
    data,
    unwatchedOnly: descriptor.unwatchedOnly,
  });
}

export function filterVideosByWatchState(videos, unwatchedOnly) {
  if (!unwatchedOnly) {
    return videos;
  }

  return videos.filter((video) => !video.hasWatchProgress);
}

export function getActiveRowIds(settings) {
  const activeRows = new Set(
    settings.playlists
      .filter((playlist) => playlist.enabled)
      .map((playlist) => settingsStore.getPlaylistRowId(playlist.playlistId)),
  );

  if (settings.showSubscriptions) {
    activeRows.add(constants.SUBSCRIPTIONS_ROW_ID);
  }

  return settings.rowOrder.filter((rowId) => activeRows.has(rowId));
}

export function swapRowIds(rowOrder, rowId, swapRowId) {
  const nextRowOrder = [...rowOrder];
  const currentIndex = nextRowOrder.indexOf(rowId);
  const swapIndex = nextRowOrder.indexOf(swapRowId);

  if (currentIndex < 0 || swapIndex < 0) {
    return nextRowOrder;
  }

  [nextRowOrder[currentIndex], nextRowOrder[swapIndex]] = [
    nextRowOrder[swapIndex],
    nextRowOrder[currentIndex],
  ];

  return nextRowOrder;
}

function buildPlaylistRowRecord({ rowId, playlist, data, unwatchedOnly }) {
  return {
    rowId,
    type: "playlist",
    playlist,
    title: data?.title || playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
    videos: filterVideosByWatchState(
      Array.isArray(data?.videos) ? data.videos : [],
      unwatchedOnly,
    ),
    unwatchedOnly,
  };
}

function buildSubscriptionsRowRecord({
  subscriptionVideos,
  unwatchedOnly,
}) {
  return {
    rowId: constants.SUBSCRIPTIONS_ROW_ID,
    type: "subscriptions",
    title: "Subscriptions",
    videos: filterVideosByWatchState(
      Array.isArray(subscriptionVideos) ? subscriptionVideos : [],
      unwatchedOnly,
    ),
    unwatchedOnly,
  };
}

function orderByRowIds(itemsByRowId, rowOrder) {
  const orderedItems = [];

  for (const rowId of rowOrder) {
    const item = itemsByRowId.get(rowId);

    if (!item) {
      continue;
    }

    orderedItems.push(item);
    itemsByRowId.delete(rowId);
  }

  orderedItems.push(...itemsByRowId.values());

  return orderedItems;
}

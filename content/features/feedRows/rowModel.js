import * as constants from "../../core/constants.js";
import * as settingsStore from "../../core/settings.js";

export function buildFeedRowRecords({
  settings,
  playlistRows,
  subscriptionVideos,
}) {
  const playlistRowsByRowId = new Map(
    playlistRows.map((row) => [
      settingsStore.getPlaylistRowId(row.playlist.playlistId),
      row,
    ]),
  );
  const recordsByRowId = new Map();

  for (const [rowId, { playlist, data }] of playlistRowsByRowId) {
    const videos = filterVideosByWatchState(
      Array.isArray(data?.videos) ? data.videos : [],
      playlist.unwatchedOnly,
    );

    recordsByRowId.set(rowId, {
      rowId,
      type: "playlist",
      playlist,
      title: data?.title || playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
      videos,
      unwatchedOnly: playlist.unwatchedOnly,
    });
  }

  if (settings.showSubscriptions) {
    recordsByRowId.set(constants.SUBSCRIPTIONS_ROW_ID, {
      rowId: constants.SUBSCRIPTIONS_ROW_ID,
      type: "subscriptions",
      title: "Subscriptions",
      videos: filterVideosByWatchState(
        subscriptionVideos,
        settings.subscriptionsUnwatchedOnly,
      ),
      unwatchedOnly: settings.subscriptionsUnwatchedOnly,
    });
  }

  const orderedRecords = [];

  for (const rowId of settings.rowOrder) {
    const record = recordsByRowId.get(rowId);

    if (!record) {
      continue;
    }

    orderedRecords.push(record);
    recordsByRowId.delete(rowId);
  }

  orderedRecords.push(...recordsByRowId.values());

  return orderedRecords;
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

  const orderedDescriptors = [];

  for (const rowId of settings.rowOrder) {
    const descriptor = descriptorsByRowId.get(rowId);

    if (!descriptor) {
      continue;
    }

    orderedDescriptors.push(descriptor);
    descriptorsByRowId.delete(rowId);
  }

  orderedDescriptors.push(...descriptorsByRowId.values());

  return orderedDescriptors;
}

export function buildFeedRowRecord({ descriptor, data }) {
  if (descriptor.type === "subscriptions") {
    return {
      rowId: constants.SUBSCRIPTIONS_ROW_ID,
      type: "subscriptions",
      title: "Subscriptions",
      videos: filterVideosByWatchState(
        Array.isArray(data) ? data : [],
        descriptor.unwatchedOnly,
      ),
      unwatchedOnly: descriptor.unwatchedOnly,
    };
  }

  const playlist = descriptor.playlist;

  return {
    rowId: descriptor.rowId,
    type: "playlist",
    playlist,
    title: data?.title || playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
    videos: filterVideosByWatchState(
      Array.isArray(data?.videos) ? data.videos : [],
      descriptor.unwatchedOnly,
    ),
    unwatchedOnly: descriptor.unwatchedOnly,
  };
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

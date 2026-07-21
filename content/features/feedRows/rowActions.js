import * as constants from "../../core/constants.js";
import * as settingsStore from "../../core/settings.js";

import { getActiveRowIds, swapRowIds } from "./rowModel.js";

export function createRowControls({ record, index, rowCount }) {
  return {
    disableMoveUp: index <= 0,
    disableMoveDown: index >= rowCount - 1,
    unwatchedOnly: record.unwatchedOnly,
    canRemove: true,
    onMoveUp: () => {
      void moveRow(record.rowId, -1);
    },
    onMoveDown: () => {
      void moveRow(record.rowId, 1);
    },
    onToggleUnwatchedOnly: () => {
      void toggleRowUnwatchedOnly(record);
    },
    onRemove: () => {
      void removeRowWithConfirmation(record);
    },
  };
}

export async function moveRow(rowId, direction) {
  const settings = await settingsStore.readSettings();
  const activeRowIds = getActiveRowIds(settings);
  const activeIndex = activeRowIds.indexOf(rowId);
  const swapRowId = activeRowIds[activeIndex + direction];

  if (!swapRowId) {
    return;
  }

  await settingsStore.writeSettings({
    ...settings,
    rowOrder: swapRowIds(settings.rowOrder, rowId, swapRowId),
  });
}

export async function toggleRowUnwatchedOnly(record) {
  const settings = await settingsStore.readSettings();

  if (record.type === "subscriptions") {
    await settingsStore.writeSettings({
      ...settings,
      subscriptionsUnwatchedOnly: !settings.subscriptionsUnwatchedOnly,
    });

    return;
  }

  await settingsStore.writeSettings({
    ...settings,
    playlists: settings.playlists.map((playlist) =>
      playlist.playlistId === record.playlist.playlistId
        ? {
            ...playlist,
            unwatchedOnly: !playlist.unwatchedOnly,
          }
        : playlist,
    ),
  });
}

export async function removeRowWithConfirmation(record) {
  const title =
    record.type === "subscriptions"
      ? "Subscriptions"
      : record.playlist.title || constants.DEFAULT_PLAYLIST_TITLE;
  const shouldRemove = window.confirm(`Remove "${title}" from WatchTube?`);

  if (!shouldRemove) {
    return;
  }

  const settings = await settingsStore.readSettings();

  if (record.type === "subscriptions") {
    await settingsStore.writeSettings({
      ...settings,
      showSubscriptions: false,
    });

    return;
  }

  await settingsStore.writeSettings({
    ...settings,
    playlists: settings.playlists.filter(
      (entry) => entry.playlistId !== record.playlist.playlistId,
    ),
    rowOrder: settings.rowOrder.filter((entry) => entry !== record.rowId),
  });
}

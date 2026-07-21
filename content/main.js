"use strict";

import * as constants from "./core/constants.js";
import * as account from "./core/account.js";
import * as settingsStore from "./core/settings.js";
import * as youtube from "./core/youtube.js";

import { ensureStyleElement } from "./styles/inject.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";

import {
  closeAddPlaylistDialog,
  openAddPlaylistDialog,
} from "./features/feedRows/playlists/dialog.js";
import * as playlists from "./features/feedRows/playlists/index.js";
import { buildFeedRowRecords } from "./features/feedRows/rowModel.js";
import { createRowControls } from "./features/feedRows/rowActions.js";
import * as subscriptions from "./features/feedRows/subscriptions/index.js";
import * as feedRowRenderer from "./features/feedRows/shared/render.js";

let domObserverStarted = false;
let refreshScheduled = false;
let scheduledForceDataRefresh = false;
let refreshInFlight = null;
let refreshRequestedDuringFlight = false;
let refreshRequestedForceDuringFlight = false;
let pendingGridRetry = null;
let pendingGridRetryForceDataRefresh = false;
let lastAccountKey = null;
let renderedFeedRowIds = new Set();
let editMode = false;
let handledEditModeRequest = null;
let bootstrapRefreshTimer = null;
let bootstrapRefreshAttempts = 0;

start();

function start() {
  void ensureStyleElement();

  watchYoutubeNavigation();
  watchPageReadiness();
  watchYoutubeDom();
  watchStorageChanges();
  void activateRequestedEditMode();

  scheduleRefresh();
  startBootstrapRefreshes();
}

function watchYoutubeNavigation() {
  window.addEventListener("yt-navigate-finish", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });
}

function watchPageReadiness() {
  window.addEventListener("DOMContentLoaded", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });

  window.addEventListener("load", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });

  window.addEventListener("pageshow", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleRefresh();
      startBootstrapRefreshes();
    }
  });
}

function watchYoutubeDom() {
  if (domObserverStarted) {
    return;
  }

  domObserverStarted = true;

  const observer = new MutationObserver((mutations) => {
    if (feedRowRenderer.isRenderInProgress()) {
      return;
    }

    if (!youtube.isHomePage()) {
      return;
    }

    if (shouldReactToMutations(mutations)) {
      scheduleRefresh();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function watchStorageChanges() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (changes[constants.EDIT_MODE_REQUEST_KEY]) {
      void activateRequestedEditMode();
    }

    if (!hasRelevantStorageChange(changes)) {
      return;
    }

    scheduleRefresh({
      forceDataRefresh: Boolean(changes[constants.SETTINGS_KEY]),
    });
  });
}

function scheduleRefresh({ forceDataRefresh = false } = {}) {
  scheduledForceDataRefresh = scheduledForceDataRefresh || forceDataRefresh;

  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;

  requestAnimationFrame(() => {
    refreshScheduled = false;
    const forceRefresh = scheduledForceDataRefresh;
    scheduledForceDataRefresh = false;

    void refreshPage({ forceDataRefresh: forceRefresh });
  });
}

function startBootstrapRefreshes({ forceDataRefresh = false } = {}) {
  if (!youtube.isHomePage()) {
    return;
  }

  bootstrapRefreshAttempts = 0;

  if (bootstrapRefreshTimer) {
    window.clearInterval(bootstrapRefreshTimer);
  }

  bootstrapRefreshTimer = window.setInterval(() => {
    bootstrapRefreshAttempts += 1;

    if (!youtube.isHomePage() || bootstrapRefreshAttempts > 20) {
      window.clearInterval(bootstrapRefreshTimer);
      bootstrapRefreshTimer = null;

      return;
    }

    scheduleRefresh({
      forceDataRefresh: forceDataRefresh && bootstrapRefreshAttempts === 1,
    });
  }, 750);
}

async function refreshPage({ forceDataRefresh = false } = {}) {
  if (refreshInFlight) {
    refreshRequestedDuringFlight = true;
    refreshRequestedForceDuringFlight =
      refreshRequestedForceDuringFlight || forceDataRefresh;

    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    let settings = await settingsStore.readSettings();

    if (!document.getElementById(constants.STYLE_ID)) {
      await ensureStyleElement();
    }

    if (!settings.enabled) {
      applyShortsVisibility(false);
      closeAddPlaylistDialog();
      clearManagedRows();

      return;
    }

    applyShortsVisibility(settings.hideShorts);

    if (!youtube.isHomePage()) {
      clearManagedRows();

      return;
    }

    if (!account.isSignedIn()) {
      pendingGridRetry = clearPendingRefresh(pendingGridRetry);
      lastAccountKey = account.getCurrentAccountKey();
      editMode = false;
      closeAddPlaylistDialog();
      feedRowRenderer.resetRenderState();
      clearManagedRows();

      return;
    }

    const grid = youtube.findHomeContents();

    if (!grid) {
      scheduleDeferredRefresh({ forceDataRefresh });

      return;
    }

    if (!account.isReadyForRefresh(lastAccountKey)) {
      scheduleDeferredRefresh({ forceDataRefresh });

      return;
    }

    pendingGridRetry = clearPendingRefresh(pendingGridRetry);

    const currentAccountKey = account.getCurrentAccountKey();

    if (lastAccountKey && lastAccountKey !== currentAccountKey) {
      forceDataRefresh = true;
      feedRowRenderer.resetRenderState();
      clearManagedRows();
    }

    lastAccountKey = currentAccountKey;
    const enabledPlaylists = settings.playlists.filter((playlist) => playlist.enabled);

    const [playlistRows, subscriptionVideos] = await Promise.all([
      Promise.all(
        enabledPlaylists.map(async (playlist) => {
          const data = await playlists.storage.getPlaylistData({
            playlist,
            force: forceDataRefresh,
          });

          return {
            playlist,
            data,
          };
        }),
      ),
      settings.showSubscriptions
        ? subscriptions.storage.getSubscriptionVideos({
            force: forceDataRefresh,
          })
        : Promise.resolve([]),
    ]);

    if (account.getCurrentAccountKey() !== currentAccountKey) {
      feedRowRenderer.resetRenderState();
      clearManagedRows();
      refreshRequestedDuringFlight = true;
      refreshRequestedForceDuringFlight = true;

      return;
    }

    settings = await syncStoredPlaylistTitles(settings, playlistRows);
    feedRowRenderer.renderEditModeButton(grid, {
      isEditing: editMode,
      onToggle: () => {
        setEditMode(!editMode);
      },
    });

    if (editMode) {
      feedRowRenderer.renderAddPlaylistRow(grid, {
        onAdd: () => {
          void openAddPlaylistDialog();
        },
      });
    } else {
      feedRowRenderer.removeFeedRow("playlist-add");
    }

    syncFeedRows({
      grid,
      settings,
      playlistRows,
      subscriptionVideos,
    });
  })();

  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;

    if (refreshRequestedDuringFlight) {
      const forceRefresh = refreshRequestedForceDuringFlight;
      refreshRequestedDuringFlight = false;
      refreshRequestedForceDuringFlight = false;
      scheduleRefresh({ forceDataRefresh: forceRefresh });
    }
  }
}

function shouldReactToMutations(mutations) {
  for (const mutation of mutations) {
    if (
      containsRelevantMutation(mutation.addedNodes) ||
      containsRelevantMutation(mutation.removedNodes)
    ) {
      return true;
    }
  }

  return false;
}

function hasRelevantStorageChange(changes) {
  return Object.keys(changes).some(
    (key) =>
      key === constants.SETTINGS_KEY ||
      key.startsWith(`${constants.PLAYLISTS_CACHE_KEY}:`) ||
      key.startsWith(`${constants.SUBSCRIPTIONS_CACHE_KEY}:`),
  );
}

function containsRelevantMutation(nodes) {
  for (const node of nodes) {
    if (!(node instanceof Element)) {
      continue;
    }

    if (node.id === constants.STYLE_ID) {
      continue;
    }

    if (feedRowRenderer.isWatchTubeNode(node)) {
      continue;
    }

    return true;
  }

  return false;
}

function scheduleDeferredRefresh({ forceDataRefresh = false } = {}) {
  pendingGridRetryForceDataRefresh =
    pendingGridRetryForceDataRefresh || forceDataRefresh;

  if (pendingGridRetry) {
    return;
  }

  pendingGridRetry = window.setTimeout(() => {
    const forceRefresh = pendingGridRetryForceDataRefresh;
    pendingGridRetry = null;
    pendingGridRetryForceDataRefresh = false;
    scheduleRefresh({ forceDataRefresh: forceRefresh });
  }, 500);
}

function clearPendingRefresh(timeoutId) {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }

  pendingGridRetryForceDataRefresh = false;

  return null;
}

async function activateRequestedEditMode() {
  const stored = await chrome.storage.local.get(constants.EDIT_MODE_REQUEST_KEY);
  const request = stored[constants.EDIT_MODE_REQUEST_KEY];
  const requestId = String(request?.id || "");
  const requestedAt = Number(request?.requestedAt || 0);
  const requestIsFresh = Date.now() - requestedAt < 60 * 1000;

  if (!requestId || requestId === handledEditModeRequest || !requestIsFresh) {
    return;
  }

  handledEditModeRequest = requestId;
  setEditMode(true);
}

function setEditMode(isEditing) {
  if (editMode === isEditing) {
    return;
  }

  editMode = isEditing;

  if (!editMode) {
    closeAddPlaylistDialog();
  }

  scheduleRefresh();
}

async function syncStoredPlaylistTitles(settings, playlistRows) {
  const nextTitlesByPlaylistId = new Map();

  for (const { playlist, data } of playlistRows) {
    const title = String(data?.title || "").trim();

    if (title) {
      nextTitlesByPlaylistId.set(playlist.playlistId, title);
    }
  }

  let changed = false;

  const playlists = settings.playlists.map((playlist) => {
    const nextTitle = nextTitlesByPlaylistId.get(playlist.playlistId);

    if (!nextTitle || nextTitle === playlist.title) {
      return playlist;
    }

    changed = true;

    return {
      ...playlist,
      title: nextTitle,
    };
  });

  if (!changed) {
    return settings;
  }

  return settingsStore.writeSettings({
    ...settings,
    playlists,
  });
}

function syncFeedRows({ grid, settings, playlistRows, subscriptionVideos }) {
  const records = buildFeedRowRecords({
    settings,
    playlistRows,
    subscriptionVideos,
  });
  const nextRenderedRowIds = new Set();

  for (const [index, record] of records.entries()) {
    if (!record.videos.length && !editMode) {
      clearFeedRow(record.rowId);
      continue;
    }

    feedRowRenderer.renderFeedRow(grid, {
      rowId: record.rowId,
      title: record.title,
      videos: record.videos,
      loadAvatar: playlists.api.getChannelAvatarUrl,
      controls: editMode
        ? createRowControls({
            record,
            index,
            rowCount: records.length,
          })
        : null,
      controlsSignature: [
        editMode,
        record.rowId,
        index,
        records.length,
        record.unwatchedOnly,
      ].join(":"),
    });

    nextRenderedRowIds.add(record.rowId);
  }

  for (const rowId of renderedFeedRowIds) {
    if (!nextRenderedRowIds.has(rowId)) {
      clearFeedRow(rowId);
    }
  }

  renderedFeedRowIds = nextRenderedRowIds;
}

function clearManagedRows() {
  const rowIds = new Set(renderedFeedRowIds);

  document.querySelectorAll(".watchtube-section").forEach((section) => {
    const rowId = section.dataset.watchtubeRow;

    if (rowId) {
      rowIds.add(rowId);
    }
  });

  for (const rowId of rowIds) {
    clearFeedRow(rowId);
  }

  renderedFeedRowIds = new Set();
}

function clearFeedRow(rowId) {
  feedRowRenderer.removeFeedRow(rowId);
  feedRowRenderer.clearRenderState(rowId);
}

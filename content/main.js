"use strict";

import * as constants from "./core/constants.js";
import * as account from "./core/account.js";
import * as settingsStore from "./core/settings.js";
import * as youtube from "./core/youtube.js";

import { ensureStyleElement } from "./styles/inject.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";

import * as playlists from "./features/feedRows/playlists/index.js";
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
let renderedPlaylistRowIds = new Set();

start();

function start() {
  void ensureStyleElement();

  watchYoutubeNavigation();
  watchYoutubeDom();
  watchStorageChanges();

  scheduleRefresh({ forceDataRefresh: true });
}

function watchYoutubeNavigation() {
  window.addEventListener("yt-navigate-finish", () => {
    scheduleRefresh({ forceDataRefresh: true });
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

    applyShortsVisibility(settings.hideShorts);

    if (!youtube.isHomePage()) {
      clearPlaylistRows();
      clearSubscriptions();

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
      clearPlaylistRows();
      clearSubscriptions();
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
      clearPlaylistRows();
      clearSubscriptions();
      refreshRequestedDuringFlight = true;
      refreshRequestedForceDuringFlight = true;

      return;
    }

    settings = await syncStoredPlaylistTitles(settings, playlistRows);
    syncPlaylistRows(grid, playlistRows);

    if (settings.showSubscriptions) {
      if (subscriptionVideos.length) {
        feedRowRenderer.renderFeedRow(grid, {
          rowId: "subscriptions",
          title: "Subscriptions",
          videos: subscriptionVideos,
          loadAvatar: playlists.api.getChannelAvatarUrl,
        });
      } else {
        clearSubscriptions();
      }
    } else {
      clearSubscriptions();
    }
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

function clearSubscriptions() {
  feedRowRenderer.removeFeedRow("subscriptions");
  feedRowRenderer.clearRenderState("subscriptions");
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

function syncPlaylistRows(grid, playlistRows) {
  const nextRenderedRowIds = new Set();

  for (const { playlist, data } of playlistRows) {
    const rowId = getPlaylistRowId(playlist);
    const videos = Array.isArray(data?.videos) ? data.videos : [];

    if (!videos.length) {
      clearPlaylistRow(rowId);
      continue;
    }

    feedRowRenderer.renderFeedRow(grid, {
      rowId,
      title: data?.title || playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
      videos,
      loadAvatar: playlists.api.getChannelAvatarUrl,
    });

    nextRenderedRowIds.add(rowId);
  }

  for (const rowId of renderedPlaylistRowIds) {
    if (!nextRenderedRowIds.has(rowId)) {
      clearPlaylistRow(rowId);
    }
  }

  renderedPlaylistRowIds = nextRenderedRowIds;
}

function clearPlaylistRows() {
  const rowIds = new Set(renderedPlaylistRowIds);

  document
    .querySelectorAll('.watchtube-section[data-watchtube-row^="playlist-"]')
    .forEach((section) => {
      const rowId = section.dataset.watchtubeRow;

      if (rowId) {
        rowIds.add(rowId);
      }
    });

  for (const rowId of rowIds) {
    clearPlaylistRow(rowId);
  }

  renderedPlaylistRowIds = new Set();
}

function clearPlaylistRow(rowId) {
  feedRowRenderer.removeFeedRow(rowId);
  feedRowRenderer.clearRenderState(rowId);
}

function getPlaylistRowId(playlist) {
  return `playlist-${playlist.id || playlist.playlistId}`;
}

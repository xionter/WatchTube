"use strict";

import * as constants from "./core/constants.js";
import * as account from "./core/account.js";
import * as youtube from "./core/youtube.js";

import { ensureStyleElement } from "./styles/inject.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";

import * as watchLater from "./features/feedRows/watchLater/index.js";
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
    const settings = await watchLater.storage.readSettings();

    if (!document.getElementById(constants.STYLE_ID)) {
      await ensureStyleElement();
    }

    applyShortsVisibility(settings.hideShorts);

    if (!youtube.isHomePage()) {
      clearWatchLater();
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
      clearWatchLater();
      clearSubscriptions();
    }

    lastAccountKey = currentAccountKey;

    const [videos, subscriptionVideos] = await Promise.all([
      settings.showWatchLater
        ? watchLater.storage.getWatchLaterVideos({
            force: forceDataRefresh,
          })
        : Promise.resolve([]),

      settings.showSubscriptions
        ? subscriptions.storage.getSubscriptionVideos({
            force: forceDataRefresh,
          })
        : Promise.resolve([]),
    ]);

    if (account.getCurrentAccountKey() !== currentAccountKey) {
      feedRowRenderer.resetRenderState();
      clearWatchLater();
      clearSubscriptions();
      refreshRequestedDuringFlight = true;
      refreshRequestedForceDuringFlight = true;

      return;
    }

    if (!videos.length) {
      clearWatchLater();
    }

    if (!subscriptionVideos.length) {
      clearSubscriptions();
    }

    if (settings.showWatchLater) {
      if (videos.length) {
        feedRowRenderer.renderFeedRow(grid, {
          rowId: "watch-later",
          title: "Watch Later",
          videos,
          loadAvatar: watchLater.api.getChannelAvatarUrl,
        });
      }
    } else {
      clearWatchLater();
    }

    if (settings.showSubscriptions) {
      if (subscriptionVideos.length) {
        feedRowRenderer.renderFeedRow(grid, {
          rowId: "subscriptions",
          title: "Subscriptions",
          videos: subscriptionVideos,
          loadAvatar: watchLater.api.getChannelAvatarUrl,
        });
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
      key === constants.CACHE_KEY ||
      key.startsWith(`${constants.CACHE_KEY}:`) ||
      key.startsWith("watchTubeSubscriptionsCache:"),
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

function clearWatchLater() {
  feedRowRenderer.removeFeedRow("watch-later");
  feedRowRenderer.clearRenderState("watch-later");
}

function clearSubscriptions() {
  feedRowRenderer.removeFeedRow("subscriptions");
  feedRowRenderer.clearRenderState("subscriptions");
}

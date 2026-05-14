"use strict";

import * as constants from "./core/constants.js";
import * as youtube from "./core/youtube.js";

import { ensureStyleElement } from "./styles/inject.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";

import * as watchLater from "./features/feedRows/watchLater/index.js";
import * as subscriptions from "./features/feedRows/subscriptions/index.js";
import * as feedRowRenderer from "./features/feedRows/shared/render.js";

let domObserverStarted = false;
let refreshScheduled = false;
let refreshInFlight = null;
let pendingGridRetry = null;

start();

function start() {
  void ensureStyleElement();

    watchYoutubeNavigation();
    watchYoutubeDom();
  watchStorageChanges();

  scheduleRefresh();
}

function watchYoutubeNavigation() {
  window.addEventListener("yt-navigate-finish", () => {
    feedRowRenderer.resetRenderState();

    scheduleRefresh();
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

  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      scheduleRefresh();
      return;
    }
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

    if (!changes[constants.SETTINGS_KEY] && !changes[constants.CACHE_KEY]) {
      return;
    }

    scheduleRefresh();
  });
}

function scheduleRefresh() {
  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;

  requestAnimationFrame(() => {
    refreshScheduled = false;

    void refreshPage();
  });
}

async function refreshPage() {
  if (refreshInFlight) {
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
  if (!pendingGridRetry) {
    pendingGridRetry = window.setTimeout(() => {
      pendingGridRetry = null;
      scheduleRefresh();
    }, 800);
  }

  return;
}
const [videos, subscriptionVideos] = await Promise.all([
  settings.showWatchLater
    ? watchLater.storage.getWatchLaterVideos()
    : Promise.resolve([]),

  settings.showSubscriptions
    ? subscriptions.storage.getSubscriptionVideos()
    : Promise.resolve([]),
]);

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
  }
}

function clearWatchLater() {
  feedRowRenderer.removeFeedRow("watch-later");
  feedRowRenderer.clearRenderState("watch-later");
}

function clearSubscriptions() {
  feedRowRenderer.removeFeedRow("subscriptions");
  feedRowRenderer.clearRenderState("subscriptions");
}

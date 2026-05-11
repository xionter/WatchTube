"use strict";

import * as constants from "./core/constants.js";
import * as youtube from "./core/youtube.js";

import { ensureStyleElement } from "./styles/inject.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";

import * as watchLater from "./features/feedRows/watchLater/index.js";
import * as feedRowRenderer from "./features/feedRows/shared/render.js";

let domObserverStarted = false;
let refreshScheduled = false;
let refreshInFlight = null;

let lastPageUrl = location.href;

start();

function start() {
  void ensureStyleElement();

  watchYoutubeDom();
  watchStorageChanges();

  scheduleRefresh();
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

    const navigated = location.href !== lastPageUrl;

    if (navigated) {
      lastPageUrl = location.href;

      feedRowRenderer.resetRenderState();
    }

    if (!navigated && !shouldReactToMutations(mutations)) {
      return;
    }

    scheduleRefresh();
  });
  observer.observe(document.documentElement, {
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

    await ensureStyleElement();

    applyShortsVisibility(settings.hideShorts);

    if (!settings.showWatchLater || !youtube.isHomePage()) {
      clearWatchLater();

      return;
    }

    const grid = youtube.findHomeContents();

    if (!grid) {
      window.setTimeout(scheduleRefresh, 800);

      return;
    }

    const videos = await watchLater.storage.getWatchLaterVideos();

    if (!videos.length) {
      clearWatchLater();

      return;
    }
    feedRowRenderer.renderFeedRow(grid, {
      rowId: "watch-later",
      title: "Watch Later",
      videos,
    });
  })();

  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
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

function clearWatchLater() {
  feedRowRenderer.removeFeedRow("watch-later");

  feedRowRenderer.resetRenderState();
}

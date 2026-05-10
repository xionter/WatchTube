"use strict";

import * as constants from "./core/constants.js";
import * as youtube from "./core/youtube.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";
import * as watchLater from "./features/watchLater/index.js";
import { ensureStyleElement } from "./styles/inject.js";

let domObserverStarted = false;
let refreshScheduled = false;
let refreshInFlight = null;
let lastPageUrl = location.href;
let lastRenderedSignature = "";

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
    const navigated = location.href !== lastPageUrl;

    if (navigated) {
      lastPageUrl = location.href;
      lastRenderedSignature = "";
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
    const settings = await readSettings();

    await ensureStyleElement();

    applyShortsVisibility(settings.hideShorts);

    if (!settings.showWatchLater || !youtube.isHomePage()) {
      watchLater.render.removeExistingWatchTubeNodes();
      lastRenderedSignature = "";
      return;
    }

    const grid = youtube.findHomeContents();

    if (!grid) {
      window.setTimeout(scheduleRefresh, 800);
      return;
    }

    const videos = await getWatchLaterVideos();

    if (!videos.length) {
      watchLater.render.removeExistingWatchTubeNodes();
      lastRenderedSignature = "";
      return;
    }

    watchLater.render.renderWatchLaterItems(grid, videos);
  })();

  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function readSettings() {
  const stored = await chrome.storage.local.get(constants.SETTINGS_KEY);

  return {
    ...constants.DEFAULT_SETTINGS,
    ...(stored[constants.SETTINGS_KEY] || {}),
  };
}

async function getWatchLaterVideos() {
  const now = Date.now();

  const stored = await chrome.storage.local.get(constants.CACHE_KEY);

  const cache = stored[constants.CACHE_KEY];

  if (
    cache &&
    cache.version === constants.CACHE_VERSION &&
    Array.isArray(cache.items) &&
    cache.items.length &&
    now - cache.updatedAt < constants.CACHE_TTL_MS
  ) {
    return cache.items;
  }

  try {
    const items = await watchLater.api.fetchWatchLater();

    await chrome.storage.local.set({
      [constants.CACHE_KEY]: {
        version: constants.CACHE_VERSION,
        items,
        updatedAt: now,
      },
    });

    return items;
  } catch (error) {
    console.warn("WatchTube: failed to refresh Watch Later", error);

    return cache && Array.isArray(cache.items) ? cache.items : [];
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

    if (node.classList.contains("watchtube-item") || node.closest(".watchtube-item")) {
      continue;
    }

    return true;
  }

  return false;
}

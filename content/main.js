"use strict";

import * as constants from "./core/constants.js";
import * as utils from "./core/utils.js";
import * as youtube from "./core/youtube.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";
import * as watchLater from "./features/watchLater/index.js";

let domObserverStarted = false;
let refreshScheduled = false;
let refreshInFlight = null;
let lastPageUrl = location.href;
let lastRenderedSignature = "";
let shuffleLocked = false;

start();

function start() {
  ensureStyleElement();
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

    ensureStyleElement();

    applyShortsVisibility(settings.hideShorts);

    if (!settings.showWatchLater || !youtube.isHomePage()) {
      removeExistingItems();
      lastRenderedSignature = "";
      return;
    }

    const grid = findHomeContents();

    if (!grid) {
      window.setTimeout(scheduleRefresh, 800);
      return;
    }

    const videos = await getWatchLaterVideos();

    if (!videos.length) {
      removeExistingItems();
      lastRenderedSignature = "";
      return;
    }

    renderWatchLaterItems(grid, videos);
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

function ensureStyleElement() {
  let style = document.getElementById(constants.STYLE_ID);

  if (!style) {
    style = document.createElement("style");
    style.id = constants.STYLE_ID;

    document.documentElement.appendChild(style);
  }

  const css = buildWatchTubeCss();

  if (style.textContent === css) {
    return;
  }

  style.textContent = css;
}

function buildWatchTubeCss() {
  return `
        .watchtube-item * {
            box-sizing: border-box;
        }

        .watchtube-grid,
        .watchtube-item {
            position: relative;
        }

        .watchtube-grid {
            padding-top: 54px;
        }

        .watchtube-card {
            display: grid;
            gap: 12px;

            color: #f1f1f1 !important;

            text-decoration: none;
        }

        .watchtube-thumb-wrap {
            position: relative;

            overflow: hidden;

            width: 100%;
            aspect-ratio: 16 / 9;

            border-radius: 12px;

            background: #222;
        }

        .watchtube-thumb {
            display: block;

            width: 100%;
            height: 100%;

            object-fit: cover;

            transition: transform 180ms ease;
        }

        .watchtube-card:hover .watchtube-thumb {
            transform: scale(1.02);
        }

        .watchtube-meta {
            display: grid;

            grid-template-columns:
                36px
                minmax(0, 1fr);

            gap: 12px;

            min-width: 0;

            align-items: start;
        }

        .watchtube-avatar {
            display: grid;
            place-items: center;

            width: 36px;
            height: 36px;

            border-radius: 50%;

            object-fit: cover;

            background: #303030;
            color: #fff;

            flex-shrink: 0;

            font:
                700
                15px/1
                Roboto,
                Arial,
                sans-serif;
        }

        .watchtube-copy {
            min-width: 0;
        }

        .watchtube-card-title {
            display: -webkit-box;

            overflow: hidden;

            color: #f1f1f1 !important;

            font-family:
                Roboto,
                Arial,
                sans-serif;

            font-size: 1.6rem;
            font-weight: 500;
            line-height: 2.2rem;

            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
        }

        .watchtube-card-channel,
        .watchtube-card-source {
            overflow: hidden;

            color: #aaaaaa !important;

            font-family:
                Roboto,
                Arial,
                sans-serif;

            font-size: 1.4rem;
            line-height: 2rem;

            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .watchtube-card-channel {
            margin-top: 4px;
        }

        .watchtube-shuffle {
            position: absolute;

            top: 6px;
            right: 16px;

            z-index: 2;

            min-height: 42px;

            padding: 0 18px;

            border: none;
            border-radius: 999px;

            background: #ff0033;
            color: white;

            cursor: pointer;

            font:
                700
                14px/1
                Roboto,
                Arial,
                sans-serif;

            transition:
                background 160ms ease,
                transform 160ms ease,
                opacity 160ms ease;
        }

        .watchtube-shuffle:hover {
            background: #ff3355;
            transform: translateY(-1px);
        }

        .watchtube-shuffle:active {
            transform: translateY(0);
        }

        .watchtube-shuffle:disabled {
            cursor: default;
        }
    `;
}

function findHomeContents() {
  for (const selector of youtube.HOME_CONTENT_SELECTORS) {
    const grid = document.querySelector(selector);

    if (grid) {
      return grid;
    }
  }

  return null;
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

async function preloadImages(urls) {
  await Promise.all(
    urls.map((url) => {
      return new Promise((resolve) => {
        if (!url) {
          resolve();
          return;
        }

        const img = new Image();

        img.onload = resolve;
        img.onerror = resolve;

        img.src = url;
      });
    }),
  );
}

function renderWatchLaterItems(grid, videos) {
  const existingItems = Array.from(
    document.querySelectorAll(".watchtube-item"),
  );

  const existingButton = document.querySelector(".watchtube-shuffle");

  const existingGrid = existingItems.length
    ? existingItems[0].parentElement
    : null;

  const signature = buildRenderSignature(videos);

  if (
    existingItems.length &&
    existingButton &&
    existingGrid === grid &&
    lastRenderedSignature === signature
  ) {
    return;
  }

  replaceWatchLaterItems(grid, videos);

  lastRenderedSignature = signature;
}

function replaceWatchLaterItems(grid, videos) {
  removeExistingWatchTubeNodes();

  grid.classList.add("watchtube-grid");

  const picks = utils.shuffle([...videos]).slice(0, constants.MAX_FIRST_ROW_VIDEOS);

  const items = picks.map(createGridItem);

  const firstFeedItem = findFirstFeedItem(grid);

  grid.insertBefore(createShuffleButton(grid, videos), firstFeedItem);

  for (const item of items) {
    grid.insertBefore(item, firstFeedItem);
  }
}

function findFirstFeedItem(grid) {
  return [...grid.children].find((child) => !isWatchTubeNode(child)) || null;
}

function createGridItem(video) {
  const item = document.createElement("ytd-rich-item-renderer");

  item.className = "watchtube-item";

  item.append(createCard(video));

  return item;
}

function createShuffleButton(grid, videos) {
  const button = document.createElement("button");

  button.className = "watchtube-shuffle";

  button.type = "button";

  button.textContent = "Shuffle ↻";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (shuffleLocked) {
      return;
    }

    shuffleLocked = true;

    button.disabled = true;
    button.style.opacity = "0.7";

    try {
      replaceWatchLaterItems(grid, videos);
    } finally {
      setTimeout(() => {
        shuffleLocked = false;

        button.disabled = false;
        button.style.opacity = "1";
      }, 250);
    }
  });

  return button;
}

function createCard(video) {
  const card = document.createElement("a");

  card.className = "watchtube-card";

  card.href = video.url;

  card.target = "_blank";

  card.rel = "noreferrer";

  const avatar = findVisibleChannelAvatar(video);

  const avatarMarkup = avatar
    ? createAvatarImageMarkup(avatar)
    : createAvatarPlaceholderMarkup(video);

  card.innerHTML = `
        <div class="watchtube-thumb-wrap">
            <img
                class="watchtube-thumb"
                src="${utils.escapeHtml(video.thumbnail)}"
                alt=""
            >
        </div>

        <div class="watchtube-meta">

            ${avatarMarkup}

            <div class="watchtube-copy">

                <div class="watchtube-card-title">
                    ${utils.escapeHtml(video.title)}
                </div>

                <div class="watchtube-card-channel">
                    ${utils.escapeHtml(video.channel)}
                </div>

                <div class="watchtube-card-source">
                    Watch Later
                </div>

            </div>

        </div>
    `;

  wireAvatarFallback(card, video);
  void loadMissingChannelAvatar(card, video);

  return card;
}

function findVisibleChannelAvatar(video) {
  const videoId = utils.getVideoId(video.url);

  if (!videoId) {
    return "";
  }

  const youtubeCard = Array.from(
    document.querySelectorAll("ytd-rich-item-renderer"),
  ).find((item) => {
    const link = item.querySelector('a[href*="watch?v="]');

    return link && utils.getVideoId(link.href) === videoId;
  });

  return (
    youtubeCard?.querySelector("#avatar img[src]")?.src ||
    youtubeCard?.querySelector("yt-img-shadow img[src]")?.src ||
    ""
  );
}

function createAvatarImageMarkup(src) {
  return `
        <img
            class="watchtube-avatar"
            src="${utils.escapeHtml(src)}"
            alt=""
        >
    `;
}

function createAvatarPlaceholderMarkup(video) {
  return `
        <div
            class="watchtube-avatar"
            aria-hidden="true"
        >
            ${utils.escapeHtml(getChannelInitial(video))}
        </div>
    `;
}

function wireAvatarFallback(card, video) {
  const avatar = card.querySelector(".watchtube-avatar");

  if (!(avatar instanceof HTMLImageElement)) {
    return;
  }

  avatar.addEventListener(
    "error",
    () => {
      avatar.replaceWith(createAvatarPlaceholderElement(video));
    },
    {
      once: true,
    },
  );
}

async function loadMissingChannelAvatar(card, video) {
  const currentAvatar = card.querySelector(".watchtube-avatar");

  if (
    !currentAvatar ||
    currentAvatar instanceof HTMLImageElement ||
    !video.channelUrl
  ) {
    return;
  }

  const avatarUrl = await watchLater.api.getChannelAvatarUrl(video.channelUrl);

  if (!avatarUrl || !card.isConnected || !(await canLoadImage(avatarUrl))) {
    return;
  }

  const avatar = document.createElement("img");

  avatar.className = "watchtube-avatar";

  avatar.alt = "";
  avatar.src = avatarUrl;

  avatar.addEventListener(
    "error",
    () => {
      avatar.replaceWith(createAvatarPlaceholderElement(video));
    },
    {
      once: true,
    },
  );

  currentAvatar.replaceWith(avatar);
}

function createAvatarPlaceholderElement(video) {
  const placeholder = document.createElement("div");

  placeholder.className = "watchtube-avatar";

  placeholder.setAttribute("aria-hidden", "true");

  placeholder.textContent = getChannelInitial(video);

  return placeholder;
}

function getChannelInitial(video) {
  const initial = (video.channel || "YouTube").trim().charAt(0).toUpperCase();

  return initial || "Y";
}

function canLoadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => resolve(true);

    img.onerror = () => resolve(false);

    img.src = url;
  });
}

function removeExistingItems() {
  removeExistingWatchTubeNodes();
}

function removeExistingWatchTubeNodes() {
  for (const item of document.querySelectorAll(".watchtube-item")) {
    item.remove();
  }

  for (const button of document.querySelectorAll(".watchtube-shuffle")) {
    button.remove();
  }

  for (const grid of document.querySelectorAll(".watchtube-grid")) {
    grid.classList.remove("watchtube-grid");
  }
}

function isWatchTubeNode(node) {
  return (
    node.classList.contains("watchtube-item") ||
    node.classList.contains("watchtube-shuffle")
  );
}

function buildRenderSignature(videos) {
  return videos
    .slice(0, constants.MAX_FIRST_ROW_VIDEOS)
    .map((video) => video.url)
    .join("|");
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

    if (
      node.classList.contains("watchtube-item") ||
      node.closest(".watchtube-item")
    ) {
      continue;
    }

    return true;
  }

  return false;
}

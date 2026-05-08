"use strict";

const DEFAULT_SETTINGS = {
  showWatchLater: true,
  hideShorts: false,
};

const WATCH_LATER_URL = "https://www.youtube.com/playlist?list=WL";

const SETTINGS_KEY = "watchTubeSettings";
const CACHE_KEY = "watchTubeCache";
const STYLE_ID = "watchtube-style";

const CACHE_VERSION = 2;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_FIRST_ROW_VIDEOS = 3;
const CHANNEL_AVATAR_PROMISES = new Map();

const SHORTS_SHELF_SELECTORS = [
  "ytd-rich-shelf-renderer[is-shorts]",
  "ytd-reel-shelf-renderer",
  "ytd-rich-section-renderer ytd-reel-shelf-renderer",
  "ytd-item-section-renderer ytd-reel-shelf-renderer",
];

const SHORTS_LINK_SELECTORS =
  'a[href^="/shorts"], a[href="https://www.youtube.com/shorts"]';

const HOME_CONTENT_SELECTORS = [
  "ytd-rich-grid-renderer #contents",
  "ytd-two-column-browse-results-renderer #contents",
  "ytd-browse[page-subtype='home'] #contents",
];

const GUIDE_CONTAINER_SELECTORS = [
  "ytd-guide-entry-renderer",
  "ytd-mini-guide-entry-renderer",
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
];

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

    if (!changes[SETTINGS_KEY] && !changes[CACHE_KEY]) {
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

    if (!settings.showWatchLater || !isHomePage()) {
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
  const stored = await chrome.storage.local.get(SETTINGS_KEY);

  return {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] || {}),
  };
}

function ensureStyleElement() {
  let style = document.getElementById(STYLE_ID);

  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;

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

function applyShortsVisibility(hideShorts) {
  const display = hideShorts ? "none" : "";

  for (const shelf of document.querySelectorAll(
    SHORTS_SHELF_SELECTORS.join(", "),
  )) {
    shelf.style.display = display;
  }

  for (const link of document.querySelectorAll(SHORTS_LINK_SELECTORS)) {
    findShortsContainer(link).style.display = display;
  }
}

function findHomeContents() {
  for (const selector of HOME_CONTENT_SELECTORS) {
    const grid = document.querySelector(selector);

    if (grid) {
      return grid;
    }
  }

  return null;
}

async function getWatchLaterVideos() {
  const now = Date.now();

  const stored = await chrome.storage.local.get(CACHE_KEY);

  const cache = stored[CACHE_KEY];

  if (
    cache &&
    cache.version === CACHE_VERSION &&
    Array.isArray(cache.items) &&
    cache.items.length &&
    now - cache.updatedAt < CACHE_TTL_MS
  ) {
    return cache.items;
  }

  try {
    const items = await fetchWatchLater();

    await chrome.storage.local.set({
      [CACHE_KEY]: {
        version: CACHE_VERSION,
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

async function fetchWatchLater() {
  const response = await fetch(WATCH_LATER_URL, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Watch Later request failed with status ${response.status}`,
    );
  }

  const html = await response.text();

  const json = extractInitialData(html);

  const tabs = getValue(
    json,
    ["contents", "twoColumnBrowseResultsRenderer", "tabs"],
    [],
  );

  const contents = getValue(
    tabs[0],
    [
      "tabRenderer",
      "content",
      "sectionListRenderer",
      "contents",
      0,
      "itemSectionRenderer",
      "contents",
      0,
      "playlistVideoListRenderer",
      "contents",
    ],
    [],
  );

  const videos = [];

  for (const item of contents) {
    const video = item.playlistVideoRenderer;

    if (!video || !video.videoId) {
      continue;
    }

    videos.push({
      title: getValue(video, ["title", "runs", 0, "text"], "Без названия"),

      url: `https://www.youtube.com/watch?v=${video.videoId}`,

      channel: getValue(
        video,
        ["shortBylineText", "runs", 0, "text"],
        "YouTube",
      ),

      channelUrl: getChannelUrl(video),

      thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
    });
  }

  return videos;
}
function extractInitialData(html) {
  const patterns = [
    /var ytInitialData\s*=\s*(.*?);<\/script>/s,
    /window\["ytInitialData"\]\s*=\s*(.*?);<\/script>/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return JSON.parse(match[1]);
    }
  }

  throw new Error("ytInitialData not found");
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

  const picks = shuffle([...videos]).slice(0, MAX_FIRST_ROW_VIDEOS);

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
                src="${escapeHtml(video.thumbnail)}"
                alt=""
            >
        </div>

        <div class="watchtube-meta">

            ${avatarMarkup}

            <div class="watchtube-copy">

                <div class="watchtube-card-title">
                    ${escapeHtml(video.title)}
                </div>

                <div class="watchtube-card-channel">
                    ${escapeHtml(video.channel)}
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
  const videoId = getVideoId(video.url);

  if (!videoId) {
    return "";
  }

  const youtubeCard = Array.from(
    document.querySelectorAll("ytd-rich-item-renderer"),
  ).find((item) => {
    const link = item.querySelector('a[href*="watch?v="]');

    return link && getVideoId(link.href) === videoId;
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
            src="${escapeHtml(src)}"
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
            ${escapeHtml(getChannelInitial(video))}
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

  const avatarUrl = await getChannelAvatarUrl(video.channelUrl);

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

async function getChannelAvatarUrl(channelUrl) {
  if (!CHANNEL_AVATAR_PROMISES.has(channelUrl)) {
    CHANNEL_AVATAR_PROMISES.set(channelUrl, fetchChannelAvatarUrl(channelUrl));
  }

  return CHANNEL_AVATAR_PROMISES.get(channelUrl);
}

async function fetchChannelAvatarUrl(channelUrl) {
  try {
    const response = await fetch(channelUrl, {
      credentials: "include",
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();

    const json = extractInitialData(html);

    return findChannelAvatarUrl(json);
  } catch (error) {
    console.warn("WatchTube: failed to load channel avatar", error);

    return "";
  }
}

function findChannelAvatarUrl(json) {
  const candidateGroups = [
    getValue(
      json,
      ["metadata", "channelMetadataRenderer", "avatar", "thumbnails"],
      [],
    ),
    getValue(
      json,
      ["microformat", "microformatDataRenderer", "thumbnail", "thumbnails"],
      [],
    ),
    getValue(
      json,
      ["header", "c4TabbedHeaderRenderer", "avatar", "thumbnails"],
      [],
    ),
    getValue(
      json,
      [
        "header",
        "pageHeaderRenderer",
        "content",
        "pageHeaderViewModel",
        "image",
        "decoratedAvatarViewModel",
        "avatar",
        "avatarViewModel",
        "image",
        "sources",
      ],
      [],
    ),
    getValue(
      json,
      [
        "header",
        "pageHeaderRenderer",
        "content",
        "pageHeaderViewModel",
        "image",
        "avatarViewModel",
        "image",
        "sources",
      ],
      [],
    ),
  ];

  for (const candidates of candidateGroups) {
    const url = selectLargestImageUrl(candidates);

    if (url) {
      return url;
    }
  }

  return findNestedAvatarUrl(json);
}

function selectLargestImageUrl(candidates) {
  if (!Array.isArray(candidates)) {
    return "";
  }

  const image = candidates
    .filter((candidate) => candidate?.url)
    .sort((left, right) => {
      return (right.width || 0) - (left.width || 0);
    })[0];

  return image?.url || "";
}

function findNestedAvatarUrl(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findNestedAvatarUrl(item);

      if (url) {
        return url;
      }
    }

    return "";
  }

  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().includes("avatar")) {
      const url =
        selectLargestImageUrl(child?.thumbnails) ||
        selectLargestImageUrl(child?.image?.sources) ||
        selectLargestImageUrl(child?.avatarViewModel?.image?.sources) ||
        findNestedAvatarUrl(child);

      if (url) {
        return url;
      }
    }
  }

  for (const child of Object.values(value)) {
    const url = findNestedAvatarUrl(child);

    if (url) {
      return url;
    }
  }

  return "";
}

function getChannelUrl(video) {
  const endpoint = getValue(
    video,
    ["shortBylineText", "runs", 0, "navigationEndpoint"],
    null,
  );

  const path =
    getValue(endpoint, ["commandMetadata", "webCommandMetadata", "url"], "") ||
    getValue(endpoint, ["browseEndpoint", "canonicalBaseUrl"], "");

  return normalizeYouTubeUrl(path);
}

function normalizeYouTubeUrl(path) {
  if (!path) {
    return "";
  }

  if (path.startsWith("http")) {
    return path;
  }

  return `https://www.youtube.com${path}`;
}

function getVideoId(url) {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return "";
  }
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
    .slice(0, MAX_FIRST_ROW_VIDEOS)
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

    if (node.id === STYLE_ID) {
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

function isHomePage() {
  return location.pathname === "/";
}

function shuffle(arr) {
  for (let index = arr.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));

    [arr[index], arr[nextIndex]] = [arr[nextIndex], arr[index]];
  }

  return arr;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findShortsContainer(link) {
  for (const selector of GUIDE_CONTAINER_SELECTORS) {
    const container = link.closest(selector);

    if (container) {
      return container;
    }
  }

  return link;
}

function getValue(source, path, fallback) {
  let value = source;

  for (const part of path) {
    if (value == null || value[part] == null) {
      return fallback;
    }

    value = value[part];
  }

  return value;
}

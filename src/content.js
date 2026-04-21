"use strict";

const DEFAULT_SETTINGS = {
    showWatchLater: true,
    hideShorts: false,
    hideCategories: false
};

const WATCH_LATER_URL = "https://www.youtube.com/playlist?list=WL";
const SETTINGS_KEY = "watchTubeSettings";
const CACHE_KEY = "watchTubeCache";
const STYLE_ID = "watchtube-style";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_FIRST_ROW_VIDEOS = 3;
const SHORTS_SHELF_SELECTORS = [
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-reel-shelf-renderer",
    "ytd-rich-section-renderer ytd-reel-shelf-renderer",
    "ytd-item-section-renderer ytd-reel-shelf-renderer"
];
const SHORTS_LINK_SELECTORS = 'a[href^="/shorts"], a[href="https://www.youtube.com/shorts"]';
const CATEGORY_SELECTORS = [
    "ytd-feed-filter-chip-bar-renderer",
    "ytd-rich-grid-renderer #chips-wrapper",
    "#chips-wrapper"
];
const HOME_CONTENT_SELECTORS = [
    "ytd-rich-grid-renderer #contents",
    "ytd-two-column-browse-results-renderer #contents",
    "ytd-browse[page-subtype='home'] #contents"
];
const GUIDE_CONTAINER_SELECTORS = [
    "ytd-guide-entry-renderer",
    "ytd-mini-guide-entry-renderer",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer"
];

let domObserverStarted = false;
let refreshScheduled = false;
let refreshInFlight = null;
let lastPageUrl = location.href;
let lastRenderedSignature = "";

start();

function start() {
    ensureStyleElement();
    watchYoutubeDom();
    watchStorageChanges();
    scheduleRefresh();
}

function watchYoutubeDom() {
    if (domObserverStarted) return;
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
        subtree: true
    });
}

function watchStorageChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (!changes[SETTINGS_KEY] && !changes[CACHE_KEY]) return;
        scheduleRefresh();
    });
}

function scheduleRefresh() {
    if (refreshScheduled) return;
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
        applyCategoryVisibility(settings.hideCategories);

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
        ...(stored[SETTINGS_KEY] || {})
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
            gap: 10px;
            color: inherit;
            text-decoration: none;
        }

        .watchtube-thumb-wrap {
            position: relative;
            overflow: hidden;
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 12px;
            background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1));
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
            grid-template-columns: 36px minmax(0, 1fr);
            gap: 12px;
            min-width: 0;
        }

        .watchtube-avatar {
            display: grid;
            place-items: center;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #ff0033;
            color: #fff;
            font: 700 15px/1 Roboto, Arial, sans-serif;
        }

        .watchtube-copy {
            min-width: 0;
        }

        .watchtube-card-title {
            display: -webkit-box;
            overflow: hidden;
            color: var(--yt-spec-text-primary, #0f0f0f);
            font-family: Roboto, Arial, sans-serif;
            font-size: 1.6rem;
            font-weight: 500;
            line-height: 2.2rem;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
        }

        .watchtube-card-channel,
        .watchtube-card-source {
            overflow: hidden;
            color: var(--yt-spec-text-secondary, #606060);
            font-family: Roboto, Arial, sans-serif;
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
            border: 1px solid #ff0033;
            border-radius: 21px;
            background: #ff0033;
            color: #fff;
            cursor: pointer;
            font: 700 14px/1 Roboto, Arial, sans-serif;
            opacity: 1;
        }

        .watchtube-shuffle:hover,
        .watchtube-shuffle:active,
        .watchtube-shuffle:focus-visible {
            background: #606060;
            border-color: #606060;
        }
    `;
}

function applyShortsVisibility(hideShorts) {
    const display = hideShorts ? "none" : "";

    for (const shelf of document.querySelectorAll(SHORTS_SHELF_SELECTORS.join(", "))) {
        shelf.style.display = display;
    }

    for (const link of document.querySelectorAll(SHORTS_LINK_SELECTORS)) {
        findShortsContainer(link).style.display = display;
    }
}

function applyCategoryVisibility(hideCategories) {
    const display = hideCategories ? "none" : "";

    for (const node of document.querySelectorAll(CATEGORY_SELECTORS.join(", "))) {
        node.style.display = display;
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

    if (cache && Array.isArray(cache.items) && cache.items.length && now - cache.updatedAt < CACHE_TTL_MS) {
        return cache.items;
    }

    try {
        const items = await fetchWatchLater();
        await chrome.storage.local.set({
            [CACHE_KEY]: {
                items,
                updatedAt: now
            }
        });
        return items;
    } catch (error) {
        console.warn("WatchTube: failed to refresh Watch Later", error);
        return cache && Array.isArray(cache.items) ? cache.items : [];
    }
}

async function fetchWatchLater() {
    const response = await fetch(WATCH_LATER_URL, {
        credentials: "include"
    });

    if (!response.ok) {
        throw new Error(`Watch Later request failed with status ${response.status}`);
    }

    const html = await response.text();
    const json = extractInitialData(html);
    const tabs = getValue(json, ["contents", "twoColumnBrowseResultsRenderer", "tabs"], []);
    const contents = getValue(tabs[0], [
        "tabRenderer",
        "content",
        "sectionListRenderer",
        "contents",
        0,
        "itemSectionRenderer",
        "contents",
        0,
        "playlistVideoListRenderer",
        "contents"
    ], []);

    const videos = [];

    for (const item of contents) {
        const video = item.playlistVideoRenderer;
        if (!video || !video.videoId) continue;

        videos.push({
            title: getValue(video, ["title", "runs", 0, "text"], "Без названия"),
            url: `https://www.youtube.com/watch?v=${video.videoId}`,
            channel: getValue(video, ["shortBylineText", "runs", 0, "text"], ""),
            thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`
        });
    }

    return videos;
}

function extractInitialData(html) {
    const patterns = [
        /var ytInitialData = (.*?);<\/script>/s,
        /window\["ytInitialData"\] = (.*?);<\/script>/s
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
            return JSON.parse(match[1]);
        }
    }

    throw new Error("ytInitialData not found in Watch Later page");
}

function renderWatchLaterItems(grid, videos) {
    const existingItems = Array.from(document.querySelectorAll(".watchtube-item"));
    const existingButton = document.querySelector(".watchtube-shuffle");
    const existingGrid = existingItems.length ? existingItems[0].parentElement : null;
    const signature = buildRenderSignature(videos);

    if (existingItems.length && existingButton && existingGrid === grid && lastRenderedSignature === signature) {
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
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        replaceWatchLaterItems(grid, videos);
    });

    return button;
}

function createCard(video) {
    const card = document.createElement("a");
    card.className = "watchtube-card";
    card.href = video.url;
    card.target = "_blank";
    card.rel = "noreferrer";

    card.innerHTML = `
        <div class="watchtube-thumb-wrap">
            <img class="watchtube-thumb" src="${escapeHtml(video.thumbnail)}" alt="">
        </div>
        <div class="watchtube-meta">
            <div class="watchtube-avatar">W</div>
            <div class="watchtube-copy">
                <div class="watchtube-card-title">${escapeHtml(video.title)}</div>
                <div class="watchtube-card-channel">${escapeHtml(video.channel || "YouTube")}</div>
                <div class="watchtube-card-source">Watch Later</div>
            </div>
        </div>
    `;

    return card;
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
    return node.classList.contains("watchtube-item") || node.classList.contains("watchtube-shuffle");
}

function buildRenderSignature(videos) {
    return videos
        .slice(0, MAX_FIRST_ROW_VIDEOS)
        .map((video) => video.url)
        .join("|");
}

function shouldReactToMutations(mutations) {
    for (const mutation of mutations) {
        if (containsRelevantMutation(mutation.addedNodes) || containsRelevantMutation(mutation.removedNodes)) {
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

        if (node.classList.contains("watchtube-item") || node.closest(".watchtube-item")) {
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

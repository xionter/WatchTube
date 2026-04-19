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

let domObserverStarted = false;
let refreshScheduled = false;
let refreshInFlight = null;
let injectedVersion = 0;
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
            removeExistingRow();
            lastRenderedSignature = "";
            return;
        }

        const grid = findHomeGrid();

        if (!grid) {
            window.setTimeout(scheduleRefresh, 800);
            return;
        }

        const videos = await getWatchLaterVideos();

        if (!videos.length) {
            removeExistingRow();
            lastRenderedSignature = "";
            return;
        }

        renderWatchLaterRow(grid, videos);
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

    if (style.textContent === buildWatchTubeCss()) {
        return;
    }

    style.textContent = buildWatchTubeCss();
}

function buildWatchTubeCss() {
    return `
        #watchtube-row {
            margin: 24px 24px 8px;
            padding: 18px;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: linear-gradient(180deg, rgba(23, 23, 23, 0.95) 0%, rgba(18, 18, 18, 0.95) 100%);
            box-shadow: 0 18px 36px rgba(0, 0, 0, 0.18);
        }

        #watchtube-row * {
            box-sizing: border-box;
        }

        #watchtube-row .watchtube-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 14px;
            flex-wrap: wrap;
        }

        #watchtube-row .watchtube-title-wrap {
            display: grid;
            gap: 4px;
        }

        #watchtube-row .watchtube-badge {
            color: #ff8a7b;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }

        #watchtube-row .watchtube-title {
            margin: 0;
            color: #fff;
            font-size: 22px;
            line-height: 1.2;
            font-weight: 700;
        }

        #watchtube-row .watchtube-subtitle {
            color: rgba(255, 255, 255, 0.68);
            font-size: 13px;
            line-height: 1.45;
        }

        #watchtube-row .watchtube-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        #watchtube-row .watchtube-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 36px;
            padding: 0 14px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.06);
            color: #fff;
            cursor: pointer;
            text-decoration: none;
            font: 500 13px/1 Roboto, Arial, sans-serif;
            transition: transform 160ms ease, background-color 160ms ease;
        }

        #watchtube-row .watchtube-btn:hover {
            transform: translateY(-1px);
            background: rgba(255, 255, 255, 0.12);
        }

        #watchtube-row .watchtube-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
        }

        #watchtube-row .watchtube-card {
            display: block;
            color: inherit;
            text-decoration: none;
            border-radius: 16px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.04);
            transition: transform 180ms ease, background-color 180ms ease, box-shadow 180ms ease;
        }

        #watchtube-row .watchtube-card:hover {
            transform: translateY(-2px);
            background: rgba(255, 255, 255, 0.07);
            box-shadow: 0 12px 20px rgba(0, 0, 0, 0.2);
        }

        #watchtube-row .watchtube-thumb {
            display: block;
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            background: #1b1b1b;
        }

        #watchtube-row .watchtube-card-body {
            padding: 12px 12px 14px;
        }

        #watchtube-row .watchtube-card-title {
            color: #fff;
            font-size: 14px;
            line-height: 1.4;
            font-weight: 500;
        }

        #watchtube-row .watchtube-card-channel {
            margin-top: 6px;
            color: rgba(255, 255, 255, 0.65);
            font-size: 12px;
            line-height: 1.35;
        }
    `;
}

function applyShortsVisibility(hideShorts) {
    const shelfSelectors = [
        "ytd-rich-shelf-renderer[is-shorts]",
        "ytd-reel-shelf-renderer",
        "ytd-rich-section-renderer ytd-reel-shelf-renderer",
        "ytd-item-section-renderer ytd-reel-shelf-renderer"
    ];

    const shelves = document.querySelectorAll(shelfSelectors.join(", "));
    for (const shelf of shelves) {
        shelf.style.display = hideShorts ? "none" : "";
    }

    const shortLinks = document.querySelectorAll('a[href^="/shorts"], a[href="https://www.youtube.com/shorts"]');
    for (const link of shortLinks) {
        const container =
            link.closest("ytd-guide-entry-renderer") ||
            link.closest("ytd-mini-guide-entry-renderer") ||
            link.closest("ytd-rich-item-renderer") ||
            link.closest("ytd-video-renderer") ||
            link.closest("ytd-grid-video-renderer") ||
            link;

        container.style.display = hideShorts ? "none" : "";
    }
}

function applyCategoryVisibility(hideCategories) {
    const selectors = [
        "ytd-feed-filter-chip-bar-renderer",
        "ytd-rich-grid-renderer #chips-wrapper",
        "#chips-wrapper"
    ];

    for (const node of document.querySelectorAll(selectors.join(", "))) {
        node.style.display = hideCategories ? "none" : "";
    }
}

function findHomeGrid() {
    return (
        document.querySelector("ytd-rich-grid-renderer") ||
        document.querySelector("ytd-two-column-browse-results-renderer #primary") ||
        document.querySelector("#contents")
    );
}

async function getWatchLaterVideos() {
    const now = Date.now();
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cache = stored[CACHE_KEY];

    if (cache?.items?.length && now - cache.updatedAt < CACHE_TTL_MS) {
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
        return cache?.items || [];
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
    const contents =
        json.contents
            ?.twoColumnBrowseResultsRenderer
            ?.tabs?.[0]
            ?.tabRenderer
            ?.content
            ?.sectionListRenderer
            ?.contents?.[0]
            ?.itemSectionRenderer
            ?.contents?.[0]
            ?.playlistVideoListRenderer
            ?.contents || [];

    const videos = [];

    for (const item of contents) {
        const video = item.playlistVideoRenderer;
        if (!video?.videoId) continue;

        videos.push({
            title: video.title?.runs?.[0]?.text || "Без названия",
            url: `https://www.youtube.com/watch?v=${video.videoId}`,
            channel: video.shortBylineText?.runs?.[0]?.text || "",
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

function renderWatchLaterRow(grid, videos) {
    const existingRow = document.getElementById("watchtube-row");
    const existingGrid = existingRow?.parentElement;
    const signature = buildRenderSignature(videos);

    if (existingRow && existingGrid === grid && lastRenderedSignature === signature) {
        return;
    }

    removeExistingRow();

    const version = ++injectedVersion;
    const picks = shuffle([...videos]).slice(0, 6);
    const wrap = document.createElement("section");
    wrap.id = "watchtube-row";

    wrap.innerHTML = `
        <div class="watchtube-header">
            <div class="watchtube-title-wrap">
                <span class="watchtube-badge">WatchTube</span>
                <h2 class="watchtube-title">Watch Later</h2>
                <span class="watchtube-subtitle">Быстрый доступ к сохранённым видео прямо на главной странице.</span>
            </div>
            <div class="watchtube-actions">
                <a class="watchtube-btn" href="${WATCH_LATER_URL}" target="_blank" rel="noreferrer">Открыть плейлист</a>
                <button class="watchtube-btn" type="button">Перемешать</button>
            </div>
        </div>
        <div class="watchtube-row"></div>
    `;

    const row = wrap.querySelector(".watchtube-row");
    const shuffleButton = wrap.querySelector("button");

    if (!row || !shuffleButton) {
        return;
    }

    fillRow(row, picks);
    lastRenderedSignature = signature;

    shuffleButton.addEventListener("click", () => {
        if (version !== injectedVersion) return;
        fillRow(row, shuffle([...videos]).slice(0, 6));
    });

    grid.prepend(wrap);
}

function fillRow(row, videos) {
    row.replaceChildren(...videos.map(createCard));
}

function createCard(video) {
    const card = document.createElement("a");
    card.className = "watchtube-card";
    card.href = video.url;
    card.target = "_blank";
    card.rel = "noreferrer";

    card.innerHTML = `
        <img class="watchtube-thumb" src="${escapeHtml(video.thumbnail)}" alt="">
        <div class="watchtube-card-body">
            <div class="watchtube-card-title">${escapeHtml(video.title)}</div>
            <div class="watchtube-card-channel">${escapeHtml(video.channel || "YouTube")}</div>
        </div>
    `;

    return card;
}

function removeExistingRow() {
    document.getElementById("watchtube-row")?.remove();
}

function buildRenderSignature(videos) {
    return videos
        .slice(0, 12)
        .map((video) => video.url)
        .join("|");
}

function shouldReactToMutations(mutations) {
    for (const mutation of mutations) {
        if (containsRelevantMutation(mutation.addedNodes)) {
            return true;
        }

        if (containsRelevantMutation(mutation.removedNodes)) {
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

        if (node.id === "watchtube-row" || node.id === STYLE_ID) {
            continue;
        }

        if (node.closest("#watchtube-row")) {
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
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

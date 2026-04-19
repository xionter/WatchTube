// content.js
"use strict";

let injectedVersion = 0;
let observerStarted = false;

start();

function start() {
    watchYoutubeNavigation();
    watchStorageChanges();
    tryRender();
}

function watchYoutubeNavigation() {
    if (observerStarted) return;
    observerStarted = true;

    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            resetRow();
            tryRender();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

function watchStorageChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (!changes.videos) return;

        resetRow();
        tryRender();
    });
}

async function tryRender() {
    if (!isHomePage()) return;

    const grid =
        document.querySelector("ytd-rich-grid-renderer") ||
        document.querySelector("#contents");

    if (!grid) {
        setTimeout(tryRender, 1000);
        return;
    }

    const data = await chrome.storage.local.get("videos");
    const videos = data.videos || [];

    if (!videos.length) return;

    renderRow(videos);
}

function renderRow(videos) {
    removeExisting();

    const version = ++injectedVersion;

    const picks = shuffle([...videos]).slice(0, 5);

    const wrap = document.createElement("div");
    wrap.id = "watch-later-row";
    wrap.style.margin = "24px";
    wrap.style.padding = "16px";
    wrap.style.background = "#0f0f0f";
    wrap.style.borderRadius = "18px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "14px";

    const title = document.createElement("h2");
    title.textContent = "From Watch Later";
    title.style.color = "white";
    title.style.margin = "0";
    title.style.fontSize = "20px";

    const btn = document.createElement("button");
    btn.textContent = "Shuffle";
    btn.style.cursor = "pointer";
    btn.style.padding = "8px 12px";
    btn.style.borderRadius = "10px";
    btn.style.border = "none";

    btn.onclick = () => {
        if (version !== injectedVersion) return;
        renderRow(videos);
    };

    header.appendChild(title);
    header.appendChild(btn);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "16px";
    row.style.overflowX = "auto";

    for (const v of picks) {
        const card = document.createElement("a");
        card.href = v.url;
        card.style.width = "260px";
        card.style.flex = "0 0 auto";
        card.style.textDecoration = "none";
        card.style.color = "white";

        const thumb = getThumb(v.url);

        card.innerHTML = `
            <img src="${thumb}" style="width:100%;border-radius:12px;">
            <div style="margin-top:8px;font-size:14px;line-height:1.4;">
                ${escapeHtml(v.title)}
            </div>
            <div style="margin-top:4px;color:#aaa;font-size:12px;">
                ${escapeHtml(v.channel || "")}
            </div>
        `;

        row.appendChild(card);
    }

    wrap.appendChild(header);
    wrap.appendChild(row);

    const target =
        document.querySelector("ytd-rich-grid-renderer") ||
        document.querySelector("#contents");

    target.prepend(wrap);
}

function resetRow() {
    removeExisting();
}

function removeExisting() {
    document.getElementById("watch-later-row")?.remove();
}

function isHomePage() {
    return location.pathname === "/";
}

function getThumb(url) {
    const m = url.match(/[?&]v=([^&]+)/);
    return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : "";
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
}

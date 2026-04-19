"use strict";

let alreadyInjected = false;

init();

function init() {
    observePage();
    tryInject();
}

function observePage() {
    const observer = new MutationObserver(() => {
        tryInject();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

async function tryInject() {
    if (!isHomePage()) return;
    if (alreadyInjected) return;

    const grid = document.querySelector("ytd-rich-grid-renderer");
    if (!grid) return;

    const data = await chrome.storage.local.get("videos");
    const videos = data.videos || [];

    if (!videos.length) return;

    alreadyInjected = true;

    injectRow(videos);
}

function isHomePage() {
    return location.pathname === "/";
}

function injectRow(videos) {
    const existing = document.getElementById("watch-later-row");
    if (existing) return;

    const random = shuffle([...videos]).slice(0, 5);

    const container = document.createElement("div");
    container.id = "watch-later-row";
    container.style.margin = "24px";
    container.style.padding = "16px";
    container.style.background = "#0f0f0f";
    container.style.borderRadius = "18px";

    const title = document.createElement("h2");
    title.textContent = "From Watch Later";
    title.style.color = "white";
    title.style.marginBottom = "14px";
    title.style.fontSize = "20px";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "16px";
    row.style.overflowX = "auto";

    for (const v of random) {
        const card = document.createElement("a");
        card.href = v.url;
        card.style.textDecoration = "none";
        card.style.color = "white";
        card.style.width = "260px";
        card.style.flex = "0 0 auto";

        const thumb = extractThumb(v.url);

        card.innerHTML = `
            <img
                src="${thumb}"
                style="width:100%;border-radius:12px;"
            >
            <div style="margin-top:8px;font-size:14px;line-height:1.4;">
                ${escapeHtml(v.title)}
            </div>
            <div style="margin-top:4px;color:#aaa;font-size:12px;">
                ${escapeHtml(v.channel)}
            </div>
        `;

        row.appendChild(card);
    }

    container.appendChild(title);
    container.appendChild(row);

    const target =
        document.querySelector("ytd-rich-grid-renderer") ||
        document.querySelector("#contents");

    target.prepend(container);
}

function extractThumb(url) {
    const match = url.match(/[?&]v=([^&]+)/);
    const id = match ? match[1] : "";
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

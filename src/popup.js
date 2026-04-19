"use strict";

const status = document.getElementById("status");

document.getElementById("extract").addEventListener("click", async () => {
    status.textContent = "Opening Watch Later...";

    const tab = await chrome.tabs.create({
        url: "https://www.youtube.com/playlist?list=WL",
        active: true
    });

    await waitForTabLoad(tab.id);

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeWatchLater
    });

    const videos = results[0].result;

    await chrome.storage.local.set({ videos });

    status.textContent = `Saved ${videos.length} videos.\nOpen YouTube Home now.`;
});

function waitForTabLoad(tabId) {
    return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(id, info) {
            if (id === tabId && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        });
    });
}

async function scrapeWatchLater() {
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    let lastHeight = 0;

    for (;;) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await sleep(1500);

        const newHeight = document.documentElement.scrollHeight;

        if (newHeight === lastHeight) break;
        lastHeight = newHeight;
    }

    const items = [...document.querySelectorAll("ytd-playlist-video-renderer")];

    return items.map(item => {
        const titleEl = item.querySelector("#video-title");
        const channelEl = item.querySelector("ytd-channel-name a");

        return {
            title: titleEl?.textContent.trim() || "",
            url: "https://youtube.com" + titleEl?.getAttribute("href"),
            channel: channelEl?.textContent.trim() || ""
        };
    });
}

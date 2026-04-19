"use strict";

const status = document.getElementById("status");

document.getElementById("extract").addEventListener("click", async () => {
    status.textContent = "Fetching Watch Later...";

    try {
        const videos = await fetchWatchLater();

        await chrome.storage.local.set({ videos });

        status.textContent =
            `Saved ${videos.length} videos.\nOpen YouTube Home.`;
    } catch (e) {
        status.textContent = "Failed: " + e.message;
    }
});

async function fetchWatchLater() {
    const response = await fetch(
        "https://www.youtube.com/playlist?list=WL",
        {
            credentials: "include"
        }
    );

    const html = await response.text();

    const match = html.match(/var ytInitialData = (.*?);<\/script>/s);

    if (!match) {
        throw new Error("ytInitialData not found");
    }

    const data = JSON.parse(match[1]);

    const contents =
        data.contents
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
        const v = item.playlistVideoRenderer;
        if (!v) continue;

        videos.push({
            title: v.title?.runs?.[0]?.text || "",
            url: "https://youtube.com/watch?v=" + v.videoId,
            channel:
                v.shortBylineText?.runs?.[0]?.text || ""
        });
    }

    return videos;
}

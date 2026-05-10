"use strict";

import * as constants from "../core/constants.js";

let cssPromise = null;

async function getWatchTubeCss() {
    if (!cssPromise) {
        cssPromise = fetch(
            chrome.runtime.getURL("content/styles/watchtube.css"),
        ).then((response) => response.text());
    }

    return cssPromise;
}

export async function ensureStyleElement() {
    let style = document.getElementById(constants.STYLE_ID);

    if (!style) {
        style = document.createElement("style");

        style.id = constants.STYLE_ID;

        document.documentElement.appendChild(style);
    }

    const css = await getWatchTubeCss();

    if (style.textContent === css) {
        return;
    }

    style.textContent = css;
}

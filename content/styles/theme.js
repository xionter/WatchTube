"use strict";

const WATCHTUBE_THEME_ID = "watchtube-theme-vars";
const OBSERVER_CONFIG = {
  attributes: true,
  attributeFilter: ["dark", "system-icons", "class", "style"],
};

let themeObserver = null;
let syncScheduled = false;

export function ensureThemeAdapter() {
  syncThemeVariables();
  installThemeObserver();
}

export function syncThemeVariables() {
  const style = getOrCreateThemeStyle();
  const tokens = readYouTubeThemeTokens();

  style.textContent = `:root{${Object.entries(tokens)
    .map(([name, value]) => `${name}:${value};`)
    .join("")}}`;
}

function installThemeObserver() {
  if (themeObserver || typeof MutationObserver === "undefined") {
    return;
  }

  themeObserver = new MutationObserver(scheduleThemeSync);

  themeObserver.observe(document.documentElement, OBSERVER_CONFIG);

  if (document.body) {
    themeObserver.observe(document.body, OBSERVER_CONFIG);
  }
}

function scheduleThemeSync() {
  if (syncScheduled) {
    return;
  }

  syncScheduled = true;

  requestAnimationFrame(() => {
    syncScheduled = false;
    syncThemeVariables();
  });
}

function getOrCreateThemeStyle() {
  let style = document.getElementById(WATCHTUBE_THEME_ID);

  if (!style) {
    style = document.createElement("style");
    style.id = WATCHTUBE_THEME_ID;
    document.documentElement.appendChild(style);
  }

  return style;
}

function readYouTubeThemeTokens() {
  const rootStyles = getComputedStyle(document.documentElement);
  const bodyStyles = document.body
    ? getComputedStyle(document.body)
    : rootStyles;
  const app = document.querySelector("ytd-app");
  const appStyles = app ? getComputedStyle(app) : rootStyles;
  const dark = document.documentElement.hasAttribute("dark");

  return {
    "--watchtube-font-family": firstStyleValue(
      [bodyStyles.fontFamily, appStyles.fontFamily],
      "Roboto, Arial, sans-serif",
    ),
    "--watchtube-text-primary": firstCssVariable(
      rootStyles,
      [
        "--yt-spec-text-primary",
        "--ytd-video-primary-info-renderer-title-color",
      ],
      dark ? "#f1f1f1" : "#0f0f0f",
    ),
    "--watchtube-text-secondary": firstCssVariable(
      rootStyles,
      ["--yt-spec-text-secondary", "--yt-spec-text-disabled"],
      dark ? "#aaaaaa" : "#606060",
    ),
    "--watchtube-background": firstCssVariable(
      rootStyles,
      ["--yt-spec-base-background", "--yt-spec-general-background-a"],
      dark ? "#0f0f0f" : "#ffffff",
    ),
    "--watchtube-surface": firstCssVariable(
      rootStyles,
      [
        "--yt-spec-raised-background",
        "--yt-spec-menu-background",
        "--yt-spec-base-background",
      ],
      dark ? "#212121" : "#ffffff",
    ),
    "--watchtube-chip-background": firstCssVariable(
      rootStyles,
      ["--yt-spec-badge-chip-background", "--yt-spec-10-percent-layer"],
      dark ? "#272727" : "#f1f1f1",
    ),
    "--watchtube-hover-background": firstCssVariable(
      rootStyles,
      ["--yt-spec-10-percent-layer", "--yt-spec-touch-response"],
      dark ? "#333333" : "#e5e5e5",
    ),
    "--watchtube-border": firstCssVariable(
      rootStyles,
      ["--yt-spec-10-percent-layer", "--yt-spec-outline"],
      dark ? "#3f3f3f" : "#d0d0d0",
    ),
    "--watchtube-brand": firstCssVariable(
      rootStyles,
      [
        "--yt-spec-static-brand-red",
        "--yt-spec-themed-blue",
        "--yt-spec-call-to-action",
      ],
      "#ff0033",
    ),
    "--watchtube-brand-hover": dark ? "#ff3355" : "#ff3355",
    "--watchtube-danger": "#ff0033",
    "--watchtube-menu-shadow": dark
      ? "0 4px 32px rgba(0,0,0,.55)"
      : "0 4px 32px rgba(0,0,0,.24)",
    "--watchtube-radius-card": firstCssVariable(
      rootStyles,
      ["--yt-spec-card-border-radius"],
      "12px",
    ),
  };
}

function firstCssVariable(styles, names, fallback) {
  for (const name of names) {
    const value = styles.getPropertyValue(name).trim();

    if (value) {
      return value;
    }
  }

  return fallback;
}

function firstStyleValue(values, fallback) {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

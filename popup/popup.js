"use strict";

const DEFAULT_SETTINGS = {
  showWatchLater: true,
  hideShorts: false,
};

const WATCH_LATER_URL = "https://www.youtube.com/playlist?list=WL";

const elements = {
  controls: {
    showWatchLater: document.querySelector("#showWatchLater"),
    hideShorts: document.querySelector("#hideShorts"),
  },

  states: {
    showWatchLater: document.querySelector("#showWatchLaterState"),
    hideShorts: document.querySelector("#hideShortsState"),
  },

  openWatchLaterButton: document.querySelector("#openWatchLater"),
};

main().catch(handleError);

async function main() {
  assertUi();

  const settings = await getSettings();

  render(settings);

  for (const control of Object.values(elements.controls)) {
    control.addEventListener("change", handleSettingsChange);
  }

  elements.openWatchLaterButton.addEventListener(
    "click",
    openWatchLaterPlaylist,
  );
}

function assertUi() {
  const requiredElements = [
    ...Object.values(elements.controls),
    ...Object.values(elements.states),
    elements.openWatchLaterButton,
  ];

  if (requiredElements.some((element) => !element)) {
    throw new Error("Required popup elements are missing");
  }
}

async function getSettings() {
  const { watchTubeSettings = {} } =
    await chrome.storage.local.get("watchTubeSettings");

  return {
    ...DEFAULT_SETTINGS,
    ...watchTubeSettings,
  };
}

function render(settings) {
  updateControls(settings);
  updateStatus(settings);
}

function updateControls(settings) {
  for (const [key, control] of Object.entries(elements.controls)) {
    const enabled = settings[key];

    control.checked = enabled;
    elements.states[key].textContent = enabled ? "On" : "Off";
  }
}

function updateStatus(settings) {
  const enabledFeatures = [];

  if (settings.showWatchLater) {
    enabledFeatures.push("Watch Later in the first row");
  }

  if (settings.hideShorts) {
    enabledFeatures.push("Shorts hiding");
  }
}

async function handleSettingsChange() {
  const settings = Object.fromEntries(
    Object.entries(elements.controls).map(([key, control]) => [
      key,
      control.checked,
    ]),
  );

  await chrome.storage.local.set({
    watchTubeSettings: settings,
  });

  render(settings);
}

async function openWatchLaterPlaylist() {
  await chrome.tabs.create({
    url: WATCH_LATER_URL,
  });
}

function handleError(error) {
  console.error(error);
}

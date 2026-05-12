"use strict";

const DEFAULT_SETTINGS = {
  showWatchLater: true,
  showSubscriptions: true,
  hideShorts: false,
};

const WATCH_LATER_URL = "https://www.youtube.com/playlist?list=WL";

const SUBSCRIPTIONS_URL = "https://www.youtube.com/feed/subscriptions";

const elements = {
  controls: {
    showWatchLater: document.querySelector("#showWatchLater"),
    showSubscriptions: document.querySelector("#showSubscriptions"),
    hideShorts: document.querySelector("#hideShorts"),
  },

  states: {
    showWatchLater: document.querySelector("#showWatchLaterState"),
    showSubscriptions: document.querySelector("#showSubscriptionsState"),
    hideShorts: document.querySelector("#hideShortsState"),
  },

  openWatchLaterButton: document.querySelector("#openWatchLater"),

  openSubscriptionsButton: document.querySelector("#openSubscriptions"),
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

  elements.openSubscriptionsButton.addEventListener(
    "click",
    openSubscriptionsFeed,
  );
}

function assertUi() {
  const requiredElements = [
    ...Object.values(elements.controls),
    ...Object.values(elements.states),

    elements.openWatchLaterButton,
    elements.openSubscriptionsButton,
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

  if (settings.showSubscriptions) {
    enabledFeatures.push("Subscription videos in the second row");
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

async function openSubscriptionsFeed() {
  await chrome.tabs.create({
    url: SUBSCRIPTIONS_URL,
  });
}

function handleError(error) {
  console.error(error);
}

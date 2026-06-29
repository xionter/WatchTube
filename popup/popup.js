import * as constants from "../content/core/constants.js";
import * as settingsStore from "../content/core/settings.js";
import * as playlistsApi from "../content/features/feedRows/playlists/api.js";

const elements = {
  controls: {
    showSubscriptions: document.querySelector("#showSubscriptions"),
    hideShorts: document.querySelector("#hideShorts"),
  },

  states: {
    showSubscriptions: document.querySelector("#showSubscriptionsState"),
    hideShorts: document.querySelector("#hideShortsState"),
  },

  playlistForm: document.querySelector("#playlistForm"),
  playlistInput: document.querySelector("#playlistUrl"),
  addPlaylistButton: document.querySelector("#addPlaylist"),
  playlistStatus: document.querySelector("#playlistStatus"),
  playlistList: document.querySelector("#playlistList"),
  playlistEmpty: document.querySelector("#playlistEmpty"),
  openSubscriptionsButton: document.querySelector("#openSubscriptions"),
};

let currentSettings = null;

main().catch(handleError);

async function main() {
  assertUi();

  const settings = await settingsStore.readSettings();

  render(settings);

  for (const control of Object.values(elements.controls)) {
    control.addEventListener("change", handleSettingsChange);
  }

  elements.playlistForm.addEventListener("submit", handlePlaylistAdd);

  elements.openSubscriptionsButton.addEventListener(
    "click",
    openSubscriptionsFeed,
  );
}

function assertUi() {
  const requiredElements = [
    ...Object.values(elements.controls),
    ...Object.values(elements.states),
    elements.playlistForm,
    elements.playlistInput,
    elements.addPlaylistButton,
    elements.playlistStatus,
    elements.playlistList,
    elements.playlistEmpty,
    elements.openSubscriptionsButton,
  ];

  if (requiredElements.some((element) => !element)) {
    throw new Error("Required popup elements are missing");
  }
}

function render(settings) {
  currentSettings = settings;
  updateControls(settings);
  renderPlaylists(settings.playlists);
}

function updateControls(settings) {
  for (const [key, control] of Object.entries(elements.controls)) {
    const enabled = settings[key];

    control.checked = enabled;

    elements.states[key].textContent = enabled ? "On" : "Off";
  }
}

function renderPlaylists(playlists) {
  elements.playlistList.replaceChildren();
  elements.playlistEmpty.hidden = playlists.length > 0;

  for (const playlist of playlists) {
    elements.playlistList.append(createPlaylistRow(playlist));
  }
}

async function handleSettingsChange() {
  clearPlaylistStatus();

  const settings = await settingsStore.writeSettings({
    ...currentSettings,
    ...Object.fromEntries(
      Object.entries(elements.controls).map(([key, control]) => [
        key,
        control.checked,
      ]),
    ),
  });

  render(settings);
}

async function handlePlaylistAdd(event) {
  event.preventDefault();
  clearPlaylistStatus();

  const input = elements.playlistInput.value.trim();
  const playlistId = settingsStore.extractPlaylistId(input);

  if (!playlistId) {
    setPlaylistStatus("Paste a valid YouTube playlist link.", "error");

    return;
  }

  if (
    currentSettings.playlists.some(
      (playlist) => playlist.playlistId === playlistId,
    )
  ) {
    setPlaylistStatus("That playlist is already added.", "error");

    return;
  }

  setAddPlaylistPending(true);

  try {
    let title = constants.DEFAULT_PLAYLIST_TITLE;
    let statusTone = "success";
    let statusText = "Playlist added.";

    try {
      const playlistData = await playlistsApi.fetchPlaylist({ playlistId });

      title = playlistData.title || title;
    } catch (error) {
      console.warn("WatchTube: failed to preload playlist", error);
      statusTone = "info";
      statusText = "Playlist saved. The title will update after it loads.";
    }

    const settings = await updatePlaylists((playlists) => [
      ...playlists,
      settingsStore.createPlaylist({
        playlistId,
        title,
        enabled: true,
      }),
    ]);

    elements.playlistForm.reset();
    render(settings);
    setPlaylistStatus(statusText, statusTone);
  } finally {
    setAddPlaylistPending(false);
  }
}

function createPlaylistRow(playlist) {
  const row = document.createElement("div");
  const copy = document.createElement("div");
  const title = document.createElement("div");
  const url = document.createElement("div");
  const actions = document.createElement("div");
  const toggleWrap = document.createElement("label");
  const toggleState = document.createElement("span");
  const toggle = document.createElement("span");
  const toggleInput = document.createElement("input");
  const toggleSlider = document.createElement("span");
  const buttons = document.createElement("div");
  const openButton = document.createElement("button");
  const deleteButton = document.createElement("button");

  row.className = "playlist-row";
  copy.className = "playlist-copy";
  title.className = "playlist-row-title";
  url.className = "playlist-row-link";
  actions.className = "playlist-actions";
  toggleWrap.className = "playlist-toggle";
  toggleState.className = "playlist-toggle-state";
  toggle.className = "switch switch-compact";
  buttons.className = "playlist-buttons";
  openButton.className = "mini-action";
  deleteButton.className = "mini-action mini-action-danger";

  title.textContent = playlist.title;
  url.textContent = playlist.url;
  toggleState.textContent = playlist.enabled ? "On" : "Off";

  toggleInput.type = "checkbox";
  toggleInput.checked = playlist.enabled;
  toggleInput.addEventListener("change", async () => {
    const settings = await updatePlaylists((playlists) =>
      playlists.map((entry) =>
        entry.playlistId === playlist.playlistId
          ? {
              ...entry,
              enabled: toggleInput.checked,
            }
          : entry,
      ),
    );

    render(settings);
  });

  toggleSlider.className = "slider";
  toggle.append(toggleInput, toggleSlider);
  toggleWrap.append(toggleState, toggle);

  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => {
    void openUrl(playlist.url);
  });

  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    clearPlaylistStatus();

    const settings = await updatePlaylists((playlists) =>
      playlists.filter((entry) => entry.playlistId !== playlist.playlistId),
    );

    render(settings);
  });

  buttons.append(openButton, deleteButton);
  actions.append(toggleWrap, buttons);
  copy.append(title, url);
  row.append(copy, actions);

  return row;
}

async function updatePlaylists(update) {
  return settingsStore.writeSettings({
    ...currentSettings,
    playlists: update(currentSettings.playlists),
  });
}

function setAddPlaylistPending(isPending) {
  elements.addPlaylistButton.disabled = isPending;
  elements.playlistInput.disabled = isPending;
}

function setPlaylistStatus(text, tone) {
  elements.playlistStatus.hidden = false;
  elements.playlistStatus.dataset.tone = tone;
  elements.playlistStatus.textContent = text;
}

function clearPlaylistStatus() {
  elements.playlistStatus.hidden = true;
  elements.playlistStatus.textContent = "";
  delete elements.playlistStatus.dataset.tone;
}

async function openSubscriptionsFeed() {
  await openUrl(constants.SUBSCRIPTIONS_URL);
}

async function openUrl(url) {
  await chrome.tabs.create({ url });
}

function handleError(error) {
  console.error(error);
}

import * as constants from "../../../core/constants.js";
import * as settingsStore from "../../../core/settings.js";

import * as playlists from "./index.js";
import { renderPlaylistPicker } from "./picker.js";
import {
  addOrEnablePlaylist,
  hasEnabledPlaylist,
  setPlaylistEnabled,
  setSubscriptionsEnabled,
} from "./settingsMutations.js";

let addPlaylistDialog = null;

export function openAddPlaylistDialog() {
  closeAddPlaylistDialog();

  addPlaylistDialog = createAddPlaylistDialog();
  document.documentElement.append(addPlaylistDialog.overlay);
  document.addEventListener("keydown", handleAddPlaylistDialogKeydown, true);
  addPlaylistDialog.input.focus();
}

export function closeAddPlaylistDialog() {
  document.removeEventListener("keydown", handleAddPlaylistDialogKeydown, true);
  addPlaylistDialog?.overlay.remove();
  addPlaylistDialog = null;
}

function handleAddPlaylistDialogKeydown(event) {
  if (event.key !== "Escape" || !addPlaylistDialog) {
    return;
  }

  if (addPlaylistDialog.input.disabled) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  closeAddPlaylistDialog();
}

function createAddPlaylistDialog() {
  const overlay = document.createElement("div");
  const dialog = document.createElement("form");
  const title = document.createElement("h2");
  const pickerSearchTitle = document.createElement("div");
  const pickerSearch = document.createElement("input");
  const pickerTitle = document.createElement("div");
  const pickerStatus = document.createElement("p");
  const pickerList = document.createElement("div");
  const linkTitle = document.createElement("div");
  const input = document.createElement("input");
  const status = document.createElement("p");
  const actions = document.createElement("div");
  const cancelButton = document.createElement("button");
  const addButton = document.createElement("button");

  overlay.className = "watchtube-dialog-overlay";
  overlay.dataset.watchtubeUi = "true";

  dialog.className = "watchtube-dialog";
  dialog.dataset.watchtubeUi = "true";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Add playlist row");

  title.className = "watchtube-dialog-title";
  title.textContent = "Add playlist row";

  pickerSearchTitle.className = "watchtube-dialog-section-title";
  pickerSearchTitle.textContent = "Search playlists";

  pickerSearch.className =
    "watchtube-dialog-input watchtube-playlist-picker-search";
  pickerSearch.type = "search";
  pickerSearch.placeholder = "Search playlists";
  pickerSearch.autocomplete = "off";
  pickerSearch.hidden = true;
  pickerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  });

  pickerTitle.className = "watchtube-dialog-section-title";
  pickerTitle.textContent = "Playlists";

  pickerStatus.className = "watchtube-dialog-status";
  pickerStatus.textContent = "Loading playlists...";

  pickerList.className = "watchtube-playlist-picker";

  linkTitle.className = "watchtube-dialog-section-title";
  linkTitle.textContent = "External playlist link";

  input.className = "watchtube-dialog-input";
  input.type = "text";
  input.placeholder = "Paste a YouTube playlist link";
  input.autocomplete = "off";

  status.className = "watchtube-dialog-status";
  status.hidden = true;

  actions.className = "watchtube-dialog-actions";

  cancelButton.className = "watchtube-dialog-button";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => {
    if (!input.disabled) {
      closeAddPlaylistDialog();
    }
  });

  addButton.className = "watchtube-dialog-button watchtube-dialog-button-primary";
  addButton.type = "submit";
  addButton.textContent = "Add";

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !input.disabled) {
      closeAddPlaylistDialog();
    }
  });

  dialog.addEventListener("submit", async (event) => {
    event.preventDefault();

    await addPlaylistFromDialog({
      input,
      status,
      addButton,
      cancelButton,
      pickerList,
    });
  });

  actions.append(cancelButton, addButton);
  dialog.append(
    title,
    pickerSearchTitle,
    pickerSearch,
    pickerTitle,
    pickerStatus,
    pickerList,
    linkTitle,
    input,
    status,
    actions,
  );
  overlay.append(dialog);

  void loadPlaylistPicker({
    pickerList,
    pickerStatus,
    pickerSearch,
    status,
    input,
    addButton,
    cancelButton,
  });

  return {
    overlay,
    input,
  };
}

async function addPlaylistFromDialog({
  input,
  status,
  addButton,
  cancelButton,
  pickerList,
}) {
  const playlistId = settingsStore.extractPlaylistId(input.value);

  if (!playlistId) {
    setDialogStatus(status, "Paste a valid YouTube playlist link.", "error");

    return;
  }

  await addPlaylistToSettings({
    playlistId,
    title: constants.DEFAULT_PLAYLIST_TITLE,
    status,
    input,
    addButton,
    cancelButton,
    pickerList,
    preloadTitle: true,
  });
}

async function loadPlaylistPicker({
  pickerList,
  pickerStatus,
  pickerSearch,
  status,
  input,
  addButton,
  cancelButton,
}) {
  try {
    const [availablePlaylists, settings] = await Promise.all([
      playlists.api.fetchAvailablePlaylists(),
      settingsStore.readSettings(),
    ]);
    let currentSettings = settings;

    const renderPicker = () => {
      renderPlaylistPicker({
        availablePlaylists,
        settings: currentSettings,
        query: pickerSearch.value,
        pickerList,
        pickerStatus,
        onAddPlaylist: async ({ playlistId, title }) => {
          await addPlaylistToSettings({
            playlistId,
            title,
            status,
            input,
            addButton,
            cancelButton,
            pickerList,
            pickerSearch,
            preloadTitle: false,
            closeOnSuccess: false,
            onSettingsChanged,
          });
        },
        onTogglePlaylist: async ({ playlistId, enabled }) => {
          await togglePrefetchedPlaylistInSettings({
            playlistId,
            enabled,
            status,
            input,
            addButton,
            cancelButton,
            pickerList,
            pickerSearch,
            onSettingsChanged,
          });
        },
        onToggleSubscriptions: async ({ enabled }) => {
          await toggleSubscriptionsInSettings({
            enabled,
            status,
            input,
            addButton,
            cancelButton,
            pickerList,
            pickerSearch,
            onSettingsChanged,
          });
        },
      });
    };

    const onSettingsChanged = (nextSettings) => {
      currentSettings = nextSettings;
      renderPicker();
    };

    pickerSearch.hidden = !availablePlaylists.length;
    pickerSearch.addEventListener("input", renderPicker);

    renderPicker();
  } catch (error) {
    console.warn("WatchTube: failed to load playlist picker", error);
    pickerSearch.hidden = true;
    pickerStatus.textContent = "Could not load your playlists.";
  }
}

async function addPlaylistToSettings({
  playlistId,
  title,
  status,
  input,
  addButton,
  cancelButton,
  pickerList,
  pickerSearch,
  preloadTitle,
  closeOnSuccess = true,
  onSettingsChanged,
}) {
  const settings = await settingsStore.readSettings();
  const existingPlaylist = settings.playlists.find(
    (playlist) => playlist.playlistId === playlistId,
  );

  if (existingPlaylist) {
    if (!existingPlaylist.enabled) {
      const nextSettings = await togglePrefetchedPlaylistInSettings({
        playlistId,
        enabled: true,
        status,
        input,
        addButton,
        cancelButton,
        pickerList,
        pickerSearch,
        onSettingsChanged,
      });
      if (nextSettings && closeOnSuccess) {
        closeAddPlaylistDialog();
      }
    } else {
      setDialogStatus(status, "That playlist is already enabled.", "error");
    }

    return;
  }

  setDialogBusy(
    {
      input,
      addButton,
      cancelButton,
      pickerList,
      pickerSearch,
    },
    true,
  );
  setDialogStatus(status, "Adding playlist...", "info");

  let playlistTitle = title || constants.DEFAULT_PLAYLIST_TITLE;

  try {
    if (preloadTitle) {
      const playlistData = await playlists.api.fetchPlaylist({ playlistId });

      playlistTitle = playlistData.title || playlistTitle;
    }
  } catch (error) {
    console.warn("WatchTube: failed to preload playlist", error);
  }

  try {
    const latestSettings = await settingsStore.readSettings();

    if (hasEnabledPlaylist(latestSettings, playlistId)) {
      setDialogStatus(status, "That playlist is already enabled.", "error");
      setDialogBusy(
        {
          input,
          addButton,
          cancelButton,
          pickerList,
          pickerSearch,
        },
        false,
      );

      return;
    }

    const nextSettings = await settingsStore.writeSettings(
      addOrEnablePlaylist(latestSettings, {
        playlistId,
        title: playlistTitle,
      }),
    );

    if (closeOnSuccess) {
      closeAddPlaylistDialog();
    } else {
      onSettingsChanged?.(nextSettings);
      setDialogStatus(status, "Playlist enabled.", "info");
      setDialogBusy(
        {
          input,
          addButton,
          cancelButton,
          pickerList,
          pickerSearch,
        },
        false,
      );
    }
  } catch (error) {
    console.error("WatchTube: failed to add playlist", error);
    setDialogStatus(status, "Playlist could not be added.", "error");
    setDialogBusy(
      {
        input,
        addButton,
        cancelButton,
        pickerList,
        pickerSearch,
      },
      false,
    );
  }
}

async function toggleSubscriptionsInSettings({
  enabled,
  status,
  input,
  addButton,
  cancelButton,
  pickerList,
  pickerSearch,
  onSettingsChanged,
}) {
  setDialogBusy(
    {
      input,
      addButton,
      cancelButton,
      pickerList,
      pickerSearch,
    },
    true,
  );
  setDialogStatus(
    status,
    enabled ? "Enabling subscriptions..." : "Disabling subscriptions...",
    "info",
  );

  try {
    const settings = await settingsStore.readSettings();

    const nextSettings = await settingsStore.writeSettings(
      setSubscriptionsEnabled(settings, enabled),
    );

    onSettingsChanged?.(nextSettings);
    setDialogStatus(
      status,
      enabled ? "Subscriptions enabled." : "Subscriptions disabled.",
      "info",
    );
  } catch (error) {
    console.error("WatchTube: failed to toggle subscriptions", error);
    setDialogStatus(status, "Subscriptions could not be updated.", "error");
  } finally {
    setDialogBusy(
      {
        input,
        addButton,
        cancelButton,
        pickerList,
        pickerSearch,
      },
      false,
    );
  }
}

async function togglePrefetchedPlaylistInSettings({
  playlistId,
  enabled,
  status,
  input,
  addButton,
  cancelButton,
  pickerList,
  pickerSearch,
  onSettingsChanged,
}) {
  setDialogBusy(
    {
      input,
      addButton,
      cancelButton,
      pickerList,
      pickerSearch,
    },
    true,
  );
  setDialogStatus(
    status,
    enabled ? "Enabling playlist..." : "Disabling playlist...",
    "info",
  );

  try {
    const settings = await settingsStore.readSettings();
    const nextSettings = await settingsStore.writeSettings(
      setPlaylistEnabled(settings, {
        playlistId,
        enabled,
      }),
    );

    onSettingsChanged?.(nextSettings);
    setDialogStatus(
      status,
      enabled ? "Playlist enabled." : "Playlist disabled.",
      "info",
    );

    return nextSettings;
  } catch (error) {
    console.error("WatchTube: failed to toggle playlist", error);
    setDialogStatus(status, "Playlist could not be updated.", "error");

    return null;
  } finally {
    setDialogBusy(
      {
        input,
        addButton,
        cancelButton,
        pickerList,
        pickerSearch,
      },
      false,
    );
  }
}

function setDialogStatus(status, text, tone) {
  status.hidden = false;
  status.dataset.tone = tone;
  status.textContent = text;
}

function setDialogBusy(
  { input, addButton, cancelButton, pickerList, pickerSearch },
  disabled,
) {
  input.disabled = disabled;
  addButton.disabled = disabled;
  cancelButton.disabled = disabled;
  if (pickerSearch) {
    pickerSearch.disabled = disabled;
  }
  setPickerButtonsDisabled(pickerList, disabled);
}

function setPickerButtonsDisabled(pickerList, disabled) {
  pickerList
    ?.querySelectorAll(".watchtube-playlist-picker-item")
    .forEach((button) => {
      button.disabled = disabled;
    });
}

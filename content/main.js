"use strict";

import * as constants from "./core/constants.js";
import * as account from "./core/account.js";
import * as settingsStore from "./core/settings.js";
import * as youtube from "./core/youtube.js";

import { ensureStyleElement } from "./styles/inject.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";

import * as playlists from "./features/feedRows/playlists/index.js";
import * as subscriptions from "./features/feedRows/subscriptions/index.js";
import * as feedRowRenderer from "./features/feedRows/shared/render.js";

let domObserverStarted = false;
let refreshScheduled = false;
let scheduledForceDataRefresh = false;
let refreshInFlight = null;
let refreshRequestedDuringFlight = false;
let refreshRequestedForceDuringFlight = false;
let pendingGridRetry = null;
let pendingGridRetryForceDataRefresh = false;
let lastAccountKey = null;
let renderedFeedRowIds = new Set();
let addPlaylistDialog = null;
let editMode = false;
let handledEditModeRequest = null;
let bootstrapRefreshTimer = null;
let bootstrapRefreshAttempts = 0;

start();

function start() {
  void ensureStyleElement();

  watchYoutubeNavigation();
  watchPageReadiness();
  watchYoutubeDom();
  watchStorageChanges();
  void activateRequestedEditMode();

  scheduleRefresh();
  startBootstrapRefreshes();
}

function watchYoutubeNavigation() {
  window.addEventListener("yt-navigate-finish", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });
}

function watchPageReadiness() {
  window.addEventListener("DOMContentLoaded", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });

  window.addEventListener("load", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });

  window.addEventListener("pageshow", () => {
    scheduleRefresh();
    startBootstrapRefreshes();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleRefresh();
      startBootstrapRefreshes();
    }
  });
}

function watchYoutubeDom() {
  if (domObserverStarted) {
    return;
  }

  domObserverStarted = true;

  const observer = new MutationObserver((mutations) => {
    if (feedRowRenderer.isRenderInProgress()) {
      return;
    }

    if (!youtube.isHomePage()) {
      return;
    }

    if (shouldReactToMutations(mutations)) {
      scheduleRefresh();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function watchStorageChanges() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (changes[constants.EDIT_MODE_REQUEST_KEY]) {
      void activateRequestedEditMode();
    }

    if (!hasRelevantStorageChange(changes)) {
      return;
    }

    scheduleRefresh({
      forceDataRefresh: Boolean(changes[constants.SETTINGS_KEY]),
    });
  });
}

function scheduleRefresh({ forceDataRefresh = false } = {}) {
  scheduledForceDataRefresh = scheduledForceDataRefresh || forceDataRefresh;

  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;

  requestAnimationFrame(() => {
    refreshScheduled = false;
    const forceRefresh = scheduledForceDataRefresh;
    scheduledForceDataRefresh = false;

    void refreshPage({ forceDataRefresh: forceRefresh });
  });
}

function startBootstrapRefreshes({ forceDataRefresh = false } = {}) {
  if (!youtube.isHomePage()) {
    return;
  }

  bootstrapRefreshAttempts = 0;

  if (bootstrapRefreshTimer) {
    window.clearInterval(bootstrapRefreshTimer);
  }

  bootstrapRefreshTimer = window.setInterval(() => {
    bootstrapRefreshAttempts += 1;

    if (!youtube.isHomePage() || bootstrapRefreshAttempts > 20) {
      window.clearInterval(bootstrapRefreshTimer);
      bootstrapRefreshTimer = null;

      return;
    }

    scheduleRefresh({
      forceDataRefresh: forceDataRefresh && bootstrapRefreshAttempts === 1,
    });
  }, 750);
}

async function refreshPage({ forceDataRefresh = false } = {}) {
  if (refreshInFlight) {
    refreshRequestedDuringFlight = true;
    refreshRequestedForceDuringFlight =
      refreshRequestedForceDuringFlight || forceDataRefresh;

    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    let settings = await settingsStore.readSettings();

    if (!document.getElementById(constants.STYLE_ID)) {
      await ensureStyleElement();
    }

    if (!settings.enabled) {
      applyShortsVisibility(false);
      closeAddPlaylistDialog();
      clearManagedRows();

      return;
    }

    applyShortsVisibility(settings.hideShorts);

    if (!youtube.isHomePage()) {
      clearManagedRows();

      return;
    }

    if (!account.isSignedIn()) {
      pendingGridRetry = clearPendingRefresh(pendingGridRetry);
      lastAccountKey = account.getCurrentAccountKey();
      editMode = false;
      closeAddPlaylistDialog();
      feedRowRenderer.resetRenderState();
      clearManagedRows();

      return;
    }

    const grid = youtube.findHomeContents();

    if (!grid) {
      scheduleDeferredRefresh({ forceDataRefresh });

      return;
    }

    if (!account.isReadyForRefresh(lastAccountKey)) {
      scheduleDeferredRefresh({ forceDataRefresh });

      return;
    }

    pendingGridRetry = clearPendingRefresh(pendingGridRetry);

    const currentAccountKey = account.getCurrentAccountKey();

    if (lastAccountKey && lastAccountKey !== currentAccountKey) {
      forceDataRefresh = true;
      feedRowRenderer.resetRenderState();
      clearManagedRows();
    }

    lastAccountKey = currentAccountKey;
    const enabledPlaylists = settings.playlists.filter((playlist) => playlist.enabled);

    const [playlistRows, subscriptionVideos] = await Promise.all([
      Promise.all(
        enabledPlaylists.map(async (playlist) => {
          const data = await playlists.storage.getPlaylistData({
            playlist,
            force: forceDataRefresh,
          });

          return {
            playlist,
            data,
          };
        }),
      ),
      settings.showSubscriptions
        ? subscriptions.storage.getSubscriptionVideos({
            force: forceDataRefresh,
          })
        : Promise.resolve([]),
    ]);

    if (account.getCurrentAccountKey() !== currentAccountKey) {
      feedRowRenderer.resetRenderState();
      clearManagedRows();
      refreshRequestedDuringFlight = true;
      refreshRequestedForceDuringFlight = true;

      return;
    }

    settings = await syncStoredPlaylistTitles(settings, playlistRows);
    feedRowRenderer.renderEditModeButton(grid, {
      isEditing: editMode,
      onToggle: () => {
        setEditMode(!editMode);
      },
    });

    if (editMode) {
      feedRowRenderer.renderAddPlaylistRow(grid, {
        onAdd: () => {
          void openAddPlaylistDialog();
        },
      });
    } else {
      feedRowRenderer.removeFeedRow("playlist-add");
    }

    syncFeedRows({
      grid,
      settings,
      playlistRows,
      subscriptionVideos,
    });
  })();

  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;

    if (refreshRequestedDuringFlight) {
      const forceRefresh = refreshRequestedForceDuringFlight;
      refreshRequestedDuringFlight = false;
      refreshRequestedForceDuringFlight = false;
      scheduleRefresh({ forceDataRefresh: forceRefresh });
    }
  }
}

function shouldReactToMutations(mutations) {
  for (const mutation of mutations) {
    if (
      containsRelevantMutation(mutation.addedNodes) ||
      containsRelevantMutation(mutation.removedNodes)
    ) {
      return true;
    }
  }

  return false;
}

function hasRelevantStorageChange(changes) {
  return Object.keys(changes).some(
    (key) =>
      key === constants.SETTINGS_KEY ||
      key.startsWith(`${constants.PLAYLISTS_CACHE_KEY}:`) ||
      key.startsWith(`${constants.SUBSCRIPTIONS_CACHE_KEY}:`),
  );
}

function containsRelevantMutation(nodes) {
  for (const node of nodes) {
    if (!(node instanceof Element)) {
      continue;
    }

    if (node.id === constants.STYLE_ID) {
      continue;
    }

    if (feedRowRenderer.isWatchTubeNode(node)) {
      continue;
    }

    return true;
  }

  return false;
}

function scheduleDeferredRefresh({ forceDataRefresh = false } = {}) {
  pendingGridRetryForceDataRefresh =
    pendingGridRetryForceDataRefresh || forceDataRefresh;

  if (pendingGridRetry) {
    return;
  }

  pendingGridRetry = window.setTimeout(() => {
    const forceRefresh = pendingGridRetryForceDataRefresh;
    pendingGridRetry = null;
    pendingGridRetryForceDataRefresh = false;
    scheduleRefresh({ forceDataRefresh: forceRefresh });
  }, 500);
}

function clearPendingRefresh(timeoutId) {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }

  pendingGridRetryForceDataRefresh = false;

  return null;
}

async function activateRequestedEditMode() {
  const stored = await chrome.storage.local.get(constants.EDIT_MODE_REQUEST_KEY);
  const request = stored[constants.EDIT_MODE_REQUEST_KEY];
  const requestId = String(request?.id || "");
  const requestedAt = Number(request?.requestedAt || 0);
  const requestIsFresh = Date.now() - requestedAt < 60 * 1000;

  if (!requestId || requestId === handledEditModeRequest || !requestIsFresh) {
    return;
  }

  handledEditModeRequest = requestId;
  setEditMode(true);
}

function setEditMode(isEditing) {
  if (editMode === isEditing) {
    return;
  }

  editMode = isEditing;

  if (!editMode) {
    closeAddPlaylistDialog();
  }

  scheduleRefresh();
}

async function syncStoredPlaylistTitles(settings, playlistRows) {
  const nextTitlesByPlaylistId = new Map();

  for (const { playlist, data } of playlistRows) {
    const title = String(data?.title || "").trim();

    if (title) {
      nextTitlesByPlaylistId.set(playlist.playlistId, title);
    }
  }

  let changed = false;

  const playlists = settings.playlists.map((playlist) => {
    const nextTitle = nextTitlesByPlaylistId.get(playlist.playlistId);

    if (!nextTitle || nextTitle === playlist.title) {
      return playlist;
    }

    changed = true;

    return {
      ...playlist,
      title: nextTitle,
    };
  });

  if (!changed) {
    return settings;
  }

  return settingsStore.writeSettings({
    ...settings,
    playlists,
  });
}

function syncFeedRows({ grid, settings, playlistRows, subscriptionVideos }) {
  const records = buildFeedRowRecords({
    settings,
    playlistRows,
    subscriptionVideos,
  });
  const nextRenderedRowIds = new Set();

  for (const [index, record] of records.entries()) {
    if (!record.videos.length && !editMode) {
      clearFeedRow(record.rowId);
      continue;
    }

    feedRowRenderer.renderFeedRow(grid, {
      rowId: record.rowId,
      title: record.title,
      videos: record.videos,
      loadAvatar: playlists.api.getChannelAvatarUrl,
      controls: editMode
        ? createRowControls({
            record,
            index,
            rowCount: records.length,
          })
        : null,
      controlsSignature: [
        editMode,
        record.rowId,
        index,
        records.length,
        record.unwatchedOnly,
      ].join(":"),
    });

    nextRenderedRowIds.add(record.rowId);
  }

  for (const rowId of renderedFeedRowIds) {
    if (!nextRenderedRowIds.has(rowId)) {
      clearFeedRow(rowId);
    }
  }

  renderedFeedRowIds = nextRenderedRowIds;
}

function buildFeedRowRecords({ settings, playlistRows, subscriptionVideos }) {
  const playlistRowsByRowId = new Map(
    playlistRows.map((row) => [
      settingsStore.getPlaylistRowId(row.playlist.playlistId),
      row,
    ]),
  );
  const recordsByRowId = new Map();

  for (const [rowId, { playlist, data }] of playlistRowsByRowId) {
    const videos = filterVideosByWatchState(
      Array.isArray(data?.videos) ? data.videos : [],
      playlist.unwatchedOnly,
    );

    recordsByRowId.set(rowId, {
      rowId,
      type: "playlist",
      playlist,
      title: data?.title || playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
      videos,
      unwatchedOnly: playlist.unwatchedOnly,
    });
  }

  if (settings.showSubscriptions) {
    recordsByRowId.set(constants.SUBSCRIPTIONS_ROW_ID, {
      rowId: constants.SUBSCRIPTIONS_ROW_ID,
      type: "subscriptions",
      title: "Subscriptions",
      videos: filterVideosByWatchState(
        subscriptionVideos,
        settings.subscriptionsUnwatchedOnly,
      ),
      unwatchedOnly: settings.subscriptionsUnwatchedOnly,
    });
  }

  const orderedRecords = [];

  for (const rowId of settings.rowOrder) {
    const record = recordsByRowId.get(rowId);

    if (!record) {
      continue;
    }

    orderedRecords.push(record);
    recordsByRowId.delete(rowId);
  }

  orderedRecords.push(...recordsByRowId.values());

  return orderedRecords;
}

function filterVideosByWatchState(videos, unwatchedOnly) {
  if (!unwatchedOnly) {
    return videos;
  }

  return videos.filter((video) => !video.hasWatchProgress);
}

function clearManagedRows() {
  const rowIds = new Set(renderedFeedRowIds);

  document.querySelectorAll(".watchtube-section").forEach((section) => {
    const rowId = section.dataset.watchtubeRow;

    if (rowId) {
      rowIds.add(rowId);
    }
  });

  for (const rowId of rowIds) {
    clearFeedRow(rowId);
  }

  renderedFeedRowIds = new Set();
}

function clearFeedRow(rowId) {
  feedRowRenderer.removeFeedRow(rowId);
  feedRowRenderer.clearRenderState(rowId);
}

function createRowControls({ record, index, rowCount }) {
  return {
    disableMoveUp: index <= 0,
    disableMoveDown: index >= rowCount - 1,
    unwatchedOnly: record.unwatchedOnly,
    canRemove: true,
    onMoveUp: () => {
      void moveRow(record.rowId, -1);
    },
    onMoveDown: () => {
      void moveRow(record.rowId, 1);
    },
    onToggleUnwatchedOnly: () => {
      void toggleRowUnwatchedOnly(record);
    },
    onRemove: () => {
      void removeRowWithConfirmation(record);
    },
  };
}

async function moveRow(rowId, direction) {
  const settings = await settingsStore.readSettings();
  const activeRowIds = getActiveRowIds(settings);
  const activeIndex = activeRowIds.indexOf(rowId);
  const swapRowId = activeRowIds[activeIndex + direction];

  if (!swapRowId) {
    return;
  }

  await settingsStore.writeSettings({
    ...settings,
    rowOrder: swapRowIds(settings.rowOrder, rowId, swapRowId),
  });
}

function getActiveRowIds(settings) {
  const activeRows = new Set(
    settings.playlists
      .filter((playlist) => playlist.enabled)
      .map((playlist) => settingsStore.getPlaylistRowId(playlist.playlistId)),
  );

  if (settings.showSubscriptions) {
    activeRows.add(constants.SUBSCRIPTIONS_ROW_ID);
  }

  return settings.rowOrder.filter((rowId) => activeRows.has(rowId));
}

function swapRowIds(rowOrder, rowId, swapRowId) {
  const nextRowOrder = [...rowOrder];
  const currentIndex = nextRowOrder.indexOf(rowId);
  const swapIndex = nextRowOrder.indexOf(swapRowId);

  if (currentIndex < 0 || swapIndex < 0) {
    return nextRowOrder;
  }

  [nextRowOrder[currentIndex], nextRowOrder[swapIndex]] = [
    nextRowOrder[swapIndex],
    nextRowOrder[currentIndex],
  ];

  return nextRowOrder;
}

async function toggleRowUnwatchedOnly(record) {
  const settings = await settingsStore.readSettings();

  if (record.type === "subscriptions") {
    await settingsStore.writeSettings({
      ...settings,
      subscriptionsUnwatchedOnly: !settings.subscriptionsUnwatchedOnly,
    });

    return;
  }

  await settingsStore.writeSettings({
    ...settings,
    playlists: settings.playlists.map((playlist) =>
      playlist.playlistId === record.playlist.playlistId
        ? {
            ...playlist,
            unwatchedOnly: !playlist.unwatchedOnly,
          }
        : playlist,
    ),
  });
}

async function removeRowWithConfirmation(record) {
  const title =
    record.type === "subscriptions"
      ? "Subscriptions"
      : record.playlist.title || constants.DEFAULT_PLAYLIST_TITLE;
  const shouldRemove = window.confirm(`Remove "${title}" from WatchTube?`);

  if (!shouldRemove) {
    return;
  }

  const settings = await settingsStore.readSettings();

  if (record.type === "subscriptions") {
    await settingsStore.writeSettings({
      ...settings,
      showSubscriptions: false,
    });

    return;
  }

  await settingsStore.writeSettings({
    ...settings,
    playlists: settings.playlists.filter(
      (entry) => entry.playlistId !== record.playlist.playlistId,
    ),
    rowOrder: settings.rowOrder.filter((entry) => entry !== record.rowId),
  });
}

function openAddPlaylistDialog() {
  closeAddPlaylistDialog();

  addPlaylistDialog = createAddPlaylistDialog();
  document.documentElement.append(addPlaylistDialog.overlay);
  addPlaylistDialog.input.focus();
}

function closeAddPlaylistDialog() {
  addPlaylistDialog?.overlay.remove();
  addPlaylistDialog = null;
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

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !input.disabled) {
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
        status,
        input,
        addButton,
        cancelButton,
        pickerSearch,
        onSettingsChanged: (nextSettings) => {
          currentSettings = nextSettings;
          renderPicker();
        },
      });
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

function renderPlaylistPicker({
  availablePlaylists,
  settings,
  query,
  pickerList,
  pickerStatus,
  status,
  input,
  addButton,
  cancelButton,
  pickerSearch,
  onSettingsChanged,
}) {
  const normalizedQuery = normalizePickerSearchQuery(query);
  const filteredPlaylists = availablePlaylists.filter((playlist) =>
    matchesPlaylistSearch(playlist, normalizedQuery),
  );
  const showSubscriptionsButton = matchesPickerSearchTitle(
    "subscriptions",
    normalizedQuery,
  );

  pickerList.replaceChildren();

  if (showSubscriptionsButton) {
    pickerList.append(
      createSubscriptionPickerButton({
        status,
        input,
        addButton,
        cancelButton,
        pickerList,
        pickerSearch,
        enabled: settings.showSubscriptions,
        onSettingsChanged,
      }),
    );
  }

  for (const playlist of filteredPlaylists) {
    const storedPlaylist = settings.playlists.find(
      (entry) => entry.playlistId === playlist.playlistId,
    );

    pickerList.append(
      createPlaylistPickerButton({
        playlist,
        storedPlaylist,
        status,
        input,
        addButton,
        cancelButton,
        pickerList,
        pickerSearch,
        onSettingsChanged,
      }),
    );
  }

  if (pickerList.children.length) {
    pickerStatus.hidden = true;

    return;
  }

  pickerStatus.hidden = false;
  pickerStatus.textContent = normalizedQuery
    ? "No matching playlists."
    : "No playlists found.";
}

function createSubscriptionPickerButton({
  status,
  input,
  addButton,
  cancelButton,
  pickerList,
  pickerSearch,
  enabled,
  onSettingsChanged,
}) {
  const button = document.createElement("button");
  const title = document.createElement("span");
  const state = document.createElement("span");

  button.className = "watchtube-playlist-picker-item";
  button.type = "button";
  button.dataset.state = enabled ? "enabled" : "disabled";

  title.className = "watchtube-playlist-picker-title";
  title.textContent = "Subscriptions";

  state.className = "watchtube-playlist-picker-state";
  state.textContent = enabled ? "Enabled" : "Disabled";

  button.append(title, state);
  button.addEventListener("click", async () => {
    await toggleSubscriptionsInSettings({
      enabled: !enabled,
      status,
      input,
      addButton,
      cancelButton,
      pickerList,
      pickerSearch,
      onSettingsChanged,
    });
  });

  return button;
}

function createPlaylistPickerButton({
  playlist,
  storedPlaylist,
  status,
  input,
  addButton,
  cancelButton,
  pickerList,
  pickerSearch,
  onSettingsChanged,
}) {
  const button = document.createElement("button");
  const title = document.createElement("span");
  const state = document.createElement("span");
  const isEnabled = Boolean(storedPlaylist?.enabled);
  const isStored = Boolean(storedPlaylist);

  button.className = "watchtube-playlist-picker-item";
  button.type = "button";
  button.dataset.state = isEnabled ? "enabled" : isStored ? "disabled" : "new";

  title.className = "watchtube-playlist-picker-title";
  title.textContent = playlist.title || constants.DEFAULT_PLAYLIST_TITLE;

  state.className = "watchtube-playlist-picker-state";
  state.textContent = isEnabled ? "Enabled" : isStored ? "Disabled" : "";

  button.append(title, state);
  button.addEventListener("click", async () => {
    if (isStored) {
      await togglePrefetchedPlaylistInSettings({
        playlistId: playlist.playlistId,
        enabled: !isEnabled,
        status,
        input,
        addButton,
        cancelButton,
        pickerList,
        pickerSearch,
        onSettingsChanged,
      });

      return;
    }

    await addPlaylistToSettings({
      playlistId: playlist.playlistId,
      title: playlist.title || constants.DEFAULT_PLAYLIST_TITLE,
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
  });

  return button;
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

    if (
      latestSettings.playlists.some(
        (playlist) => playlist.playlistId === playlistId && playlist.enabled,
      )
    ) {
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

    const playlist = settingsStore.createPlaylist({
      playlistId,
      title: playlistTitle,
      enabled: true,
    });
    const existingLatestPlaylist = latestSettings.playlists.find(
      (entry) => entry.playlistId === playlistId,
    );
    const playlistRowId = settingsStore.getPlaylistRowId(playlist.playlistId);
    const nextPlaylists = existingLatestPlaylist
      ? latestSettings.playlists.map((entry) =>
          entry.playlistId === playlistId
            ? {
                ...entry,
                title: playlistTitle,
                enabled: true,
              }
            : entry,
        )
      : [...latestSettings.playlists, playlist];
    const nextRowOrder = latestSettings.rowOrder.includes(playlistRowId)
      ? latestSettings.rowOrder
      : [...latestSettings.rowOrder, playlistRowId];

    const nextSettings = await settingsStore.writeSettings({
      ...latestSettings,
      playlists: nextPlaylists,
      rowOrder: nextRowOrder,
    });

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

    const nextSettings = await settingsStore.writeSettings({
      ...settings,
      showSubscriptions: enabled,
      rowOrder: settings.rowOrder.includes(constants.SUBSCRIPTIONS_ROW_ID)
        ? settings.rowOrder
        : [...settings.rowOrder, constants.SUBSCRIPTIONS_ROW_ID],
    });

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
    const playlistRowId = settingsStore.getPlaylistRowId(playlistId);
    const nextSettings = await settingsStore.writeSettings({
      ...settings,
      playlists: settings.playlists.map((playlist) =>
        playlist.playlistId === playlistId
          ? {
              ...playlist,
              enabled,
            }
          : playlist,
      ),
      rowOrder: settings.rowOrder.includes(playlistRowId)
        ? settings.rowOrder
        : [...settings.rowOrder, playlistRowId],
    });

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

function normalizePickerSearchQuery(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function matchesPlaylistSearch(playlist, query) {
  if (!query) {
    return true;
  }

  return (
    matchesPickerSearchTitle(playlist.title, query) ||
    matchesPickerSearchId(playlist.playlistId, query)
  );
}

function matchesPickerSearchTitle(value, query) {
  if (!query) {
    return true;
  }

  const normalizedTitle = String(value || "").toLocaleLowerCase();
  const words = normalizedTitle.match(/[\p{L}\p{N}]+/gu) || [];
  const queryWords = query.match(/[\p{L}\p{N}]+/gu) || [];

  return queryWords.every((queryWord) =>
    words.some((word) => word.startsWith(queryWord)),
  );
}

function matchesPickerSearchId(value, query) {
  return !query || String(value || "").toLocaleLowerCase().startsWith(query);
}

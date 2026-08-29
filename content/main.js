"use strict";

import * as constants from "./core/constants.js";
import * as account from "./core/account.js";
import * as cache from "./core/cache.js";
import * as settingsStore from "./core/settings.js";
import * as youtube from "./core/youtube.js";

import { ensureStyleElement } from "./styles/inject.js";
import { applyShortsVisibility } from "./features/shorts/shorts.js";

import {
  closeAddPlaylistDialog,
  openAddPlaylistDialog,
} from "./features/feedRows/playlists/dialog.js";
import * as playlists from "./features/feedRows/playlists/index.js";
import {
  buildFeedRowDescriptors,
  buildFeedRowRecord,
} from "./features/feedRows/rowModel.js";
import { createRowControls } from "./features/feedRows/rowActions.js";
import * as subscriptions from "./features/feedRows/subscriptions/index.js";
import * as feedRowRenderer from "./features/feedRows/shared/render.js";

const PRIORITY_ROW_COUNT = 2;
const ROW_FETCH_CONCURRENCY = 2;
const VIDEO_ACTION_BRIDGE_SCRIPT_ID = "watchtube-video-action-bridge";

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
let editMode = false;
let handledEditModeRequest = null;
let bootstrapRefreshTimer = null;
let bootstrapRefreshAttempts = 0;
let rowRefreshGeneration = 0;
let activeRowsRevision = 0;
let activeRowsSignature = "";
let activePlaylistExpansionCount = 0;

const locallyWrittenStorageKeys = new Map();
const playlistExpansionJobs = new Map();
const activePlaylistExpansionRowIds = new Set();

start();

function start() {
  void ensureStyleElement();
  ensureVideoActionBridge();

  watchYoutubeNavigation();
  watchPageReadiness();
  watchYoutubeDom();
  watchStorageChanges();
  installDebugHelpers();
  void activateRequestedEditMode();

  scheduleRefresh();
  startBootstrapRefreshes();
}

function ensureVideoActionBridge() {
  if (document.getElementById(VIDEO_ACTION_BRIDGE_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");

  script.id = VIDEO_ACTION_BRIDGE_SCRIPT_ID;
  script.type = "module";
  script.src = chrome.runtime.getURL("content/queueBridge.js");
  script.dataset.watchtubeUi = "true";
  script.addEventListener(
    "load",
    () => {
      script.remove();
    },
    {
      once: true,
    },
  );

  (document.head || document.documentElement).append(script);
}

function installDebugHelpers() {
  Object.defineProperty(globalThis, "watchTubeDebugRows", {
    configurable: true,
    value: async () => {
      const settings = await settingsStore.readSettings();
      const descriptors = buildFeedRowDescriptors(settings);
      const keys = descriptors.map(getRowCacheKey);
      const stored = await chrome.storage.local.get(keys);
      const rows = descriptors.map((descriptor) => {
        const key = getRowCacheKey(descriptor);
        const record = stored[key];
        const data = record?.items;
        const row = buildFeedRowRecord({
          descriptor,
          data,
        });

        return {
          rowId: descriptor.rowId,
          title: row.title,
          type: descriptor.type,
          totalVideos: Array.isArray(data?.videos)
            ? data.videos.length
            : Array.isArray(data)
              ? data.length
              : 0,
          filteredVideos: row.videos.length,
          unwatchedOnly: row.unwatchedOnly,
          continuation: Boolean(data?.continuation),
          complete: Boolean(data?.isComplete),
          expandedAt: data?.expandedAt
            ? new Date(data.expandedAt).toLocaleTimeString()
            : "",
          continuationFailedAt: data?.continuationFailedAt
            ? new Date(data.continuationFailedAt).toLocaleTimeString()
            : "",
          continuationError: data?.continuationError || "",
          cacheVersion: record?.version,
        };
      });

      console.table(rows);

      return rows;
    },
  });
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

    const relevantChange = getRelevantStorageChange(changes);

    if (!relevantChange.hasRelevantChange) {
      return;
    }

    scheduleRefresh({
      forceDataRefresh: relevantChange.forceDataRefresh,
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
    const generation = ++rowRefreshGeneration;
    const descriptors = buildFeedRowDescriptors(settings);
    const activeRowIds = descriptors.map((descriptor) => descriptor.rowId);

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

    feedRowRenderer.syncRowShells(grid, activeRowIds);
    clearInactiveRows(activeRowIds);

    const snapshots = await readRowCacheSnapshots({
      descriptors,
      forceDataRefresh,
    });

    if (!canContinueRowRefresh({ currentAccountKey, generation })) {
      feedRowRenderer.resetRenderState();
      clearManagedRows();
      refreshRequestedDuringFlight = true;
      refreshRequestedForceDuringFlight = true;

      return;
    }

    const loadedPlaylistRows = [];

    for (const [index, descriptor] of descriptors.entries()) {
      const snapshot = snapshots.get(descriptor.rowId);

      if (!snapshot?.hasValue) {
        continue;
      }

      renderRowData({
        grid,
        descriptor,
        data: snapshot.items,
        index,
        rowCount: descriptors.length,
      });

      collectPlaylistTitle(loadedPlaylistRows, descriptor, snapshot.items);

      if (snapshot.isFresh) {
        schedulePlaylistExpansion({
          grid,
          descriptor,
          data: snapshot.items,
          index,
          rowCount: descriptors.length,
          currentAccountKey,
          generation,
        });
      }
    }

    await refreshStaleRows({
      grid,
      descriptors,
      snapshots,
      currentAccountKey,
      generation,
      loadedPlaylistRows,
    });

    if (!canContinueRowRefresh({ currentAccountKey, generation })) {
      return;
    }

    await syncStoredPlaylistTitles(settings, loadedPlaylistRows);
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

function getRelevantStorageChange(changes) {
  let hasRelevantChange = false;
  let forceDataRefresh = false;

  for (const key of Object.keys(changes)) {
    if (consumeLocalStorageWrite(key)) {
      continue;
    }

    if (key === constants.SETTINGS_KEY) {
      hasRelevantChange = true;
      forceDataRefresh = true;
      continue;
    }

    if (
      key.startsWith(`${constants.PLAYLISTS_CACHE_KEY}:`) ||
      key.startsWith(`${constants.SUBSCRIPTIONS_CACHE_KEY}:`)
    ) {
      hasRelevantChange = true;
    }
  }

  return {
    hasRelevantChange,
    forceDataRefresh,
  };
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
  const stored = await chrome.storage.local.get(
    constants.EDIT_MODE_REQUEST_KEY,
  );
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

  return writeTrackedSettings({
    ...settings,
    playlists,
  });
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

async function readRowCacheSnapshots({ descriptors, forceDataRefresh }) {
  const cacheKeys = descriptors.map(getRowCacheKey);
  const stored = await chrome.storage.local.get(cacheKeys);
  const snapshots = new Map();

  for (const descriptor of descriptors) {
    const key = getRowCacheKey(descriptor);

    snapshots.set(
      descriptor.rowId,
      cache.readCacheRecord(stored[key], {
        ttl: getRowCacheTtl(descriptor),
        version: constants.CACHE_VERSION,
        force: forceDataRefresh,
      }),
    );
  }

  return snapshots;
}

async function refreshStaleRows({
  grid,
  descriptors,
  snapshots,
  currentAccountKey,
  generation,
  loadedPlaylistRows,
}) {
  const staleDescriptors = descriptors.filter(
    (descriptor) => !snapshots.get(descriptor.rowId)?.isFresh,
  );
  const prioritizedDescriptors = prioritizeRowDescriptors(staleDescriptors);

  await runWithConcurrency(
    prioritizedDescriptors,
    ROW_FETCH_CONCURRENCY,
    async (descriptor) => {
      if (!canContinueRowRefresh({ currentAccountKey, generation })) {
        return;
      }

      const snapshot = snapshots.get(descriptor.rowId);
      const result = await fetchAndCacheRowData(
        descriptor,
        snapshot?.items || null,
      );

      if (!canContinueRowRefresh({ currentAccountKey, generation })) {
        return;
      }

      if (!result.ok && snapshot?.hasValue) {
        return;
      }

      const index = descriptors.findIndex(
        (entry) => entry.rowId === descriptor.rowId,
      );

      renderRowData({
        grid,
        descriptor,
        data: result.data,
        index,
        rowCount: descriptors.length,
      });

      collectPlaylistTitle(loadedPlaylistRows, descriptor, result.data);
      schedulePlaylistExpansion({
        grid,
        descriptor,
        data: result.data,
        index,
        rowCount: descriptors.length,
        currentAccountKey,
        generation,
      });
    },
  );
}

function renderRowData({ grid, descriptor, data, index, rowCount }) {
  const record = buildFeedRowRecord({
    descriptor,
    data,
  });

  if (!record.videos.length && !editMode) {
    clearFeedRow(record.rowId);

    return false;
  }

  feedRowRenderer.renderFeedRow(grid, {
    rowId: record.rowId,
    title: record.title,
    videos: record.videos,
    loadAvatar: playlists.api.getChannelAvatarUrl,
    onVideoRemoved: ({ video, playlistId }) =>
      removeVideoFromPlaylistCache({
        grid,
        descriptor,
        data,
        video,
        playlistId,
        index,
        rowCount,
      }),
    controls: editMode
      ? createRowControls({
          record,
          index,
          rowCount,
        })
      : null,
    controlsSignature: [
      editMode,
      record.rowId,
      index,
      rowCount,
      record.unwatchedOnly,
    ].join(":"),
  });

  return true;
}

async function removeVideoFromPlaylistCache({
  grid,
  descriptor,
  data,
  video,
  playlistId,
  index,
  rowCount,
}) {
  if (
    descriptor.type !== "playlist" ||
    descriptor.playlist.playlistId !== playlistId
  ) {
    return;
  }

  const nextData = {
    ...data,
    videos: (data?.videos || []).filter(
      (entry) => entry.videoId !== video?.videoId,
    ),
  };

  await writeTrackedCachedRecord(getRowCacheKey(descriptor), nextData);
  renderRowData({ grid, descriptor, data: nextData, index, rowCount });
}

async function fetchAndCacheRowData(descriptor, previousData = null) {
  const key = getRowCacheKey(descriptor);

  try {
    const fetchedData =
      descriptor.type === "subscriptions"
        ? await subscriptions.api.fetchSubscriptionVideos()
        : await playlists.api.fetchPlaylist(descriptor.playlist);
    const data =
      descriptor.type === "playlist"
        ? preserveExpandedPlaylistData(fetchedData, previousData)
        : fetchedData;

    await writeTrackedCachedRecord(key, data);

    return {
      ok: true,
      data,
    };
  } catch (error) {
    console.warn("WatchTube: failed to refresh row data", error);

    return {
      ok: false,
      data: getRowFallbackValue(descriptor),
    };
  }
}

function getRowCacheKey(descriptor) {
  if (descriptor.type === "subscriptions") {
    return cache.buildAccountCacheKey(constants.SUBSCRIPTIONS_CACHE_KEY);
  }

  return cache.buildScopedAccountCacheKey(
    constants.PLAYLISTS_CACHE_KEY,
    descriptor.playlist.playlistId,
  );
}

function getRowCacheTtl(descriptor) {
  return descriptor.type === "subscriptions"
    ? constants.SUBSCRIPTIONS_CACHE_TTL_MS
    : constants.CACHE_TTL_MS;
}

function getRowFallbackValue(descriptor) {
  if (descriptor.type === "subscriptions") {
    return [];
  }

  return {
    title: descriptor.playlist?.title || constants.DEFAULT_PLAYLIST_TITLE,
    videos: [],
  };
}

function prioritizeRowDescriptors(descriptors) {
  const priorityRows = descriptors.slice(0, PRIORITY_ROW_COUNT);
  const remainingRows = descriptors.slice(PRIORITY_ROW_COUNT);

  return [...priorityRows, ...remainingRows];
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;

      await worker(item);
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(concurrency, items.length),
      },
      runNext,
    ),
  );
}

function collectPlaylistTitle(playlistRows, descriptor, data) {
  if (descriptor.type !== "playlist") {
    return;
  }

  playlistRows.push({
    playlist: descriptor.playlist,
    data,
  });
}

function clearInactiveRows(activeRowIds) {
  const nextRenderedRowIds = new Set(activeRowIds);
  const nextActiveRowsSignature = activeRowIds.join("|");

  if (nextActiveRowsSignature !== activeRowsSignature) {
    activeRowsSignature = nextActiveRowsSignature;
    activeRowsRevision += 1;
  }

  for (const rowId of renderedFeedRowIds) {
    if (!nextRenderedRowIds.has(rowId)) {
      clearFeedRow(rowId);
    }
  }

  for (const rowId of playlistExpansionJobs.keys()) {
    if (!nextRenderedRowIds.has(rowId)) {
      playlistExpansionJobs.delete(rowId);
    }
  }

  renderedFeedRowIds = nextRenderedRowIds;
}

function canContinueRowRefresh({ currentAccountKey, generation }) {
  return (
    generation === rowRefreshGeneration &&
    youtube.isHomePage() &&
    account.getCurrentAccountKey() === currentAccountKey
  );
}

function trackLocalStorageWrite(key) {
  locallyWrittenStorageKeys.set(
    key,
    (locallyWrittenStorageKeys.get(key) || 0) + 1,
  );
}

async function writeTrackedCachedRecord(key, data) {
  trackLocalStorageWrite(key);

  try {
    await cache.writeCachedRecord(key, data, {
      version: constants.CACHE_VERSION,
    });
  } catch (error) {
    consumeLocalStorageWrite(key);
    throw error;
  }
}

async function writeTrackedSettings(settings) {
  trackLocalStorageWrite(constants.SETTINGS_KEY);

  try {
    return await settingsStore.writeSettings(settings);
  } catch (error) {
    consumeLocalStorageWrite(constants.SETTINGS_KEY);
    throw error;
  }
}

function schedulePlaylistExpansion({
  grid,
  descriptor,
  data,
  index,
  rowCount,
  currentAccountKey,
}) {
  if (!shouldExpandPlaylistData(descriptor, data)) {
    return;
  }

  if (activePlaylistExpansionRowIds.has(descriptor.rowId)) {
    return;
  }

  playlistExpansionJobs.set(descriptor.rowId, {
    grid,
    descriptor,
    data,
    index,
    rowCount,
    currentAccountKey,
    activeRowsRevision,
  });

  drainPlaylistExpansionQueue();
}

function shouldExpandPlaylistData(descriptor, data) {
  return (
    descriptor.type === "playlist" &&
    data?.continuation &&
    !data.isComplete &&
    Array.isArray(data.videos) &&
    data.videos.length < constants.MAX_PLAYLIST_CACHE_VIDEOS &&
    data.context &&
    data.apiKey &&
    continuationRetryIsAllowed(data)
  );
}

function continuationRetryIsAllowed(data) {
  const failedAt = Number(data?.continuationFailedAt || 0);

  return (
    !failedAt ||
    Date.now() - failedAt >= constants.PLAYLIST_CONTINUATION_RETRY_DELAY_MS
  );
}

function preserveExpandedPlaylistData(fetchedData, previousData) {
  if (
    !Array.isArray(previousData?.videos) ||
    previousData.videos.length <= (fetchedData?.videos?.length || 0)
  ) {
    return fetchedData;
  }

  return {
    ...fetchedData,
    videos: previousData.videos,
    continuation: previousData.continuation || fetchedData.continuation || "",
    context: fetchedData.context || previousData.context || null,
    apiKey: fetchedData.apiKey || previousData.apiKey || "",
    isComplete: Boolean(previousData.isComplete) || !previousData.continuation,
    expandedAt: previousData.expandedAt,
  };
}

function drainPlaylistExpansionQueue() {
  while (
    activePlaylistExpansionCount < constants.PLAYLIST_CONTINUATION_CONCURRENCY &&
    playlistExpansionJobs.size
  ) {
    const [rowId, job] = playlistExpansionJobs.entries().next().value;

    playlistExpansionJobs.delete(rowId);
    activePlaylistExpansionRowIds.add(rowId);
    activePlaylistExpansionCount += 1;

    runPlaylistExpansionJob(job)
      .catch((error) => {
        console.warn("WatchTube: failed to expand playlist row", error);
      })
      .finally(() => {
        activePlaylistExpansionRowIds.delete(rowId);
        activePlaylistExpansionCount -= 1;
        drainPlaylistExpansionQueue();
      });
  }
}

async function runPlaylistExpansionJob(job) {
  let data = job.data;

  while (
    shouldExpandPlaylistData(job.descriptor, data) &&
    canContinuePlaylistExpansion(job)
  ) {
    const previousContinuation = data.continuation;
    const previousVideoCount = data.videos.length;
    let page;

    try {
      page = await playlists.api.fetchPlaylistContinuation({
        continuation: data.continuation,
        context: data.context,
        apiKey: data.apiKey,
        playlistId: job.descriptor.playlist.playlistId,
      });
    } catch (error) {
      await writeTrackedCachedRecord(getRowCacheKey(job.descriptor), {
        ...data,
        continuationFailedAt: Date.now(),
        continuationError: String(error?.message || error || ""),
      });

      throw error;
    }

    if (!canContinuePlaylistExpansion(job)) {
      return;
    }

    data = playlists.api.mergePlaylistData(data, page, {
      maxVideos: constants.MAX_PLAYLIST_CACHE_VIDEOS,
    });

    if (
      data.continuation === previousContinuation &&
      data.videos.length === previousVideoCount
    ) {
      data = {
        ...data,
        continuation: "",
        isComplete: true,
        expandedAt: Date.now(),
      };
    }

    await writeTrackedCachedRecord(getRowCacheKey(job.descriptor), data);

    if (!canContinuePlaylistExpansion(job)) {
      return;
    }

    renderRowData({
      grid: job.grid,
      descriptor: job.descriptor,
      data,
      index: job.index,
      rowCount: job.rowCount,
    });
  }
}

function canContinuePlaylistExpansion({
  descriptor,
  currentAccountKey,
  activeRowsRevision: jobActiveRowsRevision,
}) {
  return (
    jobActiveRowsRevision === activeRowsRevision &&
    youtube.isHomePage() &&
    account.getCurrentAccountKey() === currentAccountKey &&
    renderedFeedRowIds.has(descriptor.rowId)
  );
}

function consumeLocalStorageWrite(key) {
  const count = locallyWrittenStorageKeys.get(key) || 0;

  if (!count) {
    return false;
  }

  if (count === 1) {
    locallyWrittenStorageKeys.delete(key);
  } else {
    locallyWrittenStorageKeys.set(key, count - 1);
  }

  return true;
}

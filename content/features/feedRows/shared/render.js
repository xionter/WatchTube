import * as utils from "../../../core/utils.js";
import * as constants from "../../../core/constants.js";
import * as avatar from "./avatar.js";
import { openConfirmationDialog } from "../playlists/dialog.js";
import {
  buildVideoMenuActions,
  decodeVideoActionBridgeDetail,
  encodeVideoActionBridgeDetail,
  shareVideoLink,
  VIDEO_ACTION_QUEUE,
  VIDEO_ACTION_REQUEST_EVENT,
  VIDEO_ACTION_RESPONSE_EVENT,
  VIDEO_ACTION_REMOVE_FROM_PLAYLIST,
  VIDEO_ACTION_WATCH_LATER,
} from "./videoActions.js";

const shuffleLocks = new Set();
const playlistRemovalLocks = new Set();
const rowStates = new Map();
const sectionCache = new Map();

let renderInProgress = false;
let activeVideoActionsMenu = null;
let videoActionsMenuId = 0;
let videoActionRequestId = 0;

export function resetRenderState() {
  closeActiveVideoActionsMenu();
  rowStates.clear();
}

export function syncRowShells(grid, rowIds) {
  if (!grid) {
    return;
  }

  renderInProgress = true;

  try {
    grid.classList.add("watchtube-grid");

    const anchor = findFirstFeedItem(grid);

    for (const rowId of rowIds) {
      const section = getOrCreateSection(grid, rowId);

      if (!rowStates.has(rowId) && !section.childElementCount) {
        section.classList.add("watchtube-row-shell");
      }

      grid.insertBefore(section, anchor);
    }
  } catch (error) {
    console.error("WATCHTUBE RENDER SHELL SYNC FAILED", error);
  } finally {
    renderInProgress = false;
  }
}

export function renderFeedRow(
  grid,
  { rowId, title, videos, loadAvatar, controls = null, onVideoRemoved = null, controlsSignature = "" },
) {
  const mounted = ensureMountedSection(grid, rowId);

  if (!mounted) {
    return;
  }

  const { section, wasCreated } = mounted;
  const state = rowStates.get(rowId);

  if (
    !wasCreated &&
    state &&
    state.title === title &&
    displayedVideosStillAvailable(state.displayedUrls, videos)
  ) {
    syncRowControls(section, rowId, controls, controlsSignature);
    rowStates.set(rowId, {
      ...state,
      grid,
      title,
      sourceSignature: buildRenderSignature(videos),
      controls,
      onVideoRemoved,
      controlsSignature,
      videos,
      loadAvatar,
    });

    return;
  }

  replaceFeedRowContents(section, {
    rowId,
    title,
    videos,
    loadAvatar,
    controls,
    onVideoRemoved,
    controlsSignature,
    picks: getStablePicks(videos, state?.displayedUrls),
  });
}

export function renderAddPlaylistRow(grid, { onAdd }) {
  const mounted = ensureMountedSection(grid, "playlist-add");

  if (!mounted) {
    return;
  }

  renderInProgress = true;

  try {
    const { section } = mounted;
    const button = document.createElement("button");
    const copy = document.createElement("span");
    const icon = document.createElement("span");

    section.classList.add("watchtube-add-section");
    section.replaceChildren();

    button.className = "watchtube-add-playlist";
    button.dataset.watchtubeRow = "playlist-add";
    button.type = "button";
    button.setAttribute("aria-label", "Add playlist row");

    icon.className = "watchtube-add-playlist-icon";
    icon.textContent = "+";

    copy.className = "watchtube-add-playlist-copy";
    copy.textContent = "Add playlist row";

    button.append(icon, copy);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onAdd?.();
    });

    section.append(button);
  } finally {
    renderInProgress = false;
  }
}

export function renderEditModeButton(grid, { isEditing, onToggle }) {
  const mounted = ensureMountedSection(grid, "watchtube-edit");

  if (!mounted) {
    return;
  }

  renderInProgress = true;

  try {
    const { section } = mounted;
    const button = document.createElement("button");

    section.classList.add("watchtube-edit-section");
    section.replaceChildren();

    button.className = isEditing
      ? "watchtube-edit-mode-button watchtube-edit-mode-button-active"
      : "watchtube-edit-mode-button";
    button.dataset.watchtubeUi = "true";
    button.dataset.watchtubeRow = "watchtube-edit";
    button.type = "button";
    button.textContent = isEditing ? "Done" : "Edit rows";
    button.setAttribute(
      "aria-label",
      isEditing ? "Finish editing rows" : "Edit homepage rows",
    );

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle?.();
    });

    section.append(button);
  } finally {
    renderInProgress = false;
  }
}

function shuffleFeedRow(
  grid,
  { rowId, title, videos, loadAvatar, controls, onVideoRemoved, controlsSignature },
) {
  const section = findSection(rowId);

  if (!section || section.parentElement !== grid) {
    return;
  }

  replaceFeedRowContents(section, {
    rowId,
    title,
    videos,
    loadAvatar,
    controls,
    onVideoRemoved,
    controlsSignature,
    picks: getRandomPicks(videos),
  });
}

function replaceFeedRowContents(
  section,
  { rowId, title, videos, loadAvatar, controls, onVideoRemoved, controlsSignature, picks },
) {
  renderInProgress = true;

  try {
    sectionCache.set(rowId, section);
    closeActiveVideoActionsMenu({ rowId });
    avatar.cancelPendingAvatarLoads(section);
    section.replaceChildren();

    section.classList.remove("watchtube-row-shell");
    section.classList.remove("watchtube-add-section");
    section.classList.remove("watchtube-edit-section");

    const button = createShuffleButton(rowId);
    const fragment = document.createDocumentFragment();

    button.hidden = !videos.length;

    fragment.append(button);

    const rowControls = controls
      ? createRowControls(rowId, controls, controlsSignature)
      : null;

    if (rowControls) {
      fragment.append(rowControls);
    }

    for (const video of picks) {
      fragment.append(createGridItem(video, rowId, title, loadAvatar, onVideoRemoved));
    }

    section.append(fragment);

    rowStates.set(rowId, {
      grid: section.parentElement,
      title,
      sourceSignature: buildRenderSignature(videos),
      controls,
      onVideoRemoved,
      controlsSignature,
      videos,
      loadAvatar,
      displayedUrls: picks.map((video) => video.url),
    });

    return true;
  } catch (error) {
    console.error("WATCHTUBE RENDER FAILED", error);

    return false;
  } finally {
    renderInProgress = false;
  }
}

export function removeFeedRow(rowId) {
  closeActiveVideoActionsMenu({ rowId });

  document
    .querySelectorAll(`.watchtube-section[data-watchtube-row="${rowId}"]`)
    .forEach((node) => {
      avatar.cancelPendingAvatarLoads(node);
      node.remove();
    });

  sectionCache.delete(rowId);
  rowStates.delete(rowId);
  cleanupWatchTubeGridClasses();
}

function findSection(rowId) {
  const cached = sectionCache.get(rowId);

  if (cached?.isConnected) {
    return cached;
  }

  if (cached) {
    sectionCache.delete(rowId);
  }

  const section = document.querySelector(
    `.watchtube-section[data-watchtube-row="${rowId}"]`,
  );

  if (section) {
    sectionCache.set(rowId, section);
  }

  return section;
}

function findFirstFeedItem(grid) {
  return [...grid.children].find((child) => !isWatchTubeNode(child)) || null;
}

function ensureMountedSection(grid, rowId) {
  if (!grid) {
    return null;
  }

  renderInProgress = true;

  try {
    grid.classList.add("watchtube-grid");

    let section = getOrCreateSection(grid, rowId);
    let wasCreated = false;

    if (!section.isConnected || section.parentElement !== grid) {
      wasCreated = true;
    }

    sectionCache.set(rowId, section);

    if (section.parentElement !== grid) {
      ensureSectionPosition(grid, section);
    }

    return { section, wasCreated };
  } catch (error) {
    console.error("WATCHTUBE RENDER MOUNT FAILED", error);

    return null;
  } finally {
    renderInProgress = false;
  }
}

function getOrCreateSection(grid, rowId) {
  let section = sectionCache.get(rowId);

  if (section && section.parentElement !== grid) {
    section.remove();
  }

  if (!section || !section.isConnected || section.parentElement !== grid) {
    section = findSection(rowId);
  }

  if (section && section.parentElement !== grid) {
    section.remove();
  }

  if (!section || !section.isConnected || section.parentElement !== grid) {
    section = document.createElement("div");

    section.className = "watchtube-section";
    section.dataset.watchtubeRow = rowId;
  }

  sectionCache.set(rowId, section);

  return section;
}

function ensureSectionPosition(grid, section) {
  const firstFeedItem = findFirstFeedItem(grid);

  if (firstFeedItem) {
    grid.insertBefore(section, firstFeedItem);

    return;
  }

  if (section.parentElement !== grid) {
    grid.prepend(section);
  }
}

function createGridItem(video, rowId, title, loadAvatar, onVideoRemoved) {
  const item = document.createElement("div");

  item.className = "watchtube-item";
  item.dataset.watchtubeRow = rowId;

  item.append(createCard(video, title, loadAvatar, onVideoRemoved));

  return item;
}

function createShuffleButton(rowId) {
  const button = document.createElement("button");

  button.className = "watchtube-shuffle";
  button.dataset.watchtubeRow = rowId;

  button.type = "button";
  button.textContent = "Shuffle ↻";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (shuffleLocks.has(rowId)) {
      return;
    }

    shuffleLocks.add(rowId);

    button.disabled = true;

    try {
      const state = rowStates.get(rowId);

      if (!state) {
        return;
      }

      shuffleFeedRow(state.grid, {
        rowId,
        title: state.title,
        videos: state.videos,
        loadAvatar: state.loadAvatar,
        controls: state.controls,
        onVideoRemoved: state.onVideoRemoved,
        controlsSignature: state.controlsSignature,
      });
    } finally {
      setTimeout(() => {
        shuffleLocks.delete(rowId);

        button.disabled = false;
      }, 250);
    }
  });

  return button;
}

function createCard(video, title, loadAvatar, onVideoRemoved) {
  const card = document.createElement("div");

  card.className = "watchtube-card";

  const channelAvatar = avatar.findVisibleChannelAvatar(video);
  const avatarElement = channelAvatar
    ? avatar.createAvatarImageElement(channelAvatar)
    : avatar.createAvatarPlaceholderElement(video);

  const thumbnailLink = createVideoLink(video.url);
  const thumbnailWrap = document.createElement("div");
  const thumbnail = document.createElement("img");
  const meta = document.createElement("div");
  const copy = document.createElement("div");
  const titleLink = createVideoLink(video.url);
  const cardTitle = document.createElement("div");
  const channelLink = document.createElement("a");
  const source = document.createElement("div");
  const actions = createVideoActions(video, onVideoRemoved);

  thumbnailWrap.className = "watchtube-thumb-wrap";

  thumbnail.className = "watchtube-thumb";
  thumbnail.src = video.thumbnail;
  thumbnail.alt = "";
  thumbnail.loading = "lazy";
  thumbnail.decoding = "async";

  meta.className = "watchtube-meta";
  copy.className = "watchtube-copy";

  cardTitle.className = "watchtube-card-title";
  cardTitle.textContent = video.title;

  channelLink.className = "watchtube-card-channel";
  channelLink.href = video.channelUrl || "#";
  channelLink.rel = "noreferrer";
  channelLink.textContent = video.channel;

  source.className = "watchtube-card-source";
  source.textContent = title;

  thumbnailWrap.append(thumbnail);
  thumbnailLink.append(thumbnailWrap);
  titleLink.append(cardTitle);
  copy.append(titleLink, channelLink, source);
  meta.append(avatarElement, copy, actions);
  card.append(thumbnailLink, meta);

  avatar.wireAvatarFallback(card, video);

  avatar.scheduleMissingChannelAvatar(card, video, loadAvatar);

  return card;
}

function createVideoActions(video, onVideoRemoved) {
  const wrapper = document.createElement("div");
  const button = document.createElement("button");
  const menuId = `watchtube-video-actions-menu-${++videoActionsMenuId}`;

  wrapper.className = "watchtube-card-actions";
  wrapper.dataset.watchtubeUi = "true";

  button.className = "watchtube-video-actions-button";
  button.dataset.watchtubeUi = "true";
  button.type = "button";
  button.textContent = "⋮";
  button.title = "More actions";
  button.id = `${menuId}-button`;
  button.setAttribute("aria-label", "More actions");
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", menuId);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleVideoActionsMenu({ button, menuId, video, onVideoRemoved });
  });

  button.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openVideoActionsMenu({
      button,
      menuId,
      video,
      onVideoRemoved,
      focusIndex: event.key === "ArrowUp" ? -1 : 0,
    });
  });

  wrapper.append(button);

  return wrapper;
}

function toggleVideoActionsMenu({ button, menuId, video, onVideoRemoved }) {
  if (activeVideoActionsMenu?.button === button) {
    closeActiveVideoActionsMenu({ restoreFocus: true });

    return;
  }

  openVideoActionsMenu({ button, menuId, video, onVideoRemoved });
}

function openVideoActionsMenu({ button, menuId, video, onVideoRemoved, focusIndex = null }) {
  closeActiveVideoActionsMenu();

  const menu = createVideoActionsMenu({ button, menuId, video, onVideoRemoved });

  document.documentElement.append(menu);
  positionVideoActionsMenu(button, menu);

  button.setAttribute("aria-expanded", "true");

  activeVideoActionsMenu = {
    button,
    menu,
    rowId: button.closest("[data-watchtube-row]")?.dataset.watchtubeRow || "",
  };

  document.addEventListener("click", handleVideoActionsDocumentClick, true);
  document.addEventListener("keydown", handleVideoActionsDocumentKeydown, true);
  document.addEventListener("scroll", handleVideoActionsWindowChange, true);
  window.addEventListener("resize", handleVideoActionsWindowChange, true);

  if (focusIndex !== null) {
    focusVideoActionsMenuItem(menu, focusIndex);
  }
}

function createVideoActionsMenu({ button, menuId, video, onVideoRemoved }) {
  const menu = document.createElement("div");
  const actions = buildVideoMenuActions(video);

  menu.className = "watchtube-video-actions-menu";
  menu.dataset.watchtubeUi = "true";
  menu.id = menuId;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-labelledby", button.id);
  menu.tabIndex = -1;

  for (const action of actions) {
    menu.append(
      createVideoActionsMenuItem({
        icon: action.icon,
        label: action.label,
        onSelect: () => {
          if (
            action.id === VIDEO_ACTION_QUEUE ||
            action.id === VIDEO_ACTION_WATCH_LATER
          ) {
            void performVideoAction(action.id, action.videoId);

            return;
          }

          if (action.id === "share") {
            void shareVideoLink({ video, copyText });
          }

          if (action.id === VIDEO_ACTION_REMOVE_FROM_PLAYLIST) {
            void confirmAndRemoveFromPlaylist({ action, video, onSuccess: onVideoRemoved });
          }
        },
      }),
    );
  }

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  menu.addEventListener("keydown", handleVideoActionsMenuKeydown);

  return menu;
}

async function confirmAndRemoveFromPlaylist({ action, video, onSuccess }) {
  const lockKey = `${action.playlistId}:${action.videoId}`;

  if (playlistRemovalLocks.has(lockKey)) {
    return;
  }

  const confirmation = openConfirmationDialog({
    title: "Remove from playlist",
    message: `Remove “${video.title || "this video"}” from the playlist?`,
  });
  const shouldRemove = await confirmation.promise;

  if (!shouldRemove) {
    return;
  }

  if (playlistRemovalLocks.has(lockKey)) {
    return;
  }

  playlistRemovalLocks.add(lockKey);
  confirmation.setBusy(true);

  try {
    await performVideoAction(action.id, action.videoId, action.playlistId, true);
    await onSuccess?.({ video, playlistId: action.playlistId });
    confirmation.close();
  } catch (error) {
    confirmation.setError(
      "The video could not be removed from the playlist. Please try again.",
    );
    confirmation.setBusy(false);
    console.warn("WatchTube: failed to remove video from playlist", error);
  } finally {
    playlistRemovalLocks.delete(lockKey);
  }
}

function performVideoAction(action, videoId, playlistId = "", throwOnError = false) {
  const request = new Promise((resolve, reject) => {
    const requestId = `watchtube-video-action-${Date.now()}-${++videoActionRequestId}`;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("YouTube video action timed out"));
    }, 3000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      document.removeEventListener(VIDEO_ACTION_RESPONSE_EVENT, handleResponse);
    }

    function handleResponse(event) {
      const detail = decodeVideoActionBridgeDetail(event.detail);

      if (detail.requestId !== requestId) {
        return;
      }

      cleanup();

      if (detail.ok) {
        resolve();

        return;
      }

      reject(new Error(detail.error || "YouTube video action failed"));
    }

    document.addEventListener(VIDEO_ACTION_RESPONSE_EVENT, handleResponse);
    document.dispatchEvent(
      new CustomEvent(VIDEO_ACTION_REQUEST_EVENT, {
        detail: encodeVideoActionBridgeDetail({
          action,
          requestId,
          videoId,
          playlistId,
        }),
      }),
    );
  });

  return throwOnError
    ? request
    : request.catch((error) => {
        console.warn("WatchTube: failed to run video action", error);
      });
}

function createVideoActionsMenuItem({ icon, label, onSelect }) {
  const item = document.createElement("button");
  const iconElement = createVideoActionsMenuIcon(icon);
  const labelElement = document.createElement("span");

  item.className = "watchtube-video-actions-menu-item";
  item.dataset.watchtubeUi = "true";
  item.type = "button";
  item.setAttribute("role", "menuitem");

  labelElement.className = "watchtube-video-actions-menu-label";
  labelElement.textContent = label;

  item.append(iconElement, labelElement);

  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect?.();
    closeActiveVideoActionsMenu({ restoreFocus: true });
  });

  return item;
}

function createVideoActionsMenuIcon(icon) {
  const wrapper = document.createElement("span");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  wrapper.className = "watchtube-video-actions-menu-icon";
  wrapper.setAttribute("aria-hidden", "true");

  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("focusable", "false");

  path.setAttribute("d", getVideoActionsMenuIconPath(icon));

  svg.append(path);
  wrapper.append(svg);

  return wrapper;
}

function getVideoActionsMenuIconPath(icon) {
  if (icon === "queue") {
    return "M4 6h10v2H4V6Zm0 5h10v2H4v-2Zm0 5h7v2H4v-2Zm12-4V8h2v4h4v2h-4v4h-2v-4h-4v-2h4Z";
  }

  if (icon === "watchLater") {
    return "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 11.59 3.3 3.3-1.41 1.41L11 14.41V6h2v7.59Z";
  }

  if (icon === "share") {
    return "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.06-.23.09-.46.09-.7s-.03-.47-.09-.7l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .24.03.47.09.7L8.04 9.81A2.99 2.99 0 1 0 8.04 14.2l7.12 4.17c-.05.2-.08.41-.08.63a2.92 2.92 0 1 0 2.92-2.92Z";
  }

  if (icon === "remove") {
    return "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM8 9h2v10H8V9Zm6 0h2v10h-2V9ZM15.5 4l-1-1h-5l-1 1H5v2h14V4h-3.5Z";
  }

  return "";
}

function handleVideoActionsMenuKeydown(event) {
  if (!activeVideoActionsMenu) {
    return;
  }

  const items = getVideoActionsMenuItems(activeVideoActionsMenu.menu);
  const currentIndex = items.indexOf(document.activeElement);

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeActiveVideoActionsMenu({ restoreFocus: true });

    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.stopPropagation();
    focusVideoActionsMenuItem(
      activeVideoActionsMenu.menu,
      currentIndex + 1,
    );

    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    focusVideoActionsMenuItem(
      activeVideoActionsMenu.menu,
      currentIndex - 1,
    );

    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    event.stopPropagation();
    focusVideoActionsMenuItem(activeVideoActionsMenu.menu, 0);

    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    event.stopPropagation();
    focusVideoActionsMenuItem(activeVideoActionsMenu.menu, -1);
  }
}

function handleVideoActionsDocumentClick(event) {
  if (!activeVideoActionsMenu) {
    return;
  }

  const { button, menu } = activeVideoActionsMenu;

  if (button.contains(event.target) || menu.contains(event.target)) {
    return;
  }

  closeActiveVideoActionsMenu();
}

function handleVideoActionsDocumentKeydown(event) {
  if (event.key !== "Escape" || !activeVideoActionsMenu) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  closeActiveVideoActionsMenu({ restoreFocus: true });
}

function handleVideoActionsWindowChange() {
  if (!activeVideoActionsMenu) {
    return;
  }

  positionVideoActionsMenu(
    activeVideoActionsMenu.button,
    activeVideoActionsMenu.menu,
  );
}

function closeActiveVideoActionsMenu({
  restoreFocus = false,
  rowId = null,
} = {}) {
  if (!activeVideoActionsMenu) {
    return;
  }

  if (rowId && activeVideoActionsMenu.rowId !== rowId) {
    return;
  }

  const { button, menu } = activeVideoActionsMenu;

  document.removeEventListener("click", handleVideoActionsDocumentClick, true);
  document.removeEventListener(
    "keydown",
    handleVideoActionsDocumentKeydown,
    true,
  );
  document.removeEventListener("scroll", handleVideoActionsWindowChange, true);
  window.removeEventListener("resize", handleVideoActionsWindowChange, true);

  button.setAttribute("aria-expanded", "false");
  menu.remove();
  activeVideoActionsMenu = null;

  if (restoreFocus && button.isConnected) {
    button.focus();
  }
}

function positionVideoActionsMenu(button, menu) {
  const position = calculateVideoActionsMenuPosition({
    buttonRect: button.getBoundingClientRect(),
    menuRect: menu.getBoundingClientRect(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
  menu.style.maxHeight = `${position.maxHeight}px`;
}

function focusVideoActionsMenuItem(menu, index) {
  const items = getVideoActionsMenuItems(menu);

  if (!items.length) {
    menu.focus();

    return;
  }

  const normalizedIndex = ((index % items.length) + items.length) % items.length;

  items[normalizedIndex].focus();
}

function getVideoActionsMenuItems(menu) {
  return [...menu.querySelectorAll(".watchtube-video-actions-menu-item")];
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);

      return;
    } catch {
      // Fall through to the legacy copy path.
    }
  }

  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.dataset.watchtubeUi = "true";
  textarea.setAttribute("aria-hidden", "true");

  document.body.append(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export function calculateVideoActionsMenuPosition({
  buttonRect,
  menuRect,
  viewportWidth,
  viewportHeight,
  viewportPadding = 8,
  gap = 6,
}) {
  const menuWidth = Math.max(menuRect.width, 0);
  const menuHeight = Math.max(menuRect.height, 0);
  const minLeft = viewportPadding;
  const maxLeft = Math.max(minLeft, viewportWidth - viewportPadding - menuWidth);
  const preferredLeft = buttonRect.right - menuWidth;
  const left = clamp(preferredLeft, minLeft, maxLeft);
  const belowTop = buttonRect.bottom + gap;
  const aboveTop = buttonRect.top - gap - menuHeight;
  const belowSpace = viewportHeight - viewportPadding - belowTop;
  const aboveSpace = buttonRect.top - viewportPadding - gap;
  const fitsBelow = menuHeight <= belowSpace;
  const fitsAbove = aboveTop >= viewportPadding;
  const opensAbove = !fitsBelow && (fitsAbove || aboveSpace > belowSpace);
  const availableHeight = opensAbove ? aboveSpace : belowSpace;
  const viewportAvailableHeight = Math.max(
    1,
    viewportHeight - viewportPadding * 2,
  );
  const maxHeight = Math.min(
    Math.max(80, Math.min(menuHeight, availableHeight)),
    viewportAvailableHeight,
  );
  const unclampedTop = opensAbove
    ? buttonRect.top - gap - maxHeight
    : belowTop;
  const top = clamp(
    unclampedTop,
    viewportPadding,
    Math.max(viewportPadding, viewportHeight - viewportPadding - maxHeight),
  );

  return { left, top, maxHeight };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createVideoLink(url) {
  const link = document.createElement("a");

  link.className = "watchtube-video-link";
  link.href = url;
  link.rel = "noreferrer";

  return link;
}

export function isWatchTubeNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  return Boolean(
    node.closest("[data-watchtube-ui]") ||
    node.closest("[data-watchtube-row]") ||
    node.classList.contains("watchtube-shuffle") ||
    node.closest(".watchtube-shuffle"),
  );
}

function syncRowControls(section, rowId, controls, controlsSignature = "") {
  const state = rowStates.get(rowId);

  if (state?.controlsSignature === controlsSignature) {
    return;
  }

  section.querySelector(".watchtube-row-controls")?.remove();

  if (!controls) {
    return;
  }

  section.prepend(createRowControls(rowId, controls, controlsSignature));
}

function createRowControls(rowId, controls, controlsSignature = "") {
  const wrapper = document.createElement("div");

  wrapper.className = "watchtube-row-controls";
  wrapper.dataset.watchtubeRow = rowId;
  wrapper.dataset.watchtubeControlsSignature = controlsSignature;
  wrapper.setAttribute("aria-label", "Row controls");

  wrapper.append(
    createControlButton({
      label: "Move row up",
      text: "↑",
      disabled: Boolean(controls.disableMoveUp),
      onClick: controls.onMoveUp,
    }),
    createControlButton({
      label: "Move row down",
      text: "↓",
      disabled: Boolean(controls.disableMoveDown),
      onClick: controls.onMoveDown,
    }),
    createControlButton({
      label: controls.unwatchedOnly
        ? "Showing only unwatched videos"
        : "Showing all videos",
      text: controls.unwatchedOnly ? "Unwatched" : "All",
      wide: true,
      active: Boolean(controls.unwatchedOnly),
      onClick: controls.onToggleUnwatchedOnly,
    }),
  );

  if (controls.canRemove) {
    wrapper.append(
      createControlButton({
        label: "Remove playlist row",
        text: "×",
        danger: true,
        onClick: controls.onRemove,
      }),
    );
  }

  return wrapper;
}

function createControlButton({
  label,
  text,
  disabled = false,
  danger = false,
  wide = false,
  active = false,
  onClick,
}) {
  const button = document.createElement("button");

  button.className = [
    "watchtube-row-control",
    danger ? "watchtube-row-control-danger" : "",
    wide ? "watchtube-row-control-wide" : "",
    active ? "watchtube-row-control-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  button.dataset.watchtubeUi = "true";
  button.type = "button";
  button.disabled = disabled;
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.title = label;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!button.disabled) {
      onClick?.();
    }
  });

  return button;
}

function buildRenderSignature(videos) {
  return videos.map((video) => video.url).join("|");
}

function displayedVideosStillAvailable(displayedUrls, videos) {
  const availableUrls = new Set(videos.map((video) => video.url));

  return displayedUrls.every((url) => availableUrls.has(url));
}

function getStablePicks(videos, displayedUrls = []) {
  if (!displayedUrls.length) {
    return getRandomPicks(videos);
  }

  const videosByUrl = new Map(videos.map((video) => [video.url, video]));
  const stablePicks = displayedUrls
    .map((url) => videosByUrl.get(url))
    .filter(Boolean);

  if (stablePicks.length >= constants.MAX_FIRST_ROW_VIDEOS) {
    return stablePicks.slice(0, constants.MAX_FIRST_ROW_VIDEOS);
  }

  const usedUrls = new Set(stablePicks.map((video) => video.url));
  const fillVideos = videos.filter((video) => !usedUrls.has(video.url));

  return [...stablePicks, ...getRandomPicks(fillVideos)].slice(
    0,
    constants.MAX_FIRST_ROW_VIDEOS,
  );
}

function getRandomPicks(videos) {
  return utils.shuffle([...videos]).slice(0, constants.MAX_FIRST_ROW_VIDEOS);
}

export function isRenderInProgress() {
  return renderInProgress;
}

export function clearRenderState(rowId) {
  rowStates.delete(rowId);
}

function cleanupWatchTubeGridClasses() {
  document.querySelectorAll(".watchtube-grid").forEach((grid) => {
    if (!grid.querySelector(".watchtube-section")) {
      grid.classList.remove("watchtube-grid");
    }
  });
}

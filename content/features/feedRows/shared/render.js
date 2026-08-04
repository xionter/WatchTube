import * as utils from "../../../core/utils.js";
import * as constants from "../../../core/constants.js";
import * as avatar from "./avatar.js";

const shuffleLocks = new Set();
const rowStates = new Map();
const sectionCache = new Map();

let renderInProgress = false;

export function resetRenderState() {
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
  { rowId, title, videos, loadAvatar, controls = null, controlsSignature = "" },
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
  { rowId, title, videos, loadAvatar, controls, controlsSignature },
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
    controlsSignature,
    picks: getRandomPicks(videos),
  });
}

function replaceFeedRowContents(
  section,
  { rowId, title, videos, loadAvatar, controls, controlsSignature, picks },
) {
  renderInProgress = true;

  try {
    sectionCache.set(rowId, section);
    avatar.cancelPendingAvatarLoads(section);
    section.replaceChildren();

    section.classList.remove("watchtube-row-shell");
    section.classList.remove("watchtube-add-section");
    section.classList.remove("watchtube-edit-section");

    const button = createShuffleButton(rowId);
    const fragment = document.createDocumentFragment();

    button.hidden = !videos.length;

    fragment.append(button);

    const rowControls = createRowControlsNode(rowId, controls, controlsSignature);

    if (rowControls) {
      fragment.append(rowControls);
    }

    for (const video of picks) {
      fragment.append(createGridItem(video, rowId, title, loadAvatar));
    }

    section.append(fragment);

    rowStates.set(rowId, {
      grid: section.parentElement,
      title,
      sourceSignature: buildRenderSignature(videos),
      controls,
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

  if (!firstFeedItem && section.parentElement !== grid) {
    grid.prepend(section);
  }
}

function createGridItem(video, rowId, title, loadAvatar) {
  const item = document.createElement("div");

  item.className = "watchtube-item";
  item.dataset.watchtubeRow = rowId;

  item.append(createCard(video, title, loadAvatar));

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

function createCard(video, title, loadAvatar) {
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
  meta.append(avatarElement, copy);
  card.append(thumbnailLink, meta);

  avatar.wireAvatarFallback(card, video);

  avatar.scheduleMissingChannelAvatar(card, video, loadAvatar);

  return card;
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

function createRowControlsNode(rowId, controls, controlsSignature) {
  if (!controls) {
    return null;
  }

  return createRowControls(rowId, controls, controlsSignature);
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

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

export function renderFeedRow(grid, { rowId, title, videos, loadAvatar }) {
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
    rowStates.set(rowId, {
      ...state,
      grid,
      title,
      sourceSignature: buildRenderSignature(videos),
      videos,
      loadAvatar,
    });
    ensureSectionPosition(grid, section);

    return;
  }

  replaceFeedRowContents(section, {
    rowId,
    title,
    videos,
    loadAvatar,
    picks: getStablePicks(videos, state?.displayedUrls),
  });
}

function shuffleFeedRow(grid, { rowId, title, videos, loadAvatar }) {
  const mounted = ensureMountedSection(grid, rowId);

  if (!mounted) {
    return;
  }

  replaceFeedRowContents(mounted.section, {
    rowId,
    title,
    videos,
    loadAvatar,
    picks: getRandomPicks(videos),
  });
}

function replaceFeedRowContents(
  section,
  { rowId, title, videos, loadAvatar, picks },
) {
  renderInProgress = true;

  try {
    sectionCache.set(rowId, section);
    section.replaceChildren();

    const button = createShuffleButton(rowId);

    section.append(button);

    for (const video of picks) {
      section.append(createGridItem(video, rowId, title, loadAvatar));
    }

    rowStates.set(rowId, {
      grid: section.parentElement,
      title,
      sourceSignature: buildRenderSignature(videos),
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

    let section = sectionCache.get(rowId);
    let wasCreated = false;

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
      wasCreated = true;
    }

    sectionCache.set(rowId, section);
    ensureSectionPosition(grid, section);

    return { section, wasCreated };
  } catch (error) {
    console.error("WATCHTUBE RENDER MOUNT FAILED", error);

    return null;
  } finally {
    renderInProgress = false;
  }
}

function ensureSectionPosition(grid, section) {
  const firstFeedItem = findFirstFeedItem(grid);
  const sectionIsBeforeFeed =
    firstFeedItem &&
    section.parentElement === grid &&
    Boolean(
      section.compareDocumentPosition(firstFeedItem) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );

  if (sectionIsBeforeFeed) {
    return;
  }

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
    button.style.opacity = "0.7";

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
      });
    } finally {
      setTimeout(() => {
        shuffleLocks.delete(rowId);

        button.disabled = false;
        button.style.opacity = "1";
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

  void avatar.loadMissingChannelAvatar(card, video, loadAvatar);

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
    node.closest("[data-watchtube-row]") ||
    node.classList.contains("watchtube-shuffle") ||
    node.closest(".watchtube-shuffle"),
  );
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

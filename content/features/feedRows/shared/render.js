import * as utils from "../../../core/utils.js";
import * as constants from "../../../core/constants.js";
import * as avatar from "./avatar.js";

const shuffleLocks = new Set();
const lastRenderedSignatures = new Map();
const sectionCache = new Map();

let renderInProgress = false;

export function resetRenderState() {
  lastRenderedSignatures.clear();
}

export function renderFeedRow(grid, { rowId, title, videos, loadAvatar }) {
  const existingSection = findSection(rowId);
  const existingButton = existingSection?.querySelector(
    `.watchtube-shuffle[data-watchtube-row="${rowId}"]`,
  );

  const signature = buildRenderSignature(videos);

  if (
    existingSection &&
    existingButton &&
    existingSection.parentElement === grid &&
    lastRenderedSignatures.get(rowId) === signature
  ) {
    return;
  }

  const rendered = replaceFeedRow(grid, {
    rowId,
    title,
    videos,
    loadAvatar,
  });

  if (rendered) {
    lastRenderedSignatures.set(rowId, signature);
  }
}

function replaceFeedRow(grid, { rowId, title, videos, loadAvatar }) {
  renderInProgress = true;

  try {
    grid.classList.add("watchtube-grid");

    let section = sectionCache.get(rowId);

    if (section && (!section.isConnected || section.parentElement !== grid)) {
      section.remove();
      sectionCache.delete(rowId);
      section = null;
    }

    if (!section) {
      section = document.createElement("div");

      section.className = "watchtube-section";
      section.dataset.watchtubeRow = rowId;

      const firstFeedItem = findFirstFeedItem(grid);

      if (firstFeedItem) {
        grid.insertBefore(section, firstFeedItem);
      } else {
        grid.prepend(section);
      }
    }

    sectionCache.set(rowId, section);
    section.replaceChildren();

    const button = createShuffleButton(grid, {
      rowId,
      title,
      videos,
      loadAvatar,
    });

    section.append(button);

    const picks = utils
      .shuffle([...videos])
      .slice(0, constants.MAX_FIRST_ROW_VIDEOS);

    for (const video of picks) {
      section.append(createGridItem(video, rowId, title, loadAvatar));
    }

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

function createGridItem(video, rowId, title, loadAvatar) {
  const item = document.createElement("div");

  item.className = "watchtube-item";
  item.dataset.watchtubeRow = rowId;

  item.append(createCard(video, title, loadAvatar));

  return item;
}

function createShuffleButton(grid, { rowId, title, videos, loadAvatar }) {
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
      replaceFeedRow(grid, {
        rowId,
        title,
        videos,
        loadAvatar,
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
  return videos
    .map((video) => video.url)
    .join("|");
}

export function isRenderInProgress() {
  return renderInProgress;
}

export function clearRenderState(rowId) {
  lastRenderedSignatures.delete(rowId);
}

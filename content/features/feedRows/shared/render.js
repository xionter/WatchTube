import * as utils from "../../../core/utils.js";
import * as constants from "../../../core/constants.js";
import * as avatar from "./avatar.js";

const shuffleLocks = new Set();
const lastRenderedSignatures = new Map();
let renderInProgress = false;

export function resetRenderState() {
  lastRenderedSignatures.clear();
}

export function renderFeedRow(grid, { rowId, title, videos }) {
  const existingItems = Array.from(
    document.querySelectorAll(`[data-watchtube-row="${rowId}"]`),
  );

  const existingButton = document.querySelector(
    `.watchtube-shuffle[data-watchtube-row="${rowId}"]`,
  );

  const existingGrid = existingItems.length
    ? existingItems[0].parentElement
    : null;

  const signature = buildRenderSignature(videos);

  if (
    existingItems.length &&
    existingButton &&
    existingGrid === grid &&
    lastRenderedSignatures.get(rowId) === signature
  ) {
    return;
  }

  replaceFeedRow(grid, {
    rowId,
    title,
    videos,
  });

  lastRenderedSignatures.set(rowId, signature);
}

function replaceFeedRow(grid, { rowId, title, videos }) {
  renderInProgress = true;
  removeFeedRow(rowId);

  grid.classList.add("watchtube-grid");

  const picks = utils
    .shuffle([...videos])
    .slice(0, constants.MAX_FIRST_ROW_VIDEOS);

  const items = picks.map((video) => {
    return createGridItem(video, rowId, title);
  });
  const firstFeedItem = findFirstFeedItem(grid);

  grid.insertBefore(
    createShuffleButton(grid, {
      rowId,
      title,
      videos,
    }),
    firstFeedItem,
  );
  for (const item of items) {
    grid.insertBefore(item, firstFeedItem);
  }
  renderInProgress = false;
}

export function removeFeedRow(rowId) {
  document
    .querySelectorAll(`[data-watchtube-row="${rowId}"]`)
    .forEach((node) => node.remove());
}

function findFirstFeedItem(grid) {
  return [...grid.children].find((child) => !isWatchTubeNode(child)) || null;
}

function createGridItem(video, rowId, title) {
  const item = document.createElement("ytd-rich-item-renderer");

  item.className = "watchtube-item";
  item.dataset.watchtubeRow = rowId;

  item.append(createCard(video, title));

  return item;
}

function createShuffleButton(grid, { rowId, title, videos }) {
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

function createCard(video, title) {
  const card = document.createElement("a");

  card.className = "watchtube-card";

  card.href = video.url;
  card.rel = "noreferrer";

  const channelAvatar = avatar.findVisibleChannelAvatar(video);

  const avatarMarkup = channelAvatar
    ? avatar.createAvatarImageMarkup(channelAvatar)
    : avatar.createAvatarPlaceholderMarkup(video);

  card.innerHTML = `
        <div class="watchtube-thumb-wrap">
            <img
                class="watchtube-thumb"
                src="${utils.escapeHtml(video.thumbnail)}"
                alt=""
            >
        </div>

        <div class="watchtube-meta">
            ${avatarMarkup}

            <div class="watchtube-copy">
                <div class="watchtube-card-title">
                    ${utils.escapeHtml(video.title)}
                </div>

                <div class="watchtube-card-channel">
                    ${utils.escapeHtml(video.channel)}
                </div>

                <div class="watchtube-card-source">
                    ${utils.escapeHtml(title)}
                </div>
            </div>
        </div>
    `;

  avatar.wireAvatarFallback(card, video);

  void avatar.loadMissingChannelAvatar(card, video, video.loadAvatar);

  return card;
}

export function isWatchTubeNode(node) {
  if (!(node instanceof Element)) {
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
    .slice(0, constants.MAX_FIRST_ROW_VIDEOS)
    .map((video) => video.url)
    .join("|");
}

export function isRenderInProgress() {
  return renderInProgress;
}

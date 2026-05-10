import * as utils from "../../core/utils.js";
import * as constants from "../../core/constants.js";
import * as avatar from "./avatar.js";

let shuffleLocked = false;
let lastRenderedSignature = "";

export function resetRenderState() {
  lastRenderedSignature = "";
}

export function renderWatchLaterItems(grid, videos) {
  const existingItems = Array.from(
    document.querySelectorAll(".watchtube-item"),
  );

  const existingButton = document.querySelector(".watchtube-shuffle");

  const existingGrid = existingItems.length
    ? existingItems[0].parentElement
    : null;

  const signature = buildRenderSignature(videos);

  if (
    existingItems.length &&
    existingButton &&
    existingGrid === grid &&
    lastRenderedSignature === signature
  ) {
    return;
  }

  replaceWatchLaterItems(grid, videos);

  lastRenderedSignature = signature;
}

function replaceWatchLaterItems(grid, videos) {
  removeExistingWatchTubeNodes();

  grid.classList.add("watchtube-grid");

  const picks = utils
    .shuffle([...videos])
    .slice(0, constants.MAX_FIRST_ROW_VIDEOS);

  const items = picks.map(createGridItem);

  const firstFeedItem = findFirstFeedItem(grid);

  grid.insertBefore(createShuffleButton(grid, videos), firstFeedItem);

  for (const item of items) {
    grid.insertBefore(item, firstFeedItem);
  }
}

export function removeExistingWatchTubeNodes() {
  for (const item of document.querySelectorAll(".watchtube-item")) {
    item.remove();
  }

  for (const button of document.querySelectorAll(".watchtube-shuffle")) {
    button.remove();
  }

  for (const grid of document.querySelectorAll(".watchtube-grid")) {
    grid.classList.remove("watchtube-grid");
  }
}

function findFirstFeedItem(grid) {
  return [...grid.children].find((child) => !isWatchTubeNode(child)) || null;
}

function createGridItem(video) {
  const item = document.createElement("ytd-rich-item-renderer");

  item.className = "watchtube-item";

  item.append(createCard(video));

  return item;
}

function createShuffleButton(grid, videos) {
  const button = document.createElement("button");

  button.className = "watchtube-shuffle";

  button.type = "button";

  button.textContent = "Shuffle ↻";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (shuffleLocked) {
      return;
    }

    shuffleLocked = true;

    button.disabled = true;
    button.style.opacity = "0.7";

    try {
      replaceWatchLaterItems(grid, videos);
    } finally {
      setTimeout(() => {
        shuffleLocked = false;

        button.disabled = false;
        button.style.opacity = "1";
      }, 250);
    }
  });

  return button;
}

function createCard(video) {
  const card = document.createElement("a");

  card.className = "watchtube-card";

  card.href = video.url;

  card.target = "_blank";

  card.rel = "noreferrer";

  const channelAvatar = avatar.findVisibleChannelAvatar(video);

  const avatarMarkup = channelAvatar
    ? avatar.createAvatarImageMarkup(avatar)
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
                    Watch Later
                </div>

            </div>

        </div>
    `;

  avatar.wireAvatarFallback(card, video);
  void avatar.loadMissingChannelAvatar(card, video);

  return card;
}

function isWatchTubeNode(node) {
  return (
    node.classList.contains("watchtube-item") ||
    node.classList.contains("watchtube-shuffle")
  );
}

function buildRenderSignature(videos) {
  return videos
    .slice(0, constants.MAX_FIRST_ROW_VIDEOS)
    .map((video) => video.url)
    .join("|");
}

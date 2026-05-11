import * as utils from "../../../core/utils.js";

export function findVisibleChannelAvatar(video) {
  const videoId = utils.getVideoId(video.url);

  if (!videoId) {
    return "";
  }

  const youtubeCard = Array.from(
    document.querySelectorAll("ytd-rich-item-renderer"),
  ).find((item) => {
    const link = item.querySelector('a[href*="watch?v="]');

    return link && utils.getVideoId(link.href) === videoId;
  });

  return (
    youtubeCard?.querySelector("#avatar img[src]")?.src ||
    youtubeCard?.querySelector("yt-img-shadow img[src]")?.src ||
    ""
  );
}

export function createAvatarImageMarkup(src) {
  return `
        <img
            class="watchtube-avatar"
            src="${utils.escapeHtml(src)}"
            alt=""
        >
    `;
}

export function createAvatarPlaceholderMarkup(video) {
  return `
        <div
            class="watchtube-avatar"
            aria-hidden="true"
        >
            ${utils.escapeHtml(getChannelInitial(video))}
        </div>
    `;
}

export function wireAvatarFallback(card, video) {
  const avatar = card.querySelector(".watchtube-avatar");

  if (!(avatar instanceof HTMLImageElement)) {
    return;
  }

  avatar.addEventListener(
    "error",
    () => {
      avatar.replaceWith(createAvatarPlaceholderElement(video));
    },
    {
      once: true,
    },
  );
}

export async function loadMissingChannelAvatar(card, video, loadAvatar) {
  const currentAvatar = card.querySelector(".watchtube-avatar");

  if (
    !currentAvatar ||
    currentAvatar instanceof HTMLImageElement ||
    !video.channelUrl ||
    typeof loadAvatar !== "function"
  ) {
    return;
  }

  const avatarUrl = await loadAvatar(video.channelUrl);

  if (!avatarUrl || !card.isConnected || !(await canLoadImage(avatarUrl))) {
    return;
  }

  const avatar = document.createElement("img");

  avatar.className = "watchtube-avatar";
  avatar.alt = "";
  avatar.src = avatarUrl;

  avatar.addEventListener(
    "error",
    () => {
      avatar.replaceWith(createAvatarPlaceholderElement(video));
    },
    {
      once: true,
    },
  );

  currentAvatar.replaceWith(avatar);
}

function createAvatarPlaceholderElement(video) {
  const placeholder = document.createElement("div");

  placeholder.className = "watchtube-avatar";

  placeholder.setAttribute("aria-hidden", "true");

  placeholder.textContent = getChannelInitial(video);

  return placeholder;
}

function getChannelInitial(video) {
  const initial = (video.channel || "YouTube").trim().charAt(0).toUpperCase();

  return initial || "Y";
}

async function canLoadImage(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const loaded = await tryLoadImage(url);

    if (loaded) {
      return true;
    }

    await delay(250);
  }

  return false;
}

function tryLoadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);

    img.src = url;
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

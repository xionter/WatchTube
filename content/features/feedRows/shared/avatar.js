export function findVisibleChannelAvatar(video) {
  return video.avatar || "";
}

export function createAvatarImageElement(src) {
  const avatar = document.createElement("img");

  avatar.className = "watchtube-avatar";
  avatar.alt = "";
  avatar.src = src;

  return avatar;
}

export function createAvatarPlaceholderElement(video) {
  const placeholder = document.createElement("div");

  placeholder.className = "watchtube-avatar";

  placeholder.setAttribute("aria-hidden", "true");

  placeholder.textContent = getChannelInitial(video);

  return placeholder;
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

  if (!avatarUrl || !card.isConnected) {
    return;
  }

  const avatar = createAvatarImageElement(avatarUrl);

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

function getChannelInitial(video) {
  const initial = (video.channel || "YouTube").trim().charAt(0).toUpperCase();

  return initial || "Y";
}

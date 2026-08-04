const MAX_AVATAR_LOADS = 2;
const avatarQueue = [];
let activeAvatarLoads = 0;
let avatarObserver = null;

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

export function scheduleMissingChannelAvatar(card, video, loadAvatar) {
  if (
    !card ||
    !video?.channelUrl ||
    typeof loadAvatar !== "function" ||
    card.querySelector(".watchtube-avatar") instanceof HTMLImageElement
  ) {
    return;
  }

  if (!card.isConnected) {
    setTimeout(() => {
      if (card.isConnected) {
        scheduleMissingChannelAvatar(card, video, loadAvatar);
      }
    }, 0);

    return;
  }

  if (typeof IntersectionObserver === "undefined") {
    enqueueAvatarLoad(card, video, loadAvatar);

    return;
  }

  getAvatarObserver().observe(card);
  card.__watchtubeAvatarTask = {
    video,
    loadAvatar,
  };
}

export function cancelPendingAvatarLoads(root) {
  if (!root) {
    return;
  }

  root.querySelectorAll?.(".watchtube-card").forEach((card) => {
    avatarObserver?.unobserve(card);
    delete card.__watchtubeAvatarTask;
  });

  for (let index = avatarQueue.length - 1; index >= 0; index -= 1) {
    const task = avatarQueue[index];

    if (task.card === root || root.contains?.(task.card)) {
      avatarQueue.splice(index, 1);
    }
  }
}

function getAvatarObserver() {
  if (!avatarObserver) {
    avatarObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          avatarObserver.unobserve(entry.target);

          const task = entry.target.__watchtubeAvatarTask;

          if (!task) {
            continue;
          }

          delete entry.target.__watchtubeAvatarTask;
          enqueueAvatarLoad(entry.target, task.video, task.loadAvatar);
        }
      },
      {
        rootMargin: "600px 0px",
      },
    );
  }

  return avatarObserver;
}

function enqueueAvatarLoad(card, video, loadAvatar) {
  avatarQueue.push({
    card,
    video,
    loadAvatar,
  });

  drainAvatarQueue();
}

function drainAvatarQueue() {
  while (activeAvatarLoads < MAX_AVATAR_LOADS && avatarQueue.length) {
    const task = avatarQueue.shift();

    if (!task.card.isConnected) {
      continue;
    }

    activeAvatarLoads += 1;

    loadMissingChannelAvatar(task.card, task.video, task.loadAvatar).finally(
      () => {
        activeAvatarLoads -= 1;
        drainAvatarQueue();
      },
    );
  }
}

function getChannelInitial(video) {
  const initial = (video.channel || "YouTube").trim().charAt(0).toUpperCase();

  return initial || "Y";
}

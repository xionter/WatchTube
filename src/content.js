// content.js

const SECTION_ID = "watchtube-custom-row";
const DEFAULT_TITLE = "WatchTube";

let cachedState = {
  enabled: true,
  item: "",
};

function extractVideoId(url) {
  try {
    const parsed = new URL(url.trim());

    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "").trim();
      return id || null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }

      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeVideoUrl(input) {
  const videoId = extractVideoId(input);
  if (!videoId) return null;

  return `https://www.youtube.com/watch?v=${videoId}`;
}

function parseVideoUrls(rawValue) {
  if (typeof rawValue !== "string") return [];

  return [...new Set(
    rawValue
      .split(/[\n,\s;]+/g)
      .map((part) => part.trim())
      .filter(Boolean)
      .map(normalizeVideoUrl)
      .filter(Boolean)
  )];
}

function createVideoCard(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  const card = document.createElement("a");
  card.href = `https://www.youtube.com/watch?v=${videoId}`;
  card.className = "watchtube-video-card";
  card.style.display = "block";
  card.style.width = "210px";
  card.style.minWidth = "210px";
  card.style.textDecoration = "none";
  card.style.color = "inherit";
  card.style.flex = "0 0 auto";

  const thumbnail = document.createElement("img");
  thumbnail.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  thumbnail.alt = "Video thumbnail";
  thumbnail.style.width = "100%";
  thumbnail.style.display = "block";
  thumbnail.style.borderRadius = "12px";
  thumbnail.style.background = "#111";

  const title = document.createElement("div");
  title.textContent = videoUrl;
  title.style.marginTop = "8px";
  title.style.fontSize = "14px";
  title.style.lineHeight = "1.4";
  title.style.fontWeight = "500";
  title.style.color = "var(--yt-spec-text-primary)";

  card.appendChild(thumbnail);
  card.appendChild(title);

  return card;
}

function createSection(urls) {
  const section = document.createElement("section");
  section.id = SECTION_ID;
  section.style.margin = "24px 0";
  section.style.padding = "0 24px";

  const title = document.createElement("h2");
  title.textContent = `${DEFAULT_TITLE}: My Videos`;
  title.style.fontSize = "20px";
  title.style.fontWeight = "700";
  title.style.margin = "0 0 16px 0";
  title.style.color = "var(--yt-spec-text-primary)";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "16px";
  row.style.overflowX = "auto";
  row.style.paddingBottom = "8px";

  urls.forEach((url) => {
    const card = createVideoCard(url);
    if (card) row.appendChild(card);
  });

  if (!row.children.length) {
    const empty = document.createElement("div");
    empty.textContent = "Добавь ссылки на YouTube в popup расширения.";
    empty.style.fontSize = "14px";
    empty.style.color = "var(--yt-spec-text-secondary)";
    row.appendChild(empty);
  }

  section.appendChild(title);
  section.appendChild(row);

  return section;
}

function getHomeTarget() {
  return (
    document.querySelector("ytd-rich-grid-renderer") ||
    document.querySelector("ytd-two-column-browse-results-renderer")
  );
}

function isHomePage() {
  return location.pathname === "/";
}

function removeSection() {
  document.getElementById(SECTION_ID)?.remove();
}

function renderSection() {
  removeSection();

  if (!isHomePage()) return;
  if (!cachedState.enabled) return;

  const target = getHomeTarget();
  if (!target || !target.parentNode) return;

  const urls = parseVideoUrls(cachedState.item);
  if (!urls.length) return;

  const section = createSection(urls);
  target.parentNode.insertBefore(section, target);
}

function loadStateAndRender() {
  chrome.storage.sync.get(["enabled", "item"], (data) => {
    cachedState = {
      enabled: Boolean(data.enabled),
      item: typeof data.item === "string" ? data.item : "",
    };

    renderSection();
  });
}

function observePage() {
  const observer = new MutationObserver(() => {
    if (!document.getElementById(SECTION_ID)) {
      renderSection();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;

  if (changes.enabled) {
    cachedState.enabled = Boolean(changes.enabled.newValue);
  }

  if (changes.item) {
    cachedState.item = typeof changes.item.newValue === "string"
      ? changes.item.newValue
      : "";
  }

  renderSection();
});

window.addEventListener("yt-navigate-finish", loadStateAndRender);
window.addEventListener("load", () => {
  loadStateAndRender();
  observePage();
});

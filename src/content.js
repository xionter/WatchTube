const SECTION_ID = "watchtube-custom-row";

let state = {
  enabled: true,
  item: "",
};

function extractVideoId(url) {
  try {
    const parsed = new URL(url.trim());

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1) || null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseVideoUrls(raw) {
  if (typeof raw !== "string") return [];

  return [...new Set(
    raw
      .split(/[\n,; ]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => x.startsWith("http"))
  )];
}

function removeSection() {
  const old = document.getElementById(SECTION_ID);
  if (old) old.remove();
}

function createCard(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const a = document.createElement("a");
  a.href = `https://www.youtube.com/watch?v=${videoId}`;
  a.style.display = "block";
  a.style.minWidth = "210px";
  a.style.width = "210px";
  a.style.textDecoration = "none";
  a.style.color = "inherit";
  a.style.flex = "0 0 auto";

  const img = document.createElement("img");
  img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  img.alt = "thumbnail";
  img.style.width = "100%";
  img.style.display = "block";
  img.style.borderRadius = "12px";

  const text = document.createElement("div");
  text.textContent = url;
  text.style.marginTop = "8px";
  text.style.fontSize = "14px";
  text.style.lineHeight = "1.4";
  text.style.color = "var(--yt-spec-text-primary)";

  a.append(img, text);
  return a;
}

function render() {
  removeSection();

  if (location.pathname !== "/") return;
  if (!state.enabled) return;

  const target = document.querySelector("ytd-rich-grid-renderer");
  if (!target || !target.parentNode) return;

  const urls = parseVideoUrls(state.item);
  if (!urls.length) return;

  const section = document.createElement("section");
  section.id = SECTION_ID;
  section.style.margin = "24px 0";
  section.style.padding = "0 24px";

  const title = document.createElement("h2");
  title.textContent = "WatchTube: My Videos";
  title.style.fontSize = "20px";
  title.style.fontWeight = "700";
  title.style.margin = "0 0 16px 0";
  title.style.color = "var(--yt-spec-text-primary)";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "16px";
  row.style.overflowX = "auto";
  row.style.paddingBottom = "8px";

  for (const url of urls) {
    const card = createCard(url);
    if (card) row.appendChild(card);
  }

  if (!row.children.length) return;

  section.append(title, row);
  target.parentNode.insertBefore(section, target);
}

function loadState() {
  chrome.storage.sync.get(["enabled", "item"], (data) => {
    state.enabled = data.enabled !== false;
    state.item = typeof data.item === "string" ? data.item : "";
    render();
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  if (changes.enabled) {
    state.enabled = changes.enabled.newValue !== false;
  }

  if (changes.item) {
    state.item = typeof changes.item.newValue === "string"
      ? changes.item.newValue
      : "";
  }

  render();
});

window.addEventListener("load", loadState);
window.addEventListener("yt-navigate-finish", loadState);

const observer = new MutationObserver(() => {
  if (location.pathname === "/" && !document.getElementById(SECTION_ID)) {
    render();
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// content.js

const CUSTOM_VIDEO_URLS = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=9bZkp7q19f0",
  "https://www.youtube.com/watch?v=3JZ_D3ELwOQ"
];

function extractVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1);
    }

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }

    return null;
  } catch {
    return null;
  }
}

function createVideoCard(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const card = document.createElement("a");
  card.href = watchUrl;
  card.target = "_self";
  card.style.textDecoration = "none";
  card.style.color = "inherit";
  card.style.display = "block";
  card.style.width = "210px";
  card.style.flex = "0 0 auto";

  card.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="border-radius:12px;overflow:hidden;background:#111;">
        <img
          src="${thumbnail}"
          alt="Video thumbnail"
          style="width:100%;display:block;"
        />
      </div>
      <div style="font-size:14px;font-weight:500;line-height:1.4;">
        ${watchUrl}
      </div>
    </div>
  `;

  return card;
}

function createCustomSection() {
  if (document.getElementById("watchtube-custom-row")) return null;

  const section = document.createElement("section");
  section.id = "watchtube-custom-row";
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

  CUSTOM_VIDEO_URLS.forEach((url) => {
    const card = createVideoCard(url);
    if (card) row.appendChild(card);
  });

  section.appendChild(title);
  section.appendChild(row);

  return section;
}

function insertSectionOnHomePage() {
  const isHomePage =
    location.pathname === "/" || location.pathname === "/feed/subscriptions" ? location.pathname === "/" : false;

  if (!isHomePage) return;

  const target =
    document.querySelector("ytd-rich-grid-renderer") ||
    document.querySelector("#contents.ytd-rich-grid-renderer") ||
    document.querySelector("ytd-two-column-browse-results-renderer");

  if (!target) return;

  if (document.getElementById("watchtube-custom-row")) return;

  const section = createCustomSection();
  if (!section) return;

  target.parentNode.insertBefore(section, target);
}

function observePage() {
  const observer = new MutationObserver(() => {
    insertSectionOnHomePage();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

window.addEventListener("yt-navigate-finish", insertSectionOnHomePage);
window.addEventListener("load", () => {
  insertSectionOnHomePage();
  observePage();
});

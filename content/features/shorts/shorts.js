import * as youtube from "../../core/youtube.js";

export function applyShortsVisibility(hideShorts) {
  const display = hideShorts ? "none" : "";

  for (const shelf of document.querySelectorAll(
    youtube.SHORTS_SHELF_SELECTORS.join(", "),
  )) {
    shelf.style.display = display;
  }

  for (const link of document.querySelectorAll(youtube.SHORTS_LINK_SELECTORS)) {
    findShortsContainer(link).style.display = display;
  }
}

function findShortsContainer(link) {
  for (const selector of youtube.GUIDE_CONTAINER_SELECTORS) {
    const container = link.closest(selector);

    if (container) {
      return container;
    }
  }

  return link;
}

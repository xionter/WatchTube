export const SHORTS_SHELF_SELECTORS = [
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-reel-shelf-renderer",
    "ytd-rich-section-renderer ytd-reel-shelf-renderer",
    "ytd-item-section-renderer ytd-reel-shelf-renderer",
];

export const SHORTS_LINK_SELECTORS =
    'a[href^="/shorts"], a[href="https://www.youtube.com/shorts"]';

export const HOME_CONTENT_SELECTORS = [
    "ytd-rich-grid-renderer #contents",
    "ytd-two-column-browse-results-renderer #contents",
    "ytd-browse[page-subtype='home'] #contents",
];

export const GUIDE_CONTAINER_SELECTORS = [
    "ytd-guide-entry-renderer",
    "ytd-mini-guide-entry-renderer",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
];

export function isHomePage() {
    return location.pathname === "/";
}

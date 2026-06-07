export function getCurrentAccountKey() {
  return getAccountAvatarSrc() || "signed-out";
}

export function isSignedIn() {
  return Boolean(getAccountAvatarSrc());
}

export function isReadyForRefresh(previousAccountKey) {
  if (isSignedIn()) {
    return true;
  }

  if (previousAccountKey && previousAccountKey !== "signed-out") {
    return hasVisibleSignedOutControl();
  }

  return true;
}

function getAccountAvatarSrc() {
  const avatarButton = document.querySelector(
    "ytd-masthead button#avatar-btn, button#avatar-btn",
  );

  const src = avatarButton?.querySelector?.("img")?.src || "";

  return src;
}

function hasVisibleSignedOutControl() {
  return Boolean(
    document.querySelector(
      [
        "ytd-masthead a[href*='ServiceLogin']",
        "ytd-masthead a[href*='accounts.google.com']",
        "ytd-masthead yt-button-shape a[href*='ServiceLogin']",
      ].join(","),
    ),
  );
}

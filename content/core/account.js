export function getCurrentAccountKey() {
  return getAccountAvatarSrc() || "signed-out";
}

export function isSignedIn() {
  return Boolean(getAccountAvatarSrc());
}

function getAccountAvatarSrc() {
  const avatarButton = document.querySelector(
    "ytd-masthead button#avatar-btn, button#avatar-btn",
  );

  const src =
    avatarButton?.querySelector?.("img")?.src ||
    "";

  return src;
}

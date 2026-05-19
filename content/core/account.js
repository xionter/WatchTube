export function getCurrentAccountKey() {
  const avatarButton =
    document.querySelector("button#avatar-btn") ||
    document.querySelector("img#img");

  const src =
    avatarButton?.querySelector?.("img")?.src ||
    avatarButton?.src ||
    "";

  if (!src) {
    return "guest";
  }

  return src;
}

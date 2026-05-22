import * as utils from "../../../core/utils.js";

export function extractInitialData(html) {
  const markers = ["var ytInitialData = ", 'window["ytInitialData"] = '];

  for (const marker of markers) {
    const start = html.indexOf(marker);

    if (start === -1) {
      continue;
    }

    const jsonStart = start + marker.length;

    const scriptEnd = html.indexOf("</script>", jsonStart);

    if (scriptEnd === -1) {
      continue;
    }

    let jsonText = html.slice(jsonStart, scriptEnd).trim();

    if (jsonText.endsWith(";")) {
      jsonText = jsonText.slice(0, -1);
    }

    return JSON.parse(jsonText);
  }

  throw new Error("ytInitialData not found");
}

export function getChannelUrl(video) {
  const endpoint = utils.getValue(
    video,
    ["shortBylineText", "runs", 0, "navigationEndpoint"],
    null,
  );

  const path =
    utils.getValue(
      endpoint,
      ["commandMetadata", "webCommandMetadata", "url"],
      "",
    ) || utils.getValue(endpoint, ["browseEndpoint", "canonicalBaseUrl"], "");

  return utils.normalizeYouTubeUrl(path);
}

export function findChannelAvatarUrl(json) {
  const candidateGroups = [
    utils.getValue(
      json,
      ["metadata", "channelMetadataRenderer", "avatar", "thumbnails"],
      [],
    ),
    utils.getValue(
      json,
      ["microformat", "microformatDataRenderer", "thumbnail", "thumbnails"],
      [],
    ),
    utils.getValue(
      json,
      ["header", "c4TabbedHeaderRenderer", "avatar", "thumbnails"],
      [],
    ),
    utils.getValue(
      json,
      [
        "header",
        "pageHeaderRenderer",
        "content",
        "pageHeaderViewModel",
        "image",
        "decoratedAvatarViewModel",
        "avatar",
        "avatarViewModel",
        "image",
        "sources",
      ],
      [],
    ),
    utils.getValue(
      json,
      [
        "header",
        "pageHeaderRenderer",
        "content",
        "pageHeaderViewModel",
        "image",
        "avatarViewModel",
        "image",
        "sources",
      ],
      [],
    ),
  ];

  for (const candidates of candidateGroups) {
    const url = selectLargestImageUrl(candidates);

    if (url) {
      return url;
    }
  }

  return findNestedAvatarUrl(json);
}

function selectLargestImageUrl(candidates) {
  if (!Array.isArray(candidates)) {
    return "";
  }

  const image = candidates
    .filter((candidate) => candidate?.url)
    .sort((left, right) => {
      return (right.width || 0) - (left.width || 0);
    })[0];

  return image?.url || "";
}

function findNestedAvatarUrl(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findNestedAvatarUrl(item);

      if (url) {
        return url;
      }
    }

    return "";
  }

  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().includes("avatar")) {
      const url =
        selectLargestImageUrl(child?.thumbnails) ||
        selectLargestImageUrl(child?.image?.sources) ||
        selectLargestImageUrl(child?.avatarViewModel?.image?.sources) ||
        findNestedAvatarUrl(child);

      if (url) {
        return url;
      }
    }
  }

  for (const child of Object.values(value)) {
    const url = findNestedAvatarUrl(child);

    if (url) {
      return url;
    }
  }

  return "";
}

export function getAvatarUrl(video) {
  const thumbnails = utils.getValue(
    video,
    [
      "channelThumbnailSupportedRenderers",
      "channelThumbnailWithLinkRenderer",
      "thumbnail",
      "thumbnails",
    ],
    [],
  );

  return thumbnails[0]?.url || "";
}

import * as constants from "../../../core/constants.js";
import * as parser from "./parser.js";

export async function fetchSubscriptionVideos() {
  const response = await fetch(constants.SUBSCRIPTIONS_URL, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Subscriptions request failed with status ${response.status}`,
    );
  }

  const html = await response.text();

  const renderedVideos = parser.extractRenderedVideos(html);

  if (renderedVideos.length) {
    return renderedVideos;
  }

  const json = parser.extractInitialData(html);

  if (!parser.isSubscriptionsInitialData(json)) {
    return [];
  }

  const contents = parser.findVideoRenderers(json);

  const videos = [];

  for (const item of contents) {
    if (parser.hasWatchProgressMarker(item)) {
      continue;
    }

    const video = parser.extractVideo(item);

    if (video) {
      videos.push(video);
    }
  }

  return videos;
}

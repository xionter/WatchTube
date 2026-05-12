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

  const json = parser.extractInitialData(html);

  const contents = parser.findVideoRenderers(json);

  const videos = [];

  for (const item of contents) {
    const video = parser.extractVideo(item);

    if (video) {
      videos.push(video);
    }
  }

  return videos;
}

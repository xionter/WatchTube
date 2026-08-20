import { describe, expect, it } from "vitest";

import { extractVideo } from "./parser.js";

describe("subscriptions video extraction", () => {
  it("includes the normalized video id", () => {
    expect(
      extractVideo({
        videoId: "sub-video",
        title: {
          runs: [
            {
              text: "Subscription video",
            },
          ],
        },
      }),
    ).toEqual(
      expect.objectContaining({
        videoId: "sub-video",
        url: "https://www.youtube.com/watch?v=sub-video",
      }),
    );
  });
});

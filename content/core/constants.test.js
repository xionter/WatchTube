import { describe, expect, it } from "vitest";

import * as constants from "./constants.js";

describe("constants", () => {
  it("defines playlist expansion bounds", () => {
    expect(constants.CACHE_VERSION).toBe(9);
    expect(constants.MAX_PLAYLIST_CACHE_VIDEOS).toBe(300);
    expect(constants.PLAYLIST_CONTINUATION_CONCURRENCY).toBe(1);
    expect(constants.PLAYLIST_CONTINUATION_RETRY_DELAY_MS).toBe(5 * 60 * 1000);
  });
});

import { describe, expect, it } from "vitest";

import {
  matchesPickerSearchId,
  matchesPickerSearchTitle,
  matchesPlaylistSearch,
  normalizePickerSearchQuery,
  shouldShowSubscriptionsInPicker,
} from "./search.js";

describe("playlist picker search", () => {
  it("normalizes search queries", () => {
    expect(normalizePickerSearchQuery("  Math  ")).toBe("math");
  });

  it("matches title word prefixes instead of arbitrary substrings", () => {
    expect(matchesPickerSearchTitle("Math lectures", "m")).toBe(true);
    expect(matchesPickerSearchTitle("Philosophy", "m")).toBe(false);
  });

  it("matches every query word against a title word prefix", () => {
    expect(matchesPickerSearchTitle("Linear Algebra Basics", "lin alg")).toBe(true);
    expect(matchesPickerSearchTitle("Linear Algebra Basics", "lin geo")).toBe(false);
  });

  it("matches playlist ids by prefix", () => {
    expect(matchesPickerSearchId("PL123", "pl")).toBe(true);
    expect(matchesPickerSearchId("PL123", "123")).toBe(false);
  });

  it("matches playlists by title or id", () => {
    expect(matchesPlaylistSearch({ title: "Music", playlistId: "PL1" }, "mu")).toBe(
      true,
    );
    expect(matchesPlaylistSearch({ title: "Music", playlistId: "PL1" }, "pl")).toBe(
      true,
    );
    expect(matchesPlaylistSearch({ title: "Music", playlistId: "PL1" }, "sic")).toBe(
      false,
    );
  });

  it("applies the same prefix behavior to subscriptions", () => {
    expect(shouldShowSubscriptionsInPicker("sub")).toBe(true);
    expect(shouldShowSubscriptionsInPicker("rip")).toBe(false);
  });
});

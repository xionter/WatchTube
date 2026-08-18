import { describe, expect, it } from "vitest";

import { calculateVideoActionsMenuPosition } from "./render.js";

const menuRect = { width: 208, height: 136 };

describe("video actions menu positioning", () => {
  it("positions the menu below and right-aligned when it fits", () => {
    expect(
      calculateVideoActionsMenuPosition({
        buttonRect: { top: 100, right: 320, bottom: 140 },
        menuRect,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({
      left: 112,
      top: 146,
      maxHeight: 136,
    });
  });

  it("flips above the button near the viewport bottom", () => {
    expect(
      calculateVideoActionsMenuPosition({
        buttonRect: { top: 520, right: 760, bottom: 560 },
        menuRect,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({
      left: 552,
      top: 378,
      maxHeight: 136,
    });
  });

  it("clamps horizontally near the right viewport edge", () => {
    expect(
      calculateVideoActionsMenuPosition({
        buttonRect: { top: 100, right: 830, bottom: 140 },
        menuRect,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({
      left: 584,
      top: 146,
      maxHeight: 136,
    });
  });

  it("limits menu height when neither side has enough vertical space", () => {
    expect(
      calculateVideoActionsMenuPosition({
        buttonRect: { top: 90, right: 240, bottom: 130 },
        menuRect: { width: 208, height: 260 },
        viewportWidth: 320,
        viewportHeight: 220,
      }),
    ).toEqual({
      left: 32,
      top: 132,
      maxHeight: 80,
    });
  });

  it("keeps the menu inside very short viewports", () => {
    expect(
      calculateVideoActionsMenuPosition({
        buttonRect: { top: 28, right: 220, bottom: 68 },
        menuRect: { width: 208, height: 260 },
        viewportWidth: 320,
        viewportHeight: 72,
      }),
    ).toEqual({
      left: 12,
      top: 8,
      maxHeight: 56,
    });
  });
});

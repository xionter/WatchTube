import { afterEach, describe, expect, it, vi } from "vitest";

import { createCacheRecord, readCacheRecord } from "./cache.js";

describe("cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates versioned cache records with timestamps", () => {
    vi.setSystemTime(1_000);

    expect(createCacheRecord(["a"], { version: 3 })).toEqual({
      version: 3,
      items: ["a"],
      updatedAt: 1_000,
    });
  });

  it("marks matching records fresh within ttl", () => {
    vi.setSystemTime(2_000);

    expect(
      readCacheRecord(
        {
          version: 3,
          items: ["a"],
          updatedAt: 1_500,
        },
        {
          ttl: 1_000,
          version: 3,
        },
      ),
    ).toEqual({
      items: ["a"],
      hasValue: true,
      isFresh: true,
      updatedAt: 1_500,
    });
  });

  it("keeps stale matching records available for immediate rendering", () => {
    vi.setSystemTime(3_000);

    expect(
      readCacheRecord(
        {
          version: 3,
          items: ["a"],
          updatedAt: 1_500,
        },
        {
          ttl: 1_000,
          version: 3,
        },
      ),
    ).toEqual({
      items: ["a"],
      hasValue: true,
      isFresh: false,
      updatedAt: 1_500,
    });
  });

  it("treats forced reads as stale while preserving cached data", () => {
    vi.setSystemTime(2_000);

    expect(
      readCacheRecord(
        {
          version: 3,
          items: ["a"],
          updatedAt: 1_900,
        },
        {
          ttl: 1_000,
          version: 3,
          force: true,
        },
      ),
    ).toMatchObject({
      items: ["a"],
      hasValue: true,
      isFresh: false,
    });
  });

  it("rejects missing or mismatched cache records", () => {
    expect(
      readCacheRecord(
        {
          version: 2,
          items: ["a"],
          updatedAt: 1_000,
        },
        {
          ttl: 1_000,
          version: 3,
        },
      ),
    ).toEqual({
      items: null,
      hasValue: false,
      isFresh: false,
    });
  });
});

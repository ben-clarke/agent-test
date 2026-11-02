import { describe, expect, test } from "vitest";
import { AssetListResponseSchema, type Asset } from "../index.ts";

describe("AssetListResponseSchema", () => {
  test("Given an empty items list, when parsed, then it is accepted", () => {
    const result = AssetListResponseSchema.safeParse({ items: [] });

    expect(result.success).toBe(true);
  });

  test("Given a list holding a complete asset, when parsed, then it is accepted", () => {
    const result = AssetListResponseSchema.safeParse({ items: [buildAsset()] });

    expect(result.success).toBe(true);
  });

  test("Given an asset with no genre, when parsed, then it is accepted", () => {
    const result = AssetListResponseSchema.safeParse({ items: [buildAsset({ genre: null })] });

    expect(result.success).toBe(true);
  });

  test("Given a response without items, when parsed, then it is rejected", () => {
    const result = AssetListResponseSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  test("Given an asset whose id is not a UUID, when parsed, then it is rejected", () => {
    const result = AssetListResponseSchema.safeParse({ items: [buildAsset({ id: "not-a-uuid" })] });

    expect(result.success).toBe(false);
  });

  test("Given an asset whose createdAt is not an ISO datetime, when parsed, then it is rejected", () => {
    const result = AssetListResponseSchema.safeParse({
      items: [buildAsset({ createdAt: "yesterday" })],
    });

    expect(result.success).toBe(false);
  });
});

function buildAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "3f2b8c1e-5d4a-4b7e-9a1c-2e6f8d0b4a77",
    title: "The Left Hand of Darkness",
    author: "Ursula K. Le Guin",
    isbn: "9780441478125",
    publishedYear: 1969,
    genre: "science-fiction",
    createdAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}

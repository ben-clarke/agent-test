import type { Asset } from "@library/schemas";

export const buildAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "3f2b8c1e-5a4d-4e6f-8a7b-9c0d1e2f3a4b",
  title: "Dune",
  author: "Frank Herbert",
  isbn: "9780306406157",
  publishedYear: 1965,
  genre: "science-fiction",
  createdAt: "2026-06-15T10:00:00.000Z",
  ...overrides,
});

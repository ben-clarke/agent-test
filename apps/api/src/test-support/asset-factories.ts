import type { CreateAssetInput } from "@library/schemas";

export const buildCreateAssetRequest = (
  overrides: Partial<CreateAssetInput> = {},
): CreateAssetInput => ({
  title: "Dune",
  author: "Frank Herbert",
  isbn: "978-0-306-40615-7",
  publishedYear: 1965,
  genre: "science-fiction",
  ...overrides,
});

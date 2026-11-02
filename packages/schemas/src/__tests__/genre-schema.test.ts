import { describe, expect, test } from "vitest";
import { GenreSchema } from "../index.ts";

const AGREED_GENRES = [
  "fiction",
  "non-fiction",
  "science-fiction",
  "fantasy",
  "mystery",
  "biography",
  "history",
  "children",
  "poetry",
  "other",
] as const;

describe("GenreSchema", () => {
  test.each(AGREED_GENRES)("accepts the agreed genre %s", (genre) => {
    const result = GenreSchema.safeParse(genre);

    expect(result.success).toBe(true);
  });

  test.each(["romance", "Fiction", ""])("rejects %j, which is outside the agreed list", (genre) => {
    const result = GenreSchema.safeParse(genre);

    expect(result.success).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import {
  AssetFilterSchema,
  buildRepeatedFilterMessage,
  buildUnrecognisedFilterMessage,
  VALIDATION_MESSAGES,
} from "../index.ts";

describe("AssetFilterSchema", () => {
  test("Given a blank author, when parsed, then the author is absent", () => {
    const result = AssetFilterSchema.parse({ author: "  " });

    expect(result.author).toBeUndefined();
  });

  test("Given an author with surrounding spaces, when parsed, then it is trimmed", () => {
    const result = AssetFilterSchema.parse({ author: "  Frank Herbert " });

    expect(result.author).toBe("Frank Herbert");
  });

  test("Given title text with surrounding spaces, when parsed, then q is trimmed", () => {
    const result = AssetFilterSchema.parse({ q: " une " });

    expect(result.q).toBe("une");
  });

  test("Given blank title text, when parsed, then q is absent", () => {
    const result = AssetFilterSchema.parse({ q: "  " });

    expect(result.q).toBeUndefined();
  });

  test("Given no filters, when parsed, then the author is absent", () => {
    const result = AssetFilterSchema.parse({});

    expect(result.author).toBeUndefined();
  });

  test("Given a year of up to 4 digits, when parsed, then publishedYear is a number", () => {
    const result = AssetFilterSchema.parse({ publishedYear: " 1965 " });

    expect(result.publishedYear).toBe(1965);
  });

  test("Given a blank year, when parsed, then publishedYear is absent", () => {
    const result = AssetFilterSchema.parse({ publishedYear: "  " });

    expect(result.publishedYear).toBeUndefined();
  });

  test("Given a genre in mixed letter case, when parsed, then it is lowercased", () => {
    const result = AssetFilterSchema.parse({ genre: " Science-Fiction " });

    expect(result.genre).toBe("science-fiction");
  });

  test("Given a blank genre, when parsed, then genre is absent", () => {
    const result = AssetFilterSchema.parse({ genre: "  " });

    expect(result.genre).toBeUndefined();
  });

  test("Given a genre outside the list, when parsed, then the catalogue message is reported", () => {
    const result = AssetFilterSchema.safeParse({ genre: "romance" });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      VALIDATION_MESSAGES.genreInvalid,
    ]);
  });

  test.each(["abc", "1965.5", "01965", "12345678901234567890"])(
    "Given the year %s, when parsed, then the catalogue message is reported",
    (publishedYear) => {
      const result = AssetFilterSchema.safeParse({ publishedYear });

      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        VALIDATION_MESSAGES.publishedYearFilterInvalid,
      ]);
    },
  );

  test("Given a repeated author, when parsed, then the repeated-filter message is reported", () => {
    const result = AssetFilterSchema.safeParse({ author: ["Frank Herbert", "Jane Austen"] });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      buildRepeatedFilterMessage("author"),
    ]);
  });

  test("Given a non-text author that is not repeated, when parsed, then it is not reported as repeated", () => {
    const result = AssetFilterSchema.safeParse({ author: 5 });

    expect(result.error?.issues.map((issue) => issue.message)).not.toContain(
      buildRepeatedFilterMessage("author"),
    );
  });

  test("Given an unrecognised filter name, when its message is built, then it names the filter", () => {
    expect(buildUnrecognisedFilterMessage("authr")).toBe('"authr" is not a recognised filter');
  });
});

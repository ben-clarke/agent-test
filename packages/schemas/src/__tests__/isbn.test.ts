import { describe, expect, test } from "vitest";
import { buildCreateAssetSchema } from "../index.ts";

const schema = buildCreateAssetSchema({ currentYear: 2026 });
const INVALID_ISBN_MESSAGE = "Enter a valid 10- or 13-digit ISBN — check for typos";
const REQUIRED_ISBN_MESSAGE = "Enter an ISBN";

describe("ISBN validation", () => {
  const isbnMessages = (isbn: unknown): readonly string[] =>
    schema
      .safeParse(buildInput(isbn))
      .error?.issues.filter((issue) => issue.path[0] === "isbn")
      .map((issue) => issue.message) ?? [];

  test.each([
    ["978-0-306-40615-8", "a wrong ISBN-13 check digit"],
    ["0-306-40615-3", "a wrong ISBN-10 check digit"],
    ["12345", "too few digits"],
    ["97803064061AB", "letters in an ISBN-13"],
    ["X306406152", "an X that is not the check digit"],
    ["978030640615X", "an X in an ISBN-13"],
  ])("Given %s (%s), when parsed, then the invalid-ISBN message is given", (isbn) => {
    expect(isbnMessages(isbn)).toEqual([INVALID_ISBN_MESSAGE]);
  });

  test.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "   "],
    ["empty", ""],
    ["a number", 9780306406157],
  ])(
    "Given an ISBN that is %s, when parsed, then the required message is given",
    (_label, isbn) => {
      expect(isbnMessages(isbn)).toEqual([REQUIRED_ISBN_MESSAGE]);
    },
  );

  test.each([
    ["978-0-306-40615-7", "a valid ISBN-13"],
    ["0-306-40615-2", "a valid ISBN-10"],
    ["0-8044-2957-X", "a valid ISBN-10 ending in X"],
    ["0-8044-2957-x", "a valid ISBN-10 ending in lowercase x"],
  ])("Given %s (%s), when parsed, then it is accepted", (isbn) => {
    expect(isbnMessages(isbn)).toEqual([]);
  });
});

function buildInput(isbn: unknown): Record<string, unknown> {
  const base = { title: "Dune", author: "Frank Herbert", publishedYear: 1965 };
  return isbn === undefined ? base : { ...base, isbn };
}

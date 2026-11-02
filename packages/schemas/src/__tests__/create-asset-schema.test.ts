import { describe, expect, test } from "vitest";
import { buildCreateAssetSchema, buildUnrecognisedFieldMessage } from "../index.ts";

const CURRENT_YEAR = 2026;
const schema = buildCreateAssetSchema({ currentYear: CURRENT_YEAR });

describe("buildCreateAssetSchema", () => {
  test("Given a valid book, when parsed, then every field is returned with the canonical ISBN-13", () => {
    const result = schema.safeParse(buildInput());

    expect(result.data).toEqual({
      title: "Dune",
      author: "Frank Herbert",
      isbn: "9780306406157",
      publishedYear: 1965,
      genre: "science-fiction",
    });
  });

  test("Given no genre, when parsed, then it is accepted and genre is absent", () => {
    const { genre: _genre, ...withoutGenre } = buildInput();

    const result = schema.safeParse(withoutGenre);

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("genre");
  });

  test.each(["romance", "Fiction"])(
    "Given genre %s outside the list, when parsed, then it asks to choose from the list",
    (genre) => {
      const result = schema.safeParse(buildInput({ genre }));

      expect(result.error?.issues).toEqual([
        expect.objectContaining({ path: ["genre"], message: "Choose a genre from the list" }),
      ]);
    },
  );

  test("Given an unknown field, when parsed, then it is rejected naming that key", () => {
    const result = schema.safeParse(buildInput({ copies: 3 }));

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["copies"] }),
    ]);
  });

  test("Given a field name, when the unrecognised-field message is built, then it quotes the name", () => {
    expect(buildUnrecognisedFieldMessage("copies")).toBe('"copies" is not a recognised field');
  });

  test.each([
    ["978-0-306-40615-7", "9780306406157"],
    ["978 0 306 40615 7", "9780306406157"],
    ["0 306 40615 2", "9780306406157"],
    ["0-8044-2957-X", "9780804429573"],
    ["0-8044-2957-x", "9780804429573"],
  ])("Given ISBN %s, when parsed, then it is stored as %s", (entered, stored) => {
    const result = schema.safeParse(buildInput({ isbn: entered }));

    expect(result.data?.isbn).toBe(stored);
  });

  test("Given surrounding whitespace on title and author, when parsed, then it is trimmed", () => {
    const result = schema.safeParse(buildInput({ title: "  Dune  ", author: " Frank Herbert " }));

    expect(result.data).toMatchObject({ title: "Dune", author: "Frank Herbert" });
  });

  describe.each([
    { field: "title", required: "Enter a title", tooLong: "Title must be 200 characters or fewer" },
    {
      field: "author",
      required: "Enter an author",
      tooLong: "Author must be 200 characters or fewer",
    },
  ])("$field length", ({ field, required, tooLong }) => {
    const messagesFor = (value: unknown): readonly string[] =>
      schema
        .safeParse(buildInput({ [field]: value }))
        .error?.issues.filter((issue) => issue.path[0] === field)
        .map((issue) => issue.message) ?? [];

    test.each([
      ["empty", ""],
      ["only spaces", "   "],
      ["a number", 42],
      ["null", null],
    ])("Given a %s %s, when parsed, then one required message is given", (_label, value) => {
      expect(messagesFor(value)).toEqual([required]);
    });

    test("Given the field is missing, when parsed, then the required message is given", () => {
      const { [field]: _omitted, ...withoutField } = buildInput();

      const result = schema.safeParse(withoutField);

      expect(result.error?.issues.map((issue) => issue.message)).toEqual([required]);
    });

    test("Given 1 character, when parsed, then it is accepted", () => {
      expect(messagesFor("a")).toEqual([]);
    });

    test("Given 200 characters, when parsed, then it is accepted", () => {
      expect(messagesFor("a".repeat(200))).toEqual([]);
    });

    test("Given 200 characters with a space either side, when parsed, then it is accepted", () => {
      expect(messagesFor(` ${"a".repeat(200)} `)).toEqual([]);
    });

    test("Given 201 characters, when parsed, then the too-long message is given", () => {
      expect(messagesFor("a".repeat(201))).toEqual([tooLong]);
    });
  });
  describe("publishedYear", () => {
    const yearMessages = (value: unknown, currentYear = CURRENT_YEAR): readonly string[] =>
      buildCreateAssetSchema({ currentYear })
        .safeParse(buildInput({ publishedYear: value }))
        .error?.issues.map((issue) => issue.message) ?? [];

    test.each([
      ["1449", 1449],
      ["one above the current year", CURRENT_YEAR + 1],
      ["a fraction", 1999.5],
      ["text", "1999"],
      ["null", null],
    ])("Given %s, when parsed, then the range message names the current year", (_label, value) => {
      expect(yearMessages(value)).toEqual([
        `Year must be a whole number from 1450 to ${CURRENT_YEAR}`,
      ]);
    });

    test("Given another current year, when 2027 is parsed, then it is accepted and the message uses that year", () => {
      expect(yearMessages(2027, 2027)).toEqual([]);
      expect(yearMessages(2028, 2027)).toEqual(["Year must be a whole number from 1450 to 2027"]);
    });

    test("Given the year is missing, when parsed, then it asks for a year", () => {
      const { publishedYear: _omitted, ...withoutYear } = buildInput();

      const result = schema.safeParse(withoutYear);

      expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Enter a year"]);
    });

    test.each([1450, CURRENT_YEAR])(
      "Given the boundary year %s, when parsed, then it is accepted",
      (year) => {
        expect(yearMessages(year)).toEqual([]);
      },
    );
  });
});

function buildInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Dune",
    author: "Frank Herbert",
    isbn: "978-0-306-40615-7",
    publishedYear: 1965,
    genre: "science-fiction",
    ...overrides,
  };
}

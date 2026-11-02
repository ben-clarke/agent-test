import {
  AssetListResponseSchema,
  VALIDATION_MESSAGES,
  type CreateAssetInput,
} from "@library/schemas";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { buildTestApp, type TestApp } from "../test-support/build-test-app.ts";

describe("GET /assets filters", () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = buildTestApp();
    for (const book of BOOKS) {
      const response = await testApp.app.inject({
        method: "POST",
        url: "/assets",
        payload: buildCreateAssetRequest(book),
      });
      if (response.statusCode !== HTTP_CREATED) {
        throw new Error(`Seeding ${book.title} failed with ${response.statusCode}`);
      }
    }
  });

  afterEach(async () => {
    await testApp.app.close();
    await testApp.repository.close();
  });

  const listTitles = async (query: string): Promise<readonly string[]> => {
    const response = await testApp.app.inject({ method: "GET", url: `/assets${query}` });
    return AssetListResponseSchema.parse(response.json())
      .items.map((item) => item.title)
      .toSorted();
  };

  test("Given registered books, when listing with author in mixed letter case, then that author's books are returned", async () => {
    expect(await listTitles("?author=frank%20HERBERT")).toEqual(["Dune", "Dune Messiah"]);
  });

  test("Given registered books, when listing with part of an author name, then nothing is returned", async () => {
    expect(await listTitles("?author=Frank")).toEqual([]);
  });

  test("Given an accented author name, when listing with it in capitals, then the book is returned", async () => {
    expect(await listTitles(`?author=${encodeURIComponent("ÉMILE AJAR")}`)).toEqual(["L'Étranger"]);
  });

  test("Given registered books, when listing with title text in capitals, then titles containing it are returned", async () => {
    expect(await listTitles("?q=UNE")).toEqual(["Dune", "Dune Messiah"]);
  });

  test("Given a title containing a percent sign, when listing with q percent, then only that title is returned", async () => {
    expect(await listTitles("?q=%25")).toEqual(["100% Pure"]);
  });

  test("Given an injection string as q, when listing, then nothing is returned", async () => {
    expect(await listTitles(`?q=${encodeURIComponent("' OR 1=1 --")}`)).toEqual([]);
  });

  test("Given registered books, when listing with a blank author, then all books are returned", async () => {
    expect(await listTitles("?author=%20%20")).toHaveLength(BOOKS.length);
  });

  test("Given registered books, when listing with an exact year, then that year's book is returned", async () => {
    expect(await listTitles("?publishedYear=1965")).toEqual(["Dune"]);
  });

  test("Given a well-formed year with no books, when listing, then the list is empty", async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/assets?publishedYear=3000" });

    expect(response.statusCode).toBe(200);
    expect(AssetListResponseSchema.parse(response.json()).items).toEqual([]);
  });

  test("Given registered books, when listing with genre in mixed letter case, then that genre's books are returned", async () => {
    expect(await listTitles("?genre=Science-Fiction")).toEqual(["Dune", "Dune Messiah"]);
  });

  test("Given no poetry books, when listing with genre poetry, then the list is empty", async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/assets?genre=poetry" });

    expect(response.statusCode).toBe(200);
    expect(AssetListResponseSchema.parse(response.json())).toEqual({ items: [] });
  });

  test("Given a genre outside the list, when listing, then it is rejected with the genre message", async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/assets?genre=romance" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "ValidationError",
      details: [{ field: "genre", message: VALIDATION_MESSAGES.genreInvalid }],
    });
  });

  test("Given registered books, when listing with author and year, then only books matching both are returned", async () => {
    expect(await listTitles("?author=Frank%20Herbert&publishedYear=1969")).toEqual([
      "Dune Messiah",
    ]);
  });

  test.each(["Frank", "Herbert"])(
    "Given the misspelt filter authr=%s, when listing, then it is rejected and names the parameter",
    async (value) => {
      const response = await testApp.app.inject({ method: "GET", url: `/assets?authr=${value}` });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "ValidationError",
        details: [{ field: "authr", message: '"authr" is not a recognised filter' }],
      });
    },
  );

  test("Given a repeated author filter, when listing, then it is rejected", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/assets?author=Frank%20Herbert&author=Jane%20Austen",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "ValidationError",
      details: [{ field: "author", message: 'Give the "author" filter only once' }],
    });
  });

  test.each(["abc", "1965.5", "01965", "12345678901234567890"])(
    "Given the year %s, when listing, then it is rejected with the year message",
    async (year) => {
      const response = await testApp.app.inject({
        method: "GET",
        url: `/assets?publishedYear=${year}`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "ValidationError",
        details: [
          { field: "publishedYear", message: VALIDATION_MESSAGES.publishedYearFilterInvalid },
        ],
      });
    },
  );
});

const HTTP_CREATED = 201;

const BOOKS: readonly CreateAssetInput[] = [
  {
    title: "Dune",
    author: "Frank Herbert",
    publishedYear: 1965,
    genre: "science-fiction",
    isbn: "9780306406157",
  },
  {
    title: "Dune Messiah",
    author: "Frank Herbert",
    publishedYear: 1969,
    genre: "science-fiction",
    isbn: "9780140449136",
  },
  {
    title: "Emma",
    author: "Jane Austen",
    publishedYear: 1815,
    genre: undefined,
    isbn: "9780131103627",
  },
  {
    title: "Les Misérables",
    author: "Victor Hugo",
    publishedYear: 1862,
    genre: "fiction",
    isbn: "9780262033848",
  },
  {
    title: "L'Étranger",
    author: "Émile Ajar",
    publishedYear: 1942,
    genre: "fiction",
    isbn: "9780596517748",
  },
  {
    title: "100% Pure",
    author: "Ann Smith",
    publishedYear: 2001,
    genre: "other",
    isbn: "9780201633610",
  },
];

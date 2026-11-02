import { AssetListResponseSchema, DuplicateIsbnResponseSchema } from "@library/schemas";
import { afterEach, describe, expect, test } from "vitest";
import { openDatabase } from "../assets/open-database.ts";
import { createSqliteAssetRepository } from "../assets/sqlite-asset-repository.ts";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { buildTestApp, type TestApp } from "../test-support/build-test-app.ts";

describe("POST /assets duplicate ISBN", () => {
  let testApp: TestApp;

  afterEach(async () => {
    await testApp.app.close();
    await testApp.repository.close();
  });

  const register = (payload: object) =>
    testApp.app.inject({ method: "POST", url: "/assets", payload });

  const listItems = async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/assets" });
    return AssetListResponseSchema.parse(response.json()).items;
  };

  const expectedDuplicateBody = {
    error: "DuplicateIsbn",
    details: [{ field: "isbn", message: DUPLICATE_ISBN_MESSAGE }],
  };

  test.each([
    "9780306406157",
    "978-0-306-40615-7",
    "978 0 306 40615 7",
    "0-306-40615-2",
    "0306406152",
  ])(
    "Given ISBN 9780306406157 is registered, when a client registers ISBN %s, then it is rejected as a duplicate and one book is listed",
    async (isbn) => {
      testApp = buildTestApp();
      await register(buildCreateAssetRequest({ isbn: "9780306406157" }));

      const response = await register(buildCreateAssetRequest({ isbn }));

      expect(response.statusCode).toBe(409);
      expect(DuplicateIsbnResponseSchema.parse(response.json())).toEqual(expectedDuplicateBody);
      expect(await listItems()).toHaveLength(1);
    },
  );

  test("Given no books, when two registrations of the same ISBN are sent without waiting, then one is created and one is a duplicate", async () => {
    testApp = buildTestApp();

    const responses = await Promise.all([
      register(buildCreateAssetRequest({ isbn: "9780306406157" })),
      register(buildCreateAssetRequest({ isbn: "9780306406157" })),
    ]);

    expect(
      responses.map((response) => response.statusCode).toSorted((first, second) => first - second),
    ).toEqual([201, 409]);
    expect(await listItems()).toHaveLength(1);
  });

  test("Given Dune with one ISBN is registered, when a client registers Dune with a different ISBN, then it is created and two books are listed", async () => {
    testApp = buildTestApp();
    await register(buildCreateAssetRequest({ title: "Dune", isbn: "9780306406157" }));

    const response = await register(
      buildCreateAssetRequest({ title: "Dune", isbn: "0-8044-2957-X" }),
    );

    expect(response.statusCode).toBe(201);
    expect(await listItems()).toHaveLength(2);
  });

  test.each([
    { first: "0-306-40615-2", second: "978-0-306-40615-7", canonical: "9780306406157" },
    { first: "978-0-306-40615-7", second: "0-306-40615-2", canonical: "9780306406157" },
    { first: "0-8044-2957-x", second: "9780804429573", canonical: "9780804429573" },
  ])(
    "Given ISBN $first is registered, when a client registers $second, then it is a duplicate and the book is listed with ISBN $canonical",
    async ({ first, second, canonical }) => {
      testApp = buildTestApp();
      await register(buildCreateAssetRequest({ isbn: first }));

      const response = await register(buildCreateAssetRequest({ isbn: second }));

      expect(response.statusCode).toBe(409);
      expect((await listItems()).map((item) => item.isbn)).toEqual([canonical]);
    },
  );

  test("Given a duplicate is rejected, then one warning is logged without the submitted values", async () => {
    testApp = buildTestApp();
    await register(buildCreateAssetRequest());

    await register(buildCreateAssetRequest({ title: "Secret Title" }));

    const warnings = testApp.logCapture.readEntriesAtLevel("warn");
    expect(warnings).toEqual([expect.objectContaining({ field: "isbn" })]);
    expect(JSON.stringify(warnings)).not.toContain("Secret Title");
  });
});

describe("AssetRepository insert failures", () => {
  test("Given the database is closed, when a book is inserted, then the failure is not reported as a duplicate", async () => {
    const repository = createSqliteAssetRepository({
      database: openDatabase({ databasePath: ":memory:" }),
    });
    await repository.close();

    await expect(
      repository.insert({
        asset: {
          id: "0b6f6c34-5f0c-4f3e-9f5e-1f6f4f1f2a11",
          title: "Dune",
          author: "Frank Herbert",
          isbn: "9780306406157",
          publishedYear: 1965,
          genre: null,
          createdAt: "2026-01-15T10:00:00.000Z",
        },
      }),
    ).rejects.toThrow("database is not open");
  });
});

const DUPLICATE_ISBN_MESSAGE = "A book with this ISBN is already registered — find it in the list";

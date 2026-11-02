import { AssetListResponseSchema, ValidationErrorResponseSchema } from "@library/schemas";
import { afterEach, describe, expect, test } from "vitest";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { buildTestApp, type TestApp } from "../test-support/build-test-app.ts";

describe("POST /assets validation", () => {
  let testApp: TestApp;

  afterEach(async () => {
    await testApp.app.close();
    await testApp.repository.close();
  });

  const register = async (payload: object, now?: Date) => {
    testApp = buildTestApp({ now: now && (() => now) });
    return testApp.app.inject({ method: "POST", url: "/assets", payload });
  };

  const listItems = async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/assets" });
    return AssetListResponseSchema.parse(response.json()).items;
  };

  const withoutField = (field: string): object =>
    Object.fromEntries(Object.entries(buildCreateAssetRequest()).filter(([key]) => key !== field));

  test("Given no books, when a client registers a book without a title, then it is rejected with the catalogue message and nothing is stored", async () => {
    const response = await register(withoutField("title"));

    expect(response.statusCode).toBe(400);
    expect(ValidationErrorResponseSchema.parse(response.json())).toEqual({
      error: "ValidationError",
      details: [{ field: "title", message: "Enter a title" }],
    });
    expect(await listItems()).toEqual([]);
  });

  test("Given an author of 201 characters, when a client registers a book, then it is rejected with the too-long message", async () => {
    const response = await register(buildCreateAssetRequest({ author: "a".repeat(201) }));

    expect(response.statusCode).toBe(400);
    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "author", message: "Author must be 200 characters or fewer" },
    ]);
  });

  test("Given a wrong ISBN check digit, when a client registers a book, then it is rejected with the invalid-ISBN message", async () => {
    const response = await register(buildCreateAssetRequest({ isbn: "978-0-306-40615-8" }));

    expect(response.statusCode).toBe(400);
    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "isbn", message: INVALID_ISBN_MESSAGE },
    ]);
  });

  test("Given no ISBN, when a client registers a book, then it is rejected with the required-ISBN message", async () => {
    const response = await register(withoutField("isbn"));

    expect(response.statusCode).toBe(400);
    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "isbn", message: REQUIRED_ISBN_MESSAGE },
    ]);
  });

  test("Given the time is mid-2026, when a client registers year 2027, then it is rejected naming 2026 as the latest year", async () => {
    const response = await register(
      buildCreateAssetRequest({ publishedYear: 2027 }),
      new Date("2026-06-15T10:00:00Z"),
    );

    expect(response.statusCode).toBe(400);
    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "publishedYear", message: "Year must be a whole number from 1450 to 2026" },
    ]);
  });

  test("Given the time is 2027-01-01, when a client registers year 2027, then it is created", async () => {
    const response = await register(
      buildCreateAssetRequest({ publishedYear: 2027 }),
      new Date("2027-01-01T00:00:00Z"),
    );

    expect(response.statusCode).toBe(201);
  });

  test("Given no title and an invalid ISBN, when a client registers, then details list both fields", async () => {
    const response = await register({ ...withoutField("title"), isbn: "12345" });

    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "title", message: "Enter a title" },
      { field: "isbn", message: INVALID_ISBN_MESSAGE },
    ]);
  });

  test("Given a genre outside the list, when a client registers a book, then it is rejected", async () => {
    const response = await register({ ...buildCreateAssetRequest(), genre: "romance" });

    expect(response.statusCode).toBe(400);
    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "genre", message: "Choose a genre from the list" },
    ]);
  });

  test("Given an unknown field, when a client registers a book, then it is rejected naming the field", async () => {
    const response = await register({ ...buildCreateAssetRequest(), copies: 3 });

    expect(response.statusCode).toBe(400);
    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "copies", message: '"copies" is not a recognised field' },
    ]);
  });

  test("Given several unknown fields, when a client registers a book, then each is reported", async () => {
    const response = await register({ ...buildCreateAssetRequest(), copies: 3, shelf: "A" });

    expect(ValidationErrorResponseSchema.parse(response.json()).details).toEqual([
      { field: "copies", message: '"copies" is not a recognised field' },
      { field: "shelf", message: '"shelf" is not a recognised field' },
    ]);
  });

  test("Given an invalid title, when it is rejected, then one warning names the field and not the submitted value", async () => {
    const submittedValue = "x".repeat(201);

    await register(buildCreateAssetRequest({ title: submittedValue }));

    const warnings = testApp.logCapture.readEntriesAtLevel("warn");
    expect(warnings).toEqual([expect.objectContaining({ fields: ["title"] })]);
    expect(JSON.stringify(warnings)).not.toContain(submittedValue);
  });
});

const INVALID_ISBN_MESSAGE = "Enter a valid 10- or 13-digit ISBN — check for typos";
const REQUIRED_ISBN_MESSAGE = "Enter an ISBN";

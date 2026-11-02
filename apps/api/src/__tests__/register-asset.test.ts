import { AssetSchema } from "@library/schemas";
import { afterEach, describe, expect, test } from "vitest";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { buildTestApp, type TestApp } from "../test-support/build-test-app.ts";

const REGISTRATION_TIME = new Date("2026-06-15T10:00:00.000Z");

describe("POST /assets", () => {
  let testApp: TestApp;

  afterEach(async () => {
    await testApp.app.close();
    await testApp.repository.close();
  });

  const register = async (payload: object) => {
    testApp = buildTestApp({ now: () => REGISTRATION_TIME, generateId: () => GENERATED_ID });
    return testApp.app.inject({ method: "POST", url: "/assets", payload });
  };

  test("Given a valid book, when a client registers it, then the response is 201 with the stored book", async () => {
    const response = await register(buildCreateAssetRequest());

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: GENERATED_ID,
      title: "Dune",
      author: "Frank Herbert",
      isbn: "9780306406157",
      publishedYear: 1965,
      genre: "science-fiction",
      createdAt: "2026-06-15T10:00:00.000Z",
    });
    expect(AssetSchema.safeParse(response.json()).success).toBe(true);
  });

  test("Given a book without a genre, when a client registers it, then genre is null", async () => {
    const response = await register(buildCreateAssetRequest({ genre: undefined }));

    expect(response.statusCode).toBe(201);
    expect(response.json().genre).toBeNull();
  });

  test.each([
    ["978-0-306-40615-7", "9780306406157"],
    ["978 0 306 40615 7", "9780306406157"],
    ["0 306 40615 2", "9780306406157"],
    ["0-8044-2957-X", "9780804429573"],
    ["0-8044-2957-x", "9780804429573"],
  ])(
    "Given ISBN %s, when a client registers it, then ISBN %s is stored",
    async (entered, stored) => {
      const response = await register(buildCreateAssetRequest({ isbn: entered }));

      expect(response.statusCode).toBe(201);
      expect(response.json().isbn).toBe(stored);
    },
  );

  test("Given padded title and author, when a client registers the book, then they are trimmed", async () => {
    const response = await register(
      buildCreateAssetRequest({ title: "  Dune  ", author: " Frank Herbert " }),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ title: "Dune", author: "Frank Herbert" });
  });

  test("Given a registration, when it succeeds, then exactly one info line carries the new id and isbn", async () => {
    const response = await register(buildCreateAssetRequest());

    const infoEntries = testApp.logCapture
      .readEntriesAtLevel("info")
      .filter((entry) => isLogEntry(entry) && entry.msg === "Asset registered");
    expect(infoEntries).toEqual([
      expect.objectContaining({ id: response.json().id, isbn: "9780306406157" }),
    ]);
  });
});

const isLogEntry = (entry: unknown): entry is { readonly msg: string } =>
  typeof entry === "object" && entry !== null && "msg" in entry;

const GENERATED_ID = "11111111-1111-4111-8111-111111111111";

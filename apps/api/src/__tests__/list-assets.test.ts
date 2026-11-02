import { AssetListResponseSchema } from "@library/schemas";
import { afterEach, describe, expect, test } from "vitest";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { buildTestApp, type TestApp } from "../test-support/build-test-app.ts";

describe("GET /assets", () => {
  let testApp: TestApp;

  afterEach(async () => {
    await testApp.app.close();
    await testApp.repository.close();
  });

  test("Given no books are registered, when a client lists books, then the response is 200 with an empty items list", async () => {
    testApp = buildTestApp();

    const response = await testApp.app.inject({ method: "GET", url: "/assets" });

    expect(response.statusCode).toBe(200);
    expect(AssetListResponseSchema.parse(response.json())).toEqual({ items: [] });
  });

  const registerAndList = async (clockTimes: readonly Date[]): Promise<readonly string[]> => {
    const clock = { now: REGISTRATION_TIME };
    testApp = buildTestApp({ now: () => clock.now });
    const books = [
      { title: "Emma", isbn: "9780306406157" },
      { title: "Dune", isbn: "9780804429573" },
    ];

    for (const [index, book] of books.entries()) {
      clock.now = clockTimes[index] ?? REGISTRATION_TIME;
      const created = await testApp.app.inject({
        method: "POST",
        url: "/assets",
        payload: buildCreateAssetRequest(book),
      });
      expect(created.statusCode).toBe(201);
    }

    const response = await testApp.app.inject({ method: "GET", url: "/assets" });
    return AssetListResponseSchema.parse(response.json()).items.map((item) => item.title);
  };

  test("Given Emma registered before Dune, when a client lists books, then Dune is listed before Emma", async () => {
    const titles = await registerAndList([
      new Date("2026-06-15T10:00:00.000Z"),
      new Date("2026-06-15T10:05:00.000Z"),
    ]);

    expect(titles).toEqual(["Dune", "Emma"]);
  });

  test("Given two books registered at the same instant, when a client lists books, then the later registration is listed first", async () => {
    const titles = await registerAndList([REGISTRATION_TIME, REGISTRATION_TIME]);

    expect(titles).toEqual(["Dune", "Emma"]);
  });
});

const REGISTRATION_TIME = new Date("2026-06-15T10:00:00.000Z");

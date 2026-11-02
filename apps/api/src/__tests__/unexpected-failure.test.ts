import { InternalErrorResponseSchema } from "@library/schemas";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { buildTestApp, type TestApp } from "../test-support/build-test-app.ts";

describe("unexpected failures", () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = buildTestApp();
    await testApp.repository.close();
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  const readErrorEntries = (): readonly unknown[] => testApp.logCapture.readEntriesAtLevel("error");

  test("Given the book store is unavailable, when a client registers a valid book, then the response is a generic 500 and the failure is logged", async () => {
    const response = await testApp.app.inject({
      method: "POST",
      url: "/assets",
      payload: buildCreateAssetRequest(),
    });

    expect(response.statusCode).toBe(500);
    expect(InternalErrorResponseSchema.parse(response.json())).toEqual({ error: "InternalError" });
    expect(readErrorEntries()).toEqual([
      expect.objectContaining({
        err: expect.objectContaining({ message: CLOSED_DATABASE_MESSAGE }),
      }),
    ]);
  });

  test("Given the book store is unavailable, when a client lists books, then the response is a generic 500 and the failure is logged", async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/assets" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "InternalError" });
    expect(readErrorEntries()).toEqual([
      expect.objectContaining({
        err: expect.objectContaining({ message: CLOSED_DATABASE_MESSAGE }),
      }),
    ]);
  });
});

const CLOSED_DATABASE_MESSAGE = "database is not open";

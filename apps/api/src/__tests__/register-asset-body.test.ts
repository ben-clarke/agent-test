import { AssetListResponseSchema } from "@library/schemas";
import { afterEach, describe, expect, test } from "vitest";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { buildTestApp, type TestApp } from "../test-support/build-test-app.ts";

describe("POST /assets request body", () => {
  let testApp: TestApp;

  afterEach(async () => {
    await testApp.app.close();
    await testApp.repository.close();
  });

  const send = async ({ payload, contentType }: SendOptions) => {
    testApp = buildTestApp();
    return testApp.app.inject({
      method: "POST",
      url: "/assets",
      headers: contentType === undefined ? {} : { "content-type": contentType },
      payload,
    });
  };

  const listItems = async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/assets" });
    return AssetListResponseSchema.parse(response.json()).items;
  };

  const readWarnings = (): readonly unknown[] => testApp.logCapture.readEntriesAtLevel("warn");

  test.each([
    ["malformed JSON", '{"title":'],
    ["an empty body", ""],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"x"'],
  ])(
    "Given %s as application/json, when a client registers, then it is rejected naming the body and nothing is stored",
    async (_label, payload) => {
      const response = await send({ payload, contentType: JSON_CONTENT_TYPE });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "ValidationError",
        details: [{ field: "body", message: "Send the book details as a JSON object" }],
      });
      expect(await listItems()).toEqual([]);
    },
  );

  test("Given a JSON content type with a charset, when a client registers a valid book, then it is created", async () => {
    const response = await send({
      payload: JSON.stringify(buildCreateAssetRequest()),
      contentType: "application/json; charset=utf-8",
    });

    expect(response.statusCode).toBe(201);
  });

  test.each([
    ["text/plain"],
    ["application/x-www-form-urlencoded"],
    ["multipart/form-data; boundary=x"],
    [undefined],
  ])(
    "Given content type %s, when a client registers, then it is refused with 415 and nothing is stored",
    async (contentType) => {
      const response = await send({
        payload: Buffer.from(JSON.stringify(buildCreateAssetRequest())),
        contentType,
      });

      expect(response.statusCode).toBe(415);
      expect(response.body).toBe('{"error":"UnsupportedMediaType"}');
      expect(await listItems()).toEqual([]);
    },
  );

  test("Given another origin, when it sends a preflight and a registration, then no response grants cross-origin access", async () => {
    testApp = buildTestApp();
    const headers = { origin: "https://other.example" };

    const preflight = await testApp.app.inject({ method: "OPTIONS", url: "/assets", headers });
    const registration = await testApp.app.inject({
      method: "POST",
      url: "/assets",
      headers: { ...headers, "content-type": JSON_CONTENT_TYPE },
      payload: JSON.stringify(buildCreateAssetRequest()),
    });

    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    expect(registration.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("Given a JSON body larger than 1 MiB, when a client registers, then it is refused with 413 and logged", async () => {
    const response = await send({
      payload: JSON.stringify({ title: "a".repeat(ONE_MEBIBYTE) }),
      contentType: JSON_CONTENT_TYPE,
    });

    expect(response.statusCode).toBe(413);
    expect(response.body).toBe('{"error":"RequestRejected"}');
    expect(readWarnings()).toEqual([
      expect.objectContaining({ msg: "Request rejected", statusCode: 413 }),
    ]);
  });
});

type SendOptions = {
  readonly payload: string | Buffer;
  readonly contentType?: string | undefined;
};

const JSON_CONTENT_TYPE = "application/json";
const ONE_MEBIBYTE = 1024 * 1024;

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssetListResponseSchema } from "@library/schemas";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startServer, type RunningServer } from "../start-server.ts";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { createLogCapture } from "../test-support/log-capture.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let workDirectory: string;

beforeAll(() => {
  workDirectory = mkdtempSync(join(tmpdir(), "library-persistence-"));
});

afterAll(() => {
  rmSync(workDirectory, { recursive: true, force: true });
});

test("Given Dune was registered, when the service is stopped and started again with the same data file, then listing books returns Dune", async () => {
  const databasePath = join(workDirectory, "library.db");

  const firstRun = await startServerOn({ databasePath });
  await fetch(`${firstRun.baseUrl}/assets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildCreateAssetRequest({ title: "Dune" })),
  });
  await firstRun.server.stop();

  const secondRun = await startServerOn({ databasePath });
  const response = await fetch(`${secondRun.baseUrl}/assets`);
  const { items } = AssetListResponseSchema.parse(await response.json());
  await secondRun.server.stop();

  expect(items.map((item) => item.title)).toEqual(["Dune"]);
  expect(items[0]?.id).toMatch(UUID_PATTERN);
});

const startServerOn = async ({
  databasePath,
}: {
  readonly databasePath: string;
}): Promise<{ readonly server: RunningServer; readonly baseUrl: string }> => {
  const server = await startServer({
    config: { host: "localhost", port: 0, databasePath },
    now: () => new Date(),
    loggerInstance: createLogCapture().loggerInstance,
  });
  const [address] = server.addresses;
  const host = address?.family === "IPv6" ? `[${address.address}]` : address?.address;
  return { server, baseUrl: `http://${host}:${address?.port}` };
};

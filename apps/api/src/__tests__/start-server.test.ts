import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssetListResponseSchema } from "@library/schemas";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { startServer, type RunningServer } from "../start-server.ts";
import { buildCreateAssetRequest } from "../test-support/asset-factories.ts";
import { createLogCapture } from "../test-support/log-capture.ts";

describe("startServer", () => {
  let workDirectory: string;
  let dataFolder: string;
  let databasePath: string;
  let server: RunningServer;
  let baseUrl: string;

  const start = (port: number): Promise<RunningServer> =>
    startServer({
      config: { host: "localhost", port, databasePath },
      now: () => new Date(),
      loggerInstance: createLogCapture().loggerInstance,
    });

  beforeEach(async () => {
    workDirectory = mkdtempSync(join(tmpdir(), "library-start-server-"));
    dataFolder = join(workDirectory, "not-yet-created");
    databasePath = join(dataFolder, "library.db");
    server = await start(0);
    baseUrl = buildBaseUrl(server);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.stop();
    rmSync(workDirectory, { recursive: true, force: true });
  });

  test("Given the data folder does not exist, when the service starts, then the folder is created and listing returns no books", async () => {
    const response = await fetch(`${baseUrl}/assets`);

    expect(existsSync(dataFolder)).toBe(true);
    expect(AssetListResponseSchema.parse(await response.json())).toEqual({ items: [] });
  });

  test("Given the service is started, when its addresses are inspected, then every one is a loopback address", () => {
    const addresses = server.addresses.map((address) => address.address);

    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.every((address) => LOOPBACK_ADDRESSES.includes(address))).toBe(true);
  });

  test("Given the service is running, when it is stopped, then requests are refused", async () => {
    await server.stop();

    await expect(fetch(`${baseUrl}/assets`)).rejects.toBeInstanceOf(TypeError);
  });

  test("Given a book was registered, when the service is stopped and started again on the same data file, then the book is still listed", async () => {
    await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildCreateAssetRequest()),
    });

    await server.stop();
    server = await start(0);

    const response = await fetch(`${buildBaseUrl(server)}/assets`);
    const { items } = AssetListResponseSchema.parse(await response.json());
    expect(items.map((item) => item.title)).toEqual(["Dune"]);
  });

  test("Given a stop is already under way, when stop is requested again, then both stops complete without error", async () => {
    await expect(Promise.all([server.stop(), server.stop()])).resolves.toBeDefined();
  });

  test("Given the service is running, when it is stopped, then the database handle is released", async () => {
    // Handle release is not observable with a rollback journal.
    const closeDatabase = vi.spyOn(DatabaseSync.prototype, "close");

    await server.stop();

    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  test("Given the port is already in use, when the service starts, then it releases its database handle", async () => {
    // Handle release is not observable with a rollback journal.
    const closeDatabase = vi.spyOn(DatabaseSync.prototype, "close");
    const [occupied] = server.addresses;

    await expect(start(occupied?.port ?? 0)).rejects.toMatchObject({ code: "EADDRINUSE" });

    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  test("Given the port is already in use, when the service starts, then it fails with EADDRINUSE", async () => {
    const [occupied] = server.addresses;

    await expect(start(occupied?.port ?? 0)).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});

const buildBaseUrl = (server: RunningServer): string => {
  const [address] = server.addresses;
  const host = address?.family === "IPv6" ? `[${address.address}]` : address?.address;
  return `http://${host}:${address?.port}`;
};

const LOOPBACK_ADDRESSES: readonly string[] = ["127.0.0.1", "::1"];

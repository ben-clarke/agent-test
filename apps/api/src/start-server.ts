import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { FastifyBaseLogger } from "fastify";
import { buildApp } from "./app.ts";
import { openDatabase } from "./assets/open-database.ts";
import { createSqliteAssetRepository } from "./assets/sqlite-asset-repository.ts";
import type { Config } from "./config.ts";

export const startServer = async ({
  config,
  now,
  loggerInstance,
}: StartServerOptions): Promise<RunningServer> => {
  const repository = createSqliteAssetRepository({
    database: openDatabase({ databasePath: config.databasePath }),
  });
  const app = buildApp({ repository, now, generateId: randomUUID, loggerInstance });
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    await repository.close();
    throw error;
  }
  const shutDown = async (): Promise<void> => {
    await app.close();
    await repository.close();
  };
  let stopping: Promise<void> | undefined;
  return {
    addresses: app.addresses(),
    // A repeated signal must not close the database twice.
    stop: (): Promise<void> => (stopping ??= shutDown()),
  };
};

export type StartServerOptions = {
  readonly config: Config;
  readonly now: () => Date;
  readonly loggerInstance: FastifyBaseLogger;
};

export type RunningServer = {
  readonly addresses: readonly (AddressInfo & { family: string })[];
  readonly stop: () => Promise<void>;
};

import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.ts";
import type { AssetRepository } from "../assets/asset-repository.ts";
import { openDatabase } from "../assets/open-database.ts";
import { createSqliteAssetRepository } from "../assets/sqlite-asset-repository.ts";
import { createLogCapture, type LogCapture } from "./log-capture.ts";

export const buildTestApp = ({
  now = () => FIXED_NOW,
  generateId = buildSequentialIdGenerator(),
}: BuildTestAppOptions = {}): TestApp => {
  const repository = createSqliteAssetRepository({
    database: openDatabase({ databasePath: IN_MEMORY_DATABASE }),
  });
  const logCapture = createLogCapture();
  const app = buildApp({
    repository,
    now,
    generateId,
    loggerInstance: logCapture.loggerInstance,
  });
  return { app, repository, logCapture };
};

const buildSequentialIdGenerator = (): (() => string) => {
  const counter = { value: 0 };
  return (): string => {
    counter.value += 1;
    return `00000000-0000-4000-8000-${String(counter.value).padStart(12, "0")}`;
  };
};

export type BuildTestAppOptions = {
  readonly now?: () => Date;
  readonly generateId?: () => string;
};

export type TestApp = {
  readonly app: FastifyInstance;
  readonly repository: AssetRepository;
  readonly logCapture: LogCapture;
};

const IN_MEMORY_DATABASE = ":memory:";
const FIXED_NOW = new Date("2026-01-15T10:00:00.000Z");

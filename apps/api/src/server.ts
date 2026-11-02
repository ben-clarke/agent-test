import { pino } from "pino";
import { resolveConfig } from "./config.ts";
import { startServer } from "./start-server.ts";

const loggerInstance = pino();
const server = await startServer({
  config: resolveConfig({ env: process.env }),
  now: () => new Date(),
  loggerInstance,
});

const stopAndExit = (): void => {
  server.stop().then(
    () => process.exit(0),
    (error: unknown) => {
      loggerInstance.error({ err: error }, "Shutdown failed");
      process.exit(1);
    },
  );
};

process.on("SIGINT", stopAndExit);
process.on("SIGTERM", stopAndExit);

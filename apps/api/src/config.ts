import { fileURLToPath } from "node:url";
import { z } from "zod";

export const resolveConfig = ({ env }: ResolveConfigOptions): Config => {
  const parsed = EnvSchema.parse(env);
  return { host: LOCAL_HOST, port: parsed.PORT, databasePath: parsed.DATABASE_PATH };
};

export type Config = {
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
};

export type ResolveConfigOptions = {
  readonly env: Readonly<Record<string, string | undefined>>;
};

const LOCAL_HOST = "localhost";
const DEFAULT_PORT = 3000;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const PORT_RANGE_MESSAGE = `PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}`;
const DEFAULT_DATABASE_PATH = fileURLToPath(new URL("../data/library.db", import.meta.url));

const EnvSchema = z.object({
  PORT: z.coerce
    .number({ error: PORT_RANGE_MESSAGE })
    .int({ error: PORT_RANGE_MESSAGE })
    .min(MIN_PORT, { error: PORT_RANGE_MESSAGE })
    .max(MAX_PORT, { error: PORT_RANGE_MESSAGE })
    .default(DEFAULT_PORT),
  DATABASE_PATH: z.string().min(1).default(DEFAULT_DATABASE_PATH),
});

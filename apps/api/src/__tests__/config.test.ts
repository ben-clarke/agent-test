import { isAbsolute, join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveConfig } from "../config.ts";

describe("resolveConfig", () => {
  test("Given nothing is configured, when resolved, then port 3000 and the package data file apply on localhost", () => {
    const config = resolveConfig({ env: {} });

    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.host).toBe("localhost");
    expect(isAbsolute(config.databasePath)).toBe(true);
    expect(config.databasePath.endsWith(join("apps", "api", "data", "library.db"))).toBe(true);
  });

  test("Given DATABASE_PATH and PORT are set, when resolved, then they override the defaults", () => {
    const config = resolveConfig({ env: { DATABASE_PATH: "/tmp/books-test.db", PORT: "3100" } });

    expect(config).toEqual({ host: "localhost", port: 3100, databasePath: "/tmp/books-test.db" });
  });

  test.each(["abc", "0", "70000", "1.5", ""])(
    "Given PORT is %j, when resolved, then resolution fails with a message naming PORT",
    (port) => {
      expect(() => resolveConfig({ env: { PORT: port } })).toThrow(/PORT/);
    },
  );
});

const DEFAULT_PORT = 3000;

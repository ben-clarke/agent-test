import * as axeMatchers from "vitest-axe/matchers";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { server } from "./test-support/msw-server.ts";

expect.extend(axeMatchers);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  // vitest-axe 0.1.0 only augments the pre-1.0 `Vi` namespace.
  interface Assertion<T> extends AxeMatchers {
    readonly __axeMatchers?: T;
  }
}

---
name: run-playwright-tests
description: Run scoped Playwright tests for one of the UI apps (ui-dashboard), starting the app (and checking its infra) first via start-app. Use when asked to run/execute Playwright tests or specs locally, especially after adding or changing a spec.
---

# Run Playwright Tests

Runs scoped Playwright specs for one app, ensuring the app (and its infra) is actually running first. Use this instead of invoking `play:test` directly — agents frequently get muddled running Playwright against a dev server that isn't up.

## Inputs

Accept `app` (one of: `ui-dashboard`) and a test scope: a spec path, a directory of specs, and/or a `--grep "<scenario>"` pattern.

Ask which app and which scope when either can't be inferred from the request or surrounding context (e.g. the spec file just changed).

## Workflow

1. Use the `start-app` skill for the target app. If it reports required infra is down, stop and wait as it instructs — do not start infra or the app yourself outside that skill.

2. Confirm the local URL `start-app` reports matches what the target app's Playwright config expects (e.g. `playwright.config.ts` `baseURL` / `PORT` env var) before running tests. If they don't line up, stop and report the mismatch rather than running tests against the wrong target.

3. Follow the "Running Playwright" section of `docs/guidelines/PLAYWRIGHT_TESTING_GUIDELINES.md` to run only scoped tests:
   - `cd src/js/apps/<app> && pnpm play:test playwright/e2e/<feature>/<spec>.spec.ts`
   - Add `--grep "<scenario>"` to narrow to a specific scenario when given one.
   - Do not run a full-suite Playwright run (bare `play:test` with no path) unless explicitly requested.

## Output

Report:
- Which app was used and whether it was already running or started by `start-app`.
- The exact scoped command run.
- Pass/fail result, including the count of passed/failed/skipped tests.
- On failure, the actual Playwright error output (assertion diff, timeout, etc.) rather than a summary guess.

## Failure Handling

- If `start-app` reports infra or the app can't be started, report exactly what it returned — do not attempt to route around it.
- If a spec fails due to a stale locator or changed UI, report the failure as-is; do not edit the spec to make it pass unless asked.
- If the requested scope doesn't resolve to any spec file, say so rather than silently falling back to a full-suite run.

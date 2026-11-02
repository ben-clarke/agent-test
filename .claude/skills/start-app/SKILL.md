---
name: start-app
description: Start one of the UI apps (ui-dashboard) locally for interactive use, after checking that required local infra (redis, keycloak) is already running. Use when asked to start/run/launch one of these apps locally, or as a prerequisite step for other skills that need a running app (e.g. verify-ui-journey).
---

# Start App

Starts one UI app's `pnpm dev` locally. Does not start or manage the shared infra services (redis, keycloak) — those must already be running.

## Inputs

Accept `app`, one of: `ui-dashboard`.

Ask which app when it cannot be inferred from the request or surrounding context (e.g. the files just changed).

## Workflow

1. Check the two shared infra services are actually ready:
   - Redis: a local TCP listener on `6379` is sufficient.
   - Keycloak: a local TCP listener on `8080` is sufficient.

   ```bash
   is_port_listening() {
     lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
   }

   is_port_listening 6379 && echo "redis: up" || echo "redis: DOWN"
   is_port_listening 8080 && echo "keycloak: up" || echo "keycloak: DOWN"
   ```

   Do not use `nc -z localhost` for the Redis port check. On macOS, `localhost` may
   resolve to IPv4 while a Docker-published service listens only through an
   IPv6 Docker proxy, producing a false "DOWN" result. `lsof` detects either
   address family.

2. If either is down, **stop here**. Do not start them yourself. Report which service(s) are down and how to start them, then wait for the user:
   - Redis: `cd src/js/apps/local-redis && pnpm dev`
   - Keycloak: `cd src/js/apps/local-keycloak && pnpm dev`

3. Determine the app's dev port before checking or starting anything — it is worktree-specific, not fixed:
   - If `src/js/apps/<app>/.env.worktree` exists (linked worktree), read its `PORT` value — that is the effective port for this checkout.
   - Otherwise (main checkout), use the Makefile default: `ui-dashboard` 3000.

   If that port is already listening, treat the app as already running — do not start a second instance.

4. Otherwise, start it in the background from the app's root:

   ```bash
   cd src/js/apps/<app> && pnpm dev
   ```

   Run this as a background command — it's a long-running dev server, not a one-shot command.

5. Wait for the dev server to report ready and confirm the actual URL from its output (e.g. the `react-router dev` "Local:" line) as a sanity check against the port determined in step 3.

## Output

Report:
- Which app was started (or was already running).
- The confirmed local URL.
- Which infra services were checked and their status.

## Failure Handling

- If an infra service is down, do not proceed to start the app — report and wait, per step 2.
- If the dev server fails to start (e.g. crashes on boot), surface the actual error output rather than retrying silently.

# agent-test

Library book tracking: staff register books and find them again. A React web app (`apps/web`) talks to a Node API (`apps/api`) backed by SQLite, with shared schemas in `packages/schemas`.

## Prerequisites

Node 24 LTS. The exact major version is in `.nvmrc`. Check yours:

```sh
node --version
```

The output must start with `v24`. With nvm, run `nvm install` then `nvm use` in the repository root.

## Corepack and pnpm

pnpm is pinned in the `packageManager` field of `package.json` and provided through Corepack:

```sh
npm install --global corepack
corepack enable
pnpm --version
```

`pnpm --version` must print the version after `pnpm@` in `packageManager`.

## Install and run

```sh
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000

The browser calls the API through the Vite dev-server proxy, so open the web URL only; there is no need to visit the API directly.

## Data

Books are stored in a SQLite file at `apps/api/data/library.db`, created on first start. They survive restarts.

To reset to an empty library, stop `pnpm dev` and delete the file:

```sh
rm apps/api/data/library.db
```

To store the data elsewhere, set `DATABASE_PATH`:

```sh
DATABASE_PATH=/tmp/library.db pnpm dev
```

## Tests and checks

```sh
pnpm test run        # tests
pnpm lint            # lint
pnpm format:check    # formatting check
pnpm format          # fix formatting
pnpm typecheck       # type check
```

### Playwright (end-to-end)

One browser journey registers a book and finds it again. Install Chromium once, then run:

```sh
pnpm --filter @library/web exec playwright install chromium
pnpm test:e2e
```

Playwright starts its own API and web server on ports 3100 and 5174 with its own data file under `apps/web/e2e/.data/`, so it does not touch a running `pnpm dev` or its data. Stop anything else using those two ports first. It runs locally only, not in CI.

## Continuous integration

CI runs on every pull request and on every push to `main`. It checks that Node and pnpm match `.nvmrc` and `packageManager`, installs with a frozen lockfile, then runs format check, lint, typecheck and tests with 100% coverage. It does not run Playwright (see Playwright above).

Run the same four checks locally with `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test run`.

## Troubleshooting

- **Wrong Node version**: `pnpm install` exits 1 with `Error: ERR_PNPM_UNSUPPORTED_ENGINE` and `Unsupported engine for <repo>: wanted: {"node":">=24 <25"} (current: {"node":"22.23.4"})` (your version will differ) because `engineStrict` is on in `pnpm-workspace.yaml`. Run `nvm use` (or install Node 24) and retry.
- **`pnpm` not found**: run `corepack enable` (see Corepack and pnpm above), then open a new shell.
- **Port 3000 or 5173 already in use**: find the process with `lsof -i :3000` or `lsof -i :5173`, then stop it. The same applies to 3100 and 5174 for `pnpm test:e2e`.
- **esbuild build script not run**: `pnpm-workspace.yaml` deliberately denies esbuild's build script (`allowBuilds: esbuild: false`). Everything works without it, so do not run `pnpm approve-builds`.

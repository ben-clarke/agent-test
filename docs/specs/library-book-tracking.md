# Spec: Library Book Tracking

**Format:** spec-version 1

## Intent Description

Library staff need a small service to register the books a library holds and to find them again. A book is registered once per edition, identified by its ISBN. Staff register a book through a web page and see the list of registered books on the same page, narrowed by author, title text, publication year, or genre.

The service runs locally: a Node REST API persists books to a local SQLite file so they survive an API restart, and a React page calls the API. A newcomer can set up the toolchain, start both apps, and open the page by following `README.md` alone. The brief is deliberately short, so every decision it leaves open is recorded in the Ambiguity Log below and carried into the decision log in `instructions.md`.

## Architecture Specification

### Components

| Component | Path | Technology | Responsibility |
|---|---|---|---|
| Shared schemas | `packages/schemas` | TypeScript, Zod | `CreateAssetSchema`, `AssetSchema`, `AssetFilterSchema`, `GenreSchema`, ISBN normalisation and checksum. Single source of truth for API, web, and tests. |
| API | `apps/api` | Node 24 LTS, Fastify, Zod, `node:sqlite` | `POST /assets`, `GET /assets`. Validation, persistence, error mapping, logging. Port 3000. |
| Web | `apps/web` | Vite, React, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`) | One page: registration form and filterable list. Port 5173. |

### Tooling

- pnpm workspaces; root `pnpm dev` starts API and web together; root `pnpm test run`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`.
- Linting with Oxlint and formatting with oxfmt, configured once at the root. No ESLint or Prettier.
- CI: GitHub Actions workflow `.github/workflows/ci.yml` runs on pull requests and pushes to `main`. It installs with the pinned Node and pnpm versions, then runs format check, lint, typecheck, and tests with coverage.
- TypeScript strict mode with the flags in `CLAUDE.md`.
- Vitest across all packages. API tests use Fastify `inject` against an in-memory SQLite database. Web tests use React Testing Library with MSW.
- One Playwright spec for the register-then-find journey, run against both apps.
- Node version pinned in `.nvmrc` and `engines` because `node:sqlite` needs Node 22.5 or later.
- pnpm version pinned in the root `package.json` `packageManager` field, so Corepack installs the exact version.
- Root `README.md` is the single source of local-run instructions: prerequisites, Corepack and pnpm installation, install, `pnpm dev`, the browser URL, tests, and common failures.

### Interfaces

`POST /assets`

- Request: `Content-Type: application/json`, body `{ title, author, isbn, publishedYear, genre? }`.
- `201` with the created asset: `{ id, title, author, isbn, publishedYear, genre, createdAt }`. `id` is a server-generated UUID; `createdAt` is an ISO-8601 UTC timestamp; `genre` is `null` when omitted; `isbn` is returned as its canonical ISBN-13 (digits only); an ISBN-10 is converted with the `978` prefix and a recalculated check digit.
- `400` `{ error: "ValidationError", details: [{ field, message }] }` for invalid JSON or schema failure.
- `409` `{ error: "DuplicateIsbn", details: [{ field: "isbn", message }] }` when the normalised ISBN already exists.
- `415` for a non-JSON content type.
- `500` `{ error: "InternalError" }` for unexpected failures; no internal detail leaks.

`GET /assets`

- Query parameters, all optional and combined with AND: `author` (case-insensitive exact match), `q` (case-insensitive substring of title), `publishedYear` (exact integer match), `genre` (case-insensitive match against the enum).
- `200` `{ items: Asset[] }` sorted by `createdAt` descending. No matches returns `{ items: [] }`.
- `400` `ValidationError` for invalid filter values, for example `publishedYear=abc` or an unknown genre, and for unknown query parameters, for example `?authr=`.

Web calls relative `/assets`; the Vite dev server proxies `/assets` to `http://localhost:3000`, so the API needs no CORS configuration.

### Validation rules

| Field | Rule |
|---|---|
| `title` | Required string, trimmed, 1–200 characters |
| `author` | Required string, trimmed, 1–200 characters |
| `isbn` | Required string. Hyphens and spaces stripped, then a valid ISBN-10 or ISBN-13 checksum. Stored as canonical ISBN-13. Unique, so an ISBN-10 and its ISBN-13 equivalent are the same book. |
| `publishedYear` | Required integer, 1450 to the current year inclusive |
| `genre` | Optional. One of `GenreSchema` values |
| any other field | Rejected (strict schema) |

`GenreSchema` values: `fiction`, `non-fiction`, `science-fiction`, `fantasy`, `mystery`, `biography`, `history`, `children`, `poetry`, `other`.

### Constraints

- Persistence sits behind an asset repository interface, so tests and the HTTP layer do not depend on SQLite directly.
- Uniqueness of ISBN is enforced by a database unique index, not only by a read-before-write check.
- SQLite file lives at `apps/api/data/library.db` (gitignored); path overridable by environment variable `DATABASE_PATH`.
- Logging uses Fastify's built-in pino logger. `@sme-lending/logger` from `CLAUDE.md` is not available in a standalone project.
- Out of scope: update, delete, authentication, authorization, pagination, deployment.

## Acceptance Criteria

### API — register

1. AC-1: A valid body returns `201` with all fields, a UUID `id`, a `createdAt` timestamp, and a normalised `isbn`.
2. AC-2: Omitting `genre` returns `201` with `genre: null`.
3. AC-3: A missing, empty, whitespace-only, or over-length `title` or `author` returns `400` with a `details` entry naming the field.
4. AC-4: An ISBN with an invalid checksum or wrong length returns `400` naming `isbn`. ISBNs with hyphens or spaces and a valid checksum are accepted.
5. AC-5: A `publishedYear` below 1450, above the current year, or non-integer returns `400` naming `publishedYear`.
6. AC-6: A `genre` outside the enum returns `400` naming `genre`.
7. AC-7: An unknown field returns `400` naming that field.
8. AC-8: Malformed JSON returns `400` `ValidationError`; a non-JSON content type returns `415`.
9. AC-9: Registering an ISBN that already exists, in any hyphenation or as its ISBN-10/ISBN-13 equivalent, returns `409` `DuplicateIsbn`, and no second record is stored.
10. AC-10: An unexpected persistence failure returns `500` `{ error: "InternalError" }` and logs the error at `error` level.

### API — list

11. AC-11: With no filters, all assets are returned in `{ items }`, newest first.
12. AC-12: `author` matches case-insensitively and exactly; `q` matches any part of the title case-insensitively; `publishedYear` matches exactly; `genre` matches case-insensitively.
13. AC-13: Multiple filters combine with AND.
14. AC-14: No matches returns `200` `{ items: [] }`.
15. AC-15: An invalid `publishedYear`, an unknown `genre`, or an unknown query parameter returns `400` naming the parameter.

### Persistence

16. AC-16: An asset registered before an API restart is returned by `GET /assets` after the restart.

### Web page

17. AC-17: On load, the page lists all assets with title, author, ISBN, year, and genre, and shows a loading indicator while the request is pending.
18. AC-18: With no assets, or no matches for the current filters, the page shows an empty-state message.
19. AC-19: Submitting a valid form registers the book, shows a success message, clears the form, and refreshes the list with the current filters applied.
20. AC-20: A `400` response shows each field error inline beside its field; a `409` response shows the duplicate-ISBN error beside the ISBN field. The form keeps the entered values.
21. AC-21: The submit button is disabled while a registration is pending.
22. AC-22: Applying author, title text, year, or genre filters updates the list from `GET /assets` with those parameters. Genre is a select populated from `GenreSchema`.
23. AC-23: When the API is unreachable or returns `500`, the page shows an error message telling the user to retry, without losing form input.
24. AC-24: Every form and filter control has a visible label, is reachable and operable by keyboard, and shows a visible focus indicator.

### Quality

25. AC-25: `pnpm test run`, `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` pass from the root, with 100% coverage per package.
26. AC-26: `pnpm install && pnpm dev` from a clean clone starts both apps, and the page at `http://localhost:5173` registers and lists books against the API.
27. AC-27: A Playwright spec covers registering a book and finding it by a filter, and a duplicate-ISBN sad path.

### Local-run documentation

28. AC-28: `README.md` lists the prerequisites: Node 24 LTS with the version taken from `.nvmrc`, plus how to check it with `node --version`.
29. AC-29: `README.md` gives the commands to install and enable Corepack (`npm install --global corepack`, then `corepack enable`) and to confirm pnpm with `pnpm --version`, matching the `packageManager` version.
30. AC-30: `README.md` gives the commands, in order, to install dependencies (`pnpm install`) and start both apps (`pnpm dev`). It states the web URL `http://localhost:5173`, the API URL `http://localhost:3000`, and that the browser calls the API through the Vite proxy.
31. AC-31: `README.md` states where the SQLite file lives, how to reset it, and the `DATABASE_PATH` override.
32. AC-32: `README.md` lists the commands for tests (`pnpm test run`), lint, typecheck, and Playwright.
33. AC-33: `README.md` has a troubleshooting section that covers a wrong Node version, `pnpm` not found, and a port that is already in use.
34. AC-34: A person who follows `README.md` from top to bottom on a clean clone, using only the commands it lists, reaches a working page at `http://localhost:5173`. This is checked by hand before handoff.

### Continuous integration

35. AC-35: `.github/workflows/ci.yml` runs on every pull request and on every push to `main`.
36. AC-36: The workflow uses the Node version from `.nvmrc` and the pnpm version from `packageManager`, and installs with `pnpm install --frozen-lockfile`.
37. AC-37: The workflow runs `pnpm format:check` (oxfmt), `pnpm lint` (Oxlint), `pnpm typecheck`, and `pnpm test run` with coverage. Any failure, including coverage below 100%, fails the workflow.
38. AC-38: `README.md` states what CI checks and how to run the same checks locally.

## Glossary

| Term | Definition | Status | Source |
|------|------------|--------|--------|
| Asset | A book edition registered with the library, identified by its normalised ISBN. Not a physical copy. | `verified` | Human: "Book: title, author, ISBN, year published, optional genre"; ISBN unique |
| ISBN | International Standard Book Number, ISBN-10 or ISBN-13, stored as digits and `X` only after a checksum check | `verified` | Human chose checksum + unique |
| Genre | One value from `GenreSchema` | `verified` | Human chose fixed enum and confirmed the values |
| Filter | A `GET /assets` query parameter that narrows the list | `verified` | Human chose author, title text, year, genre |

## Ambiguity Log

| Decision | Classification | Resolved By | Rationale / Answer |
|----------|---------------|-------------|-------------------|
| Tech stack and repo structure | `requires-stakeholder-input` | human | pnpm monorepo: Fastify + Zod API, Vite + React web, shared Zod schemas package, Vite proxy. Alternatives offered: Express, React Router framework mode, separate folders. |
| Persistence across restart | `requires-stakeholder-input` | human | SQLite file via `node:sqlite`. Alternatives: in-memory, JSON file. |
| What an asset is | `requires-stakeholder-input` | human | Book: title, author, ISBN, publishedYear required; genre optional. Brief's "name" maps to `title`. |
| Which filters | `requires-stakeholder-input` | human | `author` exact case-insensitive, `q` title substring, `publishedYear` exact, `genre` case-insensitive. AND-combined. |
| ISBN validation and uniqueness | `requires-stakeholder-input` | human | ISBN-10/13 checksum, normalised, unique; duplicate returns `409`. Consequence: an asset is an edition, not a copy. |
| Malformed request handling | `requires-stakeholder-input` | human | `400` with per-field details; strict schema rejects unknown fields; `415` for non-JSON; string trim and 200-char limit; year 1450..current. |
| Genre free text or enum | `requires-stakeholder-input` | human | Fixed enum. |
| Genre enum values | `requires-stakeholder-input` | human | Agent proposed common library categories plus `other`; human confirmed. |
| Pagination, sort, invalid filters | `requires-stakeholder-input` | human | No pagination; `createdAt` desc; `{ items }` wrapper; invalid filter `400`; no matches `200` empty. |
| Update and delete | `inferable` | inference | Brief names only POST and GET. Predictability check passed: alternative "add DELETE" is ruled out by the brief's "That is the whole functional brief". |
| Authentication and authorization | `inferable` | inference | Local single-user tool; brief names no actors. Predictability check passed: alternative "API key" has no actor to serve in a local run. |
| ID and timestamps | `inferable` | inference | Server-generated UUID and `createdAt`. Predictability check: alternative "ISBN as id" plausible; UUID keeps the ISBN mutable later at no cost. |
| Logging | `inferable` | inference | Fastify pino logger; `@sme-lending/logger` unavailable standalone. Log `error` on 500; `info` on registration; `warn` on 400/409. Predictability check: no plausible alternative within a Fastify app. |
| Dependency failure (DB) | `inferable` | inference | `500` generic body, error logged, web shows retry message. Predictability check passed: no plausible alternative that leaks internals. |
| CORS vs proxy | `inferable` | inference | Vite proxy avoids CORS in local dev; follows from "run locally" and same-origin calls. Predictability check passed. |
| Node version | `inferable` | inference | Node 24 LTS required by `node:sqlite`. No plausible alternative given the SQLite choice. |
| Web UX states | `inferable` | inference | Loading, empty, success, inline error, disabled-while-pending, keyboard and labels from the UX checklist. Predictability check: no plausible alternative a competent developer would ship without these. |
| Undo for registration | `inferable` | inference | UX template suggests undo; no delete endpoint exists, so undo is out of scope. |
| Local-run documentation in `README.md` | `requires-stakeholder-input` | human | Required: Corepack and pnpm install, local dev start-up, browser URL. |
| Corepack install method | `inferable` | inference | `npm install --global corepack` works on every Node version, including Node 25+ where Corepack is no longer bundled. Predictability check: the alternative "rely on the bundled Corepack" is ruled out by the human asking for installation steps. |
| pnpm version pinning | `inferable` | inference | The `packageManager` field lets Corepack fetch the exact pnpm version. Predictability check passed: the alternative `npm i -g pnpm` gives an unpinned version. |
| README scope beyond start-up | `inferable` | inference | Tests, database reset, and troubleshooting are added so a newcomer can recover without asking. Predictability check: a minimal README is a plausible alternative, but it costs little to rule out. |
| Styling approach | `requires-stakeholder-input` | human | Tailwind CSS, chosen because it makes a polished page quick to build. |
| Tailwind version and setup | `inferable` | inference | Tailwind v4 through the `@tailwindcss/vite` plugin: no PostCSS or config file needed, and it is the current setup documented for Vite. Predictability check: the alternative v3 + PostCSS has no advantage in a new project. |
| Component library on top of Tailwind | `inferable` | inference | None; plain Tailwind utilities on semantic HTML. Predictability check: shadcn/ui or Headless UI are plausible alternatives, but a single form and list does not need them. |
| CI provider and checks | `requires-stakeholder-input` | human | GitHub Actions; runs lint, typecheck, and tests. |
| Linter and formatter | `requires-stakeholder-input` | human | Oxlint and oxfmt instead of ESLint and Prettier. |
| CI triggers | `inferable` | inference | Pull requests and pushes to `main`. Predictability check passed: the alternative "every branch push" duplicates PR runs. |
| Formatting enforced in CI | `inferable` | inference | `oxfmt --check` fails CI on unformatted code; choosing a formatter implies enforcing it. Predictability check: the alternative "format locally only" is plausible but leaves drift unchecked. |
| Playwright in CI | `requires-stakeholder-input` | human | Not in CI for now; Playwright runs locally only. |
| ISBN-10 and ISBN-13 equivalence | `requires-stakeholder-input` | human | Same book: both forms are stored as canonical ISBN-13, so registering the other form returns `409`. |
| Unknown `GET /assets` query parameters | `requires-stakeholder-input` | human | Rejected with `400`, so a typo such as `?authr=` does not silently return every book. |
| Concurrent duplicate registration | `inferable` | inference | Database unique index makes the second insert fail with `409`. Predictability check passed. |

## Consistency Gate

- [x] Intent is unambiguous
- [x] Every behavior/goal maps to an acceptance criterion
- [x] Architecture constrains without over-engineering
- [x] Terminology consistent across artifacts
- [x] No contradictions between artifacts
- [x] Every gap/ambiguity finding is logged — inferable with rationale or resolved by human

**Verdict:** PASS

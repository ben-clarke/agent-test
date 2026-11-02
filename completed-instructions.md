# Library Book Tracking — Instructions

## Brief

A small service for tracking books in a library.

- Backend — Node, REST: `POST /assets` registers an asset; `GET /assets` lists assets, with at least one filter.
- Front end — React: a page that uses both endpoints.

The brief does not say how assets are validated, what happens when a request is malformed, whether data persists across a restart, or what an asset is beyond a name. Each of those decisions is recorded below.

Full specification, including acceptance criteria AC-1 to AC-38: [`docs/specs/library-book-tracking.md`](docs/specs/library-book-tracking.md).

## Decision Log

"Decided by" is **Human** when the stakeholder chose, or **Agent** when the decision was inferred and documented for review.

### Stack and tooling

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D1 | pnpm workspaces monorepo: `apps/api`, `apps/web`, `packages/schemas` | Two independent folders; single React Router framework-mode app | Shared Zod schema keeps API, web, and tests on one source of truth. Separate apps keep the brief's backend/front-end split. | Human |
| D2 | API: Fastify + Zod, TypeScript strict | Express | Built-in schema hooks, `inject` for HTTP tests without a running server, strong typing. | Human |
| D3 | Web: Vite + React + TypeScript | React Router framework mode, Next.js | Fast local dev, plain SPA matches "a page", no server rendering needed. | Human |
| D4 | Styling: Tailwind CSS v4 through `@tailwindcss/vite` | Plain CSS, CSS modules, Tailwind v3 + PostCSS | Quick to make the page look good. v4 needs no PostCSS or config file. | Human (Tailwind), Agent (v4) |
| D5 | No component library on top of Tailwind | shadcn/ui, Headless UI | One form and one list do not need one. | Agent |
| D6 | Web calls relative `/assets`; Vite dev server proxies to `http://localhost:3000` | CORS on the API | Same-origin in the browser; no CORS configuration to get wrong. | Agent |
| D7 | Testing: Vitest everywhere; Fastify `inject` with in-memory SQLite for API; React Testing Library + MSW for web; one Playwright journey | Supertest, Jest, Cypress | Matches the project's `CLAUDE.md` standards. | Agent |
| D8 | Node 24 LTS, pinned in `.nvmrc` and `engines` | Node 20/22 | `node:sqlite` needs Node 22.5 or later; 24 is the current LTS. | Agent |
| D9 | pnpm pinned through the `packageManager` field; Corepack installed with `npm install --global corepack` | `npm i -g pnpm`; rely on Corepack bundled with Node | Exact pnpm version for everyone. Node 25+ no longer bundles Corepack, so the install step works on every version. | Agent |
| D10 | Logging: Fastify's built-in pino logger. `info` on registration, `warn` on 400/409, `error` on 500 | `@sme-lending/logger` | The shared logger is not available in a standalone project. | Agent |

### Data model

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D11 | An asset is a book: `title`, `author`, `isbn`, `publishedYear` required; `genre` optional. The brief's "name" maps to `title`. | Name only; generic asset with a type | Gives meaningful filters while staying focused on books. | Human |
| D12 | An asset is an edition, not a physical copy: ISBN is unique | Allow duplicate ISBNs, one record per copy | Follows from unique ISBN. Copy tracking is out of scope. | Human |
| D13 | ISBN-10 or ISBN-13 with a valid checksum; hyphens and spaces stripped; stored as canonical ISBN-13 (an ISBN-10 gets the `978` prefix and a recalculated check digit) | Format-only check; store as entered | Catches typos; storing as canonical ISBN-13 makes duplicate detection reliable, so an ISBN-10 and its ISBN-13 equivalent are the same book. | Human |
| D14 | Genre is a fixed enum: `fiction`, `non-fiction`, `science-fiction`, `fantasy`, `mystery`, `biography`, `history`, `children`, `poetry`, `other` | Free text; BISAC codes | Enum chosen by human for consistent filtering. Values proposed by agent, confirmed by human. | Human |
| D15 | Server generates a UUID `id` and an ISO-8601 UTC `createdAt` | ISBN as primary key | Keeps ISBN an ordinary, validated field. | Agent |
| D16 | Field limits: strings trimmed, 1–200 characters; `publishedYear` integer from 1450 to the current year | No limits | Rejects blank and absurd input. 1450 is roughly the start of the printing press. | Human |

### Persistence

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D17 | SQLite file through `node:sqlite` at `apps/api/data/library.db` (gitignored), overridable with `DATABASE_PATH` | In-memory; JSON file | Survives restart, no extra infrastructure or dependency, real SQL filtering. | Human |
| D18 | Persistence behind a repository interface | HTTP handlers call SQLite directly | Tests use in-memory SQLite; storage can change without touching routes. | Agent |
| D19 | ISBN uniqueness enforced by a database unique index | Read-before-write check only | Correct under concurrent registrations. | Agent |

### API behaviour

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D20 | Invalid input returns `400 { error: "ValidationError", details: [{ field, message }] }` | Generic 400 message | Lets the form show errors beside each field. | Human |
| D21 | Unknown fields are rejected (strict schema) | Strip silently | Surfaces client mistakes instead of hiding them. | Human |
| D22 | Malformed JSON returns `400`; non-JSON content type returns `415` | Treat both as 400 | Standard HTTP semantics. | Human |
| D23 | Duplicate ISBN returns `409 { error: "DuplicateIsbn" }` | 400; silently return existing record | Conflict is not a validation failure. | Human |
| D24 | Unexpected failures return `500 { error: "InternalError" }`, logged, with no internal detail | Pass through error message | Avoids leaking internals. | Agent |
| D25 | Filters: `author` exact case-insensitive; `q` case-insensitive title substring; `publishedYear` exact; `genre` case-insensitive. Combined with AND | Author only; title only | Covers the main ways staff look up a book. | Human |
| D26 | List returns `{ items }` sorted by `createdAt` descending; no pagination; no matches returns `200 { items: [] }`; invalid filter returns `400` | Limit/offset pagination; sort by title | Small local dataset; the wrapper leaves room for pagination later. | Human |

### Web page

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D27 | One page: registration form and a filterable list | Separate pages for register and list | The brief asks for "a page". | Agent |
| D28 | UX states: loading indicator, empty state, success message, inline field errors, submit disabled while pending, retry message when the API fails, form input kept on error | Minimal happy path | From the UX checklist; a competent developer would ship these. | Agent |
| D29 | Accessible: labelled controls, full keyboard operation, visible focus indicators | — | WCAG 2.2 AA baseline. | Agent |
| D30 | Genre filter and field are selects populated from the shared `GenreSchema` | Hard-coded options | One source of truth for genre values. | Agent |

### Scope

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D31 | No update or delete | Add `PUT`/`DELETE` | The brief names only POST and GET. | Agent |
| D32 | No authentication or authorization | API key; login | Local single-user tool; the brief names no actors. | Agent |
| D33 | No undo for registration | Undo through delete | No delete endpoint exists. | Agent |
| D34 | No deployment | Docker; cloud hosting | The goal is to run locally. | Agent |

### Documentation

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D35 | `README.md` documents Node prerequisites, Corepack and pnpm installation, `pnpm install`, `pnpm dev`, and the browser URL `http://localhost:5173` | Minimal README | A newcomer can run the project with no other help. | Human |
| D36 | `README.md` also covers tests, database reset, and troubleshooting (wrong Node version, `pnpm` not found, port in use) | Start-up only | Low cost; avoids the most common local failures. | Agent |

### CI and code quality

| # | Decision | Alternatives considered | Rationale | Decided by |
|---|---|---|---|---|
| D37 | CI on GitHub Actions (`.github/workflows/ci.yml`), triggered by pull requests and pushes to `main` | Other CI providers; run on every branch push | The repository is on GitHub. PR and `main` triggers avoid duplicate runs for branch pushes that already have a PR. | Human |
| D38 | Oxlint for linting and oxfmt for formatting, configured once at the root | ESLint and Prettier | Fast, single-binary tools with little configuration. | Human |
| D39 | Formatting enforced in CI with `pnpm format:check` (`oxfmt --check`) | Format locally only | Choosing a formatter implies enforcing it; otherwise formatting drifts. | Agent |
| D40 | Playwright is not run in CI for now; it runs locally only | Run Playwright in CI | Keeps CI fast and free of browser and two-app setup; the journey is checked locally before handoff. | Human |

## Nice to Have

Left out of the first run to keep it small. Each item notes why it would be worth doing next time.

| Item | Why it would help |
|---|---|
| Full Turborepo setup | Cached, dependency-aware builds and tests across `apps/*` and `packages/*` as the workspace grows. |
| Copy counts (total and available per book) | Makes the catalogue useful for real library stock, not just a list of titles. |
| Split the instructions into multiple specs | Build the foundations first, then add functionality spec by spec; smaller specs are easier to plan, review and deliver. |
| Wider Playwright coverage | This run has one local journey (S32) and no CI run (D40); more journeys and sad paths, run in CI, would catch UI regressions earlier. |
| Quick mockup designs fed into the plan | Getting the design right up front is cheaper in time and money than tweaking the UI at the end. |
| A different backend Database, such as DynamoDB, with an MSW mock backend for tests | Closer to a production setup than local SQLite; MSW keeps web tests fast and independent of the real API. Needs setup time this run did not have. |
| Authentication approaches | Needed once there is more than one user or the tool leaves localhost (see D32). |
| More API operations, such as `DELETE` and `PATCH` | Lets users correct or remove books; out of scope because the brief names only `POST` and `GET` (see D31, D33). |

## Implementation Plan

### Ticket
- Key: LIBRARY-BOOKS (standalone project, no Jira ticket)
- Spec: docs/specs/library-book-tracking.md

### Summary
- Greenfield pnpm monorepo: `packages/schemas` (Zod), `apps/api` (Fastify, `node:sqlite`), `apps/web` (Vite, React, Tailwind v4).
- `POST /assets` registers a book edition (unique, checksum-valid, normalised ISBN); `GET /assets` lists books newest first, filtered by `author`, `q`, `publishedYear`, `genre` (AND).
- One page registers and lists books with loading, empty, success, inline error, pending and retry states, fully keyboard operable. Error text is staff-friendly and defined once (Message Catalogue).
- Data survives an API restart. `README.md` alone takes a newcomer from a clean clone to a working page.
- Oxlint and oxfmt for code quality; a GitHub Actions workflow runs format check, lint, typecheck and tests with 100% coverage on every PR and push to `main` (Playwright stays local).
- Built as 7 vertical slices: a walking skeleton (including CI, so every later slice is checked) first, then registration, validation, duplicates, failures, filters, and finally the Playwright journey and README completion. README sections land with the slice that makes them true.

### Plan
| id | step | status |
| --- | --- | --- |
| S1 | Slice 1: Workspace, tooling and the shared genre list | completed |
| S2 | Slice 1: API lists an empty catalogue | completed |
| S3 | Slice 1: API configuration and start-up | completed |
| S4 | Slice 1: Page layout, loading and the empty catalogue | completed |
| S5 | Slice 1: CI workflow runs every check on PRs and pushes to main | completed |
| S6 | Slice 1: Root `pnpm dev` and README start-up and CI sections | completed |
| S7 | Slice 2: Shared registration and asset schemas | completed |
| S8 | Slice 2: API registers a valid book | completed |
| S9 | Slice 2: API lists registered books newest first | completed |
| S10 | Slice 2: Books survive an API restart; README data section | completed |
| S11 | Slice 2: Page lists registered books | completed |
| S12 | Slice 2: Page registers a book and refreshes the list | completed |
| S13 | Slice 2: Submit unavailable while a registration is pending | completed |
| S14 | Slice 3: API rejects invalid title and author | completed |
| S15 | Slice 3: API rejects invalid ISBNs | completed |
| S16 | Slice 3: API rejects out-of-range or non-integer years | completed |
| S17 | Slice 3: API rejects unknown genres and unknown fields | completed |
| S18 | Slice 3: API rejects malformed, non-JSON and oversized bodies | completed |
| S19 | Slice 3: Page shows field errors inline and keeps input | completed |
| S20 | Slice 4: API rejects duplicate ISBNs | completed |
| S21 | Slice 4: Page shows the duplicate-ISBN error beside ISBN | completed |
| S22 | Slice 5: API returns a generic 500 and logs the failure | completed |
| S23 | Slice 5: Page shows a retry message when registration fails | completed |
| S24 | Slice 5: Page shows a retry message when the list fails | completed |
| S25 | Slice 6: API filters by author | completed |
| S26 | Slice 6: API filters by title text | completed |
| S27 | Slice 6: API filters by publication year | completed |
| S28 | Slice 6: API filters by genre | completed |
| S29 | Slice 6: API combines filters and rejects unknown parameters | completed |
| S30 | Slice 6: Page filter controls update the list | completed |
| S31 | Slice 6: Page filter errors and registration with active filters | completed |
| S32 | Slice 7: Playwright register-and-find journey | completed |
| S33 | Slice 7: README Playwright section and clean-clone checklist | completed |
| T1 | Step 6: Run the full suite (`pnpm test run`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:e2e`) and add tests for remaining gaps | completed |
| R1 | Step 7: Self-review, cleanup, and acceptance-criteria check — tick every Traceability row (AC-35–37 as "verified locally, pending first CI run"; R1 does not wait for CI) | completed |
| P1 | Step 8: PR handoff — record the first PR's CI run link in Notes; the user records the post-merge `main` run | pending |

### Changed Files
- S1: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc`, `.npmrc`, `tsconfig.base.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `.gitignore`, `packages/schemas/{package.json,tsconfig.json,vitest.config.ts}`, `packages/schemas/src/{index.ts,genre-schema.ts}`, `packages/schemas/src/__tests__/genre-schema.test.ts`
- S2: `apps/api/{package.json,tsconfig.json,vitest.config.ts}`, `apps/api/src/{app.ts,routes/list-assets.ts}`, `apps/api/src/assets/{asset-repository.ts,open-database.ts,sqlite-asset-repository.ts}`, `apps/api/src/test-support/{build-test-app.ts,log-capture.ts}`, `apps/api/src/__tests__/list-assets.test.ts`, `packages/schemas/src/{asset-schema.ts,asset-list-response-schema.ts,index.ts}`, `pnpm-lock.yaml`
- S3: `apps/api/src/{config.ts,start-server.ts,server.ts}`, `apps/api/src/assets/open-database.ts`, `apps/api/src/__tests__/{config.test.ts,start-server.test.ts}`, `apps/api/{package.json,vitest.config.ts}`, `pnpm-lock.yaml`
- S4: `apps/web/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,index.html}`, `apps/web/src/{main.tsx,app.tsx,index.css,vitest.setup.ts,vitest-axe.d.ts}`, `apps/web/src/api/{list-assets.ts,to-client-result.ts}`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/components/layout/page-section.tsx`, `apps/web/src/components/book-list/{book-list.tsx,book-list-loading.tsx,book-list-empty.tsx}`, `apps/web/src/test-support/{msw-server.ts,asset-handlers.ts,create-gate.ts}`, `apps/web/src/__tests__/list-books.test.tsx`, `pnpm-lock.yaml`
- S5: `.github/workflows/ci.yml`; repair of S2 gap: `packages/schemas/src/__tests__/asset-list-response-schema.test.ts`
- S6: `package.json` (root `dev`), `README.md`, `.oxfmtrc.json` (README no longer ignored)
- S7: `packages/schemas/src/{isbn.ts,create-asset-schema.ts,validation-messages.ts,index.ts}`, `packages/schemas/src/__tests__/create-asset-schema.test.ts` (`asset-schema.ts` unchanged — already complete)
- S8: `apps/api/src/http/{request-validation-error.ts,parse-or-throw.ts,error-handler.ts}`, `apps/api/src/routes/register-asset.ts`, `apps/api/src/test-support/asset-factories.ts`, `apps/api/src/__tests__/register-asset.test.ts`, `apps/api/src/{app.ts,assets/asset-repository.ts,assets/sqlite-asset-repository.ts}`
- S9: `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/list-assets.test.ts`
- S10: `apps/api/src/__tests__/persistence.test.ts`, `README.md` (Data section)
- S11: `apps/web/src/genre-labels.ts`, `apps/web/src/test-support/asset-factories.ts`, `apps/web/src/components/book-list/{book-table.tsx,book-row.tsx,book-count.tsx,book-list.tsx}`, `apps/web/src/__tests__/list-books.test.tsx`
- S12: `apps/web/src/api/{register-asset.ts,to-client-result.ts}`, `apps/web/src/hooks/{use-register-asset.ts,use-asset-list.ts}`, `apps/web/src/components/register-book-form/{register-book-form.tsx,registration-success.tsx,to-create-asset-request.ts}`, `apps/web/src/components/form-controls/{text-field.tsx,genre-select.tsx}`, `apps/web/src/{app.tsx,components/book-list/book-list.tsx,components/book-list/book-table.tsx,test-support/asset-handlers.ts}`, `apps/web/src/__tests__/{register-book.test.tsx,list-books.test.tsx}`, `apps/web/package.json`, `pnpm-lock.yaml`
- S13: `apps/web/src/hooks/use-register-asset.ts`, `apps/web/src/components/register-book-form/register-book-form.tsx`, `apps/web/src/__tests__/register-book.test.tsx`
- S14: `packages/schemas/src/{create-asset-schema.ts,validation-messages.ts,error-response-schemas.ts,index.ts}`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`, `apps/api/src/http/{validation-details.ts,parse-or-throw.ts}`, `apps/api/src/__tests__/register-asset-validation.test.ts`
- S15: `packages/schemas/src/{isbn.ts,create-asset-schema.ts,validation-messages.ts}`, `packages/schemas/src/__tests__/isbn.test.ts`, `apps/api/src/__tests__/register-asset-validation.test.ts`
- S16: `packages/schemas/src/{create-asset-schema.ts,validation-messages.ts}`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`, `apps/api/src/__tests__/register-asset-validation.test.ts`
- S17: `packages/schemas/src/{create-asset-schema.ts,validation-messages.ts,index.ts}`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`, `apps/api/src/http/validation-details.ts`, `apps/api/src/__tests__/register-asset-validation.test.ts`
- S18: `apps/api/src/{app.ts,http/error-handler.ts,http/validation-details.ts}`, `packages/schemas/src/validation-messages.ts`, `apps/api/src/__tests__/{register-asset-body.test.ts,register-asset.test.ts}`
- S19: `apps/web/src/{api/to-client-result.ts,group-details-by-field.ts}`, `apps/web/src/components/register-book-form/{register-book-form.tsx,form-alert.tsx}`, `apps/web/src/components/form-controls/{text-field.tsx,genre-select.tsx,field-error.tsx}`, `apps/web/src/test-support/asset-handlers.ts`, `apps/web/src/__tests__/register-book-errors.test.tsx`
- S20: `apps/api/src/assets/{sqlite-asset-repository.ts,asset-repository.ts}`, `apps/api/src/routes/register-asset.ts`, `apps/api/src/__tests__/register-asset-duplicate.test.ts`, `packages/schemas/src/{error-response-schemas.ts,validation-messages.ts,index.ts}`
- S21: `apps/web/src/api/to-client-result.ts`, `apps/web/src/__tests__/register-book-errors.test.tsx`
- S22: `apps/api/src/http/error-handler.ts`, `packages/schemas/src/{error-response-schemas.ts,index.ts}`, `apps/api/src/__tests__/unexpected-failure.test.ts`
- S23: `apps/web/src/components/register-book-form/register-book-form.tsx`, `apps/web/src/__tests__/{register-book-failure.test.tsx,register-book-errors.test.tsx}`
- S24: `apps/web/src/api/to-client-result.ts`, `apps/web/src/components/book-list/{book-list-error.tsx,book-list.tsx}`, `apps/web/src/components/layout/page-section.tsx`, `apps/web/src/hooks/use-focus-after-retry.ts`, `apps/web/src/app.tsx`, `apps/web/src/__tests__/{list-books.test.tsx,register-book-failure.test.tsx}`
- S25: `packages/schemas/src/{asset-filter-schema.ts,index.ts}`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/routes/list-assets.ts`, `apps/api/src/assets/{asset-repository.ts,sqlite-asset-repository.ts}`, `apps/api/src/__tests__/filter-assets.test.ts`
- S26: `packages/schemas/src/asset-filter-schema.ts`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`
- S27: `packages/schemas/src/{asset-filter-schema.ts,validation-messages.ts}`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`
- S28: `packages/schemas/src/asset-filter-schema.ts`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`
- S29: `packages/schemas/src/{validation-messages.ts,index.ts,asset-filter-schema.ts}`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/routes/list-assets.ts`, `apps/api/src/http/{parse-or-throw.ts,validation-details.ts}`, `apps/api/src/__tests__/filter-assets.test.ts`
- S30: `apps/web/src/api/{build-asset-query.ts,list-assets.ts}`, `apps/web/src/components/book-filters/book-filters.tsx`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/app.tsx`, `apps/web/src/components/book-list/{book-list.tsx,book-list-empty.tsx}`, `apps/web/src/components/form-controls/{text-field.tsx,genre-select.tsx}`, `apps/web/src/__tests__/{filter-books.test.tsx,register-book.test.tsx,register-book-errors.test.tsx,register-book-failure.test.tsx,list-books.test.tsx}`
- S31: `apps/web/src/{app.tsx,group-details-by-field.ts}`, `apps/web/src/hooks/{use-asset-list.ts,use-register-asset.ts}`, `apps/web/src/components/book-filters/book-filters.tsx`, `apps/web/src/components/book-list/{book-list.tsx,book-table.tsx,book-list-rejected-note.tsx}`, `apps/web/src/components/register-book-form/{register-book-form.tsx,registration-success.tsx}`, `apps/web/src/__tests__/{filter-books,list-books,register-book,register-book-errors,register-book-failure}.test.tsx`
- S32: `apps/web/{playwright.config.ts,package.json,tsconfig.json}`, `apps/web/e2e/register-and-find-book.spec.ts`, `apps/web/e2e/support/{build-unique-book.ts,book-page.ts,record-focus-styles.ts}`, `package.json` (root `test:e2e`), `pnpm-workspace.yaml` (`allowBuilds: esbuild: false`), `pnpm-lock.yaml`
- S33: `README.md` (Playwright subsection, CI pointer, Troubleshooting: ports 3100/5174, esbuild policy, wrong-Node output), `pnpm-workspace.yaml` (`engineStrict: true`), `.npmrc` deleted

### Acceptance Criteria
- [ ] AC-1: Valid body returns `201` with all fields, UUID `id`, `createdAt`, normalised `isbn`
- [ ] AC-2: Omitted `genre` returns `201` with `genre: null`
- [ ] AC-3: Missing, empty, whitespace-only or over-length `title`/`author` returns `400` naming the field
- [ ] AC-4: Invalid ISBN checksum or length returns `400` naming `isbn`; hyphens and spaces accepted
- [ ] AC-5: `publishedYear` below 1450, above current year, or non-integer returns `400` naming `publishedYear`
- [ ] AC-6: `genre` outside the enum returns `400` naming `genre`
- [ ] AC-7: Unknown field returns `400` naming that field
- [ ] AC-8: Malformed JSON returns `400` `ValidationError`; non-JSON content type returns `415`
- [ ] AC-9: Existing ISBN in any hyphenation returns `409` `DuplicateIsbn`; no second record
- [ ] AC-10: Persistence failure returns `500` `{ error: "InternalError" }` and logs at `error`
- [ ] AC-11: No filters returns all assets in `{ items }`, newest first
- [ ] AC-12: `author` exact case-insensitive; `q` title substring case-insensitive; `publishedYear` exact; `genre` case-insensitive
- [ ] AC-13: Filters combine with AND
- [ ] AC-14: No matches returns `200 { items: [] }`
- [ ] AC-15: Invalid `publishedYear` or unknown `genre` filter returns `400` naming the parameter
- [ ] AC-16: Asset registered before restart is listed after restart
- [ ] AC-17: Page lists all assets with title, author, ISBN, year, genre; loading indicator while pending
- [ ] AC-18: Empty-state message with no assets or no matches
- [ ] AC-19: Valid submit registers, shows success, clears form, refreshes list with current filters
- [ ] AC-20: `400` field errors inline; `409` beside ISBN; form keeps values
- [ ] AC-21: Submit disabled while registration pending
- [ ] AC-22: Filters update the list via `GET /assets`; genre select from `GenreSchema`
- [ ] AC-23: API unreachable or `500` shows a retry message without losing form input
- [ ] AC-24: Every control labelled, keyboard operable, visible focus indicator
- [ ] AC-25: `pnpm test run`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck` pass from root with 100% coverage per package
- [ ] AC-26: `pnpm install && pnpm dev` from a clean clone works at `http://localhost:5173`
- [ ] AC-27: Playwright covers register-and-find-by-filter and duplicate-ISBN sad path
- [ ] AC-28: README prerequisites: Node 24 LTS from `.nvmrc`, `node --version`
- [ ] AC-29: README Corepack install/enable and `pnpm --version` matching `packageManager`
- [ ] AC-30: README `pnpm install`, `pnpm dev`, web and API URLs, Vite proxy
- [ ] AC-31: README SQLite location, reset, `DATABASE_PATH`
- [ ] AC-32: README test, lint, typecheck, Playwright commands
- [ ] AC-33: README troubleshooting: wrong Node version, `pnpm` not found, port in use
- [ ] AC-34: README followed top to bottom on a clean clone reaches a working page (checked by hand)
- [ ] AC-35: `.github/workflows/ci.yml` runs on every pull request and every push to `main`
- [ ] AC-36: CI uses Node from `.nvmrc`, pnpm from `packageManager`, `pnpm install --frozen-lockfile`
- [ ] AC-37: CI runs `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test run` with coverage; any failure or coverage below 100% fails the workflow
- [ ] AC-38: README states what CI checks and how to run the same checks locally

### Traceability

R1 ticks each row only when its steps are `completed` and their scenarios pass. AC-35–37 are ticked as "verified locally, pending first CI run"; P1 adds the PR run link and the user adds the post-merge run.

| AC | Scenarios (slice) | Steps |
|---|---|---|
| AC-1 | A valid book is registered; ISBNs are stored as canonical ISBN-13; whitespace trimmed (2) | S7, S8 |
| AC-2 | Genre is optional (2) | S7, S8 |
| AC-3 | Invalid title or author; non-text title or author; length boundaries (3) | S14 |
| AC-4 | Invalid ISBN; ISBN missing or not text (3); ISBNs stored as canonical ISBN-13 (2) | S15, S7 |
| AC-5 | Out-of-range or non-integer year; boundary years (3) | S16 |
| AC-6 | Genre outside the list (3) | S17 |
| AC-7 | Unknown field (3) | S17 |
| AC-8 | Body not a JSON object; non-JSON body refused (3) | S18 |
| AC-9 | ISBN already registered in any hyphenation or ISBN-10/13 form; overlapping registrations (4) | S20 |
| AC-10 | Registration/listing fails when the store is unavailable (5) | S22 |
| AC-11 | Newest first; same-instant ordering (2) | S9 |
| AC-12 | Author, title text, year, genre scenarios (6) | S25–S28 |
| AC-13 | Filters combine (6) | S29 |
| AC-14 | No matches (6) | S28 |
| AC-15 | Invalid filter outline, including unknown parameter (6) | S27–S29 |
| AC-16 | Survives a restart (2) | S10 |
| AC-17 | Loading then empty (1); lists books with details (2) | S4, S11 |
| AC-18 | Empty catalogue (1); nothing matches (6) | S4, S30 |
| AC-19 | Register from the page (2); register with filters applied (6) | S12, S31 |
| AC-20 | Field errors inline (3); duplicate beside ISBN (4) | S19, S21 |
| AC-21 | Submit unavailable while pending (2) | S13 |
| AC-22 | Staff filter the list; filter keyboard (6) | S30 |
| AC-23 | Registration fails outline; list fails outline; form input survives a list failure; reload fails after success (5) | S23, S24 |
| AC-24 | Keyboard registration (2); focus on first invalid field (3); filter keyboard (6); visible focus (7); axe checks (1–6) | S4, S12, S19, S30, S32 |
| AC-25 | CI runs on a pull request (1) | S1, S5, T1 |
| AC-26 | Newcomer starts both apps (1); Playwright journey (7) | S6, S32, S33 |
| AC-27 | Register and find; duplicate ISBN (7) | S32 |
| AC-28–33 | README checklist (7) | S6, S10, S33 |
| AC-34 | Clean-clone walk-through (7) | S33 |
| AC-35 | CI runs on a pull request; CI runs on push to main (1) — verified locally, pending first CI run | S5, P1 |
| AC-36 | CI uses the pinned toolchain; lockfile mismatch fails (1) — verified locally, pending first CI run | S5, P1 |
| AC-37 | CI fails when a check fails; Playwright absent (1) — verified locally, pending first CI run | S5, P1 |
| AC-38 | README checklist (7) | S6, S33 |

### Message Catalogue

API validation and conflict messages are written for staff, use the page's field names, and live once in `packages/schemas/src/validation-messages.ts`, attached to the schemas as Zod custom errors. The API returns them in `details[].message` and the page shows them verbatim (D69). Page-only copy lives as constants in the component that shows it. Scenarios assert this exact text.

| Case | Field | Message |
|---|---|---|
| Title missing, blank or not text | `title` | Enter a title |
| Title over 200 characters | `title` | Title must be 200 characters or fewer |
| Author missing, blank or not text | `author` | Enter an author |
| Author over 200 characters | `author` | Author must be 200 characters or fewer |
| ISBN missing, blank or not text | `isbn` | Enter an ISBN |
| ISBN wrong length, characters or checksum | `isbn` | Enter a valid 10- or 13-digit ISBN — check for typos |
| Year missing or blank (the page omits a blank Year) | `publishedYear` | Enter a year |
| Year not a whole number, or out of range | `publishedYear` | Year must be a whole number from 1450 to {currentYear} (computed from the injected clock) |
| Genre not in the list | `genre` | Choose a genre from the list |
| Unknown body field | `<field>` | "<field>" is not a recognised field |
| Body malformed, empty or not an object | `body` | Send the book details as a JSON object |
| Duplicate ISBN | `isbn` | A book with this ISBN is already registered — find it in the list |
| Year filter invalid | `publishedYear` | Year must be a whole number of up to 4 digits, for example 1965 |
| Genre filter invalid | `genre` | Choose a genre from the list |
| Unknown or repeated filter | `<param>` | "<param>" is not a recognised filter / Give the "<param>" filter only once |
| Page: registered | — | "<title>" registered. |
| Page: registered but hidden by filters | — | "<title>" registered. It is hidden by the current filters — clear them to see it. |
| Page: registration unavailable | — | Could not register the book. Check the service is running and try again. |
| Page: list unavailable | — | Could not load books. Check the service is running and try again. (with a "Retry" button) |
| Page: loading (first load only) | — | Loading books… |
| Page: no books | — | No books registered yet. |
| Page: no matches | — | No books match these filters. |
| Page: list count (live region) | — | 1 book shown / N books shown |

### Approach Stances

- Destructive shape (replace vs merge): **merge** (default). `README.md` and `.gitignore` already exist. Keep the existing `README.md` title line, replace only its one-line description with the project description, and add sections below; append new ignore entries (`apps/api/data/`, `playwright-report/`, `apps/web/e2e/.data/`) to `.gitignore` without removing any.
- Scope (touch only what was requested): **default**. Nothing beyond the spec and D1–D40 is built. Implementation details the spec leaves open (415 and other 4xx bodies, query-parameter strictness, message wording, `PORT`/`API_URL` overrides used only to isolate Playwright) are recorded in the Plan Decision Log, not added as features.
- Integration (auto-merge vs direct-to-trunk): **default**. Work lands on a feature branch and a PR; nothing is pushed to `main` directly.
- Format fidelity and migrate-vs-stub: not touched.

### Threat Model

STRIDE run for the two new endpoints and the browser-to-API flow (D41). Trust boundaries: browser page to Vite dev server, Vite proxy to API, API to SQLite file. Assets: the book catalogue (non-sensitive) and the integrity of the local machine's API.

| STRIDE | Threat | Severity | Mitigation | Verification |
|---|---|---|---|---|
| Spoofing | Another host on the network calls the unauthenticated API (D32) | High | API listens on `localhost` only; no setting binds it to other interfaces | S3 scenario "API listens only on this machine" asserts every bound address is loopback |
| Tampering | A malicious website in the same browser posts a book cross-site (CSRF) | Medium | Fastify's default `text/plain` parser is removed, so only `application/json` is accepted and every form-style content type gets `415`; a JSON post needs a CORS preflight the API never approves (no CORS headers, D6, D76) | S18 scenarios "A non-JSON body is refused" (four content types, nothing stored) and "No cross-origin access is granted" |
| Tampering | SQL injection through filter values or fields | High | Parameterised statements only; title search uses `instr`, not `LIKE`, so wildcards are literal | S26 scenario "Title search treats special characters literally" |
| Tampering | Stored script in a title or author runs in the page (XSS) | High | React text rendering only; no `dangerouslySetInnerHTML` (Oxlint `react/no-danger`) | S11 scenario "Book text is shown exactly as entered" |
| Repudiation | Registrations cannot be attributed | Low | Accepted: no actors exist (D32). Each registration is logged at `info` with `id` and `isbn` | S8 test asserts the info log |
| Information disclosure | Error responses leak stack traces or SQL | Medium | `500` body is exactly `{ error: "InternalError" }`; other 4xx bodies are generic; detail only in logs (D24, D77) | S18 and S22 assert exact bodies |
| Information disclosure | Logs capture request bodies | Low | Request bodies are never logged; only field names on `warn` | S14 test asserts the warn log has field names and no submitted values |
| Denial of service | Oversized bodies or strings | Low | Fastify default 1 MiB body limit returns `413`; strings capped at 200 characters | S18 "An oversized body is refused"; S14 covers the 200 cap |
| Denial of service | Unbounded list response (no pagination, D26) | Low | Accepted for a small local dataset | n/a |
| Elevation of privilege | No roles exist | n/a | n/a | n/a |

Accepted risks: no authentication (D32), no pagination (D26), DNS-rebinding reads of the catalogue (data is non-sensitive and the tool is local; revisit if the tool is ever deployed, D34).

### Slices

Test conventions for every web step: MSW handlers that must stay pending use a gated deferred promise from `apps/web/src/test-support/create-gate.ts` (`gate.open()` releases the response), never timers (D79); every page test file ends with a `vitest-axe` check of the rendered page in the state it tested (D74). API tests capture logs through a pino instance passed as Fastify 5 `loggerInstance` (D66).

#### Slice 1: Walking skeleton — empty catalogue end to end

**Depends-on:** none
**Files:** `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `tsconfig.base.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `.gitignore`, `README.md`, `packages/schemas/{package.json,tsconfig.json,vitest.config.ts}`, `packages/schemas/src/{index.ts,genre-schema.ts,asset-schema.ts,asset-list-response-schema.ts}`, `packages/schemas/src/__tests__/genre-schema.test.ts`, `apps/api/{package.json,tsconfig.json,vitest.config.ts}`, `apps/api/src/{app.ts,config.ts,start-server.ts,server.ts}`, `apps/api/src/routes/list-assets.ts`, `apps/api/src/assets/{asset-repository.ts,open-database.ts,sqlite-asset-repository.ts}`, `apps/api/src/test-support/{build-test-app.ts,log-capture.ts}`, `apps/api/src/__tests__/{list-assets.test.ts,config.test.ts,start-server.test.ts}`, `apps/web/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,index.html}`, `apps/web/src/{main.tsx,app.tsx,index.css,vitest.setup.ts}`, `apps/web/src/api/{list-assets.ts,to-client-result.ts}`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/components/layout/page-section.tsx`, `apps/web/src/components/book-list/{book-list.tsx,book-list-loading.tsx,book-list-empty.tsx}`, `apps/web/src/test-support/{msw-server.ts,asset-handlers.ts,create-gate.ts}`, `apps/web/src/__tests__/list-books.test.tsx`

**Behavior:**

```gherkin
Feature: Walking skeleton

  Scenario: The agreed genres are accepted
    Given the shared genre list
    When each of "fiction", "non-fiction", "science-fiction", "fantasy", "mystery", "biography", "history", "children", "poetry" and "other" is checked
    Then each one is accepted

  Scenario Outline: A genre outside the agreed list is rejected
    Given the shared genre list
    When "<genre>" is checked
    Then it is rejected

    Examples:
      | genre   |
      | romance |
      | Fiction |
      |         |

  Scenario: An empty catalogue lists no books
    Given no books are registered
    When a client lists books
    Then the response is 200 with an empty items list

  Scenario: First start creates the data folder
    Given the configured data file is in a folder that does not exist yet
    When the service starts
    Then the folder is created
    And listing books returns an empty items list

  Scenario: Defaults apply when nothing is configured
    Given no PORT or DATABASE_PATH is set
    When the service configuration is resolved
    Then the service uses port 3000
    And the data file is "apps/api/data/library.db" regardless of the folder the service was started from

  Scenario: DATABASE_PATH and PORT override the defaults
    Given DATABASE_PATH is "/tmp/books-test.db" and PORT is "3100"
    When the service configuration is resolved
    Then the data file is "/tmp/books-test.db" and the port is 3100

  Scenario Outline: An invalid port stops start-up
    Given PORT is "<port>"
    When the service configuration is resolved
    Then resolution fails with a message naming PORT

    Examples:
      | port  |
      | abc   |
      | 0     |
      | 70000 |

  Scenario: API listens only on this machine
    Given the service is started on a free port
    When its listening addresses are inspected
    Then every address is a loopback address
    And listing books over HTTP returns an empty items list

  Scenario: Stopping the service releases the port and the data file
    Given the service is running
    When it is stopped
    Then requests to its port are refused
    And the data file can be opened by a new service

  Scenario: The page shows loading, then the empty catalogue
    Given no books are registered
    And the book list has not arrived yet
    When staff open the page
    Then the page title is "Library books" and its main heading is "Library books"
    And it has sections headed "Register a book" and "Find books"
    And "Loading books…" is shown
    When the list arrives
    Then "Loading books…" disappears and "No books registered yet." is shown
    And "0 books shown" is announced

  Scenario: CI runs on a pull request
    Given a pull request whose code is formatted, lint-free, type-correct and fully covered
    When the pull request is opened or updated
    Then the CI workflow runs format check, lint, typecheck and tests with coverage, and passes

  Scenario: CI runs on push to main
    Given a change is merged to main
    When main is pushed
    Then the CI workflow runs the same checks and passes

  Scenario: CI uses the pinned toolchain
    Given ".nvmrc" names Node 24 and "packageManager" names a pnpm version
    When the CI workflow runs
    Then the Node version it reports matches ".nvmrc" and the pnpm version matches "packageManager"
    And the workflow fails at the toolchain check step if either version differs
    And dependencies are installed with a frozen lockfile

  Scenario Outline: CI fails when a check fails
    Given a pull request that <problem>
    When the CI workflow runs
    Then the workflow fails at the <check> step

    Examples:
      | problem                              | check        |
      | contains an unformatted file         | format check |
      | contains a lint violation            | lint         |
      | contains a type error                | typecheck    |
      | leaves a branch uncovered by tests   | tests        |

  Scenario: CI refuses a lockfile that does not match the manifests
    Given a pull request that changes a dependency without updating the lockfile
    When the CI workflow runs
    Then the install step fails

  Scenario: CI does not run Playwright
    Given the CI workflow definition
    Then no step runs Playwright or installs browsers

  Scenario: A newcomer starts both apps from the README (manual)
    Given a clean clone and Node 24 LTS installed
    When they follow the README prerequisites, Corepack, install and run sections in order
    Then the page at http://localhost:5173 shows "No books registered yet."
```

**Steps:**

##### S1: Workspace, tooling and the shared genre list

**Complexity**: complex
**Scenarios**: The agreed genres are accepted; A genre outside the agreed list is rejected
**IMPLEMENT**: Root `package.json` (`private`, `packageManager: pnpm@<current>`, `engines.node: ">=24 <25"`, scripts `test` = `pnpm -r test`, `lint` = `oxlint --deny-warnings`, `format` = `oxfmt`, `format:check` = `oxfmt --check`, `typecheck` = `pnpm -r typecheck`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (`24`), `.npmrc` with `engine-strict=true` so `pnpm install` refuses a Node outside `engines` (D80), `tsconfig.base.json` with every strict flag from `CLAUDE.md`, root `.oxlintrc.json` and `.oxfmtrc.json` (D38, D57). Commit `pnpm-lock.yaml`. `packages/schemas` (`@library/schemas`, source-only exports, D53) with `GenreSchema` (`z.enum`, exact lowercase) and `Genre` type. Package `test` scripts are plain `vitest`; each `vitest.config.ts` enables v8 coverage at 100% thresholds and the exclusions in D56. Merge `.gitignore` additions.
**TEST**: Vitest acceptance test `packages/schemas/src/__tests__/genre-schema.test.ts` — each of the ten values parses; `romance`, `Fiction`, empty string fail. Verify `pnpm test run` forwards `run` (no watch mode, exits) and that `pnpm test run`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck` pass; removing a genre fails the test; a misformatted file fails `pnpm format:check`.
**REFACTOR**: Check root scripts and tsconfig inheritance for duplication; constants at the bottom of files.
**Files**: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc`, `.npmrc`, `tsconfig.base.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `.gitignore`, `packages/schemas/package.json`, `packages/schemas/tsconfig.json`, `packages/schemas/vitest.config.ts`, `packages/schemas/src/index.ts`, `packages/schemas/src/genre-schema.ts`, `packages/schemas/src/__tests__/genre-schema.test.ts`

##### S2: API lists an empty catalogue

**Complexity**: complex
**Scenarios**: An empty catalogue lists no books
**IMPLEMENT**: `apps/api` (`@library/api`): `buildApp({ repository, now, loggerInstance })` returning a Fastify 5 instance (D2, D44, D66); `AssetRepository` interface with async `list` and `close` (D18, D63); `openDatabase({ databasePath })` in `open-database.ts` opens `DatabaseSync` and applies the final `assets` table and unique ISBN index (D49); `createSqliteAssetRepository({ database })` in `sqlite-asset-repository.ts` holds only queries; `GET /assets` route returning `{ items }`. `AssetSchema` stub and `AssetListResponseSchema` in `@library/schemas`. Test helpers `buildTestApp` (in-memory database, fixed clock) and `createLogCapture` (pino instance writing to an array).
**TEST**: Vitest acceptance test `apps/api/src/__tests__/list-assets.test.ts` using Fastify `inject`: `GET /assets` returns `200` and body equals `{ items: [] }`, parsing with `AssetListResponseSchema`.
**REFACTOR**: Keep `app.ts` composition-only; SQL in named constants at the bottom of each file.
**Files**: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/list-assets.ts`, `apps/api/src/assets/asset-repository.ts`, `apps/api/src/assets/open-database.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/test-support/build-test-app.ts`, `apps/api/src/test-support/log-capture.ts`, `apps/api/src/__tests__/list-assets.test.ts`, `packages/schemas/src/asset-schema.ts`, `packages/schemas/src/asset-list-response-schema.ts`, `packages/schemas/src/index.ts`

##### S3: API configuration and start-up

**Complexity**: standard
**Scenarios**: First start creates the data folder; Defaults apply when nothing is configured; DATABASE_PATH and PORT override the defaults; An invalid port stops start-up; API listens only on this machine; Stopping the service releases the port and the data file
**IMPLEMENT**: `resolveConfig({ env })` parses `PORT` (integer 1–65535, default 3000) and `DATABASE_PATH` (default resolved from the API package directory via `import.meta.url`, D64) with a Zod schema, and fixes `host: "localhost"`. `openDatabase` creates the parent folder first. `startServer({ config, now, loggerInstance })` in `start-server.ts` opens the database, builds the app, listens on `config.host`/`config.port`, and returns `{ addresses, stop }`, where `stop` closes the app and the database (D75). `server.ts` only calls `resolveConfig`, `startServer`, and wires `SIGINT`/`SIGTERM` to `stop` (coverage-excluded, D56). `dev` script `tsx watch src/server.ts` (D54).
**TEST**: Vitest acceptance tests `apps/api/src/__tests__/config.test.ts` (defaults, overrides, each invalid `PORT` with an error naming `PORT`) and `apps/api/src/__tests__/start-server.test.ts`: `startServer` with `port: 0` and a data file in a not-yet-existing temp folder → folder exists; every address is `127.0.0.1` or `::1`; `fetch` to `/assets` returns `{ items: [] }`; after `stop()` a `fetch` is refused and a new `openDatabase` on the same file succeeds.
**REFACTOR**: Keep `server.ts` free of branching; any logic moves into `config.ts` or `start-server.ts`.
**Files**: `apps/api/src/config.ts`, `apps/api/src/start-server.ts`, `apps/api/src/server.ts`, `apps/api/src/assets/open-database.ts`, `apps/api/src/__tests__/config.test.ts`, `apps/api/src/__tests__/start-server.test.ts`, `apps/api/package.json`, `apps/api/vitest.config.ts`

##### S4: Page layout, loading and the empty catalogue

**Complexity**: standard
**Scenarios**: The page shows loading, then the empty catalogue
**IMPLEMENT**: `apps/web` (`@library/web`): Vite + React + `@tailwindcss/vite` (D3, D4), `index.html` `<title>Library books</title>`, Vite proxy `/assets` to `API_URL` (default `http://localhost:3000`, D6, D58), `build.assetsDir: "static"` (D62). `api/list-assets.ts` `listAssets({ filters, signal })` and `api/to-client-result.ts` (status-to-result mapping, D61). `useAssetList` hook. `App` renders `<h1>Library books</h1>` and two `PageSection`s (`<section aria-labelledby>` with `<h2>` "Register a book" and "Find books"); single-column layout that works at 360 px. `BookList` renders `BookListLoading` (first load only), `BookListEmpty`, and an always-mounted polite live region announcing the count. `vitest-axe` set up in `vitest.setup.ts` (D74). MSW server, handler factories and `createGate`.
**TEST**: Vitest + RTL + MSW `apps/web/src/__tests__/list-books.test.tsx`: with the handler gated, `Loading books…` is visible; after `gate.open()` it is gone, `No books registered yet.` shows, the live region reads `0 books shown`; `document.title`, the `h1`, and both `h2` regions exist by role and name; axe reports no violations.
**REFACTOR**: One responsibility per component file; `App` composes only.
**Files**: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/src/index.css`, `apps/web/src/vitest.setup.ts`, `apps/web/src/api/list-assets.ts`, `apps/web/src/api/to-client-result.ts`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/components/layout/page-section.tsx`, `apps/web/src/components/book-list/book-list.tsx`, `apps/web/src/components/book-list/book-list-loading.tsx`, `apps/web/src/components/book-list/book-list-empty.tsx`, `apps/web/src/test-support/msw-server.ts`, `apps/web/src/test-support/asset-handlers.ts`, `apps/web/src/test-support/create-gate.ts`, `apps/web/src/__tests__/list-books.test.tsx`

##### S5: CI workflow runs every check on PRs and pushes to main

**Complexity**: standard
**Scenarios**: CI runs on a pull request; CI runs on push to main; CI uses the pinned toolchain; CI fails when a check fails; CI refuses a lockfile that does not match the manifests; CI does not run Playwright
**IMPLEMENT**: `.github/workflows/ci.yml` (D37, D39, D40): triggers `pull_request` and `push` to `main`; one job on `ubuntu-latest` with `permissions: contents: read` and a `concurrency` group cancelling superseded runs: checkout; `actions/setup-node` with `node-version-file: .nvmrc`; `npm install --global corepack` and `corepack enable` (D9); a toolchain check step that prints `node --version` and `pnpm --version` and exits non-zero if the Node major differs from `.nvmrc` or the pnpm version differs from `packageManager`; `pnpm install --frozen-lockfile`; separate named steps `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test run` (100% thresholds make a gap exit non-zero, D55). No Playwright step.
**TEST**: Default proof is local, with the exact commands the workflow runs: on throwaway changes that are then reverted, show that an unformatted file fails `pnpm format:check`, an Oxlint violation fails `pnpm lint`, a type error fails `pnpm typecheck`, an untested branch fails `pnpm test run`, and a manifest change without a lockfile update fails `pnpm install --frozen-lockfile`. Run the toolchain check script locally with a mismatched version to see it fail. Inspect `ci.yml`: triggers are exactly `pull_request` and `push: branches: [main]`, Node comes from `.nvmrc`, no step mentions `playwright`. Then one real run on the first PR (P1): it passes and its version step prints the `.nvmrc` Node and `packageManager` pnpm versions. The push-to-main trigger is confirmed on the first run after merge. Record both run links in `### Notes`; AC-35–37 are ticked only once those runs are green.
**REFACTOR**: One named step per check so the failing check is obvious; no duplicated install logic.
**Files**: `.github/workflows/ci.yml`

##### S6: Root `pnpm dev` and README start-up and CI sections

**Complexity**: trivial
**Scenarios**: A newcomer starts both apps from the README (manual)
**IMPLEMENT**: Root `dev` script `pnpm --parallel --filter "./apps/*" dev`. README (merge stance): project description; Prerequisites (Node 24 LTS from `.nvmrc`, `node --version`, AC-28); Corepack and pnpm (`npm install --global corepack`, `corepack enable`, `pnpm --version` matching `packageManager`, AC-29); Install and run (`pnpm install`, `pnpm dev`, web `http://localhost:5173`, API `http://localhost:3000`, browser calls the API through the Vite proxy, AC-30); Tests and checks (`pnpm test run`, `pnpm lint`, `pnpm format:check`, `pnpm format` to fix, `pnpm typecheck`, AC-32 part); Continuous integration (CI runs format check, lint, typecheck and tests with 100% coverage on every PR and push to `main`, not Playwright; the same four commands run the checks locally, AC-38); Troubleshooting (wrong Node version: `pnpm install` stops with `ERR_PNPM_UNSUPPORTED_ENGINE` because of `engine-strict`; fix with `nvm use`, `pnpm` not found, port 3000 or 5173 in use with `lsof -i :<port>`, AC-33).
**TEST**: Manual, on a clean clone: follow the README in order; `pnpm dev` starts both apps and `http://localhost:5173` shows `No books registered yet.`. The README's CI section names exactly the steps in `ci.yml`. Full README checklist runs in S33.
**REFACTOR**: Check every README command was run exactly as written; remove any step not needed.
**Files**: `package.json`, `README.md`

#### Slice 2: Register a book and see it listed

**Depends-on:** 1
**Files:** `packages/schemas/src/{create-asset-schema.ts,asset-schema.ts,isbn.ts,validation-messages.ts,index.ts}`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`, `apps/api/src/routes/{register-asset.ts,list-assets.ts}`, `apps/api/src/http/{request-validation-error.ts,parse-or-throw.ts,error-handler.ts}`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/test-support/asset-factories.ts`, `apps/api/src/__tests__/{register-asset.test.ts,list-assets.test.ts,persistence.test.ts}`, `apps/web/src/components/book-list/{book-table.tsx,book-row.tsx,book-count.tsx}`, `apps/web/src/components/register-book-form/{register-book-form.tsx,registration-success.tsx}`, `apps/web/src/components/form-controls/{text-field.tsx,genre-select.tsx}`, `apps/web/src/genre-labels.ts`, `apps/web/src/hooks/{use-register-asset.ts,use-asset-list.ts}`, `apps/web/src/api/register-asset.ts`, `apps/web/src/app.tsx`, `apps/web/src/test-support/asset-factories.ts`, `apps/web/src/__tests__/{list-books.test.tsx,register-book.test.tsx}`, `README.md`

**Behavior:**

```gherkin
Feature: Register a book and see it listed

  Scenario: A valid book is registered
    Given no books are registered
    And the current time is 2026-06-15T10:00:00Z
    When a client registers title "Dune", author "Frank Herbert", ISBN "978-0-306-40615-7", year 1965, genre "science-fiction"
    Then the response is 201
    And the body has title "Dune", author "Frank Herbert", ISBN "9780306406157", year 1965, genre "science-fiction"
    And the body has a UUID id and createdAt "2026-06-15T10:00:00.000Z"

  Scenario: Genre is optional
    When a client registers a valid book without a genre
    Then the response is 201 with genre null

  Scenario Outline: ISBNs are stored as canonical ISBN-13
    When a client registers a valid book with ISBN "<entered>"
    Then the response is 201 with ISBN "<stored>"

    Examples:
      | entered           | stored        |
      | 978-0-306-40615-7 | 9780306406157 |
      | 978 0 306 40615 7 | 9780306406157 |
      | 0 306 40615 2     | 9780306406157 |
      | 0-8044-2957-X     | 9780804429573 |
      | 0-8044-2957-x     | 9780804429573 |

  Scenario: Surrounding whitespace is trimmed from title and author
    When a client registers title "  Dune  " and author " Frank Herbert "
    Then the response is 201 with title "Dune" and author "Frank Herbert"

  Scenario: Books are listed newest first
    Given "Emma" was registered at 2026-06-15T10:00:00Z
    And "Dune" was registered at 2026-06-15T10:05:00Z
    When a client lists books
    Then the items are "Dune" then "Emma"

  Scenario: Books registered at the same instant list the later registration first
    Given "Emma" and then "Dune" were registered at 2026-06-15T10:00:00Z
    When a client lists books
    Then the items are "Dune" then "Emma"

  Scenario: A registered book survives a restart
    Given "Dune" was registered
    When the service is stopped and started again with the same data file
    Then listing books returns "Dune"

  Scenario: The page lists registered books with their details
    Given "Dune" by "Frank Herbert", ISBN "9780306406157", 1965, genre "science-fiction" is registered
    And "Emma" by "Jane Austen" with no genre is registered
    When staff open the page
    Then a row shows "Dune", "Frank Herbert", "9780306406157", "1965", "Science fiction"
    And the "Emma" row shows "No genre"
    And "2 books shown" is announced

  Scenario: Book text is shown exactly as entered
    Given a book titled "<img src=x onerror=alert(1)>" is registered
    When staff open the page
    Then the title is shown as that literal text and no image is rendered

  Scenario: Staff register a book from the page
    Given the page shows no books
    When staff fill in Title, Author, ISBN, Year and Genre "Science fiction" and press "Register book"
    Then the service receives genre "science-fiction"
    And "\"Dune\" registered." is announced
    And every form field is empty again
    And "Dune" appears in the list without the list being replaced by "Loading books…"

  Scenario: The success message clears when staff start the next book
    Given "\"Dune\" registered." is shown
    When staff type in Title
    Then the success message is gone

  Scenario: The submit button is unavailable while a registration is pending
    Given the registration response has not arrived yet
    When staff press "Register book"
    Then the button is marked unavailable and reads "Registering…"
    And keyboard focus stays on the button
    And pressing Enter in a field sends no second registration
    When the response arrives
    Then the button is available again and reads "Register book"

  Scenario: Staff register a book using only the keyboard
    Given staff are on the page
    When they move through the form with Tab
    Then focus reaches Title, Author, ISBN, Year, "Genre (optional)" and "Register book" in that order
    And Title, Author, ISBN and Year are marked required
    And pressing Enter in the Year field submits the form
```

**Steps:**

##### S7: Shared registration and asset schemas

**Complexity**: standard
**Scenarios**: A valid book is registered; Genre is optional; ISBNs are stored as canonical ISBN-13; Surrounding whitespace is trimmed from title and author
**IMPLEMENT**: In `@library/schemas`: `normalizeIsbn` (strip hyphens and spaces, uppercase `x`) and `toCanonicalIsbn13` (a 10-character ISBN gets the `978` prefix, drops its own check digit, and gets a recalculated ISBN-13 check digit; a 13-digit ISBN is unchanged) (D52); `buildCreateAssetSchema({ currentYear })` (D44) — object with trimmed `title`/`author` strings, `isbn` transformed by `normalizeIsbn` then `toCanonicalIsbn13` (checksum validation is added before the transform in S15), `publishedYear` number, optional `genre` (`GenreSchema`, D51); `validation-messages.ts` holding the Message Catalogue entries as they are needed (D69), starting with the type-error messages used here. Length, checksum, range and strict-key rules arrive in Slice 3 with their tests. Complete `AssetSchema` (`id` UUID, `createdAt` ISO datetime, nullable `genre`); export `CreateAssetInput` and `Asset`.
**TEST**: Vitest acceptance test `packages/schemas/src/__tests__/create-asset-schema.test.ts`: valid input parses; every canonical ISBN-13 example, including ISBN-10 with upper and lower case `X`; whitespace trimmed; missing genre parses as absent.
**REFACTOR**: Keep `isbn.ts` pure; derive every type from a schema.
**Files**: `packages/schemas/src/isbn.ts`, `packages/schemas/src/create-asset-schema.ts`, `packages/schemas/src/asset-schema.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/index.ts`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`

##### S8: API registers a valid book

**Complexity**: standard
**Scenarios**: A valid book is registered; Genre is optional; ISBNs are stored as canonical ISBN-13; Surrounding whitespace is trimmed from title and author
**IMPLEMENT**: `parseOrThrow({ schema, value })` throws `RequestValidationError` carrying `details`; the error handler maps it to `400 { error: "ValidationError", details }` with a `warn` log of field names (D45). `POST /assets` route stays parse → repository → reply: calls `now()` once per request and derives both `currentYear` (UTC) and `createdAt` from that value, builds the asset (`randomUUID()`, `genre ?? null`), `repository.insert`, replies `201`, logs `info` with `id` and `isbn` (D10). Repository `insert` writes the row with lowercase search columns (D48) and returns `{ outcome: "created", asset }` (D63). Factory `buildCreateAssetRequest(overrides)` typed with `CreateAssetInput`.
**TEST**: Vitest acceptance test `apps/api/src/__tests__/register-asset.test.ts` with a fixed clock: `201` body matches the scenario exactly (UUID pattern for `id`), parses with `AssetSchema`; genre omitted gives `null`; each canonical ISBN-13 example; trimming; exactly one `info` log line with the new `id`.
**REFACTOR**: Handler has no branching beyond the repository outcome; extract `toAsset` if it grows.
**Files**: `apps/api/src/routes/register-asset.ts`, `apps/api/src/http/parse-or-throw.ts`, `apps/api/src/http/request-validation-error.ts`, `apps/api/src/http/error-handler.ts`, `apps/api/src/app.ts`, `apps/api/src/assets/asset-repository.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/test-support/asset-factories.ts`, `apps/api/src/__tests__/register-asset.test.ts`

##### S9: API lists registered books newest first

**Complexity**: standard
**Scenarios**: Books are listed newest first; Books registered at the same instant list the later registration first
**IMPLEMENT**: Repository `list` orders by `created_at DESC, rowid DESC` (D49) and maps rows back to `Asset`.
**TEST**: `apps/api/src/__tests__/list-assets.test.ts`: register through `POST` with a clock advanced between calls → `Dune`, `Emma`; with an unchanged clock the later registration is first; every item parses with `AssetSchema`.
**REFACTOR**: Row-to-asset mapping is one small pure function.
**Files**: `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/list-assets.test.ts`

##### S10: Books survive an API restart; README data section

**Complexity**: standard
**Scenarios**: A registered book survives a restart
**IMPLEMENT**: No new production behaviour beyond S3 and S8. README "Data" section: file location `apps/api/data/library.db`, reset by stopping `pnpm dev` and deleting the file, `DATABASE_PATH` override example (AC-31).
**TEST**: Vitest acceptance test `apps/api/src/__tests__/persistence.test.ts`: `startServer` on a temp data file, register `Dune` over HTTP, `stop()`, `startServer` again on the same file, `GET /assets` returns `Dune`. Confirm the test fails when the data path is `:memory:`.
**REFACTOR**: Share temp-folder setup with `start-server.test.ts` only if it is the same knowledge.
**Files**: `apps/api/src/__tests__/persistence.test.ts`, `README.md`

##### S11: Page lists registered books

**Complexity**: standard
**Scenarios**: The page lists registered books with their details; Book text is shown exactly as entered
**IMPLEMENT**: `BookTable` (semantic `<table>` with caption and headers Title, Author, ISBN, Year, Genre) inside a horizontally scrollable, keyboard-focusable region (`tabIndex=0`, labelled) so it fits at 360 px; `BookRow` shows the genre's display label from `genre-labels.ts` (D73) or `No genre`; `BookCount` live region (`1 book shown` / `N books shown`).
**TEST**: Vitest + RTL + MSW in `list-books.test.tsx`, data from a `buildAsset(overrides)` factory typed with `Asset`: each field in its column, `Science fiction` label, `No genre`, count announcement; a script-like title renders as text with no `img` role; axe passes.
**REFACTOR**: `BookList` only composes; labels come only from `genre-labels.ts`.
**Files**: `apps/web/src/components/book-list/book-list.tsx`, `apps/web/src/components/book-list/book-table.tsx`, `apps/web/src/components/book-list/book-row.tsx`, `apps/web/src/components/book-list/book-count.tsx`, `apps/web/src/genre-labels.ts`, `apps/web/src/test-support/asset-factories.ts`, `apps/web/src/__tests__/list-books.test.tsx`

##### S12: Page registers a book and refreshes the list

**Complexity**: standard
**Scenarios**: Staff register a book from the page; The success message clears when staff start the next book; Staff register a book using only the keyboard
**IMPLEMENT**: `api/register-asset.ts` `registerAsset(input)` returning `{ kind: "created", asset }` via `to-client-result.ts`. `useRegisterAsset({ onRegistered })`. Wiring: `App` owns `useAssetList({ filters })` (which exposes `reload`) and passes `onRegistered={reload}` to `RegisterBookForm` (D61). During a reload the existing rows stay visible, dimmed, with `aria-busy="true"` on the table; `Loading books…` shows only before the first result. `RegisterBookForm` (`noValidate`, D72) composes `TextField`s for Title, Author, ISBN, Year (`inputMode="numeric"`, D60) with `required`, `GenreSelect` labelled "Genre (optional)" with a `No genre` option and display labels (D30, D73), and `RegistrationSuccess` — an always-mounted `role="status"` region. On success: clear fields, announce `"<title>" registered.`, call `onRegistered`; the message clears on the next input or submit. `focus-visible` ring on every control (D29).
**TEST**: Vitest + RTL + MSW `apps/web/src/__tests__/register-book.test.tsx`: fill by label and submit; assert the request body (genre slug), success text, empty fields, new row, no `Loading books…` during the reload, message cleared on typing; `userEvent.tab()` order, `required` on the four fields, Enter in Year submits; axe passes.
**REFACTOR**: `RegisterBookForm` composes only; body-building in a pure `toCreateAssetRequest` helper.
**Files**: `apps/web/src/api/register-asset.ts`, `apps/web/src/api/to-client-result.ts`, `apps/web/src/hooks/use-register-asset.ts`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/app.tsx`, `apps/web/src/components/book-list/book-table.tsx`, `apps/web/src/components/register-book-form/register-book-form.tsx`, `apps/web/src/components/register-book-form/registration-success.tsx`, `apps/web/src/components/form-controls/text-field.tsx`, `apps/web/src/components/form-controls/genre-select.tsx`, `apps/web/src/__tests__/register-book.test.tsx`

##### S13: Submit unavailable while a registration is pending

**Complexity**: standard
**Scenarios**: The submit button is unavailable while a registration is pending
**IMPLEMENT**: While pending, the submit button has `aria-disabled="true"`, reads `Registering…`, and submits are ignored; it is not given the `disabled` attribute, so focus is not lost (D71).
**TEST**: In `register-book.test.tsx` with a gated handler counting requests: during the pending state `aria-disabled="true"`, pending text, focus still on the button, a second Enter leaves the count at 1; after `gate.open()` the button is available again.
**REFACTOR**: Pending state lives only in `useRegisterAsset`.
**Files**: `apps/web/src/hooks/use-register-asset.ts`, `apps/web/src/components/register-book-form/register-book-form.tsx`, `apps/web/src/__tests__/register-book.test.tsx`

#### Slice 3: Reject invalid registrations

**Depends-on:** 2
**Files:** `packages/schemas/src/{create-asset-schema.ts,isbn.ts,validation-messages.ts,error-response-schemas.ts,index.ts}`, `packages/schemas/src/__tests__/{create-asset-schema.test.ts,isbn.test.ts}`, `apps/api/src/http/{validation-details.ts,error-handler.ts}`, `apps/api/src/app.ts`, `apps/api/src/__tests__/{register-asset-validation.test.ts,register-asset-body.test.ts}`, `apps/web/src/api/register-asset.ts`, `apps/web/src/components/register-book-form/{register-book-form.tsx,form-alert.tsx}`, `apps/web/src/components/form-controls/{text-field.tsx,genre-select.tsx,field-error.tsx}`, `apps/web/src/group-details-by-field.ts`, `apps/web/src/__tests__/register-book-errors.test.tsx`

**Behavior:**

```gherkin
Feature: Reject invalid registrations

  Scenario Outline: An invalid title or author is rejected
    Given no books are registered
    When a client registers a book whose <field> is <value>
    Then the response is 400 with error "ValidationError"
    And details contain "<field>" with message "<message>"
    And listing books returns an empty items list

    Examples:
      | field  | value          | message                                 |
      | title  | missing        | Enter a title                           |
      | title  | ""             | Enter a title                           |
      | title  | "   "          | Enter a title                           |
      | title  | the number 42  | Enter a title                           |
      | title  | 201 characters | Title must be 200 characters or fewer   |
      | author | missing        | Enter an author                         |
      | author | ""             | Enter an author                         |
      | author | "   "          | Enter an author                         |
      | author | the number 42  | Enter an author                         |
      | author | 201 characters | Author must be 200 characters or fewer  |

  Scenario Outline: Text at the length limit is accepted, measured after trimming
    When a client registers a valid book whose <field> is <value>
    Then the response is 201

    Examples:
      | field  | value                                   |
      | title  | 200 characters                          |
      | author | 200 characters                          |
      | title  | 200 characters with a space either side |

  Scenario Outline: An invalid ISBN is rejected
    When a client registers a valid book with ISBN <isbn>
    Then the response is 400 with "isbn" message "<message>"

    Examples:
      | isbn                | message                                              |
      | "978-0-306-40615-8" | Enter a valid 10- or 13-digit ISBN — check for typos |
      | "0-306-40615-3"     | Enter a valid 10- or 13-digit ISBN — check for typos |
      | "12345"             | Enter a valid 10- or 13-digit ISBN — check for typos |
      | "97803064061AB"     | Enter a valid 10- or 13-digit ISBN — check for typos |
      | "X306406152"        | Enter a valid 10- or 13-digit ISBN — check for typos |
      | "978030640615X"     | Enter a valid 10- or 13-digit ISBN — check for typos |
      | missing             | Enter an ISBN                                        |
      | null                | Enter an ISBN                                        |
      | the number 9780306406157 | Enter an ISBN                                   |

  Scenario Outline: An out-of-range or non-integer year is rejected
    Given the current time is 2026-06-15T10:00:00Z
    When a client registers a valid book with year <year>
    Then the response is 400 with "publishedYear" message "<message>"

    Examples:
      | year    | message                                          |
      | 1449    | Year must be a whole number from 1450 to 2026    |
      | 2027    | Year must be a whole number from 1450 to 2026    |
      | 1999.5  | Year must be a whole number from 1450 to 2026    |
      | "1999"  | Year must be a whole number from 1450 to 2026    |
      | missing | Enter a year                                     |

  Scenario Outline: Years at the boundaries are accepted
    Given the current time is <now>
    When a client registers a valid book with year <year>
    Then the response is 201

    Examples:
      | now                  | year |
      | 2026-06-15T10:00:00Z | 1450 |
      | 2026-06-15T10:00:00Z | 2026 |
      | 2027-01-01T00:00:00Z | 2027 |

  Scenario Outline: A genre outside the list is rejected
    When a client registers a valid book with genre "<genre>"
    Then the response is 400 with "genre" message "Choose a genre from the list"

    Examples:
      | genre   |
      | romance |
      | Fiction |

  Scenario: An unknown field is rejected
    When a client registers a valid book with an extra field "copies" set to 3
    Then the response is 400 with "copies" message "\"copies\" is not a recognised field"

  Scenario: Every problem is reported at once
    When a client registers a book with no title and ISBN "12345"
    Then the response is 400 with details for "title" and "isbn"

  Scenario Outline: A body that is not a JSON object is rejected
    When a client sends <body> as "application/json"
    Then the response is 400 with "body" message "Send the book details as a JSON object"
    And listing books returns an empty items list

    Examples:
      | body                  |
      | malformed `{"title":` |
      | an empty body         |
      | `[]`                  |
      | `null`                |
      | `"x"`                 |

  Scenario: A JSON content type with a charset is accepted
    When a client sends a valid book as "application/json; charset=utf-8"
    Then the response is 201

  Scenario Outline: A non-JSON body is refused
    When a client sends a valid book as <content type>
    Then the response is 415 with body exactly {"error":"UnsupportedMediaType"}
    And listing books returns an empty items list

    Examples:
      | content type                        |
      | "text/plain"                        |
      | "application/x-www-form-urlencoded" |
      | "multipart/form-data"               |
      | no content type                     |

  Scenario: No cross-origin access is granted
    When another origin sends a preflight request and a registration
    Then no response carries an "access-control-allow-origin" header

  Scenario: An oversized body is refused
    When a client sends a JSON body larger than 1 MiB
    Then the response is 413 with body exactly {"error":"RequestRejected"}
    And the rejection is logged as a warning

  Scenario: Field errors appear beside their fields and input is kept
    Given the registration is rejected with "Enter a valid 10- or 13-digit ISBN — check for typos" for ISBN and "Year must be a whole number from 1450 to 2026" for Year
    When staff submit the form
    Then each message is shown beside its field and the field is marked invalid
    And keyboard focus moves to the ISBN field, the first invalid field in form order
    And every field keeps the value staff entered
    And no success message is shown

  Scenario: Submitting with Year empty asks for a year
    Given staff fill in every field except Year
    When they submit the form
    Then the service receives no publishedYear
    And "Enter a year" is shown beside Year

  Scenario: Editing a field clears only its error
    Given errors are shown for ISBN and Year
    When staff change the ISBN
    Then the ISBN error disappears and the Year error remains

  Scenario: An error for a field not on the form is still shown
    Given the registration is rejected with "Send the book details as a JSON object" for "body"
    When staff submit the form
    Then that message is shown as an alert above "Register book"

  Scenario: Field errors clear after a successful registration
    Given staff saw an error beside ISBN
    When they correct the ISBN and submit again successfully
    Then no field error is shown
```

**Steps:**

##### S14: API rejects invalid title and author

**Complexity**: complex
**Scenarios**: An invalid title or author is rejected; Text at the length limit is accepted, measured after trimming; Every problem is reported at once
**IMPLEMENT**: Trim then `min(1)`/`max(200)` on `title` and `author` with catalogue messages, including the type-error message (D16, D69). `toValidationDetails(issues)` in `validation-details.ts` maps Zod issues to `{ field, message }` (D46); `parseOrThrow` uses it. `ValidationErrorResponseSchema` added to `@library/schemas`.
**TEST**: Schema tests in `create-asset-schema.test.ts` (boundaries 0, 1, 200, 201 after trim; exact messages). API acceptance test `apps/api/src/__tests__/register-asset-validation.test.ts`: each example's status, field and exact message, body parses with `ValidationErrorResponseSchema`, list empty afterwards; combined failure lists both; the warn log has field names and not the submitted value.
**REFACTOR**: `validation-details.ts` is the only place that shapes `details`; `MAX_TEXT_LENGTH` at the bottom.
**Files**: `packages/schemas/src/create-asset-schema.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/error-response-schemas.ts`, `packages/schemas/src/index.ts`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`, `apps/api/src/http/validation-details.ts`, `apps/api/src/http/parse-or-throw.ts`, `apps/api/src/__tests__/register-asset-validation.test.ts`

##### S15: API rejects invalid ISBNs

**Complexity**: standard
**Scenarios**: An invalid ISBN is rejected
**IMPLEMENT**: `isValidIsbn` in `isbn.ts`: after normalisation, ISBN-10 (9 digits + digit or `X`, mod-11) or ISBN-13 (13 digits, alternating 1/3 weights, mod-10) (D13, D52), checked before the canonical ISBN-13 transform; `isbn` must be a string (`Enter an ISBN` for missing, null, blank or non-string) and pass the refine (`Enter a valid 10- or 13-digit ISBN — check for typos`).
**TEST**: `packages/schemas/src/__tests__/isbn.test.ts` through the exported schema: every example plus valid ISBN-10 and ISBN-13 controls. API test covers each example row's status and message.
**REFACTOR**: Two small pure checksum functions with named weight constants.
**Files**: `packages/schemas/src/isbn.ts`, `packages/schemas/src/create-asset-schema.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/__tests__/isbn.test.ts`, `apps/api/src/__tests__/register-asset-validation.test.ts`

##### S16: API rejects out-of-range or non-integer years

**Complexity**: standard
**Scenarios**: An out-of-range or non-integer year is rejected; Years at the boundaries are accepted
**IMPLEMENT**: `publishedYear` integer, `min(1450)`, `max(currentYear)` with the message built from `currentYear` (D16, D44); `Enter a year` when missing.
**TEST**: Schema boundary tests with explicit `currentYear` (message contains that year). API tests with a fixed clock per example, including `2027-01-01T00:00:00Z`.
**REFACTOR**: `EARLIEST_PUBLISHED_YEAR` constant at the bottom; no clock reads outside `now`.
**Files**: `packages/schemas/src/create-asset-schema.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`, `apps/api/src/__tests__/register-asset-validation.test.ts`

##### S17: API rejects unknown genres and unknown fields

**Complexity**: standard
**Scenarios**: A genre outside the list is rejected; An unknown field is rejected
**IMPLEMENT**: Strict object (D21); `unrecognized_keys` maps to one detail per key with the catalogue message (D46); genre message `Choose a genre from the list`.
**TEST**: Schema and API tests: `romance`, `Fiction` → `genre` with exact message; `copies` → `copies` with exact message.
**REFACTOR**: One branch per issue shape in the mapper; no nesting.
**Files**: `packages/schemas/src/create-asset-schema.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/__tests__/create-asset-schema.test.ts`, `apps/api/src/http/validation-details.ts`, `apps/api/src/__tests__/register-asset-validation.test.ts`

##### S18: API rejects malformed, non-JSON and oversized bodies

**Complexity**: standard
**Scenarios**: A body that is not a JSON object is rejected; A JSON content type with a charset is accepted; A non-JSON body is refused; No cross-origin access is granted; An oversized body is refused
**IMPLEMENT**: `buildApp` removes Fastify's default `text/plain` parser so only JSON is parsed (D76). Error handler, flat dispatch (D77): `RequestValidationError` and JSON body-parse errors (invalid, empty) → `400 ValidationError` with `field: "body"`; unsupported or missing media type → `415 { error: "UnsupportedMediaType" }` (D22, D47); any other Fastify error with a 4xx `statusCode` (for example `413`) keeps its status with `{ error: "RequestRejected" }`; every 4xx logs `warn`. Root-level schema issues (`[]`, `null`, `"x"`) → `field: "body"`.
**TEST**: Vitest acceptance test `apps/api/src/__tests__/register-asset-body.test.ts` with raw `inject` payloads: each example's status and exact body; list empty after each refusal; `OPTIONS` preflight with an `Origin` header and a cross-origin `POST` have no `access-control-allow-origin`; a 1 MiB + 1 byte body gives `413` and a warn log.
**REFACTOR**: Handler order: validation → parse → media type → other 4xx → fallback (S22).
**Files**: `apps/api/src/http/error-handler.ts`, `apps/api/src/app.ts`, `apps/api/src/http/validation-details.ts`, `packages/schemas/src/validation-messages.ts`, `apps/api/src/__tests__/register-asset-body.test.ts`

##### S19: Page shows field errors inline and keeps input

**Complexity**: standard
**Scenarios**: Field errors appear beside their fields and input is kept; Submitting with Year empty asks for a year; Editing a field clears only its error; An error for a field not on the form is still shown; Field errors clear after a successful registration
**IMPLEMENT**: `registerAsset` returns `{ kind: "rejected", details }` for `400` bodies that parse with `ValidationErrorResponseSchema` (D61). `group-details-by-field.ts` (pure) splits details into form fields and others. `FieldError` component; `TextField` and `GenreSelect` render it with `aria-invalid` and `aria-describedby`. `FormAlert` (always-mounted `role="alert"`) shows details for fields not on the form. After a rejection focus moves to the first invalid field in form order; a field's error clears when it changes; values are kept; all errors reset on the next submit.
**TEST**: Vitest + RTL + MSW `apps/web/src/__tests__/register-book-errors.test.tsx`: exact messages as each field's accessible description, `aria-invalid="true"`, focus on ISBN, values kept, no success text; blank Year sends no `publishedYear` and shows `Enter a year` (MSW handler answers with the real API message); editing ISBN clears only its error; `body` detail in the alert; errors gone after a later success; axe passes with errors shown.
**REFACTOR**: Form composes only; grouping stays in the pure helper.
**Files**: `apps/web/src/api/register-asset.ts`, `apps/web/src/api/to-client-result.ts`, `apps/web/src/hooks/use-register-asset.ts`, `apps/web/src/group-details-by-field.ts`, `apps/web/src/components/register-book-form/register-book-form.tsx`, `apps/web/src/components/register-book-form/form-alert.tsx`, `apps/web/src/components/form-controls/text-field.tsx`, `apps/web/src/components/form-controls/genre-select.tsx`, `apps/web/src/components/form-controls/field-error.tsx`, `apps/web/src/__tests__/register-book-errors.test.tsx`

#### Slice 4: Reject duplicate ISBNs

**Depends-on:** 3
**Files:** `apps/api/src/assets/{asset-repository.ts,sqlite-asset-repository.ts}`, `apps/api/src/routes/register-asset.ts`, `packages/schemas/src/{error-response-schemas.ts,validation-messages.ts,index.ts}`, `apps/api/src/__tests__/register-asset-duplicate.test.ts`, `apps/web/src/api/{register-asset.ts,to-client-result.ts}`, `apps/web/src/__tests__/register-book-errors.test.tsx`

**Behavior:**

```gherkin
Feature: Reject duplicate ISBNs

  Scenario Outline: An ISBN already registered is rejected in any hyphenation or ISBN form
    Given a book with ISBN "9780306406157" is registered
    When a client registers another book with ISBN "<isbn>"
    Then the response is 409 with error "DuplicateIsbn" and "isbn" message "A book with this ISBN is already registered — find it in the list"
    And listing books returns exactly one book

    Examples:
      | isbn              |
      | 9780306406157     |
      | 978-0-306-40615-7 |
      | 978 0 306 40615 7 |
      | 0-306-40615-2     |
      | 0306406152        |

  Scenario: Two overlapping registrations of the same ISBN create one book
    Given no books are registered
    When two registrations of ISBN "9780306406157" are sent without waiting for either response
    Then one response is 201 and the other is 409 "DuplicateIsbn"
    And listing books returns exactly one book

  Scenario: Different editions with the same title are both accepted
    Given "Dune" with ISBN "9780306406157" is registered
    When a client registers "Dune" with ISBN "0-8044-2957-X"
    Then the response is 201 and listing books returns two books

  Scenario Outline: An ISBN-10 and its ISBN-13 equivalent are the same book
    Given a book with ISBN "<first>" is registered
    When a client registers a book with ISBN "<second>"
    Then the response is 409 with error "DuplicateIsbn"
    And listing books returns exactly one book, with ISBN "<canonical>"

    Examples:
      | first             | second            | canonical     |
      | 0-306-40615-2     | 978-0-306-40615-7 | 9780306406157 |
      | 978-0-306-40615-7 | 0-306-40615-2     | 9780306406157 |
      | 0-8044-2957-x     | 9780804429573     | 9780804429573 |

  Scenario: The duplicate-ISBN error appears beside ISBN and input is kept
    Given the ISBN staff enter is already registered
    When staff submit the form
    Then "A book with this ISBN is already registered — find it in the list" is shown beside the ISBN field
    And keyboard focus moves to the ISBN field
    And every field keeps the value staff entered
```

**Steps:**

##### S20: API rejects duplicate ISBNs

**Complexity**: complex
**Scenarios**: An ISBN already registered is rejected in any hyphenation or ISBN form; Two overlapping registrations of the same ISBN create one book; Different editions with the same title are both accepted; An ISBN-10 and its ISBN-13 equivalent are the same book
**IMPLEMENT**: Repository `insert` catches only the unique-constraint error (`code === "ERR_SQLITE_ERROR"` and `errcode === 2067`, D42) and returns `{ outcome: "duplicate-isbn" }`; anything else rethrows. Route replies `409 { error: "DuplicateIsbn", details: [{ field: "isbn", message }] }` with the catalogue message and logs `warn` (D23). `DuplicateIsbnResponseSchema` in `@library/schemas`. No read-before-write check (D19), so the index is the only guard (D78).
**TEST**: Vitest acceptance test `apps/api/src/__tests__/register-asset-duplicate.test.ts`: each hyphenation and the ISBN-10 form → `409` with exact body and one listed book; `Promise.all` of two injects → one `201`, one `409` (an outcome check — synchronous SQLite serialises the inserts, so this is not true concurrency; D78); same title with a different ISBN → `201`; each ISBN-10/ISBN-13 pair in either order → `409`, one book listed with the canonical ISBN-13 (pins D52). Uniqueness comes from the unique index on the canonical value.
**REFACTOR**: Named SQLite error-code constant; constraint check is a small predicate.
**Files**: `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/assets/asset-repository.ts`, `apps/api/src/routes/register-asset.ts`, `packages/schemas/src/error-response-schemas.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/index.ts`, `apps/api/src/__tests__/register-asset-duplicate.test.ts`

##### S21: Page shows the duplicate-ISBN error beside ISBN

**Complexity**: standard
**Scenarios**: The duplicate-ISBN error appears beside ISBN and input is kept
**IMPLEMENT**: `to-client-result.ts` maps `409` bodies that parse with `DuplicateIsbnResponseSchema` to the same `rejected` result, so the existing field-error path shows it.
**TEST**: In `register-book-errors.test.tsx`: MSW returns `409`; exact message is the ISBN field's description, focus on ISBN, values kept.
**REFACTOR**: The status-to-result mapping stays a flat lookup.
**Files**: `apps/web/src/api/to-client-result.ts`, `apps/web/src/__tests__/register-book-errors.test.tsx`

#### Slice 5: Handle unexpected failures

**Depends-on:** 3
**Files:** `apps/api/src/http/error-handler.ts`, `packages/schemas/src/{error-response-schemas.ts,index.ts}`, `apps/api/src/__tests__/unexpected-failure.test.ts`, `apps/web/src/api/{to-client-result.ts,list-assets.ts,register-asset.ts}`, `apps/web/src/hooks/{use-register-asset.ts,use-asset-list.ts}`, `apps/web/src/components/register-book-form/{register-book-form.tsx,form-alert.tsx}`, `apps/web/src/components/book-list/{book-list.tsx,book-list-error.tsx}`, `apps/web/src/__tests__/{register-book-failure.test.tsx,list-books.test.tsx}`

**Behavior:**

```gherkin
Feature: Handle unexpected failures

  Scenario: Registration fails when the book store is unavailable
    Given the book store has become unavailable
    When a client registers a valid book
    Then the response is 500 with body exactly {"error":"InternalError"}
    And the failure is logged at error level

  Scenario: Listing fails when the book store is unavailable
    Given the book store has become unavailable
    When a client lists books
    Then the response is 500 with body exactly {"error":"InternalError"}
    And the failure is logged at error level

  Scenario Outline: The page asks staff to retry when registration fails
    Given the service <failure>
    When staff submit a valid book
    Then "Could not register the book. Check the service is running and try again." is shown as an alert
    And every field keeps the value staff entered
    And "Register book" is available again

    Examples:
      | failure                                       |
      | cannot be reached                             |
      | responds with a server error                  |
      | responds with a status the page does not expect, such as 413 |
      | responds with a body the page cannot read     |

  Scenario: The retry message clears after a successful resubmit
    Given "Could not register the book. Check the service is running and try again." is shown
    When the service recovers and staff submit again
    Then the retry message is gone and "\"Dune\" registered." is announced

  Scenario Outline: The page asks staff to retry when the list fails, and recovers
    Given the service <failure> when listing books
    When staff open the page
    Then "Could not load books. Check the service is running and try again." is shown with a "Retry" button
    When the service recovers and staff press "Retry"
    Then the books are listed and the message is gone

    Examples:
      | failure                                   |
      | cannot be reached                         |
      | responds with a server error              |
      | responds with an unexpected status (404)  |
      | responds with a body the page cannot read |

  Scenario: After a successful retry, focus moves to the list
    Given the list failed to load
    When the service recovers and staff press "Retry"
    Then keyboard focus moves to the "Find books" heading and the count is announced

  Scenario: Form input survives a list failure
    Given staff have typed a Title and Author
    When reloading the list fails
    Then the Title and Author still hold what staff typed

  Scenario: The book is registered but the list cannot be refreshed
    Given registering succeeds but listing books then fails
    When staff submit a valid book
    Then "\"Dune\" registered." is announced
    And "Could not load books. Check the service is running and try again." is shown with a "Retry" button
```

**Steps:**

##### S22: API returns a generic 500 and logs the failure

**Complexity**: complex
**Scenarios**: Registration fails when the book store is unavailable; Listing fails when the book store is unavailable
**IMPLEMENT**: Error handler fallback: any error that is not a recognised 4xx → `500 { error: "InternalError" }`, logged at `error` with the error object; nothing from the error reaches the body (D24). `InternalErrorResponseSchema` in `@library/schemas`.
**TEST**: Vitest acceptance test `apps/api/src/__tests__/unexpected-failure.test.ts` with the real SQLite repository closed before the request (real `ERR_INVALID_STATE`, D42): body deep-equals `{ error: "InternalError" }` for `POST` and `GET`; the captured log has a level-50 entry with the error message.
**REFACTOR**: Handler branches stay flat and ordered.
**Files**: `apps/api/src/http/error-handler.ts`, `packages/schemas/src/error-response-schemas.ts`, `packages/schemas/src/index.ts`, `apps/api/src/__tests__/unexpected-failure.test.ts`

##### S23: Page shows a retry message when registration fails

**Complexity**: standard
**Scenarios**: The page asks staff to retry when registration fails; The retry message clears after a successful resubmit
**IMPLEMENT**: `to-client-result.ts` completes the D61 mapping: `fetch` rejection, any status other than the expected success/`400`/`409`, and bodies that fail schema parsing → `{ kind: "unavailable" }`. The form shows the catalogue message in `FormAlert`, keeps values, makes submit available again, and clears the alert on the next submit.
**TEST**: Vitest + RTL + MSW `apps/web/src/__tests__/register-book-failure.test.tsx`: `HttpResponse.error()`, `500`, `413`, and `201` with an invalid body each show the exact message with values kept and the button available; a later success clears it; axe passes.
**REFACTOR**: No `try/catch` outside `api/`; result union type at the bottom of `to-client-result.ts`.
**Files**: `apps/web/src/api/to-client-result.ts`, `apps/web/src/api/register-asset.ts`, `apps/web/src/hooks/use-register-asset.ts`, `apps/web/src/components/register-book-form/register-book-form.tsx`, `apps/web/src/components/register-book-form/form-alert.tsx`, `apps/web/src/__tests__/register-book-failure.test.tsx`

##### S24: Page shows a retry message when the list fails

**Complexity**: standard
**Scenarios**: The page asks staff to retry when the list fails, and recovers; After a successful retry, focus moves to the list; Form input survives a list failure; The book is registered but the list cannot be refreshed
**IMPLEMENT**: `listAssets` uses the same mapping (`200` → `listed`, `400` → `rejected`, everything else → `unavailable`). `BookListError` (`role="alert"`, `Retry` button) rendered by `BookList`; `Retry` calls `reload`, and when that reload succeeds focus moves to the "Find books" heading (`tabIndex=-1`). The registration success message and the list error are independent, so both show when a reload fails.
**TEST**: Vitest + RTL + MSW in `list-books.test.tsx`: each outline row shows the exact message; after swapping the handler to success, `Retry` lists the books and focus is on the "Find books" heading; typed form values survive a failed reload (triggered by Apply). In `register-book-failure.test.tsx`: `POST` succeeds, `GET` fails → success announcement and list error both present.
**REFACTOR**: Share the unavailable mapping only because it is the same rule (transport or contract failure).
**Files**: `apps/web/src/api/list-assets.ts`, `apps/web/src/api/to-client-result.ts`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/components/book-list/book-list.tsx`, `apps/web/src/components/book-list/book-list-error.tsx`, `apps/web/src/__tests__/list-books.test.tsx`, `apps/web/src/__tests__/register-book-failure.test.tsx`

#### Slice 6: Filter the list

**Depends-on:** 3 (S31 also depends on Slice 5's list error states)
**Files:** `packages/schemas/src/{asset-filter-schema.ts,validation-messages.ts,index.ts}`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/routes/list-assets.ts`, `apps/api/src/assets/{asset-repository.ts,sqlite-asset-repository.ts}`, `apps/api/src/__tests__/filter-assets.test.ts`, `apps/web/src/components/book-filters/book-filters.tsx`, `apps/web/src/components/book-list/book-list-empty.tsx`, `apps/web/src/components/register-book-form/registration-success.tsx`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/api/{list-assets.ts,build-asset-query.ts}`, `apps/web/src/app.tsx`, `apps/web/src/__tests__/filter-books.test.tsx`

**Behavior:**

```gherkin
Feature: Filter the list

  Background:
    Given these books are registered:
      | title          | author        | year | genre           |
      | Dune           | Frank Herbert | 1965 | science-fiction |
      | Dune Messiah   | Frank Herbert | 1969 | science-fiction |
      | Emma           | Jane Austen   | 1815 |                 |
      | Les Misérables | Victor Hugo   | 1862 | fiction         |
      | L'Étranger     | Émile Ajar    | 1942 | fiction         |
      | 100% Pure      | Ann Smith     | 2001 | other           |

  Scenario: Author matches whole names in any letter case
    When a client lists books with author "frank HERBERT"
    Then the items are "Dune Messiah" and "Dune"

  Scenario: Author must match the whole name
    When a client lists books with author "Frank"
    Then the items list is empty

  Scenario: Author matching ignores case for accented letters
    When a client lists books with author "ÉMILE AJAR"
    Then the items are "L'Étranger"

  Scenario: Title text matches any part of the title in any letter case
    When a client lists books with q "UNE"
    Then the items are "Dune Messiah" and "Dune"

  Scenario: Title search treats special characters literally
    When a client lists books with q "%"
    Then the items are "100% Pure"
    When a client lists books with q "' OR 1=1 --"
    Then the items list is empty

  Scenario: Year matches exactly
    When a client lists books with publishedYear "1965"
    Then the items are "Dune"

  Scenario: A well-formed year with no books returns an empty list
    When a client lists books with publishedYear "3000"
    Then the response is 200 with an empty items list

  Scenario: Genre matches in any letter case
    When a client lists books with genre "Science-Fiction"
    Then the items are "Dune Messiah" and "Dune"

  Scenario: Filters combine so every condition must hold
    When a client lists books with author "Frank Herbert" and publishedYear "1969"
    Then the items are "Dune Messiah"

  Scenario: No matches returns an empty list
    When a client lists books with genre "poetry"
    Then the response is 200 with an empty items list

  Scenario: A blank filter is ignored
    When a client lists books with author "  "
    Then all six books are returned

  Scenario Outline: An invalid filter is rejected
    When a client lists books with <parameter> "<value>"
    Then the response is 400 with error "ValidationError" and "<parameter>" message "<message>"

    Examples:
      | parameter     | value                | message                                                         |
      | publishedYear | abc                  | Year must be a whole number of up to 4 digits, for example 1965 |
      | publishedYear | 1965.5               | Year must be a whole number of up to 4 digits, for example 1965 |
      | publishedYear | 01965                | Year must be a whole number of up to 4 digits, for example 1965 |
      | publishedYear | 12345678901234567890 | Year must be a whole number of up to 4 digits, for example 1965 |
      | genre         | romance              | Choose a genre from the list                                    |
      | authr         | Frank                | "authr" is not a recognised filter                              |

  Scenario: A misspelt filter is rejected rather than ignored
    When a client lists books with authr "Herbert"
    Then the response is 400 with "authr" message "\"authr\" is not a recognised filter"
    And no books are returned

  Scenario: A repeated filter is rejected
    When a client lists books with author "Frank Herbert" given twice
    Then the response is 400 with "author" message "Give the \"author\" filter only once"

  Scenario: Staff filter the list on the page
    Given staff are on the page
    When they choose Genre "Science fiction", enter Author "Frank Herbert" and press "Apply filters"
    Then the service is asked for genre "science-fiction" and author "Frank Herbert" only
    And the list shows the books it returns
    And the Genre filter offers "All genres" plus the display label of every agreed genre
    When they clear filters, enter Title contains "une" and Year "1965" and press "Apply filters"
    Then the service is asked for q "une" and publishedYear "1965" only

  Scenario: Staff apply filters using only the keyboard
    Given staff are on the page
    When they Tab to "Author", "Title contains", "Year" and "Genre" filters, each with a visible label
    And press Enter in the "Title contains" field
    Then the filters are applied

  Scenario: The page shows an empty state when nothing matches
    When staff apply filters that match no books
    Then "No books match these filters." is shown

  Scenario: Clearing filters lists every book again
    Given filters are applied
    When staff press "Clear filters"
    Then every filter is empty and every book is listed

  Scenario: The latest filters win when results arrive out of order
    Given the response for the first filters has not arrived
    When staff apply Author "Jane Austen" and then Author "Frank Herbert"
    And the first response then arrives
    Then only the "Frank Herbert" results are shown
    And no error message is shown

  Scenario: Leaving the page while a list request is pending causes no error
    Given a list request has not arrived
    When the page is closed
    Then no error is reported

  Scenario: An invalid year filter is explained beside the Year filter
    Given the list shows all six books
    When staff enter Year "abc" and press "Apply filters"
    Then "Year must be a whole number of up to 4 digits, for example 1965" is shown beside the Year filter
    And keyboard focus moves to the Year filter
    And the six books stay listed, dimmed, with the note "Filters not applied — fix the highlighted filter"
    And no empty-state message is shown and the count still reads "6 books shown"
    When staff change the Year filter
    Then the Year error disappears
    When staff enter Year "1965" and press "Apply filters"
    Then the note is gone and only "Dune" is listed

  Scenario: Registering with filters applied refreshes the filtered list
    Given Genre filter "Fantasy" is applied
    When staff register a "fantasy" book titled "Earthsea"
    Then "\"Earthsea\" registered." is announced and "Earthsea" is listed
    When staff register a "mystery" book titled "Rebecca"
    Then "\"Rebecca\" registered. It is hidden by the current filters — clear them to see it." is announced
    And "Rebecca" is not listed
```

**Steps:**

##### S25: API filters by author

**Complexity**: standard
**Scenarios**: Author matches whole names in any letter case; Author must match the whole name; Author matching ignores case for accented letters; A blank filter is ignored
**IMPLEMENT**: `AssetFilterSchema` in `@library/schemas`: strict object of optional trimmed strings; blank values become absent (D50); `author` only for now. Route uses `parseOrThrow` on `request.query`; repository `list({ filter })` adds `author_search = ?` with the JS-lowercased value (D48). Parameterised statements only.
**TEST**: `packages/schemas/src/__tests__/asset-filter-schema.test.ts` (blank → absent). Vitest acceptance test `apps/api/src/__tests__/filter-assets.test.ts` seeding the Background through `POST`: each author scenario.
**REFACTOR**: WHERE clause built from a list of `{ clause, value }` entries with `filter`/`map`.
**Files**: `packages/schemas/src/asset-filter-schema.ts`, `packages/schemas/src/index.ts`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/routes/list-assets.ts`, `apps/api/src/assets/asset-repository.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`

##### S26: API filters by title text

**Complexity**: standard
**Scenarios**: Title text matches any part of the title in any letter case; Title search treats special characters literally
**IMPLEMENT**: `q` in the filter schema; clause `instr(title_search, ?) > 0` with the lowercased value (D48).
**TEST**: `filter-assets.test.ts`: `UNE`, `%`, and the injection string.
**REFACTOR**: Confirm no value is concatenated into SQL.
**Files**: `packages/schemas/src/asset-filter-schema.ts`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`

##### S27: API filters by publication year

**Complexity**: standard
**Scenarios**: Year matches exactly; A well-formed year with no books returns an empty list; An invalid filter is rejected (publishedYear rows)
**IMPLEMENT**: `publishedYear` filter must match `^\d{1,4}$`, then becomes a number (D50); `published_year = ?` clause; failures go through `parseOrThrow` with the catalogue message.
**TEST**: Schema tests and `filter-assets.test.ts`: `1965` → `Dune`; `3000` → `200` empty; `abc`, `1965.5`, `01965`, 20-digit string → `400` with the exact message.
**REFACTOR**: No query-specific error mapper.
**Files**: `packages/schemas/src/asset-filter-schema.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`

##### S28: API filters by genre

**Complexity**: standard
**Scenarios**: Genre matches in any letter case; No matches returns an empty list; An invalid filter is rejected (genre row)
**IMPLEMENT**: `genre` filter lowercased then piped into `GenreSchema` (D25); `genre = ?` clause.
**TEST**: Schema tests and `filter-assets.test.ts`: `Science-Fiction` matches; `poetry` → `200 { items: [] }`; `romance` → `400` with exact message.
**REFACTOR**: Filter schema reads as one declarative object.
**Files**: `packages/schemas/src/asset-filter-schema.ts`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`

##### S29: API combines filters and rejects unknown parameters

**Complexity**: standard
**Scenarios**: Filters combine so every condition must hold; An invalid filter is rejected (unknown parameter row); A misspelt filter is rejected rather than ignored; A repeated filter is rejected
**IMPLEMENT**: Clauses joined with `AND`; strict filter schema rejects unknown parameters (D50); repeated parameters arrive as arrays and fail with the repeated-filter message.
**TEST**: `filter-assets.test.ts`: author + year; `authr=Frank` and `authr=Herbert` → `400` with exact message (pins D50); repeated `author` → `400` exact message.
**REFACTOR**: Split query building into `asset-filter-query.ts` only if the repository now has two responsibilities.
**Files**: `packages/schemas/src/asset-filter-schema.ts`, `packages/schemas/src/validation-messages.ts`, `packages/schemas/src/__tests__/asset-filter-schema.test.ts`, `apps/api/src/assets/sqlite-asset-repository.ts`, `apps/api/src/__tests__/filter-assets.test.ts`

##### S30: Page filter controls update the list

**Complexity**: standard
**Scenarios**: Staff filter the list on the page; Staff apply filters using only the keyboard; The page shows an empty state when nothing matches; Clearing filters lists every book again; The latest filters win when results arrive out of order; Leaving the page while a list request is pending causes no error
**IMPLEMENT**: `BookFilters` form inside the "Find books" section: labelled `TextField`s "Author", "Title contains", "Year" (`inputMode="numeric"`); `GenreSelect` with `All genres` and display labels; `Apply filters` (submit, so Enter applies) and `Clear filters` (D59). `App` holds applied filters. `build-asset-query.ts` (pure) sends only non-blank values. `useAssetList` aborts the previous request with `AbortController` and on unmount; an aborted request changes no state and shows no error. `BookListEmpty` shows `No books match these filters.` when any filter is applied.
**TEST**: Vitest + RTL + MSW `apps/web/src/__tests__/filter-books.test.tsx`: query parameters MSW receives; rows shown; genre options equal `All genres` + every label; labels by `getByLabelText` and Tab order; Enter in "Title contains" applies; empty-state text; clear resets inputs and lists all; gated first response released after the second → only second results and no alert; unmount while gated → no error and no React warning; axe passes.
**REFACTOR**: `App` composes only; mapping lives in `build-asset-query.ts`.
**Files**: `apps/web/src/components/book-filters/book-filters.tsx`, `apps/web/src/components/book-list/book-list-empty.tsx`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/api/list-assets.ts`, `apps/web/src/api/build-asset-query.ts`, `apps/web/src/app.tsx`, `apps/web/src/__tests__/filter-books.test.tsx`

##### S31: Page filter errors and registration with active filters

**Complexity**: standard
**Scenarios**: An invalid year filter is explained beside the Year filter; Registering with filters applied refreshes the filtered list
**IMPLEMENT**: `BookFilters` shows `rejected` list details beside the matching filter using `FieldError` and `group-details-by-field.ts`, moves focus to the first invalid filter, and clears a filter's error when it changes and all errors on the next Apply. On rejection `useAssetList` keeps the last good items; `BookList` shows them dimmed with the note `Filters not applied — fix the highlighted filter`, no empty state, and an unchanged count. After a successful registration, `RegistrationSuccess` waits until the reload settles, then announces once — adding the hidden-by-filters sentence if the new asset's `id` is not in the reloaded items.
**TEST**: In `filter-books.test.tsx`: Year `abc` → exact message as the Year filter's description, focus on Year, previous rows still present with the note, no empty-state text, count unchanged; editing Year clears its error; a valid Apply removes the note; with `fantasy` applied (MSW handler filters its in-test store by `genre`), `Earthsea` is announced and listed, `Rebecca` is announced with the hidden sentence only after its gated reload is released, and is not listed.
**REFACTOR**: List and register share `FieldError` and the grouping helper, not copies.
**Files**: `apps/web/src/components/book-filters/book-filters.tsx`, `apps/web/src/components/book-list/book-list.tsx`, `apps/web/src/components/register-book-form/registration-success.tsx`, `apps/web/src/hooks/use-asset-list.ts`, `apps/web/src/app.tsx`, `apps/web/src/__tests__/filter-books.test.tsx`

#### Slice 7: End-to-end journey and README completion

**Depends-on:** 4, 5, 6
**Files:** `apps/web/playwright.config.ts`, `apps/web/e2e/register-and-find-book.spec.ts`, `apps/web/e2e/support/build-unique-book.ts`, `apps/web/package.json`, `package.json`, `.gitignore`, `README.md`

**Behavior:**

```gherkin
Feature: Register and find a book end to end

  Scenario: Staff register a book and find it by author
    Given both apps are running
    When staff register a book with a unique ISBN and a unique author name
    And apply the Author filter with that name in lower case
    Then exactly that book is listed

  Scenario: Registering a duplicate ISBN shows an error beside ISBN
    Given a book with a unique ISBN and a unique author is registered
    When staff register another book with the same ISBN written as its hyphenated ISBN-10 form
    Then "A book with this ISBN is already registered — find it in the list" is shown beside the ISBN field
    And filtering by that author lists exactly one book

  Scenario: Staff register a book using only the keyboard with visible focus
    Given both apps are running
    When staff Tab through every form and filter control
    Then each control looks different when focused than when not focused
    And they can register a book by pressing Enter

  Scenario: The page fits a narrow screen
    Given the viewport is 360 pixels wide
    When staff open the page with books listed
    Then the page does not scroll horizontally

  Scenario Outline: README checklist (manual, on a clean clone)
    When the person runs <check>
    Then <outcome>
    And the result is recorded in Notes

    Examples:
      | AC    | check                                                                    | outcome                                                       |
      | AC-28 | the Prerequisites commands, including `node --version`                   | the version matches `.nvmrc`                                  |
      | AC-29 | `npm install --global corepack`, `corepack enable`, `pnpm --version`     | the pnpm version matches `packageManager`                     |
      | AC-30 | `pnpm install` then `pnpm dev`                                           | the page loads at 5173 and the API answers at 3000            |
      | AC-31 | the reset steps, then `DATABASE_PATH=<temp file> pnpm dev`               | the list is empty after reset; the override file is created   |
      | AC-32 | `pnpm test run`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, the Playwright commands | each passes                           |
      | AC-33 | `nvm use 22` then `pnpm install`; a shell with `corepack disable`; a second `pnpm dev` while the first runs | `ERR_PNPM_UNSUPPORTED_ENGINE`, `pnpm: command not found`, and `EADDRINUSE` respectively, each matching its Troubleshooting entry, and each documented fix works |
      | AC-38 | the four CI commands listed in the CI section                            | they match `ci.yml` and pass locally                          |
      | AC-24 | the page at 360 px width and at 200% zoom, using Tab only               | no page-level horizontal scroll; the table region scrolls and is reachable by Tab; text readable; focus ring visible; body, error and success text pairs from D74 pass 4.5:1 contrast |

  Scenario: A newcomer follows the README on a clean clone (manual)
    Given a clean clone on a machine with Node 24 LTS
    When they follow README.md from top to bottom using only its commands
    Then the page at http://localhost:5173 registers and lists books
```

**Steps:**

##### S32: Playwright register-and-find journey

**Complexity**: standard
**Scenarios**: Staff register a book and find it by author; Registering a duplicate ISBN shows an error beside ISBN; Staff register a book using only the keyboard with visible focus; The page fits a narrow screen
**IMPLEMENT**: `@playwright/test` in `apps/web` (devDependency), Chromium only (D68). `playwright.config.ts` `webServer` starts the API on 3100 with `DATABASE_PATH` in `apps/web/e2e/.data/` and the web app on 5174 with `API_URL=http://localhost:3100`, `reuseExistingServer: false` (D58). Root `test:e2e` script. `build-unique-book.ts` gives each test a unique valid ISBN (with its ISBN-10 form) and a unique author, so tests do not depend on an empty catalogue or on each other. `e2e/**` is outside Vitest's include (D56).
**TEST**: Playwright spec `apps/web/e2e/register-and-find-book.spec.ts` with role and label locators: the three scenarios; the focus check records each control's computed `outline` and `box-shadow` unfocused, then focused, and asserts they differ; at a 360 px viewport `document.documentElement.scrollWidth <= clientWidth`.
**REFACTOR**: Locators by role and label only; helpers in `e2e/support`.
**Files**: `apps/web/playwright.config.ts`, `apps/web/e2e/register-and-find-book.spec.ts`, `apps/web/e2e/support/build-unique-book.ts`, `apps/web/package.json`, `package.json`, `.gitignore`

##### S33: README Playwright section and clean-clone checklist

**Complexity**: trivial
**Scenarios**: README checklist (manual, on a clean clone); A newcomer follows the README on a clean clone (manual)
**IMPLEMENT**: README "Tests and checks": `pnpm --filter @library/web exec playwright install chromium` and `pnpm test:e2e` (AC-32), noting Playwright uses ports 3100 and 5174 and its own data file and runs locally only, not in CI (D40). Final read-through of every section from S6 and S10.
**TEST**: Manual, in a fresh `git clone` in a temp folder: run every checklist row, including reset, the `DATABASE_PATH` override, and reproducing wrong Node, missing `pnpm`, and a port in use; then the top-to-bottom walk-through ending with registering and filtering a book. Record each row's result in `### Notes`.
**REFACTOR**: Remove duplicated or stale README text.
**Files**: `README.md`

### Skipped (low value)

| Finding | Rationale (one line) |
|---|---|
| Separate tests for the SQLite repository | Every repository behaviour is observable and covered through the HTTP acceptance tests. |
| Vitest tests for the Vite proxy configuration | No branching logic; proven by the Playwright journey and the manual run. |
| Tests for `server.ts` signal wiring and `main.tsx` | No logic once start-up lives in `start-server.ts` (D56, D75); covered by Playwright and the manual run. |
| Tests asserting Tailwind classes | Styling has no behavioural signal; focus visibility is checked by Playwright, layout by the manual run. |

### Plan Decision Log

Numbered from D41; D37–D40 are in the main Decision Log above.

- D41 (2026-11-02): Threat modeling run (STRIDE) because the plan adds two API endpoints on an unauthenticated local service. High-threat mitigations (loopback binding, parameterised SQL with literal title search, React text rendering) are scenarios in S3, S26 and S11; the cross-site write mitigation (`415` for every non-JSON type, no CORS headers) is in S18. Accepted risks: no authentication (D32), no pagination (D26), DNS-rebinding reads of non-sensitive data.
- D42 (2026-11-02): External client `node:sqlite` (`DatabaseSync`), the only notable dependency, behaviour checked on Node 24.21: `new DatabaseSync(path)` throws `ERR_SQLITE_ERROR` errcode 14 when the folder is missing → `openDatabase` creates the folder first (S3); `run` on a duplicate ISBN throws `ERR_SQLITE_ERROR` errcode 2067 → `{ outcome: "duplicate-isbn" }` → `409` (S20); `all` with no rows returns `[]` → `{ items: [] }`; any other throw (for example `ERR_INVALID_STATE` on a closed database) propagates → `500 InternalError`, logged at `error` (S22). No other external client calls.
- D43 (2026-11-02): Playwright: added `apps/web/e2e/register-and-find-book.spec.ts` — register then find by author filter, duplicate-ISBN sad path, keyboard-only registration with visible focus (AC-24, AC-26, AC-27). Run locally with `pnpm test:e2e`; not in CI (D40). The `run-playwright-tests` and `start-app` skills target `ui-dashboard` and do not apply here.
- D44 (2026-11-02): Time is injected: `buildApp({ now })`, called once per registration; the year bound uses that value's UTC year through `buildCreateAssetSchema({ currentYear })` instead of a static `CreateAssetSchema` constant, because the bound changes every year and tests must be deterministic.
- D45 (2026-11-02): One 400 mechanism: routes call `parseOrThrow`, which throws `RequestValidationError`; the error handler alone maps it to `400 ValidationError` and logs `warn`. Routes stay parse → repository → reply. No `fastify-type-provider-zod`, to control the `details` shape (D20) without another dependency.
- D46 (2026-11-02): `details` mapping: field is the issue path joined with `.`; `unrecognized_keys` gives one entry per key; root-level issues and body-parse failures use `field: "body"`.
- D47 (2026-11-02): The `415` body is `{ error: "UnsupportedMediaType" }`; the spec gives only the status.
- D48 (2026-11-02): Case-insensitive matching stores `author_search` and `title_search` columns lowercased in JavaScript, because SQLite `LOWER` and `NOCASE` only fold ASCII. Title search uses `instr` so `%` and `_` are literal.
- D49 (2026-11-02): The final `assets` table (including search columns) and unique ISBN index are created in S2 with `IF NOT EXISTS`. There is no released database, so no migration framework; a mid-build data file is reset per the README.
- D50 (2026-11-02, decided by Human): `GET /assets` query rules: unknown parameters return `400` naming the parameter (consistent with D21; a typo such as `?authr=` would otherwise silently return every book — pinned by S29); blank values are treated as absent; repeated parameters return `400`; `publishedYear` must be 1–4 digits (`01965` and very long strings are `400`); a well-formed year with no books (for example `3000`) returns `200` with no items.
- D51 (2026-11-02): `POST` `genre` must be an exact lowercase enum value (`Fiction` is rejected); only the filter is case-insensitive, as the spec states. Explicit `null` is rejected; the web omits the field.
- D52 (2026-11-02, decided by Human): ISBN-10 and its ISBN-13 equivalent are the same book. After stripping hyphens and spaces and validating the checksum, every ISBN is stored and returned as canonical ISBN-13: an ISBN-10 gets the `978` prefix and a recalculated check digit. The unique index is on the canonical value, so registering the other form returns `409`. Lowercase `x` is accepted as the ISBN-10 check digit; `X` is valid only there; ISBN-13 prefixes are not otherwise checked (checksum only, D13). Pinned by S7 and S20.
- D53 (2026-11-02): `@library/schemas` is source-only (exports point at `src/index.ts`); Vite, tsx and Vitest consume TypeScript directly, so there is no build step.
- D54 (2026-11-02): The API `dev` script uses `tsx watch`, because it resolves workspace TypeScript imports without `.ts` extensions; Node's built-in type stripping does not.
- D55 (2026-11-02): Each package has its own Vitest config with v8 coverage enabled and 100% thresholds; package `test` scripts are plain `vitest`; root `test` is `pnpm -r test`, so `pnpm test run` runs `vitest run` per package (verified in S1, AC-25). Playwright is separate (`pnpm test:e2e`).
- D56 (2026-11-02): Vitest `include` covers `src/**/__tests__/**` only, so `e2e/**` never runs under Vitest. Coverage excludes `src/test-support/**`, `e2e/**`, `*.config.ts`, `apps/api/src/server.ts` and `apps/web/src/main.tsx`; the last two only wire config and signals to covered functions and are exercised by Playwright and the manual run.
- D57 (2026-11-02): Oxlint (D38) with the `typescript`, `react`, `react-hooks`, `jsx-a11y` and `vitest` plugins enabled in one root `.oxlintrc.json`; `react/no-danger` and `typescript/no-explicit-any` set to error; warnings fail `pnpm lint` (`--deny-warnings`). oxfmt formats everything with one root `.oxfmtrc.json`. Oxlint has limited type-aware rules, so `pnpm typecheck` (strict `tsc --noEmit`) stays the gate for type rules.
- D58 (2026-11-02): The API reads `PORT` (default 3000) and the web proxy reads `API_URL` (default `http://localhost:3000`), so Playwright runs isolated on 3100/5174 with its own data file and never touches a running dev session or its data. The API host is fixed to `localhost` (D41).
- D59 (2026-11-02): Filters apply on an explicit `Apply filters` submit (Enter in any filter field), with `Clear filters`, rather than on each keystroke: deterministic, keyboard friendly, no debounce timers. A superseded or unmounted list request is aborted silently.
- D60 (2026-11-02): No client-side validation; inline errors come from the API (D20). The Year input is text with `inputMode="numeric"`: blank (or whitespace-only) Year and blank optional genre are omitted, so the API answers `Enter a year`; digits are sent as a number; anything else as the raw string so the API names `publishedYear`.
- D61 (2026-11-02): Web API layer is split: `list-assets.ts`, `register-asset.ts`, `build-asset-query.ts` (pure), `to-client-result.ts` (pure status mapping). Every response is parsed with the shared response schemas. Register: `201` + valid asset → `created`; `400` or `409` + valid error body → `rejected(details)`; anything else (network error, other status such as `413`, `415`, `500`, unreadable body) → `unavailable`. List: `200` + valid → `listed`; `400` + valid → `rejected(details)`; anything else → `unavailable`; an aborted request → no state change. `App` owns `useAssetList({ filters })` and passes its `reload` to the form as `onRegistered`.
- D62 (2026-11-02): Vite `build.assetsDir` is `static`, so built files never collide with the proxied `/assets` API path.
- D63 (2026-11-02): `AssetRepository` is async (`insert`, `list`, `close`) though `node:sqlite` is synchronous, so a future store fits D18 without changing routes. `openDatabase` owns opening and schema; `createSqliteAssetRepository({ database })` owns queries. `insert` returns `{ outcome: "created", asset } | { outcome: "duplicate-isbn" }`; other failures throw.
- D64 (2026-11-02): Default data path resolves from the API package directory, so `pnpm dev` from the root and `pnpm --filter` both use `apps/api/data/library.db`.
- D65 (2026-11-02): Schema rules are tested in `@library/schemas` against its exported schemas (it is a public package with its own coverage gate); API tests cover the HTTP mapping with each acceptance example's status and message.
- D66 (2026-11-02): Fastify 5 receives a pino instance through `loggerInstance`; tests pass one writing to an in-memory array. Default request logging stays at `info`; request bodies are never logged.
- D67 (2026-11-02): Library versions: current majors at build time (Fastify 5, Zod 4, React 19, Vite, Tailwind 4, Vitest, MSW 2, Playwright, vitest-axe). pnpm pinned to the current release in `packageManager`.
- D68 (2026-11-02): Playwright runs Chromium only; one browser proves the journey for a local tool.
- D69 (2026-11-02): Staff-facing validation and conflict messages are produced by the API, from one catalogue in `@library/schemas` (`validation-messages.ts`), using page field names; the page shows `details[].message` verbatim. One source of wording for API and page, no web-side mapping table to drift. Page-only copy (success, empty, loading, retry) lives as constants in its component. Exact text is in the Message Catalogue.
- D70 (2026-11-02): Fastify 4xx errors other than validation and media type (for example `413`) keep their status with `{ error: "RequestRejected" }` and a `warn` log; only non-4xx or unknown errors become `500 InternalError`.
- D71 (2026-11-02): While a registration is pending the submit button uses `aria-disabled="true"` and ignores activation instead of the `disabled` attribute, so keyboard focus is not lost; this meets AC-21 (assistive technology reports it as disabled).
- D72 (2026-11-02): Required fields carry `required` for semantics; the form has `noValidate` so the browser's own validation bubbles never pre-empt the API's messages (D60).
- D73 (2026-11-02): Genre slugs stay the values sent and stored; the page shows display labels from `apps/web/src/genre-labels.ts` (for example `science-fiction` → `Science fiction`). A missing genre is always `No genre` (list cell and form option); the filter's empty option is `All genres`.
- D74 (2026-11-02): `vitest-axe` (devDependency) runs in every page test file so CI checks accessibility rules on each tested state; jsdom cannot check colour contrast, so the manual S33 row checks these Tailwind pairs on `white`: body text `slate-900`, secondary text `slate-600`, error text `red-700`, success text `green-800`, focus ring `blue-600` (each meets 4.5:1 for text, 3:1 for the ring).
- D75 (2026-11-02): `startServer({ config, loggerInstance })` owns open, listen and `stop`, and is tested (loopback addresses, clean stop); `server.ts` only resolves config and wires signals.
- D76 (2026-11-02): Fastify's default `text/plain` parser is removed, so `text/plain`, form and multipart bodies, and bodies without a content type all get `415`. If the installed Fastify answers a missing content type differently, S18 adds a catch-all content-type parser that raises `415`.
- D77 (2026-11-02): Error handler dispatch is flat and ordered: `RequestValidationError` → JSON parse errors → media type → other 4xx (D70) → `500` (D24).
- D78 (2026-11-02): The overlapping-registrations test proves the outcome (one book, one `409`); the absence of any read-before-write makes the unique index the only guard, so the test covers D19.
- D79 (2026-11-02): Pending network states in web tests use gated deferred promises (`createGate`), never timers, so scenarios are deterministic.
- D80 (2026-11-02): Wrong Node is caught by `engineStrict: true` in `pnpm-workspace.yaml` (moved from `.npmrc` at S33): `pnpm install` on a Node outside `engines` fails with `ERR_PNPM_UNSUPPORTED_ENGINE`, which the README Troubleshooting entry quotes. Chosen over relying on a Node 20 `node:sqlite` import error, which appears later and less clearly.

- S1 (2026-11-02, build): Dev dependencies pinned to the newest releases at least 7 days old, to respect the user's `min-release-age=7` (no `minimumReleaseAgeExclude`): vitest/@vitest/coverage-v8 5.0.5, oxlint 1.89.0, oxfmt 0.74.0, oxlint-tsgolint 7.0.2005, typescript 7.0.2, zod 4.6.7; `packageManager` pnpm@12.15.0.
- S1 (2026-11-02, build): `.oxfmtrc.json` ignores `.claude/**`, `docs/**`, `CLAUDE.md`, `instructions.md`, `README.md` (pre-existing unformatted files); drop the README entry once a later step formats it.
- S1 (2026-11-02, build): `tsconfig.base.json` adds `allowImportingTsExtensions` (tests import `.ts` paths, `noEmit`); vitest configs set `coverage.enabled: true` so plain `vitest` enforces 100%; `COVERAGE_THRESHOLD_PERCENT` stays above the export to avoid a TDZ error.

- S2 (2026-11-02, build): Runtime deps pinned at least 7 days old: fastify 5.12.7, pino 10.4.0. `node:sqlite` loads under Vitest default pool on Node 24; `forks` not needed (residual risk closed).
- S2 (2026-11-02, build): `assets` columns inferred from D48/D50: id, title, author, isbn (unique index), published_year, genre, created_at, title_search, author_search. `AssetSchema` stub: id uuid, title, author, isbn, publishedYear int, genre nullable, createdAt ISO; S7 completes it.
- S2 (2026-11-02, build): `list` runs the ordered SELECT but returns `[]` with a TODO for S9 row mapping (avoids uncovered code). `buildApp` accepts `now` unused until S8. `buildTestApp` returns `{ app, repository, logCapture }`; `createLogCapture` returns `{ loggerInstance, readEntries }`.
- S3 (2026-11-02, build): `startServer` also takes a required `now: () => Date` (buildApp needs it; `server.ts` passes the real clock). `openDatabase` skips `mkdir` for `:memory:`. `zod` 4.6.7 and dev `tsx` 4.23.15 added to `apps/api`. Extra invalid PORT cases `1.5` and empty string.
- S3 (2026-11-02, build): pnpm reported "Ignored build scripts: esbuild" (tsx dependency); `pnpm approve-builds` not run. Confirm `tsx watch` works in S6. Known gap for review: if `listen` fails, `startServer` does not close the database.
- S4 (2026-11-02, build): Web versions (newest at least 7 days old): react/react-dom 19.2.9, vite 8.3.5, @vitejs/plugin-react 6.1.2, tailwindcss/@tailwindcss/vite 4.3.3, msw 3.0.3, @testing-library/react 16.3.3, jsdom 30.1.3, vitest-axe 0.1.0. Deviation from D67 "MSW 2": MSW 3 is the current major (D67 intent: current majors); `listen` uses `onUnhandledFrame: "error"`.
- S4 (2026-11-02, build): Live region is `<output aria-live="polite">` (oxlint jsx-a11y). Page-title test parses `index.html` with DOMParser. `vitest-axe.d.ts` declares matcher types for vitest 5. No jest-dom. `globals: true`. Extra coverage tests: non-200, malformed body, unmount while pending. `listAssets` filters typed `Readonly<Record<string,string>>` until S30. Singular "1 book shown" deferred to S11 (TODO in `book-list.tsx`).
- S5 (2026-11-02, build): CI: `actions/checkout@v4`, `actions/setup-node@v4`, single job `checks`, concurrency group `ci-${{ github.workflow }}-${{ github.ref }}`; toolchain check inline bash (Node major from `.nvmrc`, pnpm from `packageManager` via `node -p`). Local proofs all failed as expected; pnpm-mismatch via `packageManager` alone does not fail because pnpm 12 self-switches to `packageManager` — proved with a stub `pnpm` on PATH instead. AC-35–37 await real CI runs (P1).
- S5 (2026-11-02, build): Repair: S2 left `asset-schema.ts`/`asset-list-response-schema.ts` uncovered within `packages/schemas` (S2 evidence ran only `apps/api`); added a schemas acceptance test. Later steps record evidence in every package they touch.
- S6 (2026-11-02, build): `pnpm dev` verified with curl: API and Vite proxy both return `{"items":[]}`, page HTML served; esbuild ignored-builds warning is harmless. No browser available, so rendered "No books registered yet." not seen (S33 clean-clone checklist covers it). Global corepack install, `corepack enable`, `nvm use` and `ERR_PNPM_UNSUPPORTED_ENGINE` not exercised.
- S7 (2026-11-02, build): `buildCreateAssetSchema({ currentYear })` takes `_options` unused until Slice 3 year rule. `VALIDATION_MESSAGES` is one `as const` object (title/author/isbn/year required, genre invalid) attached via Zod `{ error }`; `genreInvalid` not yet attached to `GenreSchema.optional()`.
- S7 (2026-11-02, build): `genre` is optional in the parsed output: the API (S8) must map absent to `null`. `CreateAssetInput` = `z.infer` of the built schema. ISBN-13 check digit uses index-parity weights (no lookup array) to keep branches coverable.
- S8 (2026-11-02, build): `InsertAssetResult` has only `created` until S20 adds `duplicate-isbn` (TODO). Error handler forwards non-validation errors via `reply.send(error)` (Fastify default 500 until S22). `details` = `{ field: path.join(".") || "body", message }`; D46 `unrecognized_keys` handling left for S17. Info log "Asset registered".
- S8 (2026-11-02, build): Extra coverage tests: missing title 400, no body 400 with field `body`, store failure 500 (repository stub). `buildCreateAssetRequest` defaults: ISBN 978-0-306-40615-7, year 1965, genre science-fiction. oxfmt only finds targets when run from the repo root; package-level `oxfmt --check` may be vacuous — later steps use `pnpm -w format:check`.
- S9 (2026-11-02, build): `list` orders `created_at DESC, rowid DESC` and maps rows with pure `mapRowToAsset` validated by `AssetSchema.parse` (no type assertion); S2 TODO resolved. Newest-first tests build the app directly with a mutable clock because `buildTestApp` takes only a fixed clock.
- S10 (2026-11-02, build): README Data section sits between "Install and run" and "Tests and checks": file location, reset via stopping `pnpm dev` and `rm apps/api/data/library.db`, `DATABASE_PATH=/tmp/library.db pnpm dev` example. Persistence test setup kept separate from `start-server.test.ts` (different lifecycle).
- S11 (2026-11-02, build): Scroll wrapper is `<section aria-label="Books list" tabIndex={0}>` with a justified `oxlint-disable-next-line no-noninteractive-tabindex` (scrollable region must be focusable, WCAG 2.1.1). sr-only caption "Registered books". `BookCount` renders an empty live region until the list loads. `GENRE_LABELS: Record<Genre,string>`; only "Science fiction" was specified, other labels are sentence-cased by the engineer. S4 TODO resolved.
- S12 (2026-11-02, build): Added dev dependency `@testing-library/user-event` 14.6.8 (published 2026-10-13). `toRegisterResult` returns `created` or `unavailable` (D61); hook ignores `unavailable` until S23, `rejected` until S19. `useAssetList` returns `{ listState, isReloading, reload }`; table shows `aria-busy` + `opacity-50` while reloading.
- S12 (2026-11-02, build): `RegistrationSuccess` uses `<output>` (implicit status role; oxlint rejects `role="status"` on `<p>`). Two status regions now exist, so `list-books.test.tsx` queries are scoped to the "Find books" region (assertions unchanged). `registerAssetHandler` added to test-support.
- S13 (2026-11-02, build): `useRegisterAsset` owns `isPending` (cleared in `finally`); button uses `aria-disabled` (renders "false" when available, never `disabled`) and reads "Registering…"; the pending guard is an early return in the form submit. Break-the-behaviour check not run for the new test (CLAUDE.md requires it; check in Step 7).
- S14 (2026-11-02, build): `ValidationErrorResponseSchema` = `{ error: "ValidationError", details: [{ field, message }] }`, exported with its type. Null title/author gets the required message. The combined-failure API test uses a numeric ISBN ("Enter an ISBN") instead of the Gherkin "12345" until S15 adds the checksum rule; S15 should switch the example back.
- S15 (2026-11-02, build): `isbn` pipeline: trim → min 1 ("Enter an ISBN") → normalise → `isValidIsbn` refine (ISBN-10 mod 11 or ISBN-13) → canonical transform; blank never also gives the invalid message. `isbnInvalid` message added. S14 carry-over done (combined test uses "12345").
- S16 (2026-11-02, build): Exported `buildYearOutOfRangeMessage({ earliestYear, currentYear })` (parameterised, so not on `VALIDATION_MESSAGES`); 1450 lives in `EARLIEST_PUBLISHED_YEAR`. Year type error: undefined → "Enter a year", any other wrong type (e.g. "1999", null) → range message. `_options` carry-over removed. API test `register` helper takes optional `now`.
- S17 (2026-11-02, build): Genre message via `z.enum(GenreSchema.options, { error: genreInvalid }).optional()` (`genre-schema.ts` unchanged); schema is `.strict()`. Exported `buildUnrecognisedFieldMessage(field)` from the catalogue; API mapper names unknown fields as `[...issue.path, key].join(".")`, one detail per unknown field. S7/S8 carry-overs resolved.
- S18 (2026-11-02, build): Residual risk closed (Fastify 5.12.7): invalid JSON → `FST_ERR_CTP_INVALID_JSON_BODY` 400; empty JSON or JSON type with no body → `FST_ERR_CTP_EMPTY_JSON_BODY` 400; with `text/plain` parser removed, text/form/multipart/no content type → `FST_ERR_CTP_INVALID_MEDIA_TYPE` 415; over 1 MiB → `FST_ERR_CTP_BODY_TOO_LARGE` 413. D76 holds; no catch-all parser.
- S18 (2026-11-02, build): `VALIDATION_MESSAGES.bodyNotJsonObject` matches the catalogue; empty-path issues map to `field: "body"`. S8 "no body" test now sends `content-type: application/json` (no content type is 415 per D76).
- S19 (2026-11-02, build): `toRegisterResult` maps 400 with a valid body to `rejected`; 400 with an unparseable body stays `unavailable`; 409 left for S21. First detail per field shown; focus via `form.elements.namedItem`; `FormAlert` always mounted (empty `role="alert"`). Year-range message is a literal in the web test because `buildYearOutOfRangeMessage` is not exported from the schemas index (review: export it or accept).
- S20 (2026-11-02, build): `InsertAssetResult` gains `duplicate-isbn` via `isUniqueConstraintError` (SQLite code constants); other errors rethrow (covered at repository level; S22 adds the HTTP 500). `VALIDATION_MESSAGES.isbnDuplicate`; `DuplicateIsbnResponseSchema` with `field: "isbn"`. Warn log `{ field: "isbn" }` "Duplicate ISBN rejected", no submitted values. Register route handler typed `Promise<unknown>` (review: tighten to a union).
- S21 (2026-11-02, build): `toRegisterResult` uses a flat `REJECTION_SCHEMAS_BY_STATUS` map (400 → ValidationError, 409 → DuplicateIsbn); a parsed body is `rejected`, anything else `unavailable`. An unparseable 409 currently shows nothing — S23 retry message should cover it (`unavailable`).
- S22 (2026-11-02, build): Fallback logs `request.log.error({ err: error }, "Request failed")` and replies `500 { error: "InternalError" }` with no error detail. `InternalErrorResponseSchema` exported. Test closes the real repository to force failures on POST and GET.
- S23 (2026-11-02, build): `RegisterBookForm` tracks `isUnavailable` (cleared on submit) and passes the retry message to `FormAlert`; unparseable 400/409, network error, 500, 413 and an invalid 201 body all show it. Two S21 tests now expect the retry message. Retry copy is a local constant in the form file, not a shared catalogue constant (review).
- S24 (2026-11-02, build): `toListResult` maps a valid 400 to `rejected` (shared `toRejectedResult`, `UNAVAILABLE_RESULT`). `BookListError` with Retry; focus-after-retry in `use-focus-after-retry.ts` (heading `tabIndex=-1` only with `headingRef`); focus stays put when retry fails again. Extra 400 row in the list-failure outline.
- S24 (2026-11-02, build): Carry-over to S30/S31: the "typed form values survive a failed reload triggered by Apply" scenario was tested via Retry because Apply filters does not exist yet; re-test it with the real Apply button.
- S25 (2026-11-02, build): Blank filter values become absent (`.trim()` + empty → undefined). Repository `list({ filter })` (required); `buildConditions` returns `{ clause, value }` entries joined with AND, values always bound as `?` parameters. Filter tests seed 6 books via POST in `beforeEach` without status assertions (oxlint `no-standalone-expect`).
- S26 (2026-11-02, build): `q` uses shared `OptionalTrimmedText` with `author`; repository condition `instr(title_search, ?) > 0` (bound, so `%` is literal). Mutation check not run on the two new schema tests.
- S27 (2026-11-02, build): `VALIDATION_MESSAGES.publishedYearFilterInvalid` (catalogue text). `PublishedYearFilter` = `OptionalTrimmedText` piped to a 4-digit regex + `Number` (blank stays absent). `FilterCondition.value` is `string | number | undefined`. `YEAR_FILTER_PATTERN` sits above its use (TDZ at module load) — deviation from constants-at-bottom, like S1 `COVERAGE_THRESHOLD_PERCENT`.
- S28 (2026-11-02, build): Genre filter: `OptionalTrimmedText` → lowercase → genre enum with `genreInvalid` (blank ignored, D25 case-insensitive). Filter test fixture "Emma" now registered with `genre: undefined` to match the Background table (factory default is science-fiction).
- S29 (2026-11-02, build): Exported `buildUnrecognisedFilterMessage` and `buildRepeatedFilterMessage`. `parse-or-throw`/`toValidationDetails` take an optional `buildUnrecognisedMessage` (defaults to the body-field builder) so query and body share one mapping. Any repeated filter parameter (array input) gives the repeated message. `asset-filter-query.ts` split not needed.
- S30 (2026-11-02, build): `AssetFilterValues {author,title,publishedYear,genre}` with `NO_FILTERS` and `hasActiveFilters` in `build-asset-query.ts` (`title` → `q`). `TextField`/`GenreSelect` gained optional `idPrefix`, `isRequired`, `label`, `emptyLabel`; filters use prefix `filter-books`. Existing web tests query the register form via a `registerForm()` helper (no assertion changes).
- S30 (2026-11-02, build): "Unmount while pending" test is not discriminating under React 19 (no warning on post-unmount update); kept as a regression guard (review). List 400 still shows "unavailable" until S31. S24 Apply carry-over passed to S31.
- S31 (2026-11-02, build): Filter rejections show beside each filter (`FieldError` + `groupDetailsByField` with optional `fieldNames`; API `q` remapped to `title`); focus to first invalid filter; edit clears that error, Apply/Clear clear all. `AssetListState` gains `rejected { items, details }`: last good items stay dimmed (`BookTable isDimmed`, no `aria-busy`) with a note.
- S31 (2026-11-02, build): `RegistrationSuccess` announces after the reload settles, adding the hidden-by-filters sentence when the new id is not listed; a failed/rejected reload announces plain "registered.". Apply/Clear pass a fresh filter object so identical filters reload. S24 Apply carry-over done (new Apply test; Retry test kept). 400 row removed from the list-unavailable outline (now a filter error).
- S32 (2026-11-02, build): `@playwright/test` 1.64.1 (published 2026-10-14); Chromium installed without sudo. e2e uses API port 3100 and web port 5174; `DATABASE_PATH` `../web/e2e/.data/library.sqlite` (persists; unique ISBNs keep runs independent). `apps/web/tsconfig.json` now includes `playwright.config.ts` and `e2e/**/*.ts`. Focus check requires a visible indicator (outline or box-shadow not none).
- S32 (2026-11-02, build): Fix found at S32: pnpm 12 exits 1 on `ERR_PNPM_IGNORED_BUILDS` for esbuild, so `pnpm install --frozen-lockfile` (CI, README) failed since S3. `pnpm-workspace.yaml` now denies esbuild build scripts explicitly (`allowBuilds: { esbuild: false }`); tsx, Vite and Playwright all work without it. Not approved via `approve-builds` (keeps supply-chain exposure unchanged).
- S33 (2026-11-02, build): Fix found at S33 (AC-33): pnpm 12 does not read `engine-strict` from `.npmrc`, so Node 22 installed silently. D80 mechanism moved to `engineStrict: true` in `pnpm-workspace.yaml`; `.npmrc` deleted. Node 22 now fails with `ERR_PNPM_UNSUPPORTED_ENGINE`, which README quotes.
- R1 (2026-11-02, review, user decision): js-fp-review error (inline `randomUUID()` in the register route) — user chose to inject an id generator: `buildApp` takes `generateId` alongside `now`; deviation from the S8 block, which put `randomUUID()` in the route.
- R1 (2026-11-02, review, user decision): security-review warning (no Host-header allow-list, DNS rebinding) — user kept D41 as an accepted risk while the tool stays local-only; finding recorded as skipped.

### Notes

- Run id: LIBRARY-BOOKS@02fde67-20261102T184748Z
- Build mode: Autopilot (build-plan invoked directly; software-engineer temporarily on haiku/low effort for this POC).
- Plan approved: 2026-11-02T17:32:26Z
- No Jira ticket; `LIBRARY-BOOKS` is used as the key. The plan lives in `instructions.md` under `## Implementation Plan` instead of `PLAN.md`.
- Spec read from `docs/specs/library-book-tracking.md` (gate passed; Ambiguity Log settled, including the CI and Oxlint/oxfmt rows added mid-planning).
- `docs/guidelines/` does not exist, so the React, Remix, Unit Testing, Playwright and Logging guideline documents linked from `CLAUDE.md` could not be read; the plan follows `CLAUDE.md` alone. Remix guidance does not apply (Vite SPA). `@sme-lending/logger` is unavailable (D10).
- CI: the repository has an `origin` remote on GitHub. S5's default proof is local; AC-35–37 are confirmed only once the first PR run and the first push-to-main run are green. Record both run links here.
- README checklist results (S33, scratch copy of the working tree, 2026-11-02):
  - AC-28 Node version: pass (v24.21.0 matches `.nvmrc`).
  - AC-29 Corepack/pnpm: pass, partial (pnpm 12.15.0 matches `packageManager`; global `npm install --global corepack` and `corepack enable` not re-run).
  - AC-30 Install and run: pass (`pnpm install` clean; API and Vite proxy return `{"items":[]}`; page HTML served; rendered page not viewed, no browser).
  - AC-31 Data: pass (reset by deleting `apps/api/data/library.db`; `DATABASE_PATH` override creates its own file).
  - AC-32 Tests and checks: pass (schemas 90, api 109, web 63 tests at 100% coverage; lint, format check, typecheck; Playwright 4 passed).
  - AC-33 missing pnpm: pass (`pnpm: command not found`). Port in use: pass (`EADDRINUSE ::1:3000`; Vite moves to another port silently). Wrong Node: pass after fix (initially failed; see S33 Plan Decision Log entry) — `ERR_PNPM_UNSUPPORTED_ENGINE`.
  - AC-38 CI section: pass (commands match `ci.yml`).
  - AC-24 zoom/keyboard/contrast: not verified manually (no browser); Playwright 360 px and visible-focus tests pass.
  - Walk-through: pass via API through the proxy (register Dune, find by `q` and full author); browser UI covered by Playwright only.
- User answered the open questions: ISBN-10/ISBN-13 equivalents are the same book, stored as canonical ISBN-13 (D52, main D13 updated); unknown query parameters return `400` (D50). Spec re-read after the update.
- Residual risk: `node:sqlite` must load under Vitest's worker pool on Node 24 (confirm in S2; use the `forks` pool if threads fail).
- Resolved in S18 (Fastify 5.12.7 confirmed D76; Oxlint/oxfmt flags confirmed in S1; `node:sqlite` confirmed in S2). Original note: Fastify 5's handling of a body with no content type (D76) and its parse-error codes for invalid and empty JSON must be confirmed in S18; Oxlint and oxfmt option names (`--deny-warnings`, `--check`, plugin keys) must be confirmed in S1.
- Step 6 (2026-11-02): full suite green — schemas 90, api 109, web 63 Vitest tests, all at 100% coverage; `pnpm typecheck` per package, root `pnpm lint`, `pnpm format:check` and `pnpm test:e2e` (4 passed) exit 0; logs under `.claude/metrics/runs/<run id>/logs/`. `pnpm install --frozen-lockfile` exits 0 (S32/S33 fixes). UI check: `verify-ui-journey` targets `ui-dashboard` and does not apply; the Playwright journey is the browser proof. No extra gap tests added in Step 6; known test-quality items are left for Step 7: S13 and S26 schema tests not mutation-checked; S30 "unmount while pending" test not discriminating under React 19.
- Review started: 2026-11-02T19:48:37Z
- Review panel (Step 7, run id above): reviewers run — spec-compliance-review, a11y-review, arch-review, component-architecture-review, concurrency-review, doc-review, domain-review, js-fp-review, naming-review, performance-review, react-reactivity-review, structure-review, test-review, test-smell-review, correctness-review, security-review, refactor-opportunity-review. Skipped — logging-review (not selected by the resolver; no Remix loaders/actions). doc-review round 1 wrote invalid JSON and was re-dispatched once.
- Review outcome: round 1 raised 7 errors and 55 warnings; 2 fix iterations (two parallel fixers split web / api+schemas+root, then one fixer for the user-decided id generator and doc warnings). Round 2 re-ran the 12 reviewers with fixed findings: 0 errors, 33 warnings, 25 suggestions remaining. Remaining warnings are mostly judgment items the fixers deliberately skipped (larger hook/test restructures, repo-wide Asset/Book and q/title renames, timeout values, test-support state) — accepted as residual; recorded with outcome `escalated` in review metrics. User decisions: id generator injected; D41 Host-header risk kept.
- Final full run after fixes: schemas 90, api 111, web 66 Vitest tests at 100% coverage; typecheck, lint, format check, `pnpm test:e2e` (4 passed) and `pnpm install --frozen-lockfile` all exit 0. `oxfmt` already clean (format check passes), so no `--write` changes.
- Residual risks / follow-ups: AC-35–37 await the first real CI runs (P1); AC-24 manual zoom/keyboard/contrast walk-through not done (no browser); spec-compliance-review-r1-1 (manual README walk-through in a browser) open; 33 review warnings listed in `.claude/metrics/runs/<run id>/round-2/`.
- Test quality (test-design-reviewer): Farley Score 6.9/10 (Good) — Understandable 8, Maintainable 6, Repeatable 8, Atomic 8, Necessary 6, Granular 6, Fast 7, First 6. Its merge blocker (`as HTMLInputElement` casts in `register-book-errors.test.tsx`) is fixed. Deferred follow-ups: duplicated validation tables across schemas and api tests; split sprawling web tests; replace DOM-id/`DatabaseSync.prototype.close` coupling with accessible queries/outcomes; tidy `list-assets.test.ts` seeding; align web test names to Given-When-Then; tie the narrow-screen Playwright test to an AC.
- Playwright: added `apps/web/e2e/register-and-find-book.spec.ts` (register, find by filters, duplicate-ISBN sad path, keyboard-only registration, visible focus, 360 px) per the Step 4 decision; local only, not in CI.
- React guidance: `docs/guidelines/REACT_COMPONENT_GUIDELINES.md` does not exist; CLAUDE.md's React rules were followed (one responsibility per component; `App` composes). Remix guidance does not apply (Vite SPA).
- Test improvements (2026-11-02, after Step 7, user request): Farley follow-ups done. Validation tables live in the schemas tests; API keeps one case per HTTP outcome/field (api 111 → 85 tests). `buildTestApp` accepts `now`; `list-assets.test.ts` uses it, asserts 201 seeds and explicit ISBNs. `start-server.test.ts` asserts outcomes (restart on same file, double stop, `EADDRINUSE`) and keeps two `DatabaseSync.prototype.close` spies, commented, because handle release is not observable with a rollback journal. Web tests split to one behaviour each, Given-When-Then names, accessible-description helper instead of DOM ids, genre options derived from `GenreSchema.options`, one axe check per state with each file ending in axe (web 66 → 84). Playwright narrow-screen test named for AC-24. Full run: schemas 90, api 85, web 84 at 100% coverage; typecheck, lint, format check, `pnpm test:e2e` (4 passed) exit 0.

### Plan Review Summary

Plan tier: complex — reviewers: Acceptance, Design, UX, Strategic (none skipped)

- Round 1: all four returned needs-revision. Blockers: UX error copy undefined; Acceptance README AC-31/33 without scenarios, CI AC-35/36 without scenarios, AC-23 list failure incomplete. All fixed (Message Catalogue, README checklist, CI scenarios with local proof, AC-23 outlines).
- Round 2 (Acceptance and UX re-run as the blocker raisers): Acceptance approve; UX needs-revision on warnings only, no blockers. Round-2 warnings from both were folded into existing steps without a third review round.
- Design and Strategic raised warnings only in round 1; all addressed (Depends-on, error-handler dispatch, single 400 path, web API split, start-up coverage, repository split, local-first CI proof).
- Residual observations worth keeping:
  - `node:sqlite` under Vitest's worker pool must be confirmed in S2.
  - Fastify 5 behaviour for a missing content type and its JSON parse-error codes must be confirmed in S18 (D76).
  - Oxlint and oxfmt flag names must be confirmed in S1.
  - The overlapping-registration test is an outcome check; synchronous SQLite means it is not true concurrency (D78).
  - DNS-rebinding reads of the catalogue are an accepted risk while the tool stays local (D41).

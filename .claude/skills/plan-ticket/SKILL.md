---
name: plan-ticket
description: >-
  Create the detailed implementation plan for a Jira ticket in PLAN.md:
  vertical slices with per-slice Gherkin scenarios, small implement-test-refactor
  steps, and an independent review by plan-review agents scaled to plan size.
  team-ticket and solo-ticket run this in their Step 4. Use directly when the user says "plan
  this ticket", "break this down", or "how should I implement PROJ-123", then hand
  over to team-ticket or solo-ticket to build.
argument-hint: "<TICKET-KEY> [spec path]"
user-invocable: true
---

# Plan ticket

Role: orchestrator. This skill creates a structured plan — it does not implement anything.

## Two ways in

| Caller | Behavior |
|---|---|
| `team-ticket` or `solo-ticket` Step 4 | The caller passes the ticket key, its Step 3 understanding, the existing `PLAN.md`, and the planner agent ID from Step 3. Write the detailed plan into that `PLAN.md`, then return to the caller. Do **not** ask for approval — the Step 4 STOP is the approval gate. |
| The user directly | Resolve the ticket (fetch it with Jira MCP when given a key). If `PLAN.md` exists for a different ticket, ask before replacing it. If `PLAN.md` already holds a plan for this ticket key with `## Slices`, do not plan again unless the user asks. When its `## Plan Review Summary` is filled in (a `Plan tier:` line naming the tier), the reviews finished: go straight to step 6 and present it. Otherwise the reviews did not finish: have a `planner` classify the existing plan (step 4) without rewriting it, then run step 5. Otherwise write the plan and present it for approval. On approval, suggest `team-ticket <KEY>` (or `solo-ticket <KEY>` for a less complex ticket) to build it. |

**Say which plan you are using.** When called directly, announce the plan source in chat, in bold on its own line, before any planning work or approval question: `**Plan: New plan created**` when this run writes the plan, or `**Plan: Existing plan used (approved <timestamp>)**` or `**Plan: Existing plan used (not yet approved)**` when it reuses one. Callers make the same announcement at their own Step 4.

## Constraints

**Confirm agent-dispatch capability before step 5.** Step 5 dispatches the
`plan-review-*` agents as parallel sub-agents. Before dispatch, confirm the
`Agent` tool is available. If it is not: **STOP.** Do not apply the reviewers'
checklists inline as a substitute, and do not present the plan as reviewed — a
self-certified pass is not a review. Tell the user that plan review cannot run
because no `Agent` tool is available, and that the plan cannot reach the
approval gate until it is re-run from a session that has one.

1. **Do not implement.** Produce only the plan. No code, no scaffolding, no file edits beyond `PLAN.md`.
2. **Every step is one behavior with a full cycle.** The cadence is Code-First Small Batches — each step follows IMPLEMENT → TEST → REFACTOR. The refactor runs in every cycle.
3. **Incremental.** Each step must leave the codebase in a working, committable state.
4. **Be concise.** The plan is the artifact; keep chat to decisions and gaps.
5. **State your approach stance.** For any high-reversal-cost axis in [`references/decision-defaults.md`](references/decision-defaults.md) the ticket touches (replace-vs-merge, format fidelity, migrate-vs-edit-stub, auto-merge-vs-direct, scope), state the chosen stance in `## Approach Stances` so it is visible — and correctable — at the approval gate.
6. **Follow the repository.** Apply `CLAUDE.md` and the guideline documents it links. Read the unit testing, React, Remix, and Playwright guidelines whenever the plan touches those areas.

## Who does what

Planning needs the strongest model; dispatching reviewers does not. Steps 1–4 are authored by the `planner` agent (Opus), and this session runs Steps 5–6 on whatever model it has.

- **Steps 1–4:** when the caller passes a planner agent ID (`team-ticket` or `solo-ticket` Step 3 already ran its understanding pass), use `SendMessage` to tell that planner to write the plan. Otherwise dispatch `planner` (by `subagent_type`) with the ticket key, the Step 3 understanding or the fetched ticket, the spec path if known, and the `PLAN.md` path. Do not author or edit the plan yourself. Keep the agent's ID for revisions.
- **Step 5:** dispatch the reviewers using the tier, reviewer set, and spec path from the planner's hand-back.
- **Revisions:** send every blocker to the same planner with `SendMessage`, so it revises with its context intact. If it can no longer be reached, dispatch a fresh `planner` with the blockers; it re-reads `PLAN.md`.

## Steps

### 1. Find the spec

Search `docs/specs/**` for a spec whose `**Jira:**` line matches the ticket key, or a spec path given by the caller or named in the ticket description. A spec may not be merged into the current branch yet, so search these locations in order and use the first match:

1. The current worktree: `grep -rl "\*\*Jira:\*\* <TICKET-KEY>" docs/specs/`.
2. The base branch (`main` unless the caller names another): `git fetch -q origin <base>`, then `git grep -l "\*\*Jira:\*\* <TICKET-KEY>" origin/<base> -- docs/specs/`. Read a match with `git show origin/<base>:<path>`.
3. The base branch's main checkout, for specs that are committed locally but not pushed, or not committed yet: find its path as the first `worktree` entry in `git worktree list --porcelain`, then search its `docs/specs/` directory the same way as in location 1.
4. The Jira ticket's spec comment, for specs written on another machine or by another developer: follow the "Read the comment" steps in [Jira spec comment](../specs/references/jira-spec-comment.md), which save the spec to `.claude/plans/jira-spec-<TICKET-KEY>.md`.

When the caller passes a path outside the worktree, read it from there. When the spec is found outside the current worktree, record its source (for example `Spec read from <absolute path>, not yet on this branch`, or `Spec read from Jira comment on <TICKET-KEY>`) in `## Notes`. Pass that absolute path, the `origin/<base>:<path>` ref, or the saved Jira copy's path to the reviewers. Do not copy the spec into the branch unless the caller asks.

A spec contains Intent Description, Architecture Specification, Acceptance Criteria, Glossary, and Ambiguity Log, and no Gherkin — authoring the scenarios is this skill's job.

- **Spec found:** it is the primary source for goals, constraints, and acceptance criteria. Ambiguity Log rows resolved by a human are settled decisions; do not ask them again. Where the ticket and spec disagree, the spec wins; record the mismatch in `## Notes`.
- **No spec:** plan from the ticket. Do not prompt for one. Record `No spec found — planned from the ticket` in `## Notes`.

### 2. Understand the task and cut the slices

Read relevant code and context to understand what needs to change. Keep exploration focused — this is planning, not research.

Then **decompose the feature into vertical slices**. A slice is a vertically deliverable increment — independently testable and, ideally, independently shippable. Sequence slices so `main` stays releasable at every step: land incomplete behavior behind a feature toggle or an abstraction, and order any data change as expand-before-contract rather than a single breaking change (see [`references/release-strategies.md`](references/release-strategies.md) and [`.claude/knowledge/database-change-management.md`](../../knowledge/database-change-management.md)). Each slice declares `Depends-on` so the build order is explicit. For each slice, **author the Gherkin scenario(s)** that define its observable behavior.

When authoring each slice's Gherkin, cover:

- **Happy path** — the primary success behavior.
- **Negative cases** — invalid, unauthorized, missing, or malformed input.
- **Edge cases** — empty collections, boundary values, concurrent access, idempotency.
- **Error scenarios** — specify observable error behavior, not just "should fail".

Keep scenarios implementation-independent (no databases, selectors, or internal data structures in step text) and deterministic. Every acceptance criterion must be covered by at least one scenario across the slices. Each step traces back to one or more scenarios in its slice. The scenarios become the repository's Given-When-Then acceptance tests (Vitest) or Playwright specs — say which in each step's **TEST** line. Do not write `.feature` files.

**Threat-model security-sensitive changes.** When the ticket adds or changes an API endpoint, an external integration (for example Salv or Tuum), authentication or authorization, or a data flow that crosses a trust boundary, run the `threat-modeling` skill before finalising the slices. Its critical and high mitigations become scenarios in the owning slice, and the plan tier is at least `complex`. Skip it for internal refactors and UI-only cosmetic changes, and record the skip in `## Decision Log`.

**Read dependency error contracts.** An external client is a client of a system outside this repository, for example `@lhv-ts-core/*` (Tuum), Salesforce/nCino, Salv, or an AWS SDK client. For every external client call the plan adds or changes, read the client's implementation, not only its types, as `CLAUDE.md` Error Handling requires. Record one `## Decision Log` entry per call naming the call, each failure mode the implementation shows (thrown error, error result, empty result, logged and swallowed), and how the plan handles each one. When the plan adds or changes no external client call, record that in one entry. When a failure mode's handling depends on a product decision, do not pick one: list it in `## Notes` as an open question and return it in the hand-back's `Open questions:`, so it is answered at the Step 4 approval rather than during the build. See [`references/plan-template.md`](references/plan-template.md) for the entry format.

**Filter `LOW_VALUE` findings out of the steps.** A gap classified `LOW_VALUE` by `specs` (no branching logic, no observable outcome, coverage already provided by a higher-layer test) never becomes a slice or a step. List such findings in `## Skipped (low value)` with a one-line rationale.

### 3. Write the plan

Write the plan into `PLAN.md` using [`references/plan-template.md`](references/plan-template.md). It extends `team-ticket`'s base `PLAN.md` template with slices, Gherkin, step details, approach stances, skipped findings, and the review summary. Keep the `## Plan` table, `## Acceptance Criteria`, `## Changed Files`, `## Decision Log`, and `## Notes` rules from `team-ticket` unchanged.

Include the Playwright decision (`Playwright: added/updated <planned spec path>` with the scenario, or `Playwright: not added` with a short rationale) in `## Decision Log`.

### 4. Classify the plan tier

The reviewer set scales to plan complexity — a one-function plan does not pay the same review ceremony as a complex feature. Derive a **plan tier** from the slice count, the file count, the per-step Complexity ratings, and the `## Approach Stances`.

| Tier | Signals | Reviewers |
| ------ | --------- | ----------- |
| `trivial` | 1 slice, ≤ 2 files, no `complex` step, touches no high-reversal-cost decision axis | **Acceptance** only |
| `standard` | Anything between — for example a single slice with a few files, or a small multi-slice plan within existing patterns | **Acceptance + Design**, plus **UX** if the plan has a user-facing surface |
| `complex` | ≥ 4 slices, any `complex` step, a security-sensitive or cross-cutting change, or a **non-default** stance on a high-reversal-cost decision axis | **All four** |

Restating a default stance is not, by itself, a `complex` signal. When in doubt, classify up.

### 5. Run the plan reviewers

Dispatch the selected reviewers in parallel as sub-agents, by `subagent_type`. Pass each one the full `PLAN.md` content and the spec path, if any.

| Reviewer | Agent | Focus |
| ---------- | ---------- | ------- |
| Acceptance | `plan-review-acceptance` | Per-slice Gherkin quality (determinism, isolation, implementation-independence), scenario gaps, error paths, criteria coverage, step traceability |
| Design | `plan-review-design` | Coupling, abstractions, structural risks, pattern adherence |
| UX | `plan-review-ux` | User journey, error UX, cognitive load, accessibility |
| Strategic | `plan-review-strategic` | Problem fit, scope, slice boundaries, risk, opportunity cost |

Each returns a verdict (`approve` or `needs-revision`) with issues. The Acceptance reviewer always runs; it is the quality gate for the scenarios authored in step 2.

**If any reviewer returns `needs-revision`:** send every `blocker` to the `planner` to revise `PLAN.md`. Re-run only the reviewers that flagged blockers. Repeat until all pass, for at most 2 iterations — then escalate to the user with the outstanding blockers.

**After all pass:** write `## Plan Review Summary` with the tier, the reviewer set (and why any were skipped), and the warnings and observations worth keeping.

### 6. Hand back

Before handing back, check that `## Skipped (low value)` holds every `LOW_VALUE` finding and that no step carries one.

- **Called by `team-ticket` or `solo-ticket`:** return to its Step 4 with a short summary: slice count, tier, reviewer verdicts, and open questions.
- **Called directly:** show the plan summary and the review summary. Ask: "Approve this plan, or suggest changes?" Send changes to the `planner` and re-present; remove any `Plan approved:` line from `## Notes` before the planner revises the plan. On approval, record `Plan approved: <timestamp>` in `PLAN.md` `## Notes`, taking the timestamp from `date -u +%Y-%m-%dT%H:%M:%SZ` and replacing any earlier `Plan approved:` line. Then suggest `team-ticket <KEY>` (or `solo-ticket <KEY>` for a less complex ticket) to build it; `solo-ticket` builds an approved plan without planning again.

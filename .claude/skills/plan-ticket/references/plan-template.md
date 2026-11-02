# PLAN.md additions

Use this structure when writing the plan (step 3 of [`../SKILL.md`](../SKILL.md)).

`PLAN.md` has one base template: the one in `team-ticket`'s
`PLAN.md HANDOFF FILE` section (`.claude/skills/team-ticket/SKILL.md`). Follow
that template and its rules exactly. Do not copy it here; a second copy would
drift. This file only defines:

- the extra metadata line under `## Ticket`
- how `## Plan` rows map to slices and steps
- the extra sections that go **after** `## Acceptance Criteria`

## Ticket metadata

Add the spec path under the ticket key when a spec was found:

```markdown
## Ticket
- Key: PROJ-123
- Spec: docs/specs/<slug>.md
```

## Plan rows

Each step becomes one `## Plan` row. Number step ids `S1`, `S2`, … in build
order across all slices, so `team-ticket` keeps its `id` rules unchanged. Prefix
the row text with the slice number. Keep the workflow-tail rows (`T1`, `R1`, `P1`).

```markdown
| id | step | status |
| --- | --- | --- |
| S1 | Slice 1: <step description> | in_progress |
| S2 | Slice 1: <step description> | pending |
| S3 | Slice 2: <step description> | pending |
| T1 | Step 6: Run the full suite and add tests for <remaining gaps> | pending |
| R1 | Step 7: Self-review, cleanup, and acceptance-criteria check | pending |
| P1 | Step 8: PR handoff | pending |
```

## Extra sections

````markdown
## Approach Stances

- <decision-defaults axis>: <stance> — <default | non-default, with reason>

Omit this section when the ticket touches no high-reversal-cost axis.

## Slices

A slice is a vertically deliverable increment. Each slice carries the Gherkin
scenario(s) that define its behavior, followed by the steps that satisfy them.
Step ids match the `## Plan` table.

### Slice 1: <Slice Name>

**Depends-on:** none
**Files:** `path/to/file.ts`, `path/to/__tests__/file.test.ts`

**Behavior:**

```gherkin
Feature: <feature name>

  Scenario: <happy path>
    Given <precondition>
    When <action>
    Then <observable outcome>

  Scenario: <negative / edge / error case>
    Given <precondition>
    When <action>
    Then <observable outcome>
```

**Steps:**

#### S1: <Description>

**Complexity**: <trivial | standard | complex>
**Scenarios**: <scenario names this step satisfies>
**IMPLEMENT**: <the one behavior this step adds>
**TEST**: <test covering the scenario — where it lives (Vitest acceptance test, Playwright spec) and what it asserts>
**REFACTOR**: <what to clean up — runs every cycle; never "skip">
**Files**: `path/to/file.ts`, `path/to/__tests__/file.test.ts`

#### S2: <Description>

...

### Slice 2: <Slice Name>

**Depends-on:** 1
...

## Skipped (low value)

Findings classified `LOW_VALUE` — feasible but no signal (no branching logic, no
observable outcome, coverage already provided by a higher-layer test). These are
**skipped, not deferred**: they never appear in a slice or a step. Omit this
section when there are none.

| Finding | Rationale (one line) |
|---|---|
| <finding> | <why it delivers no signal> |

## Plan Review Summary

Plan tier: <trivial | standard | complex> — reviewers: <dispatched list> (<skipped reviewers and why>)

- <reviewer>: <verdict> — <warnings and observations worth keeping>
````

Risks and open questions go in the base template's `## Notes`; decisions go in
`## Decision Log`.

## Dependency contract entries

Step 2 of `SKILL.md` records each external client call's error contract in the
base template's `## Decision Log`, not in a new section. Use one entry per call:

```markdown
- YYYY-MM-DD: External client `tuumClient.getAccount`: throws on non-2xx → caught at the loader, logged and shown as an error state; returns `undefined` when the account is missing → treated as not found.
```

When the plan adds or changes no external client call, write one entry:

```markdown
- YYYY-MM-DD: External client calls: none added or changed.
```

A failure mode whose handling needs a product decision goes in `## Notes` as an
open question, not in a Decision Log entry, until it is answered.

## Complexity ratings

Each step carries a rating. The ratings feed the plan tier (step 4 of
`SKILL.md`), which sets how many plan reviewers run. `build-plan` reviews the
whole branch once at the end, whatever the ratings.

| Rating | Criteria |
|--------|----------|
| `trivial` | Single-file rename, config change, typo fix, documentation-only |
| `standard` | New function, test, module, or behavioral change within existing patterns |
| `complex` | Architectural change, security-sensitive, cross-cutting concern, new abstraction |

When in doubt, classify up (standard rather than trivial, complex rather than standard).

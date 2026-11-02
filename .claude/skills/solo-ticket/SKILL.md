---
name: solo-ticket
description: Deliver a less complex Jira ticket where subagents plan (planner, plan-ticket with plan reviewers) and review (review-branch, test-design-reviewer) but the main session does all the engineering itself. Cheaper and faster than team-ticket, with a reviewed plan and review panel unlike complete-jira. Defaults to `Autopilot Mode` (single approval gate after Step 4, then automatic execution through Step 8 including draft PR handoff); supports `Standard Mode` and `Routine Mode`. Do NOT use for complex tickets (use team-ticket) or ad-hoc coding.
argument-hint: "<TICKET-KEY> [Standard | Autopilot | Routine]"
user-invocable: true
---

SESSION MODEL (CHECK BEFORE STEP 1)
- The main session writes all the code, so it must run on Opus. A skill `model` setting would only last one turn, so check the session model instead.
- If you are not running on Opus, tell the user to run `/model opus` and STOP until they switch or say to continue. In `Routine Mode`, continue without stopping.

Same role, rules, mode selection, blocker policy, commit message format, and response shorthand as [`team-ticket`](../team-ticket/SKILL.md). Read that file and follow it for everything this file does not override. Steps are numbered the same, so `PLAN.md` ids (`S*`, `T1`, `R1`, `P1`) still match.

- **Modes:** `Autopilot Mode` is the default. `Standard Mode` and `Routine Mode` are used only when the user asks for them, with the gating `team-ticket` defines.
- **Shared text, not repeated here:** follow `team-ticket`'s `PLAN.md HANDOFF FILE` and `CONTEXT COMPACTION POLICY`, plus build-plan's Step 6 and `## Escalation` sections.

**Confirm agent-dispatch capability first.** Planning and review dispatch agents. If the `Agent` tool is not available, STOP and say so.

NEVER dispatch `software-engineer` in this workflow. Implementation, tests, refactors, repairs, and review fixes all happen in the main session.

STEPS 1–2 — TICKET INPUT AND BRANCH READINESS
Exactly as `team-ticket` Steps 1–2.

EXISTING PLAN CHECK (AFTER STEP 2, BEFORE STEP 3)
Read `PLAN.md` if it exists. An existing plan counts only when its `## Ticket` key is this ticket's key and it has `## Slices`.
- **Approved plan** (it also has a `Plan approved:` line in `## Notes`): announce `**Plan: Existing plan used (approved <timestamp>)**` in bold on its own line. Skip Steps 3–4: dispatch no `planner` and no plan reviewers. Go to Step 5 and start at the first `## Plan` row that is not `completed`; when every `S*` row is `completed`, continue at the first workflow-tail row (`T1`, `R1`, or `P1`) that is not.
- **Plan without approval** (no `Plan approved:` line, and `## Plan Review Summary` is filled in with a `Plan tier:` line naming the tier): announce `**Plan: Existing plan used (not yet approved)**` in bold on its own line. Skip Step 3 and Step 4's `plan-ticket` run. Show the plan summary and `## Plan Review Summary`, apply Step 4's complex-tier rule, and ask for approval as Step 4 does. On approval, record the line as `team-ticket` Step 4 does, then go to Step 5. If the user asks for changes, dispatch a `planner` with them and the `PLAN.md` path, then ask again.
- **Unreviewed plan** (no `Plan approved:` line, and `## Plan Review Summary` is not filled in, so the plan reviews did not finish): announce `**Plan: Existing plan used (not yet approved)**` in bold on its own line. Skip Step 3. In Step 4, run `plan-ticket` on the existing plan: it classifies and reviews the plan without rewriting it. Then continue Step 4 as below.
- **Anything else** (no `PLAN.md`, no `## Slices`, or a plan for another ticket): run Steps 3–4 as below, and announce `**Plan: New plan created**` in bold on its own line at the Step 4 gate.

STEP 3 — UNDERSTANDING
Exactly as `team-ticket` Step 3: dispatch the `planner` agent for the understanding pass and keep its agent ID. Do not write the understanding yourself. Same gating as `team-ticket`.

STEP 4 — DETAILED PLAN (STOP AFTER THIS STEP IN BOTH MODES, EXCEPT ROUTINE)
- Run `plan-ticket` as `team-ticket` Step 4 does, passing the ticket key, Step 3 understanding, spec path, and the planner agent ID. It writes `## Slices` and `## Plan Review Summary`. Do not write the plan yourself. Check the same plan requirements `team-ticket` Step 4 lists.
- **Complex tier.** Read the tier `plan-ticket` set:
  - `complex`, not `Routine Mode`: add a warning at the approval gate that this ticket is too complex for `solo-ticket`, recommend `team-ticket`, and start the build only when the user confirms.
  - `complex`, `Routine Mode`: record the same warning in `PLAN.md` `## Notes` and continue.
  - Any other tier: no warning.
- STOP and wait for approval. This is the only approval gate in `Autopilot Mode`. On approval, record `Plan approved:` as `team-ticket` Step 4 does.

STEP 5 — IMPLEMENTATION (IN THE MAIN SESSION)
Mode stops as build-plan Step 5: `Standard Mode` stops after each row; `Autopilot Mode` and `Routine Mode` continue unless blocked.

Before the first row, fix the run id as `<TICKET-KEY>@<short HEAD sha>-<UTC time as yyyymmddThhmmssZ>` (for example from `date -u +%Y%m%dT%H%M%SZ`) and record it as `Run id:` in `PLAN.md` `## Notes`. Reuse it on resume, in Step 6 log paths, and in Step 7.

Unlike `build-plan`, steps run only their scoped tests; REFACTOR, lint, and type-check run once per slice. A slice's steps are the `S*` rows listed under it in `## Slices`, and the slice ends after its last row in `## Plan` order. A row with no `## Slices` block is a slice of its own. `T1`, `R1`, and `P1` belong to Steps 6–8.

**On resume**, before starting any row: a slice whose rows are all `completed` but that has no `Slice verified:` line in `## Notes` runs its slice-end checks first.

For each slice, in `## Plan` order:
1. **Authoring checklist, once.** Run `python3 .claude/skills/review-branch/scripts/select_lenses.py --files <every file the slice's steps plan to change>` and read the `## Authoring checklist` section of each returned reviewer. Do not read them again for each step. Skip this when the slice declares no files or no reviewer has a checklist.
2. **For each of the slice's rows**, in order:
   1. Set the row `in_progress` in `PLAN.md`.
   2. Read the step's block from `## Slices` (IMPLEMENT, TEST, REFACTOR, Files, Scenarios) and the slice's Gherkin. The design is settled; do not redesign. For a row with no `## Slices` block, use the row text and `## Acceptance Criteria`.
   3. **IMPLEMENT**, then **TEST**, writing to the checklist. Never all the code and then all the tests. When TEST names a Playwright spec, write or update the spec but do not run it; Step 6 runs it first.
   4. **Evidence.** Run the step's scoped tests: Vitest, or the Python tests for a step that changes only Python. The row is `completed` only with fresh passing output. Do not run lint, type-check, or REFACTOR for the row. Only a step that changes nothing but a Playwright spec or Markdown is complete once its files are written.
   5. Update `PLAN.md`: complete the row, move the next to `in_progress`, update `## Changed Files` and `## Acceptance Criteria`, and add assumptions to `## Decision Log`.
3. **Slice-end checks**, after the slice's last row:
   1. **REFACTOR**: run `python3 .claude/skills/build-plan/scripts/build_phase.py refactor --step <the slice's last step id>` so the test-freeze hook blocks test-file edits, apply the REFACTOR notes of the slice's steps to the code the slice changed, then run `python3 .claude/skills/build-plan/scripts/build_phase.py clear`. A blocked test edit means the refactor changed behaviour: clear the phase and go back to TEST.
   2. Run the slice's scoped tests, lint on the files the slice changed, and the affected packages' type-check. The slice is done only with fresh passing output for all three. As in build-plan Step 5 item 3, a slice that changed only Python needs only scoped tests, and one that changed only Markdown needs no check.
   3. Record `Slice verified: <slice> <UTC time from date -u +%Y-%m-%dT%H:%M:%SZ>` in `PLAN.md` `## Notes`.

**Repair on failure**, for step and slice-end checks alike, using build-plan Step 5 item 4: diagnose before retrying, compare failure signatures, two identical consecutive signatures is a dead end, and escalate after 3 failed fix attempts. Run `systematic-debugging` before escalating.

Do not commit unless `team-ticket` or the user asks.

STEP 6 — TESTING
Exactly build-plan Step 6 (clear the phase record, full suite, lint, and type-check once per affected package through build-plan's Full runs wrapper, UI check, whole suite green, same mode stops). You make every repair yourself using the Step 5 repair loop. Step 6 is not complete unless the full suite, lint, and type-check are all green.
- Also run each Playwright spec written or updated in Step 5, through `run-playwright-tests` and the wrapper. This is its first run, in addition to any other Playwright run, and it must pass.

STEP 7 — SELF-REVIEW & CLEANUP
Mode stops as build-plan Step 7. Review runs once over the whole branch.
- Run `review-branch` with `--fix-inline --to-files` and `--run <the run id in PLAN.md ## Notes>`. Reviewers write their findings to files and hand back one line each; you read only the findings files that need fixing. It runs `spec-compliance-review`, the lenses `select_lenses.py` selects, and `refactor-opportunity-review`. You apply the fixes, at most 2 iterations before escalating, then one full test, lint, and type-check run through the wrapper, then it records review metrics.
- Dispatch `test-design-reviewer` on the changed test files and report its Farley Score. It is informational and does not block Step 8.
- Do the other build-plan Step 7 checks: acceptance criteria, no redundant tests, `oxfmt --write` on changed TS/JS files only, the unit testing, React, and Remix guideline checks, and the Playwright decision.
- Update `PLAN.md` with the review outcome, the Farley Score, residual risks, and follow-ups.

STEP 8 — PR HANDOFF
Exactly as `team-ticket` Step 8, including the Claude usage report (`python3 .claude/skills/team-ticket/scripts/claude_usage.py`).

---
name: build-plan
description: >-
  Execute an approved PLAN.md one step at a time: a software-engineer agent
  implements, tests, and refactors each step; then the full suite, one review
  panel over the whole branch, and a test-quality score.
  team-ticket runs this for its Steps 5–7 (solo-ticket does the same steps in
  the main session and refers to this skill's Step 6 and escalation rules). Use directly when the user says
  "build the plan", "implement PLAN.md", or "start building" on an approved plan.
argument-hint: "[Standard | Autopilot | Routine]"
user-invocable: true
---

# Build plan

Role: orchestrator. This skill implements an approved plan — it does not create plans or specs. It covers `team-ticket` Steps 5 (implementation), 6 (testing), and 7 (self-review and cleanup), and keeps their step numbers so `PLAN.md`'s `T1`/`R1` rows still match.

## Two ways in

| Caller | Behavior |
|---|---|
| `team-ticket` after Step 4 approval | Use the mode `team-ticket` passes. Return to `team-ticket` for Step 8 when Step 7 is done. |
| The user directly | Read `PLAN.md`. If it has no `## Slices` or the user has not approved it, ask before building. Default to `Standard Mode`. On completion, suggest `team-ticket <KEY>` or `raise-github-pr` for the PR. |

Mode stops are the same as `team-ticket`'s: Standard stops where each step below says; Autopilot and Routine continue unless blocked. A blocker pauses in every mode; in Standard and Autopilot, independent slices continue while it is open (see `## Escalation`).

## Constraints

**Confirm agent-dispatch capability first.** This skill dispatches `software-engineer`, the review panel agents, and `test-design-reviewer`. If the `Agent` tool is not available, **STOP**: say so, and do not do the agents' work inline or mark any review passed.

1. **Follow the plan exactly.** If the plan is wrong, stop and ask — do not deviate silently.
2. **One step at a time, one agent per step.** Each step is one `software-engineer` dispatch that does IMPLEMENT → TEST → REFACTOR. Never all the code then all the tests.
3. **Evidence, not impressions.** Do not mark a step `completed` without a passing `check_evidence.py` run over the step's evidence file. You run the full test suite, lint, and type-check yourself once, in Step 6 — not after each step.
4. **Diagnose before retry.** When a command fails, read the exit code and error, state a one-line cause hypothesis, then correct it. Never re-run a failed command unmodified.
5. **Do not commit.** `team-ticket` and the user own commits. Follow `team-ticket`'s commit message format if asked to commit.
6. **Keep `PLAN.md` current** using `team-ticket`'s `PLAN.md` rules and context compaction policy.

## Full runs through the wrapper

Run every full test, lint, type-check, and Playwright run the main session makes through `run_logged.py`, so only the summary enters the session:

```bash
python3 .claude/skills/build-plan/scripts/run_logged.py \
  --log .claude/metrics/runs/<run-id>/logs/<package>-<test|lint|typecheck|playwright>.log \
  --cwd <package dir> -- pnpm <test run|lint|typecheck>
```

It saves the full output to the log and prints the runner's summary, each failing test or error with its first error line (or the last 20 lines when no failure can be named), `result: PASS|FAIL exit=<n> duration=<s>s`, and the log path. Read the log only when the summary does not explain a failure. For Playwright, `run-playwright-tests` still starts the app; wrap the `play:test` command it runs.

## STEP 5 — IMPLEMENTATION

Before the first row, fix the run id as `<TICKET-KEY>@<short HEAD sha>-<UTC time as yyyymmddThhmmssZ>` (for example from `date -u +%Y%m%dT%H%M%SZ`) and record it as `Run id:` in `PLAN.md` `## Notes`. Reuse it on resume, for Step 6 log paths, and in Step 7. The timestamp gives a repeated build its own run directory.

For each `## Plan` row in order (`S1`, `S2`, …):

1. **Set the row `in_progress`** in `PLAN.md`, and note the step start time from `date -u +%Y-%m-%dT%H:%M:%SZ`.
2. **Dispatch `software-engineer`** (by `subagent_type`) with:
   - the step's block from `## Slices` (IMPLEMENT, TEST, REFACTOR, Files, Scenarios) and the slice's full Gherkin;
   - the spec path from `## Ticket`, if any;
   - the instruction: **the design is settled; do not design.** Implement exactly this step, then return the step report (changed files, commands with exit codes, assumptions, blockers, evidence file);
   - the line `Evidence file: .claude/metrics/runs/<run-id>/evidence/<step-id>.log`.
   - For a row with no `## Slices` block (a plan written before `plan-ticket`), pass the row text and the `## Acceptance Criteria` instead.
   - the **authoring checklist** for the step: run `python3 .claude/skills/review-branch/scripts/select_lenses.py --files <the step's planned files>` and paste the `## Authoring checklist` section of each returned reviewer under an `## Authoring checklist (write-time)` heading. These are the things the Step 7 reviewers will check, so writing to them up front avoids fix rounds. Skip this when the step declares no files or no reviewer has a checklist.
3. **Check the evidence.** Do not re-run the checks, and do not read the evidence file. Run:
   ```bash
   python3 .claude/skills/build-plan/scripts/check_evidence.py --evidence <evidence file> --since <step start> --require <kinds>
   ```
   Required kinds follow the step's files: `scoped-tests lint typecheck` when it changes TS or JS, `scoped-tests` when it changes only Python, and no check when it changes only Markdown. A non-zero exit is a step failure: send its output to the repair loop below. Missing or stale evidence counts as a failure.
4. **Repair on failure.** Send the failing output or the blocker back to `software-engineer` as correction context. After each repair attempt, compare the **failure signature**: the sorted set of failing test names plus each test's error class, with timestamps, durations, paths, and ports stripped.
   - A changed signature is progress — keep repairing.
   - **Two identical consecutive signatures is a dead end.** Stop. Record the diagnostic snapshot in `PLAN.md` `## Notes` (command, smallest useful error excerpt, affected files, what improved, what still fails). Escalate as a blocker in every mode.
   - After 3 or more failed fix attempts, say so in the escalation and question the design: "After 3+ failed fix attempts, question the architecture — stop patching."
5. **Update `PLAN.md`:** complete the row, move the next row to `in_progress`, update `## Changed Files` and `## Acceptance Criteria` progress, and copy the step report's assumptions into `## Decision Log`.

`Standard Mode`: STOP after each step and wait for review, summarising what changed, the modified files, and trade-offs.
`Autopilot Mode` and `Routine Mode`: continue through all steps unless blocked.

## STEP 6 — TESTING

- Run `python3 .claude/skills/build-plan/scripts/build_phase.py clear` first, so no stale REFACTOR record keeps test files frozen.
- Run the full test suite, lint, and type-check for every affected app and package (`pnpm test run`, `pnpm lint`, `pnpm typecheck` from each directory), each through the wrapper (see Full runs). This is the only full run of the build — the per-step runs in Step 5 are scoped. Repair failures through `software-engineer` using the Step 5 repair loop and its dead-end rule.
- **The whole suite must be green, not only this branch's tests.** Do not wave a failure past as pre-existing or unrelated. Fix it, or — if it is genuinely out of scope — record it in `## Notes` and report the suite as **not green**.
- **UI check.** If the branch changed `ui-dashboard` UI, exercise each changed journey once with `verify-ui-journey` (it starts the app via `start-app`). If the required local infra is not running, record `UI check skipped — infra not running` in `## Notes` and continue. A failed UI check is a failing test: fix it before Step 7.
- Add or update tests for edge cases the per-step tests did not cover. Follow the repository's unit testing guidelines.
- Do not change production code unless required to fix a test failure.
- Update `PLAN.md` with testing status, acceptance-criteria evidence, and any unresolved failures or one concise validation summary.

`Standard Mode`: STOP and wait for approval.
`Autopilot Mode`: continue to Step 7 unless blocked.
`Routine Mode`: continue to Step 7, using the recommended plan if blocked.

## STEP 7 — SELF-REVIEW & CLEANUP

Review runs **once, here, over the whole branch** — not per step or per slice — to keep cost down.

- **Review panel.** Run the `review-branch` skill with `--fix --to-files`, using the run id recorded in `PLAN.md` `## Notes`. File mode keeps each reviewer's findings in a file, so only one line per reviewer enters this session. It runs `spec-compliance-review` first, then the reviewers `select_lenses.py` selects for the changed files, fixes findings through `software-engineer` (scoped checks per round, one full test, lint, and type-check run after the loop if anything changed), records review metrics, and writes the reviewers run and skipped to `PLAN.md` `## Notes`. Its escalations are blockers here.
- **Test quality.** Dispatch `test-design-reviewer` on the test files changed on the branch (`git diff --name-only $(git merge-base HEAD origin/main)...HEAD`, test files only). Report its Farley Score. The score is informational — it does not block Step 8 — but surface it so the user can decide whether to revise. If no test files changed, say so in one line.
- Check against acceptance criteria. Ensure no redundant tests. Identify risks and follow-ups.
- Minor cleanup only if directly related.
- If unit/integration-style tests were added or changed, verify they follow the repository's unit testing guidelines and record accepted deviations.
- Run `oxfmt --write`, but only on changed TS/JS files.
- For React/UI work, verify the implementation follows the React component guidelines; for Remix work, the Remix guidelines. Record accepted deviations.
- If the project uses Playwright, verify the Step 4 Playwright decision was followed; report the spec path and scenario, or the rationale for not adding Playwright.
- Update `PLAN.md` with the review panel outcome, acceptance-criteria coverage, the Farley Score, accepted residual risks, and deferred follow-ups.

`Standard Mode`: STOP and wait for approval before Step 8.
`Autopilot Mode`: continue to Step 8 unless blocked.
`Routine Mode`: continue to Step 8, using the recommended plan if blocked.

## Escalation

A failure is a debugging task first. Before escalating, run the `systematic-debugging` skill — reproduce it, find the root cause, and state it in one sentence — and escalate **with that diagnosis**, never just an attempt count.

Stop and ask the user when:

- A test still fails after the root cause is known, and the fix needs a decision you cannot make (it changes the spec or the design).
- The plan needs a design decision it does not cover, or is incomplete or contradictory.
- A step's behavior cannot be tested in isolation, or depends on something no earlier step produced. Do not stub or guess the missing interface.
- The Step 7 fix loop does not converge after 2 iterations, or two reviewers' findings conflict.
- The repair loop hits a dead end (Step 5, item 4).
- The verify-guard hook blocks a command (`[BLOCK] verify-guard`): the same test, lint, or type-check command ran repeatedly with no edit in between. Run `systematic-debugging` instead of retrying, and escalate with the diagnosis if it is still unresolved.

### While a blocker is open

In `Standard Mode` and `Autopilot Mode`, a Step 5 escalation blocks its slice, not the whole build:

1. **Notify.** Send the notification `team-ticket`'s blocker policy requires: the ticket key and the question.
2. **Record.** Set the blocked row back to `pending`, keep its diagnostic snapshot, and add `Blocked: <step id> (slice <n>, packages <apps/packages with its uncommitted edits>) — <question>` to `PLAN.md` `## Notes`. Leave its edits in the working tree.
3. **Continue with independent slices.** Pick the next `## Plan` row that meets all of these:
   - Its slice has no open `Blocked:` note, and has no `Depends-on` path, directly or through other slices, to any slice that does.
   - Its files are in none of the apps or packages listed in any open `Blocked:` note, so the blocked edits cannot affect its checks.

   Build it as usual, one step at a time, and add `Continued: <step id> while <blocked step id> is blocked` to `## Notes`. `Standard Mode` still stops after each step. If it hits its own blocker, record it the same way; every open blocker applies to the next pick.
4. **Hold.** Never start Step 6, Step 7 or the PR while any `Blocked:` note is open. When no eligible row remains, wait for an answer.
5. **Resume.** When the user answers a blocker, record the answer in `## Decision Log` and remove only that step's `Blocked:` note and the `Continued: … while <that step id> is blocked` notes. Finish the step already running, then build the answered slice's rows before starting any later slice. Other blockers stay open.

Escalations in Steps 6 and 7 have no slices to continue with: notify and wait.

In `Routine Mode` an escalation is still a hard stop: record the trigger, diagnosis, and options considered in `PLAN.md` `## Notes`, leave the row `in_progress`, and stop. Never resolve an escalation by picking an interpretation and continuing.

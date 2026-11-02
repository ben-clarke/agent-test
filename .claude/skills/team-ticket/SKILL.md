---
name: team-ticket
description: New version of complete-jira that plans with plan-ticket (slices, Gherkin, plan reviewers) and builds with build-plan (software-engineer per step, end-of-branch review panel). Use for implementing Jira tickets with a structured workflow that defaults to `Autopilot Mode` (single approval gate after Step 4, then automatic execution through Step 8 including draft PR handoff) and supports optional `Standard Mode` (approval-gated). Do NOT use for ad-hoc coding or refactors.
---

SESSION MODEL (CHECK BEFORE STEP 1)
- Orchestration runs on the session model; a skill `model` setting would only last one turn. Planning, implementation, and review run in agents that set their own models.
- If you are not running on Sonnet, tell the user to run `/model sonnet` and STOP until they switch or say to continue. In `Routine Mode`, continue without stopping.

You are a careful, senior-level software engineer working in this repository.
Follow the process EXACTLY. Do NOT skip steps. Be concise and avoid redundancy.
If a step says STOP, apply the mode-specific gating rules in this document.

You are not allowed to:
- Perform unrelated refactors
- Modify unrelated files
- Skip required analysis steps
- Continue past a STOP instruction
- Add scope beyond the ticket

COMMIT MESSAGE FORMAT (WHEN COMMITTING)
- If committing Jira-ticket work, the commit message MUST start with the Jira key in square brackets, for example `[PROJ-123] Add payment validation`.

PROCESS (MANDATORY):

NOTE — RESPONSE SHORTHAND
- Treat `y` as a proceed command (equivalent to explicit approval to continue to the next gated step).

MODE SELECTION (REQUIRED)
- Default to `Autopilot Mode`.
- Activate `Standard Mode` only when the user explicitly requests it (for example: "Standard Mode" or "standard").
- Activate `Routine Mode` only when the user explicitly requests it (for example: "Routine Mode" or "routine"). It is for when running automated Claude Routines
- In `Autopilot Mode`, the only approval gate is after Step 4. Steps 5-8 proceed without additional approval requests unless a hard blocker is encountered.
- In `Routine Mode`, you should run with no approval gates.

BLOCKER POLICY (APPLIES TO BOTH MODES)
- Hard blockers require a pause for user input in both modes. These include:
  - Jira fetch failure in Step 1
  - Unresolved ticket key in Step 2
  - Unsafe branch-switch situations that require user choice (for example: uncommitted changes before switching branches)
  - Missing requirements that prevent safe implementation
- Blocker pauses are not approval gates and do not switch modes.
- Notify before a blocker pause in Steps 5–8 (`Standard Mode` and `Autopilot Mode`):
  - Send a push notification with `PushNotification` naming the ticket key and the question, for example `PROJ-123 blocked: <question>`, then pause.
  - The notification is best effort. If `PushNotification` is unavailable or fails, pause anyway.
  - `Routine Mode` sends no notification; it keeps its own blocked behaviour.
- While a `build-plan` blocker is open, independent steps can continue, as its `## Escalation` section says. Step 6, Step 7 and the PR never start until it is answered.

PLAN.md HANDOFF FILE (REQUIRED)
- Maintain a `PLAN.md` file in the repository root as the durable execution state for this ticket.
- Purpose: allow seamless continuation in a new thread when chat context is trimmed.
- The file MUST use this durable handoff structure:
  - Optional top-level explanation
  - A list of plan items where each item has:
    - `id` (string, immutable once created)
    - `step` (string)
    - `status` (`pending`, `in_progress`, or `completed`)
  - The plan list MUST include all remaining mandatory workflow work, not only implementation work:
    - Step 5 implementation sub-steps, split into the smallest reviewable implementation units
    - Prefer steps that change one concern at a time and can be reviewed safely in isolation
    - Avoid combining unrelated concerns in one step (for example: data-shape changes + business logic + UI wiring + tests all together)
    - When in doubt, make the step smaller
    - Step 6 testing
    - Step 7 self-review and cleanup
    - Step 8 PR handoff
- Include `Acceptance Criteria` as a concise checklist of ticket outcomes.
- Include `Decision Log` as concise dated decisions and trade-offs that affect implementation.
- Include `Changed Files` as concise durable traceability for implementation/testing/review work:
  - Record file paths grouped by completed step `id` when relevant (for example `S1`, `S2`, `T1`, `R1`)
  - Keep this section concise and cumulative; remove duplicates and obsolete entries
- Include a `Summary` section that captures your concise ticket understanding from `STEP 3 — UNDERSTANDING`.
- Keep `Decision Log` and `Notes` non-overlapping:
  - `Decision Log`: decisions/trade-offs and short rationale
  - `Notes`: handoff state only; non-decision context that remains useful when resuming later
  - If an item becomes a decision, move it to `Decision Log` and remove duplicate wording from `Notes`
- Keep `Notes` low-noise:
  - Keep unresolved blockers, open questions, external dependencies, residual risks, deferred follow-ups, final validation summaries, and PR handoff links.
  - Do not keep branch names, per-step validation diaries, subagent progress reports, resolved temporary issues, or historical review-change notes.
- Keep exactly one `in_progress` step at most.
- Update `PLAN.md` at each major checkpoint (after Step 3, Step 4, each Step 5 sub-step, Step 6, Step 7, and Step 8).
- Keep entries concise; this is execution state, not a full transcript.

CONTEXT COMPACTION POLICY (REQUIRED)
- Treat `PLAN.md` as the durable compressed state for the ticket.
- At every required `PLAN.md` update, compress the working context into `PLAN.md` before continuing or stopping.
- Preserve only:
  - current ticket understanding
  - active plan status
  - acceptance criteria progress
  - implementation-affecting decisions
  - unresolved blockers/questions/dependencies
  - residual risks or deferred follow-ups
  - final validation and PR handoff state
- Do not preserve:
  - conversation history
  - resolved debugging attempts
  - obsolete hypotheses
  - verbose command output
  - transient subagent progress
  - temporary validation details
  - repeated summaries already represented elsewhere
- If a prior assumption becomes invalid, explicitly remove or replace it. Do not keep contradicted state.
- Exception for unresolved blockers/failures (any step): preserve a minimal diagnostic snapshot in `PLAN.md` until resolved:
  - command/tool attempted
  - smallest useful error excerpt
  - affected file/module/surface
  - next intended action or pending question
- Before every STOP, ensure `PLAN.md` is sufficient for a new thread to continue without reading the old chat.

Use this template:

```md
# PLAN

## Ticket
- Key: <TICKET-KEY>

## Summary
- <Ticket summary from STEP 3 — UNDERSTANDING>

## Explanation
<optional short context note; omit this section if not needed>

## Plan
| id | step | status |
| --- | --- | --- |
| S1 | Implement <first reviewable implementation sub-step> | in_progress |
| S2 | Implement <second reviewable implementation sub-step, if needed> | pending |
| T1 | Step 6: Add/update and run tests for <planned coverage> | pending |
| R1 | Step 7: Self-review, cleanup, and acceptance-criteria check | pending |
| P1 | Step 8: PR handoff | pending |

## Changed Files
- S1: <path/to/file-a>, <path/to/file-b>
- T1: <path/to/test-file>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Decision Log
- YYYY-MM-DD: <decision and short rationale>

## Notes
- <unresolved blocker / dependency / residual risk / deferred follow-up / final validation / PR link>
```

Status mapping rules:
- `pending` means not started yet.
- `in_progress` means currently active.
- `completed` means done and verified for that step.
- `id` is immutable once created; `step` text may be refined as understanding improves.

Step text refinement example (retain same `id`):
- Before: `| S2 | Add payment validation | in_progress |`
- After: `| S2 | Add payment validation for card and bank-transfer paths | in_progress |`

STEP 1 — TICKET INPUT RESOLUTION (REQUIRED BEFORE STEP 2)
- If the user provides a Jira ticket key (for example `ABC-123`) instead of full ticket content:
  - Use the available Jira MCP server/tools to fetch the issue for the provided key.
  - Include at least the summary and description in the fetched ticket content when the tool supports field selection.
  - Use the returned Jira issue content as the ticket source for all remaining steps
- If both a Jira key and ticket text are provided:
  - Fetch with Jira MCP anyway
  - Treat fetched Jira fields as source of truth
  - Call out any mismatch in Step 3 assumptions
- If Jira fetch fails (missing permissions, issue not found, or tool failure):
  - State the failure clearly
  - Ask the user to provide ticket content directly
  - STOP (blocker pause in both modes)

STEP 2 — BRANCH READINESS (REQUIRED BEFORE STEP 3)
- Resolve the Jira ticket key from Step 1 output or user-provided ticket details.
- If the ticket key cannot be resolved confidently:
  - Ask the user for the ticket key
  - STOP (blocker pause in both modes)
- The target name is `feature/<initials>-<TICKET-KEY>-<2-3-word-slug>`:
  - Take the initials from `git config user.name` (for example `Ben Clarke` gives `bc`).
  - Take the slug from the Jira summary, in lowercase and hyphenated.
- Check the current branch with `git branch --show-current`.
- If it already matches `^feature/[a-z]+-<TICKET-KEY>-[a-z0-9-]+$` (exact key, upper case), keep it and continue to Step 3.
  - Merely containing the key is not enough. A worktree tool's default branch, such as Orca's `<user>/<name>`, must be renamed even if its name includes the key.
- Otherwise run `git fetch origin main`. Never check out local `main`: in a linked worktree it is already checked out in the main checkout, and the switch fails.
- Then check whether the current branch has commits that `origin/main` lacks, with `git rev-list --count origin/main..HEAD`. Then:
  - **The current branch is not `main` or another `feature/` branch.** This is a worktree default branch. Rename it in place with `git branch -m <target>`. This keeps the worktree, any uncommitted changes and any commits, and leaves no stray branch behind.
    - If it has no commits of its own, also run `git merge --ff-only origin/main` so it starts from the latest base.
    - If `git rev-parse --abbrev-ref @{upstream}` shows it was already pushed under its old name, ask the user before renaming. This is a blocker pause in both modes.
  - **The current branch is `main`, or a `feature/` branch for a different ticket.** Run `git status --short`. If there are uncommitted changes, present them and ask the user how to proceed. This is a blocker pause in both modes. Then run `git switch -c <target> origin/main`.
- Verify the result: `git branch --show-current` must print the target name.
  - If it doesn't, report the failing command's output and STOP. This is a blocker pause in every mode.
  - Never continue to Step 3 on a branch that doesn't match the format.
- Record the branch name in `PLAN.md` `## Notes`.

STEP 3 — UNDERSTANDING (STANDARD MODE: STOP AFTER THIS STEP | AUTOPILOT MODE: CONTINUE TO STEP 4 UNLESS BLOCKED | AUTOPILOT MODE: CONTINUE TO STEP 4 USING RECOMMENDED PLAN IF BLOCKED)
- Dispatch the `planner` agent (by `subagent_type`) for its understanding pass. Pass the ticket key, the fetched ticket content, the spec path if one is known, the `PLAN.md` path, and the bullets below as its brief. Keep the agent's ID: Step 4 and any plan revisions reuse the same planner so its codebase reading is not repeated.
- Do not do the understanding yourself. Present the planner's hand-back, and ask any clarifying questions it returns.
- The planner must:
- Summarise the ticket in your own words (concise)
- List acceptance criteria
- Identify unclear or missing requirements
- Explicitly state assumptions
- Propose a high-level implementation plan in discrete steps
- List files you expect to modify or create
- If this is UI work, look for a mock-up in `docs/mockups/`: a folder named after the ticket key (for example `proj-123-<feature>`), a folder linked from the ticket or spec, or a folder whose `README.md` mentions the ticket key. Check the base branch and its main checkout too, as for specs. Record the path, or `No mock-up found`, in `PLAN.md` `## Notes`.
- If `PLAN.md` already holds a `plan-ticket` plan for this ticket key (it has `## Slices` and `## Plan Review Summary`), keep its plan rows and sections; only update `Summary` and anything Step 3 changes.
- Create or update `PLAN.md` with:
  - Ticket key and summary
  - `Summary` populated from your concise ticket summary above
  - Optional explanation (only if useful)
  - Initial plan rows where each row has `id`, `step`, and `status`
  - Include Step 5 implementation sub-step rows plus mandatory workflow-tail rows for Step 6 testing, Step 7 self-review and cleanup, and Step 8 PR handoff
  - Make Step 5 implementation rows deliberately small:
    - one behavior change, one layer, or one tightly related file group at a time
    - separate refactors from behavior changes
    - separate production-code changes from test-only follow-up when practical
    - prefer adding a new plan row instead of making one row broad
  - Use stable `id` values (for example `S1`, `S2`, `T1`, `R1`, `P1`) so later edits update status by `id`
  - Initialize `Acceptance Criteria` from ticket requirements
  - Start `Decision Log` when any early implementation-affecting decision is made
  - Compact all Step 1-3 findings into `PLAN.md`; discard reconnaissance detail not needed for implementation.
- If the ticket is missing info required to implement safely:
  - List what is missing
  - Ask targeted clarification questions
  - STOP (blocker pause in both modes)

`Standard Mode`: STOP and wait for approval before continuing.
`Autopilot Mode`: Continue directly to Step 4 without an approval pause.

STEP 4 — DETAILED PLAN (STOP AFTER THIS STEP IN BOTH MODES)
(only after Step 3 is complete; approval is required in `Standard Mode` only)
- Use the `plan-ticket` skill to write the detailed plan into `PLAN.md`. Pass the ticket key, the Step 3 understanding, the spec path if one exists, and the Step 3 planner's agent ID. The spec may only exist on the base branch, in its main checkout, or as a comment on the Jira ticket, and not yet in this worktree; `plan-ticket` searches all four locations. It authors slices with Gherkin scenarios and implement-test-refactor steps, and runs the plan reviewers.
- If `PLAN.md` already holds a reviewed `plan-ticket` plan for this ticket key, reuse it instead of re-planning.
- Announce the plan source in chat, in bold on its own line, before the approval question: `**Plan: New plan created**` when `plan-ticket` wrote the plan in this run, or `**Plan: Existing plan used (approved <timestamp>)**` or `**Plan: Existing plan used (not yet approved)**` when an existing plan was reused.
- The bullets below are requirements the finished plan must meet; check them after `plan-ticket` returns and send any gaps to its `planner` agent to fix in `PLAN.md`.
- Expand each plan step with implementation details (concise)
- Break any implementation step that feels broad into smaller sequential steps before coding begins
- Use this sizing rule for Step 5 plan rows:
  - good: "add parser for provider payload", "wire parser into service", "update API response mapping"
  - too broad: "implement provider integration end to end"
- Prefer each implementation step to have one clear purpose and one obvious review focus
- Note edge cases and failure modes
- `Decision Log` has the dependency contract entries `plan-ticket` step 2 requires: one per external client call added or changed, or one entry saying there are none. List every open question `plan-ticket` returns in the Step 4 approval message.
- Identify tests needed (unit / integration / e2e)
- If unit or integration-style tests are needed and the repository has unit testing guidelines (for example `docs/guidelines/UNIT_TESTING_GUIDELINES.md`, another unit/Vitest testing guidelines doc, or a file linked from `AGENTS.md`):
  - Read the repository's unit testing guidelines before finalising the plan.
- If this is React/UI work:
  - Read the repository's React component guidelines before finalising the plan when the document exists.
  - Include a concise React guidelines compliance note covering component structure, composition, user-facing strings, props/types, and any deliberate deviations.
  - When a mock-up exists, read its `README.md` and HTML (`data-component` annotations) and plan to match it: reuse the components it lists, place each `NEW` component where it proposes, and cover every state it shows. Record any deliberate deviation in `Decision Log`.
- If this is Remix work:
  - Read the repository's Remix guidelines before finalising the plan when the document exists.
  - Include a concise Remix guidelines compliance note covering route/module structure, data loading and mutations, error handling, and any deliberate deviations.
- If the project uses Playwright:
  - Include a Playwright decision: `Playwright: added/updated <planned spec path>` with the scenario, or `Playwright: not added` with a short rationale.
  - Prefer updating an existing journey spec when behaviour changes; add a new spec only for a genuinely new journey or boundary.
- If the project does not use Playwright, include `Playwright: not applicable`.
- Update `PLAN.md`:
  - Ensure every detailed Step 4 implementation step is represented in `## Plan` (1:1 by step intent; no orphan detailed steps outside the table)
  - Ensure `## Plan` still includes mandatory workflow-tail rows for Step 6 testing, Step 7 self-review and cleanup, and Step 8 PR handoff
  - Refine implementation step text to reflect implementation detail while keeping each step `id` unchanged
  - Split oversized implementation rows before approval so Step 5 can execute in small, reviewable increments
  - Refine the Step 6/7/8 workflow-tail row text with ticket-specific test, review, and PR handoff detail while keeping each row `id` unchanged
  - Ensure exactly one `in_progress` step and the rest `pending`/`completed`
  - Refine `Acceptance Criteria` so each item is testable
  - Record planning decisions, trade-offs, and unresolved handoff state according to the `PLAN.md` rules above
STOP and wait for approval. This is the only approval gate in `Autopilot Mode`.
- On approval, record `Plan approved: <timestamp>` in `PLAN.md` `## Notes`, taking the timestamp from `date -u +%Y-%m-%dT%H:%M:%SZ` and replacing any earlier `Plan approved:` line. If the user asks for changes instead, remove any `Plan approved:` line before the plan is revised. `Routine Mode` has no approval, so it records no line.

STEP 5–7 — IMPLEMENTATION, TESTING, SELF-REVIEW (DELEGATED TO `build-plan`)
(only after approval of Step 4)
- Use the `build-plan` skill, passing the current mode. It runs Step 5 (implementation), Step 6 (testing), and Step 7 (self-review and cleanup) against `PLAN.md`, with the same mode stops this workflow uses:
  - `Standard Mode`: stops after each implementation sub-step, after Step 6, and after Step 7.
  - `Autopilot Mode`: runs Steps 5–7 without approval pauses unless blocked.
  - `Routine Mode`: runs Steps 5–7 without approval pauses, using the recommended plan if blocked.
- Hard blockers raised by `build-plan` pause in all modes, per the blocker policy above.
- When `build-plan` finishes Step 7, continue to Step 8.

STEP 8 — PR HANDOFF (STANDARD MODE: STOP AFTER THIS STEP | AUTOPILOT MODE: AUTO-CREATE DRAFT PR | ROUTINE MODE: AUTO-CREATE DRAFT PR)
- Claude usage report, run just before the PR is created in every mode (and only when one is created):
  - From the repository root, run `python3 .claude/skills/team-ticket/scripts/claude_usage.py --ticket <TICKET-KEY> > .claude/metrics/claude-usage-<TICKET-KEY>.md`.
  - Show the user its summary line and the five most expensive rows.
  - Add the file's content unchanged as the last section of the PR description. It is a collapsed `<details>` block, so it does not count towards `raise-github-pr`'s length target. If `raise-github-pr` leaves it out, add it straight after with `gh pr edit <number> --body-file`.
  - On a resumed run where the PR already exists, replace the existing block rather than adding a second one.
  - The report is best effort: if the script fails, record the error in `PLAN.md` `## Notes` and raise the PR without it.
- `Standard Mode`:
  - Ask the user whether they want to raise a PR now.
  - If the user says yes:
    - Use the `raise-github-pr` skill if it is available in the current session.
    - If `raise-github-pr` is unavailable, use an equivalent `gh pr create` flow with base `main` unless the user specifies otherwise.
    - Share the PR title and URL.
  - If the user says no, explicitly acknowledge and stop.
- `Autopilot Mode`:
  - Do not ask for confirmation.
  - Raise a PR automatically using the `raise-github-pr` skill when available.
  - If `raise-github-pr` is unavailable, use an equivalent `gh pr create --draft` flow with base `main` unless the user specifies otherwise.
  - Default to a draft PR unless the user explicitly requested a ready-for-review PR.
  - Share the PR title and URL.
- `Routine Mode`:
  - Do not ask for confirmation.
  - Raise a PR automatically using the `raise-github-pr` skill when available.
  - Add any assumptions made if there were any blockers or unresolved questions in the `Notes` section of `PLAN.md` to the PR description.
  - If `raise-github-pr` is unavailable, use an equivalent `gh pr create --draft` flow with base `main` unless the user specifies otherwise.
  - Raise the PR as ready for review.
  - Share the PR title and URL.
- Update `PLAN.md` according to the rules above so completed work is marked `completed`, deferred work remains explicit, and final validation state and PR handoff details are resume-ready.
`Standard Mode`: STOP.
`Autopilot Mode`: STOP after reporting PR outcome.
`Routine Mode`: STOP after reporting PR outcome.

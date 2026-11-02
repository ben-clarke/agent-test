---
name: review-branch
description: >-
  Run the review panel — spec-compliance-review first, then the reviewer agents
  selected for the changed files — over a branch, a directory, or one named
  reviewer, and record review metrics. build-plan runs this in its Step 7 with
  a fix loop. Use directly when the user says "review this branch", "review my
  changes", "run the reviewers on <path>", "run security-review", or asks which
  reviewers are worth keeping (metrics report).
argument-hint: "[--base <ref>] [--path <dir>] [--agent <name>] [--fix | --fix-inline] [--to-files] [--run <id>] [--report]"
user-invocable: true
---

# Review branch

Role: orchestrator. Route the review to agents; do not review code yourself.

## Arguments

| Argument | Behavior |
|---|---|
| (none) | Review the current branch: committed changes since `origin/main` plus uncommitted changes |
| `--base <ref>` | Review changes since `<ref>` instead of `origin/main` |
| `--path <dir>` | Review every source file under `<dir>` (not a diff). Expect a large, expensive panel — say how many files before dispatching |
| `--agent <name>` | Run only that reviewer (for example `security-review`) on the selected files |
| `--fix` | After the panel, fix findings with `software-engineer` (see Fix loop). `build-plan` always passes this |
| `--fix-inline` | Same as `--fix`, but the calling session applies the fixes itself instead of dispatching `software-engineer`. `solo-ticket` passes this. Everything else in the Fix loop is unchanged |
| `--to-files` | File mode: reviewers write their findings to files and hand back one line each, so full findings stay out of the calling session (see File mode). `build-plan` and `solo-ticket` pass this. A standalone report-only run uses file mode without it (see Handoff file) |
| `--run <id>` | Metrics run id. Default `<branch name>@<short HEAD sha>`; `build-plan` and `solo-ticket` pass the run id recorded in `PLAN.md` `## Notes` |
| `--report` | Do not review. Print `review_metrics.py report` as a table and stop |

Without `--fix` or `--fix-inline`, the review is report-only: present the findings, then ask whether to fix them.

A **standalone report-only run** is one the user starts without `--fix`, `--fix-inline`, or `--report`, with or without `--agent`. It always runs in file mode and writes a handoff file another session can act on (see Handoff file). `--fix`, `--fix-inline`, and `--report` runs write no handoff file.

## Constraints

**Confirm agent-dispatch capability first.** If the `Agent` tool is not available, **STOP** and say so. Do not do the reviewers' work inline or present anything as reviewed.

1. **Do not review code yourself.** Every finding comes from a dispatched agent.
2. **Do not add findings beyond a reviewer's scope**, and do not drop a reviewer's `error` findings.
3. **Be concise.** Tables, not narration.

## Steps

### 1. Select the files

- **Branch (default):**
  ```bash
  BASE=$(git merge-base HEAD "${BASE_REF:-origin/main}")
  { git diff --name-only "$BASE"...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u
  ```
  Added files: `git diff --name-only --diff-filter=A "$BASE"...HEAD` plus untracked files.
- **`--path <dir>`:** every tracked file under `<dir>` (`git ls-files <dir>`). Treat all of them as changed; pass no added list.
- Exclude `node_modules`, `dist`, `build`, `coverage`, and lockfiles.
- Keep deleted files in the list passed to the resolver in Step 3: deleting a shared-package file or a `package.json` can make a change cross-package. Drop them only from the files passed to reviewers in Step 4 (`git diff --name-only --diff-filter=D "$BASE"...HEAD` plus `git diff --name-only --diff-filter=D HEAD`).
- No files left once deleted files are dropped → say "Nothing to review" and stop.

### 2. Spec compliance first

Skip this step with `--agent`, or when there is no `PLAN.md` and no matching spec in `docs/specs/`.

Dispatch `spec-compliance-review` with the changed files that still exist and all criteria and scenarios in scope (in file mode, as Step 4 describes). With `--fix` or `--fix-inline`, fix every `error` (Fix loop) before running the panel — there is no point reviewing quality on code that does not meet the spec.

### 3. Select the panel

With `--agent <name>`, the panel is that one agent. Otherwise:

```bash
python3 .claude/skills/review-branch/scripts/select_lenses.py \
  --files-from <changed-files-list> \
  [--added-from <added-files-list>]
```

It prints `{"lenses": [...], "warnings": [...]}`, cheap reviewers first, by reading each `.claude/agents/*-review.md` agent's `Scope:` line — a new reviewer is picked up without editing this skill. Also add `refactor-opportunity-review` whenever source files changed: it is `Scope: on-demand`, so the resolver never returns it. If the script fails, say so and select reviewers by hand from each agent's `Scope:` line — do not skip the panel.

### 4. Dispatch

Dispatch the panel in parallel by `subagent_type`. Pass each reviewer the changed files that still exist and the line `Files in scope for this review: <path>, <path>, ...`. If the repository has code review guidelines (`docs/CODE_REVIEW_GUIDELINES.md`), tell each reviewer to apply them.

Present the results grouped by severity, then by file: reviewer, file and line, one-sentence message, suggested fix. List the reviewers run, the reviewers skipped, and the resolver's warnings. The reviewers skipped are the roster reviewers missing from the final panel (after adding `refactor-opportunity-review` or applying `--agent`), so no reviewer is listed as both run and skipped; when the resolver gives a `skipped-<reason>:<name>` warning for one, show that reason (for example `arch-review — not-cross-package`). When called by `build-plan`, also write that list to `PLAN.md` `## Notes`.

#### File mode (`--to-files`)

Reviewers follow `## File mode` in `.claude/knowledge/review-agent-output-contract.md`. Take every timestamp from `date -u +%Y-%m-%dT%H:%M:%SZ`.

- Before the first dispatch, record `Review started: <timestamp>` in `PLAN.md` `## Notes`. A standalone run without a `PLAN.md` keeps the timestamp in the session instead.
- **Rounds.** Round 1 is the first dispatch; a re-dispatch after fixes made in round `n` is round `n+1`. The `spec-compliance-review` loop in Step 2 and the panel loop count separately; their files differ by reviewer name.
- **Dispatch.** Note the dispatch time, then pass each reviewer these three lines with the files in scope:
  ```text
  Findings file: <metrics-dir>/runs/<run-id>/round-<n>/<reviewer>.json
  Round: <n>
  File mode: follow `## File mode` in `.claude/knowledge/review-agent-output-contract.md` — write the findings JSON to the findings file and hand back only the one-line status.
  ```
  `<metrics-dir>` is `.claude/metrics` (Codex: `.claude/metrics/codex`); the reviewer write guard allows Claude reviewers to write only under `.claude/metrics/runs/`.
- **Check.** When a reviewer returns, run:
  ```bash
  python3 .claude/skills/review-branch/scripts/review_metrics.py --metrics-dir <metrics-dir> check --file <findings file> --since <dispatch time>
  ```
  It prints `<status> errors=<n> warnings=<n> suggestions=<n> <path>`. A non-zero exit is a failed dispatch, never a pass or "no findings": re-dispatch that reviewer once with full context for the same round (same path, new dispatch time), then escalate.
- **Present** each reviewer's check line instead of the findings text. With `--fix`, do not read the findings files: `software-engineer` and `record` read them. A standalone report-only run presents the handoff file's findings instead (see Handoff file).

#### Handoff file (standalone report-only run)

Once every reviewer has returned and passed `check`, or failed it after its one re-dispatch, render the findings to `.claude/plans/review-<KEY>.md`:

```bash
python3 .claude/skills/review-branch/scripts/render_review.py --metrics-dir <metrics-dir> \
  --run <run> --since <review started> --branch "$(git branch --show-current)" --base <base ref> \
  --head <short HEAD sha when the review started> --reviewers <every reviewer dispatched> \
  --skipped <name>=<reason> ...
```

- `<KEY>` is the first Jira key (`<PROJECT>-<digits>`) in the branch name, or the branch name with `/` replaced by `-`. The script replaces any earlier file at that path and prints the path.
- Pass every reviewer dispatched, including `spec-compliance-review`. A reviewer whose findings file still fails `check` is listed as `failed`, never as clean, so do not leave it out.
- Pass the reviewers skipped with their reasons, as in Step 4. Use `none` as the reason when the resolver gives none.
- Show the file's `## Findings` section in chat (grouped by severity, then by file), then the reviewers run and skipped, the resolver's warnings, and the line `Handoff file: <printed path>`.
- If the script fails, say so and present the findings from the findings files instead. Do not skip the review.

### 5. Fix loop (`--fix` or `--fix-inline`)

Fix `error`-level and actionable `warning` findings grouped by file. With `--fix`, send them to `software-engineer` under its Review Feedback Protocol. With `--fix-inline`, apply them yourself in the calling session: do not dispatch `software-engineer`, and run the scoped test, changed-file lint, and type-check yourself and keep the passing output as the evidence. Do not re-run the checks yourself between rounds. Confirm passing scoped test, changed-file lint, and type-check evidence exists: with `--fix`, note the round's dispatch time, pass `software-engineer` the line `Evidence file: <metrics-dir>/runs/<run-id>/evidence/review-fix-<loop>-r<n>.log`, where `<loop>` is `spec` for the Step 2 loop and `panel` for the panel loop so the two loops keep separate evidence, and gate the round on `check_evidence.py --evidence <that file> --since <dispatch time> --require <kinds>` with the kinds `build-plan` Step 5 uses; a non-zero exit is a failed fix iteration. Missing evidence is a failure. Then re-run only the reviewers that reported those findings, against the files that changed. Suggestion-level findings are recorded, never chased. After 2 fix iterations that do not converge, escalate to the user. Where two reviewers' findings conflict, ask the user.

**In file mode**, send findings by path, not text:

- Pass the fixer the findings files whose check line shows `errors` or `warnings` above zero. With `--fix`, `software-engineer` reads them under its Review Feedback Protocol. With `--fix-inline`, read those files yourself and apply the same rule.
- The fixer fixes every `error` and actionable `warning` in those files and reports `Fixed: <ids>` and `Skipped: <id> — <reason>` for each one left unfixed. Keep both id lists for Step 6. A skipped `error` escalates to the user.
- Re-dispatch only the reviewers named by the fixed ids (the id with its trailing `-r<n>-<number>` removed), as round `n+1`.

When the loop ends, if any fix changed code, run the full `pnpm test run`, `pnpm lint`, and `pnpm typecheck` once for every affected package, through the wrapper described in `build-plan`'s Full runs section. This is the only full run in the fix loop. A failure goes back to the fixer (`software-engineer`, or you with `--fix-inline`) as correction context and counts as a fix iteration.

### 6. Record metrics

Always, once the review (and any fix loop) has finished. Use the `--run` id, or `<branch name>@<short HEAD sha when the review started>` by default. Recording is fail-open: never let it block or fail the review.

In file mode, step 1 is a single command instead, which reads every findings file written since the review started:
`python3 .claude/skills/review-branch/scripts/review_metrics.py --metrics-dir <metrics-dir> record --run <run> --since <review started> --fixed <every fixed id> --skipped <every skipped id>`
It prints the number of findings recorded and any skipped files. In step 2, add `--since <review started>` so the counts cover this review only.

1. For every finding from every reviewer (including `spec-compliance-review`), record it once, with the fix round it was first raised in and `--fixed` if it was resolved:
   `python3 .claude/skills/review-branch/scripts/review_metrics.py finding --run <run> --lens <reviewer> --category <category> --severity <error|warning|suggestion> --iteration <round> [--fixed]`
2. Record the review run, listing every reviewer dispatched:
   `python3 .claude/skills/review-branch/scripts/review_metrics.py review --run <run> --agents <reviewer> ... --fix-iterations <rounds> --outcome <no-op|fixed|escalated> --diff-shape <test-only|mixed>`
   `outcome` is `no-op` when nothing was found, `fixed` when findings were fixed, and `escalated` when the fix loop did not converge or findings were left unfixed. On a report-only run, record the outcome after the user decides whether to fix. `diff-shape` is `test-only` only when every changed file is a test file.

`review_metrics.py report` summarises every recorded run per reviewer. A reviewer with mostly no-op runs is a candidate to drop; a category that fires often belongs in that reviewer's `## Authoring checklist`.

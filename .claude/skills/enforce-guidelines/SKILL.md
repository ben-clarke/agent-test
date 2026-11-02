---
name: enforce-guidelines
description: Strictly review the current branch or local working-tree changes against AGENTS.md and the repository guideline docs using static analysis only. Use when asked to review local changes, audit the current branch diff, enforce repo guidelines, or proactively suggest code-quality improvements based on AGENTS.md, React, Remix, unit-testing, or Playwright guidance without running validation commands.
---

# Enforce Guidelines

Use this skill to perform a strict, adversarial review of the current branch and working tree. This is a review skill, not an implementation skill.

Do not hand-wave compliance. If the diff does not clearly prove that a repository rule is satisfied, raise a finding instead of assuming the change is acceptable.
Do not run validation commands. This skill is limited to static review of the changed code and nearby context.
This skill should improve code quality, not just block risky merges. Be proactive about surfacing guideline-aligned improvements when the changed code could be stronger, clearer, or more consistent with repository standards.

## Review Scope

Review the current working-tree snapshot relative to local `origin/main`, including:

- committed branch changes between `git merge-base HEAD origin/main` and `HEAD`
- staged tracked changes
- unstaged tracked changes
- relevant untracked source, test, and skill files

Always gather scope with:

```bash
bash .claude/skills/enforce-guidelines/scripts/collect-branch-review-scope.sh
```

If the script reports that local `origin/main` is unavailable, stop and report that you cannot produce a reliable branch review baseline. Do not guess or silently fall back to another base.

## Workflow

1. Confirm you are at the repository root.
2. Run the scope collection script and use its output as the review baseline and change inventory.
3. Always read:
   - `AGENTS.md`
   - `docs/CODE_REVIEW_GUIDELINES.md`
4. Conditionally read additional guideline docs based on the touched files and change type:
   - Read `docs/guidelines/REACT_COMPONENT_GUIDELINES.md` for React/component/UI changes such as `*.tsx`, `client/components/**`, `app/components/**`, `packages/ui/**`, or `packages/design-system/**`.
   - Read `docs/guidelines/REMIX_GUIDELINES.md` for route-backed or Remix structure changes such as `app/routes/**`, `app/route-handlers/**`, route loaders, actions, validators, or route-local server/client splits.
   - Read `docs/guidelines/UNIT_TESTING_GUIDELINES.md` for Vitest, unit-test, or integration-style test work such as `__tests__/**`, `*.test.ts`, or `*.test.tsx`.
   - Read `docs/guidelines/PLAYWRIGHT_TESTING_GUIDELINES.md` when Playwright files change and whenever a user-visible UI flow changes, even if no Playwright spec was added. In that case, explicitly check whether the change includes a clear rationale for not adding Playwright coverage.
5. Review all changed files plus the surrounding context needed to judge structure, not just added lines.
6. Never execute `test`, `lint`, `typecheck`, `build`, `play:test`, or similar validation commands as part of this skill.
7. Produce findings and proactive improvement suggestions in repository review format only after checking the rules below.

## Review Standard

Apply a fail-closed standard:

- Passing tests are evidence, not approval.
- No executed validation is required or expected here; absence of executed checks is not itself a finding because this skill must not run them.
- Do not infer compliance from nearby legacy code, naming intent, or partial refactors.
- Do not substitute your own materiality threshold for a documented repository rule. If the diff does not clearly satisfy the rule, raise the issue even when the practical harm seems small.
- Do not reason from "this is probably fine" or "this is only a small helper/component" to excuse a rule miss. Judge first whether the documented rule is satisfied; only then discuss severity.
- Missing rationale counts against the change when the repository rules require an explicit decision, especially for Playwright coverage and deliberate deviations from React or Remix guidance.
- Prefer `P1` or `P2` findings when a repository rule appears unmet. Do not downgrade concrete defects into soft advice.
- Use `No findings` only when the diff and surrounding evidence clearly support compliance.
- Treat repository rules as binding by default. Only treat a statement as optional when the source document explicitly uses softening language such as `prefer`, `favour`, `consider`, `acceptable`, `pragmatic`, `when practical`, or equivalent.
- Even when a rule is phrased as a preference, raise a finding if the change moves in the opposite direction without a clear diff-local reason or required rationale.
- When in doubt between "guideline preference" and "repository rule", resolve the ambiguity strictly and raise the issue.
- When a change violates a documented structural or stylistic rule, do not dismiss it solely because the code is still readable, local, low-risk, or behaviour-preserving.
- Do not stop at merge blockers. Also identify non-blocking but worthwhile improvements when the diff misses a stronger repository-preferred pattern.
- Treat repository preferences as actionable review input. If the code is acceptable but not aligned with a documented preferred pattern, surface that as a proactive suggestion unless there is an obvious local reason not to.
- Bias toward useful specificity. Prefer concrete, code-local improvement suggestions over broad style commentary.

## What To Check

Always review against `AGENTS.md`, including:

- type safety rules such as no `any`, no casual assertions, explicit domain types, and interface-vs-type guidance
- naming conventions for functions, types, constants, files, booleans, and environment variables
- structure rules such as main/public functions first, helpers below, types near the bottom, constants at the bottom, and constant files exporting primitive values only
- implementation style such as immutable updates, early returns, focused functions, options objects where appropriate, and avoiding nested conditionals
- logger usage, including reuse of shared log fields when multiple log lines share common metadata
- required review-visible rationale, such as Playwright coverage decisions or deliberate deviations that the repository rules say must be explained

When relevant, also check:

- React placement, component scope, composition, prop shape, route thinness, and constants usage from `docs/guidelines/REACT_COMPONENT_GUIDELINES.md`
- Remix route thinness, route-handler structure, server/client boundaries, validation at the edge, and extraction rules from `docs/guidelines/REMIX_GUIDELINES.md`
- unit-test structure, naming, mocking, behavioural coverage, DOM testing conventions, and route/controller testing patterns from `docs/guidelines/UNIT_TESTING_GUIDELINES.md`
- Playwright scope, selector strategy, page-object discipline, targeted execution, and whether user-visible changes should have Playwright coverage or an explicit rationale from `docs/guidelines/PLAYWRIGHT_TESTING_GUIDELINES.md`

## Output Contract

Follow `docs/CODE_REVIEW_GUIDELINES.md` exactly.

Findings come first, ordered by severity. Each finding must include:

- `Severity`: `P0`, `P1`, `P2`, or `P3`
- `Location`: file and line, as narrowly as possible
- `Issue`: the concrete problem
- `Why it matters`: the impact on behaviour, maintainability, risk, or delivery confidence
- `Suggested fix`: the smallest practical correction

After findings, add a `Suggestions` section whenever you can identify improvements that are supported by the repository guidelines but are not strong enough to classify as findings. Suggestions should still be concrete and anchored to changed code. Each suggestion should include:

- `Location`: file and line, as narrowly as possible
- `Opportunity`: the improvement to make
- `Why it helps`: the maintainability, consistency, readability, or guideline-alignment benefit
- `Suggested change`: the smallest practical improvement

Do not suppress suggestions just because the code is technically acceptable. If the repository docs point toward a better pattern and the diff is a reasonable place to apply it, bring it up.

After findings and suggestions, include:

- open questions or assumptions
- review limits or evidence gaps, including that no validation commands were run by design
- a brief summary only at the end

If no concrete issues are found, say `No findings`. Still provide proactive suggestions when available, and still mention any residual risk or validation gaps.

## Boundaries

- Do not approve a change purely because tests pass.
- Do not run tests, linters, typecheckers, builds, or any other validation commands.
- Do not ask the user to run validation commands as part of this skill's workflow.
- Do not implement fixes unless the user separately asks for them.
- Do not search beyond the changed files unless nearby context is needed to judge structure, ownership, or test coverage.
- Do not invent optional suggestions that are unsupported by the repository guidance. Suggestions must still trace back to documented standards or a clear consequence in the changed code.

"""Behaviour of the standalone review handoff file, run through its CLI."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import render_review  # noqa: E402


class RenderReviewBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.metrics = self.base / "metrics"
        self.plans = self.base / "plans"

    def render(self, *, branch: str | None = None, reviewers: tuple[str, ...] = ("security-review",),
               skipped: tuple[str, ...] = ()) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        arguments = [
            "--metrics-dir", str(self.metrics), "--output-dir", str(self.plans), "--run", RUN,
            "--since", REVIEW_STARTED, "--branch", branch or BRANCH, "--base", "origin/main", "--head", "abc1234",
            "--reviewers", *reviewers,
        ]
        if skipped:
            arguments.extend(["--skipped", *skipped])
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = render_review.main(arguments)
        return code, stdout.getvalue(), stderr.getvalue()

    def write_findings(self, reviewer: str, document: object, *, round_number: int = 1,
                       written_at: str | None = None) -> None:
        path = self.metrics / "runs" / RUN / f"round-{round_number}" / f"{reviewer}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(document if isinstance(document, str) else json.dumps(document))
        set_written_at(path, written_at or AFTER_START)

    def handoff(self, key: str = "PROJ-2377") -> str:
        return (self.plans / f"review-{key}.md").read_text()


class HandoffFileLocation(RenderReviewBehaviour):
    def test_given_a_branch_with_a_ticket_key_when_rendered_then_the_file_is_named_after_the_key_and_its_path_printed(self) -> None:
        self.write_findings("security-review", findings_document(status="pass", issues=[]))

        code, stdout, stderr = self.render(branch="feature/bc-proj-2377-plan-review-handoffs")

        self.assertEqual((code, stderr), (0, ""))
        self.assertEqual(stdout, f"{self.plans / 'review-PROJ-2377.md'}\n")
        self.assertIn("# Review handoff: PROJ-2377\n", self.handoff())

    def test_given_a_branch_without_a_ticket_key_when_rendered_then_the_file_is_named_after_the_branch(self) -> None:
        self.write_findings("security-review", findings_document(status="pass", issues=[]))

        code, stdout, _ = self.render(branch="spike/try-renderer")

        self.assertEqual(code, 0)
        self.assertEqual(stdout, f"{self.plans / 'review-spike-try-renderer.md'}\n")
        self.assertIn("- Branch: `spike/try-renderer`\n", self.handoff("spike-try-renderer"))

    def test_given_an_earlier_handoff_file_when_rendered_again_then_it_is_replaced(self) -> None:
        self.plans.mkdir()
        (self.plans / "review-PROJ-2377.md").write_text("earlier review with a stale finding\n")
        self.write_findings("security-review", findings_document(status="pass", issues=[]))

        self.render()

        self.assertNotIn("stale finding", self.handoff())
        self.assertIn("No findings", self.handoff())


class HandoffFileContents(RenderReviewBehaviour):
    def test_given_findings_from_several_reviewers_when_rendered_then_they_are_grouped_by_severity_then_file(self) -> None:
        self.write_findings("security-review", findings_document(status="fail", issues=[
            issue("security-review", 1, severity="warning", file="app/b.ts", line=4),
            issue("security-review", 2, severity="error", file="app/b.ts", line=9),
        ]))
        self.write_findings("naming-review", findings_document(status="warn", issues=[
            issue("naming-review", 1, severity="warning", file="app/a.ts", line=20),
            issue("naming-review", 2, severity="suggestion", file="app/a.ts", line=None),
            issue("naming-review", 3, severity="warning", file="app/a.ts", line=3),
        ]))

        code, _, _ = self.render(reviewers=("security-review", "naming-review"),
                                 skipped=("arch-review=not-cross-package", "a11y-review=no-ui-files"))

        self.assertEqual(code, 0)
        self.assertEqual(self.handoff(), """\
# Review handoff: PROJ-2377

- Branch: `feature/bc-PROJ-2377-plan-review-handoffs`
- Base: `origin/main`
- HEAD: `abc1234`
- Reviewed: 2026-10-29T10:00:00Z

## Reviewers run

| Reviewer | Result |
| --- | --- |
| security-review | fail |
| naming-review | warn |

## Reviewers skipped

- arch-review — not-cross-package
- a11y-review — no-ui-files

## Findings

### error

#### `app/b.ts`

- `security-review-r1-2` (security-review) `app/b.ts:9` — security-review finding 2
  - Fix: Fix security-review finding 2

### warning

#### `app/a.ts`

- `naming-review-r1-3` (naming-review) `app/a.ts:3` — naming-review finding 3
  - Fix: Fix naming-review finding 3
- `naming-review-r1-1` (naming-review) `app/a.ts:20` — naming-review finding 1
  - Fix: Fix naming-review finding 1

#### `app/b.ts`

- `security-review-r1-1` (security-review) `app/b.ts:4` — security-review finding 1
  - Fix: Fix security-review finding 1

### suggestion

#### `app/a.ts`

- `naming-review-r1-2` (naming-review) `app/a.ts` — naming-review finding 2
  - Fix: Fix naming-review finding 2

To act on this review: fix every `error` and actionable `warning`, skip suggestions, then re-run `/review-branch`.
""")

    def test_given_no_reviewer_reports_anything_when_rendered_then_the_file_lists_the_reviewers_and_states_no_findings(self) -> None:
        self.write_findings("security-review", findings_document(status="pass", issues=[]))
        self.write_findings("js-fp-review", findings_document(status="skip", issues=[], summary="No JS/TS files"))

        self.render(reviewers=("security-review", "js-fp-review"), skipped=("arch-review=not-cross-package",))

        handoff = self.handoff()
        self.assertIn("| security-review | pass |\n| js-fp-review | skip — No JS/TS files |\n", handoff)
        self.assertIn("- arch-review — not-cross-package\n", handoff)
        self.assertIn("## Findings\n\nNo findings\n", handoff)

    def test_given_no_reviewer_was_skipped_when_rendered_then_skipped_reviewers_says_none(self) -> None:
        self.write_findings("security-review", findings_document(status="pass", issues=[]))

        self.render()

        self.assertIn("## Reviewers skipped\n\n- None\n", self.handoff())

    def test_given_a_reviewer_re_dispatched_in_a_later_round_when_rendered_then_only_its_latest_findings_are_listed(self) -> None:
        self.write_findings("security-review", findings_document(status="warn", issues=[
            issue("security-review", 1, severity="warning", file="app/old.ts", line=1),
        ]))
        self.write_findings("security-review", findings_document(status="pass", issues=[]), round_number=2)

        self.render()

        self.assertNotIn("app/old.ts", self.handoff())
        self.assertIn("| security-review | pass |", self.handoff())

    def test_given_a_run_reused_by_a_new_review_when_rendered_then_an_earlier_reviews_later_round_is_ignored(self) -> None:
        self.write_findings("security-review", findings_document(status="pass", issues=[]), round_number=2,
                            written_at=BEFORE_START)
        self.write_findings("security-review", findings_document(status="warn", issues=[
            issue("security-review", 1, severity="warning", file="app/new.ts", line=1),
        ]))

        self.render()

        self.assertIn("| security-review | warn |", self.handoff())
        self.assertIn("`security-review-r1-1` (security-review) `app/new.ts:1`", self.handoff())


class FailedReviewer(RenderReviewBehaviour):
    def test_given_a_reviewer_with_no_findings_file_when_rendered_then_it_is_listed_as_failed(self) -> None:
        self.write_findings("security-review", findings_document(status="pass", issues=[]))

        self.render(reviewers=("security-review", "naming-review"))

        self.assertIn("| naming-review | failed — no findings file |", self.handoff())

    def test_given_a_malformed_findings_file_when_rendered_then_the_reviewer_is_failed_not_clean(self) -> None:
        self.write_findings("security-review", "not json")

        self.render()

        self.assertIn("| security-review | failed — not valid JSON |", self.handoff())

    def test_given_a_findings_file_from_before_the_review_when_rendered_then_the_reviewer_is_failed(self) -> None:
        self.write_findings("security-review", findings_document(status="pass", issues=[]), written_at=BEFORE_START)

        self.render()

        self.assertIn("| security-review | failed — older than the review", self.handoff())


class InvalidArguments(RenderReviewBehaviour):
    def test_given_an_unreadable_review_start_when_rendered_then_no_file_is_written(self) -> None:
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            code = render_review.main([
                "--output-dir", str(self.plans), "--run", RUN, "--since", "yesterday", "--branch", BRANCH,
                "--base", "origin/main", "--head", "abc1234", "--reviewers", "security-review",
            ])

        self.assertEqual(code, 2)
        self.assertIn("--since 'yesterday'", stderr.getvalue())
        self.assertFalse(self.plans.exists())

    def test_given_a_skipped_reviewer_without_a_reason_when_rendered_then_no_file_is_written(self) -> None:
        code, _, stderr = self.render(skipped=("arch-review",))

        self.assertEqual(code, 2)
        self.assertEqual(stderr, "--skipped entries must read <name>=<reason>\n")
        self.assertFalse(self.plans.exists())


def findings_document(*, status: str, issues: list[dict], summary: str = "Reviewed") -> dict:
    return {"status": status, "issues": issues, "summary": summary}


def issue(reviewer: str, number: int, *, severity: str, file: str, line: int | None) -> dict:
    return {"id": f"{reviewer}-r1-{number}", "severity": severity, "confidence": "high", "file": file, "line": line,
            "message": f"{reviewer} finding {number}", "suggestedFix": f"Fix {reviewer} finding {number}"}


def set_written_at(path: Path, moment: str) -> None:
    timestamp = render_review.findings_file.parse_utc(moment).timestamp()
    os.utime(path, (timestamp, timestamp))


BRANCH = "feature/bc-PROJ-2377-plan-review-handoffs"
RUN = "feature/bc-PROJ-2377-plan-review-handoffs@abc1234"
REVIEW_STARTED = "2026-10-29T10:00:00Z"
AFTER_START = "2026-10-29T10:05:00Z"
BEFORE_START = "2026-10-29T09:55:00Z"


if __name__ == "__main__":
    unittest.main()

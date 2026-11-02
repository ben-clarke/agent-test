"""Behaviour of the review metrics recorder, run through its CLI."""

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
import review_metrics  # noqa: E402


class ReviewMetricsBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.metrics = self.base / "metrics"

    def run_metrics(self, *arguments: str) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = review_metrics.main(["--metrics-dir", str(self.metrics), *arguments])
        return code, stdout.getvalue(), stderr.getvalue()

    def rows(self, name: str) -> list[dict]:
        return [json.loads(line) for line in (self.metrics / name).read_text().splitlines()]

    def findings_path(self, reviewer: str = "security-review", round_number: int = 1) -> Path:
        return self.metrics / "runs" / RUN / f"round-{round_number}" / f"{reviewer}.json"

    def write_findings(self, document: object, *, path: Path | None = None, written_at: str | None = None) -> Path:
        target = path or self.findings_path()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(document if isinstance(document, str) else json.dumps(document))
        set_written_at(target, written_at or AFTER_DISPATCH)
        return target

    def check(self, path: Path, since: str | None = None) -> tuple[int, str, str]:
        return self.run_metrics("check", "--file", str(path), "--since", since or DISPATCHED)

    def assert_check_fails(self, path: Path, reason: str) -> None:
        code, stdout, stderr = self.check(path)
        self.assertEqual(code, 1)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr, f"invalid findings file {path}: {reason}\n")


class CheckFindingsFile(ReviewMetricsBehaviour):
    def test_given_a_valid_findings_file_when_checked_then_it_prints_status_counts_and_path(self) -> None:
        path = self.write_findings(findings_document(
            status="warn", issues=[issue(1, severity="warning"), issue(2, severity="suggestion")],
        ))

        code, stdout, stderr = self.check(path)

        self.assertEqual(code, 0)
        self.assertEqual(stdout, f"warn errors=0 warnings=1 suggestions=1 {path.resolve()}\n")
        self.assertEqual(stderr, "")

    def test_given_a_passing_reviewer_with_no_findings_when_checked_then_it_reports_zero_findings(self) -> None:
        path = self.write_findings(findings_document(status="pass", issues=[]))

        code, stdout, _ = self.check(path)

        self.assertEqual(code, 0)
        self.assertEqual(stdout, f"pass errors=0 warnings=0 suggestions=0 {path.resolve()}\n")

    def test_given_a_file_written_in_the_dispatch_second_when_checked_then_it_is_fresh(self) -> None:
        path = self.write_findings(findings_document(status="skip", issues=[]), written_at=DISPATCHED)

        code, _, _ = self.check(path)

        self.assertEqual(code, 0)

    def test_given_a_pass_with_only_suggestions_when_checked_then_it_is_accepted(self) -> None:
        path = self.write_findings(
            findings_document(status="pass", issues=[issue(1, reviewer="logging-review", severity="suggestion")]),
            path=self.findings_path("logging-review"),
        )

        code, stdout, _ = self.check(path)

        self.assertEqual(code, 0)
        self.assertTrue(stdout.startswith("pass errors=0 warnings=0 suggestions=1 "))

    def test_given_a_spec_finding_with_low_confidence_and_no_line_when_checked_then_it_is_accepted(self) -> None:
        spec_issue = {**issue(1, reviewer="spec-compliance-review"), "confidence": "low", "line": None}
        path = self.write_findings(findings_document(status="warn", issues=[spec_issue]),
                                   path=self.findings_path("spec-compliance-review"))

        code, stdout, _ = self.check(path)

        self.assertEqual(code, 0)
        self.assertTrue(stdout.startswith("warn errors=0 warnings=1 suggestions=0 "))

    def test_given_a_failing_reviewer_with_an_error_when_checked_then_it_counts_the_error(self) -> None:
        path = self.write_findings(findings_document(status="fail", issues=[issue(1, severity="error")]))

        code, stdout, _ = self.check(path)

        self.assertEqual(code, 0)
        self.assertTrue(stdout.startswith("fail errors=1 warnings=0 suggestions=0 "))

    def test_given_no_findings_file_when_checked_then_the_dispatch_failed(self) -> None:
        self.assert_check_fails(self.findings_path(), "missing")

    def test_given_a_file_left_from_an_earlier_attempt_when_checked_then_it_is_stale(self) -> None:
        path = self.write_findings(findings_document(status="pass", issues=[]), written_at=BEFORE_DISPATCH)

        self.assert_check_fails(path, f"older than the dispatch ({BEFORE_DISPATCH} < {DISPATCHED})")

    def test_given_a_directory_at_the_findings_path_when_checked_then_it_is_unreadable(self) -> None:
        path = self.findings_path()
        path.mkdir(parents=True)
        set_written_at(path, AFTER_DISPATCH)

        code, _, stderr = self.check(path)

        self.assertEqual(code, 1)
        self.assertIn(f"invalid findings file {path}: unreadable", stderr)

    def test_given_a_path_outside_a_round_directory_when_checked_then_the_round_cannot_be_derived(self) -> None:
        path = self.write_findings(
            findings_document(status="pass", issues=[]), path=self.metrics / "runs" / RUN / "security-review.json",
        )

        self.assert_check_fails(path, f"round cannot be derived from directory {RUN!r}")

    def test_given_a_malformed_findings_file_when_checked_then_the_reason_names_the_defect(self) -> None:
        cases = [
            ("not JSON", "{status", "not valid JSON"),
            ("not an object", "[]", "not a JSON object"),
            ("unknown status", findings_document(status="ok", issues=[]),
             "status 'ok' is not one of pass, warn, fail, skip"),
            ("issues not a list", findings_document(status="pass", issues={}), "issues is not a list"),
            ("issue not an object", findings_document(status="warn", issues=["text"]), "an issue is not an object"),
            ("unknown severity", findings_document(status="warn", issues=[issue(1, severity="minor")]),
             "issue 'security-review-r1-1' has severity 'minor', not one of error, warning, suggestion"),
            ("issue without id", findings_document(status="warn", issues=[{"severity": "warning"}]),
             "an issue has no id"),
            ("duplicate ids", findings_document(status="warn", issues=[issue(1), issue(1)]),
             "id 'security-review-r1-1' is used more than once"),
            ("id from another round", findings_document(status="warn", issues=[{**issue(1), "id": "security-review-r2-1"}]),
             "id 'security-review-r2-1' does not match security-review-r1-<number>"),
            ("pass listing a warning", findings_document(status="pass", issues=[issue(1)]),
             "status pass lists errors or warnings"),
            ("summary not a string", {"status": "pass", "issues": []}, "summary is not a string"),
            ("skip without a reason", {"status": "skip", "issues": [], "summary": " "},
             "status skip has no summary explaining the skip"),
            ("issue without a file", findings_document(status="warn", issues=[{**issue(1), "file": ""}]),
             "issue 'security-review-r1-1' has no file"),
            ("issue without a message", findings_document(status="warn", issues=[without(issue(1), "message")]),
             "issue 'security-review-r1-1' has no message"),
            ("issue without a suggested fix", findings_document(status="warn", issues=[{**issue(1), "suggestedFix": 3}]),
             "issue 'security-review-r1-1' has no suggestedFix"),
            ("negative line", findings_document(status="warn", issues=[{**issue(1), "line": -1}]),
             "issue 'security-review-r1-1' has line -1, not a non-negative integer or null"),
            ("text line", findings_document(status="warn", issues=[{**issue(1), "line": "12"}]),
             "issue 'security-review-r1-1' has line '12', not a non-negative integer or null"),
            ("unknown confidence", findings_document(status="warn", issues=[{**issue(1), "confidence": "low"}]),
             "issue 'security-review-r1-1' has confidence 'low', not one of high, medium, none"),
            ("fail without issues", findings_document(status="fail", issues=[]), "status fail has no issues"),
            ("warn without issues", findings_document(status="warn", issues=[]), "status warn has no issues"),
        ]
        for name, document, reason in cases:
            with self.subTest(name):
                path = self.write_findings(document)

                self.assert_check_fails(path, reason)

    def test_given_an_unreadable_dispatch_time_when_checked_then_it_is_a_usage_error(self) -> None:
        path = self.write_findings(findings_document(status="pass", issues=[]))

        code, _, stderr = self.check(path, since="27 Oct 10:00")

        self.assertEqual(code, 2)
        self.assertEqual(stderr, "invalid --since '27 Oct 10:00': expected YYYY-MM-DDTHH:MM:SSZ\n")


class RecordFindingsAndReviews(ReviewMetricsBehaviour):
    def test_given_findings_and_a_review_when_recorded_then_counts_are_derived_from_that_runs_findings(self) -> None:
        self.run_metrics("finding", "--run", RUN, "--lens", "security-review", "--category", "A03.injection",
                         "--severity", "error", "--fixed")
        self.run_metrics("finding", "--run", RUN, "--lens", "naming-review", "--category", "magic-value",
                         "--severity", "warning", "--iteration", "2")
        self.run_metrics("finding", "--run", "PROJ-1@other", "--lens", "naming-review", "--category", "x")

        code, stdout, _ = self.run_metrics("review", "--run", RUN, "--agents", "naming-review", "security-review",
                                           "naming-review", "--fix-iterations", "1", "--outcome", "fixed")

        self.assertEqual((code, stdout), (0, ""))
        review = self.rows("review-value.jsonl")[0]
        self.assertEqual(review["agents_run"], ["naming-review", "security-review"])
        self.assertEqual(review["issues_found"], 2)
        self.assertEqual(review["severity_breakdown"], {"errors": 1, "warnings": 1, "suggestions": 0})
        self.assertEqual(review["issues_fixed"], 1)
        self.assertEqual((review["fix_iterations"], review["outcome"], review["diff_shape"]), (1, "fixed", "mixed"))
        finding = self.rows("review-findings.jsonl")[1]
        self.assertEqual(
            {key: finding[key] for key in ("run", "lens", "category", "severity", "iteration", "fixed")},
            {"run": RUN, "lens": "naming-review", "category": "magic-value", "severity": "warning",
             "iteration": 2, "fixed": False},
        )

    def test_given_a_metrics_dir_that_cannot_be_written_when_recording_then_it_fails_open(self) -> None:
        self.metrics.write_text("not a directory")

        code, _, _ = self.run_metrics("finding", "--run", RUN, "--lens", "security-review", "--category", "x")

        self.assertEqual(code, 0)


class RecordFromFindingsFiles(ReviewMetricsBehaviour):
    def record(self, *options: str) -> tuple[int, str, str]:
        return self.run_metrics("record", "--run", RUN, "--since", DISPATCHED, *options)

    def write_round(self, reviewer: str, round_number: int, issues: list[dict], *, status: str = "warn",
                    written_at: str | None = None) -> Path:
        return self.write_findings(findings_document(status=status, issues=issues),
                                   path=self.findings_path(reviewer, round_number), written_at=written_at)

    def recorded(self) -> list[dict]:
        return self.rows("review-findings.jsonl")

    def test_given_current_findings_files_when_recorded_then_every_finding_has_its_round_and_fixed_flag(self) -> None:
        self.write_round("security-review", 1, [issue(1, severity="error"), issue(2, severity="warning")], status="fail")
        self.write_round("naming-review", 1, [issue(1, reviewer="naming-review", severity="suggestion")])
        self.write_round("security-review", 2, [issue(1, round_number=2, severity="warning")])

        code, stdout, stderr = self.record("--fixed", "security-review-r1-1", "security-review-r1-2",
                                           "--skipped", "security-review-r2-1")

        self.assertEqual(code, 0)
        self.assertEqual(stdout, f"recorded 4 findings from 3 files for {RUN}, skipped=0\n")
        self.assertEqual(stderr, "")
        self.assertEqual(
            [(row["id"], row["lens"], row["category"], row["severity"], row["iteration"], row["fixed"],
              row["review_started"]) for row in self.recorded()],
            [("naming-review-r1-1", "naming-review", "A03.injection", "suggestion", 1, False, DISPATCHED),
             ("security-review-r1-1", "security-review", "A03.injection", "error", 1, True, DISPATCHED),
             ("security-review-r1-2", "security-review", "A03.injection", "warning", 1, True, DISPATCHED),
             ("security-review-r2-1", "security-review", "A03.injection", "warning", 2, False, DISPATCHED)],
        )

    def test_given_recorded_findings_when_the_review_is_recorded_then_its_count_equals_the_findings_in_the_files(self) -> None:
        self.run_metrics("finding", "--run", RUN, "--lens", "naming-review", "--category", "earlier-review")
        self.write_round("security-review", 1, [issue(1, severity="error"), issue(2)], status="fail")
        self.record("--fixed", "security-review-r1-1", "security-review-r1-2")

        self.run_metrics("review", "--run", RUN, "--agents", "security-review", "--outcome", "fixed",
                         "--since", DISPATCHED)

        review = self.rows("review-value.jsonl")[0]
        self.assertEqual((review["issues_found"], review["issues_fixed"]), (2, 2))

    def test_given_a_second_review_in_the_same_run_when_recorded_then_it_is_recorded_and_counted_separately(self) -> None:
        self.write_round("security-review", 1, [issue(1)], written_at=AFTER_DISPATCH)
        self.record("--fixed", "security-review-r1-1")
        later_review = "2026-10-27T11:00:00Z"
        self.write_round("security-review", 1, [issue(1), issue(2)], written_at="2026-10-27T11:05:00Z")

        _, stdout, _ = self.run_metrics("record", "--run", RUN, "--since", later_review,
                                        "--fixed", "security-review-r1-1", "security-review-r1-2")
        self.run_metrics("review", "--run", RUN, "--agents", "security-review", "--outcome", "fixed",
                         "--since", later_review)

        self.assertEqual(stdout, f"recorded 2 findings from 1 files for {RUN}, skipped=0\n")
        self.assertEqual(len(self.recorded()), 3)
        self.assertEqual(self.rows("review-value.jsonl")[0]["issues_found"], 2)

    def test_given_a_file_from_an_earlier_review_when_recorded_then_it_is_skipped_as_older(self) -> None:
        stale = self.write_round("naming-review", 1, [issue(1, reviewer="naming-review")], written_at=BEFORE_DISPATCH)
        self.write_round("security-review", 1, [], status="pass")

        _, stdout, _ = self.record()

        self.assertEqual(stdout, (
            f"recorded 0 findings from 1 files for {RUN}, skipped=1\n"
            f"skipped {stale}: older than the review ({BEFORE_DISPATCH} < {DISPATCHED})\n"
        ))
        self.assertFalse((self.metrics / "review-findings.jsonl").exists())

    def test_given_a_file_rewritten_by_a_retry_when_recorded_then_it_is_recorded_once_in_its_round(self) -> None:
        self.write_round("security-review", 1, [issue(1, severity="suggestion")], written_at="2026-10-27T10:20:00Z")

        _, stdout, _ = self.record()

        self.assertEqual(stdout, f"recorded 1 findings from 1 files for {RUN}, skipped=0\n")
        self.assertEqual([row["iteration"] for row in self.recorded()], [1])

    def test_given_findings_without_a_category_when_recorded_then_the_smell_or_uncategorised_is_used(self) -> None:
        smelly = {key: value for key, value in issue(1, reviewer="test-smell-review", severity="suggestion").items()
                  if key != "category"}
        bare = {key: value for key, value in issue(2, reviewer="test-smell-review", severity="suggestion").items()
                if key != "category"}
        self.write_round("test-smell-review", 1, [{**smelly, "smell": "eager-test"}, bare])

        self.record()

        self.assertEqual([row["category"] for row in self.recorded()], ["eager-test", "uncategorised"])

    def test_given_only_passing_files_when_recorded_then_nothing_is_written(self) -> None:
        self.write_round("security-review", 1, [], status="pass")

        code, stdout, _ = self.record()

        self.assertEqual((code, stdout), (0, f"recorded 0 findings from 1 files for {RUN}, skipped=0\n"))
        self.assertFalse((self.metrics / "review-findings.jsonl").exists())

    def test_given_an_already_recorded_review_when_recorded_again_then_nothing_is_added(self) -> None:
        self.write_round("security-review", 1, [issue(1, severity="suggestion")])
        self.record()

        code, stdout, _ = self.record()

        self.assertEqual(code, 0)
        self.assertEqual(stdout, f"review of {RUN} started {DISPATCHED} is already recorded; nothing written\n")
        self.assertEqual(len(self.recorded()), 1)

    def test_given_an_actionable_finding_neither_fixed_nor_skipped_when_recorded_then_it_is_flagged(self) -> None:
        self.write_round("security-review", 1, [issue(1, severity="error"), issue(2, severity="suggestion")],
                         status="fail")

        code, _, stderr = self.record()

        self.assertEqual(code, 0)
        self.assertEqual(stderr, "warning: security-review-r1-1 (error) is neither fixed nor skipped\n")
        self.assertEqual(len(self.recorded()), 2)

    def test_given_a_fixed_or_skipped_id_that_matches_no_finding_when_recorded_then_it_is_reported(self) -> None:
        self.write_round("security-review", 1, [issue(1, severity="suggestion")])

        code, _, stderr = self.record("--fixed", "naming-review-r1-9", "--skipped", "arch-review-r1-1")

        self.assertEqual(code, 0)
        self.assertEqual(stderr, (
            "warning: arch-review-r1-1 matches no recorded finding\n"
            "warning: naming-review-r1-9 matches no recorded finding\n"
        ))

    def test_given_a_malformed_file_beside_a_valid_one_when_recorded_then_recording_fails_open(self) -> None:
        broken = self.write_findings("{broken", path=self.findings_path("naming-review", 1))
        self.write_round("security-review", 1, [issue(1, severity="suggestion")])

        code, stdout, _ = self.record()

        self.assertEqual(code, 0)
        self.assertEqual(stdout, (
            f"recorded 1 findings from 1 files for {RUN}, skipped=1\n"
            f"skipped {broken}: not valid JSON\n"
        ))

    def test_given_no_findings_files_when_recorded_then_it_warns_and_succeeds(self) -> None:
        code, stdout, stderr = self.record()

        self.assertEqual(code, 0)
        self.assertEqual(stdout, f"recorded 0 findings from 0 files for {RUN}, skipped=0\n")
        self.assertEqual(stderr, f"warning: no findings files found for {RUN}\n")

    def test_given_an_unreadable_review_start_when_recorded_then_it_is_a_usage_error(self) -> None:
        code, _, stderr = self.run_metrics("record", "--run", RUN, "--since", "yesterday")

        self.assertEqual(code, 2)
        self.assertEqual(stderr, "invalid --since 'yesterday': expected YYYY-MM-DDTHH:MM:SSZ\n")

    def test_given_a_metrics_dir_when_recorded_then_nothing_is_written_outside_it(self) -> None:
        self.write_round("security-review", 1, [issue(1, severity="suggestion")])

        self.record()

        self.assertEqual(sorted(path.name for path in self.base.iterdir()), ["metrics"])


class ReportReviewerValue(ReviewMetricsBehaviour):
    def test_given_recorded_runs_when_reported_then_reviewers_are_ordered_by_findings_with_no_op_runs(self) -> None:
        self.run_metrics("finding", "--run", RUN, "--lens", "security-review", "--category", "A03",
                         "--severity", "error", "--fixed")
        self.run_metrics("finding", "--run", RUN, "--lens", "security-review", "--category", "A03",
                         "--severity", "warning", "--iteration", "2", "--fixed")
        self.run_metrics("finding", "--run", RUN, "--lens", "security-review", "--category", "A01",
                         "--severity", "unknown")
        self.run_metrics("review", "--run", RUN, "--agents", "security-review", "naming-review", "--outcome", "fixed")
        self.run_metrics("review", "--run", "PROJ-1@other", "--agents", "naming-review", "--outcome", "no-op")

        code, stdout, _ = self.run_metrics("report")

        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout), [
            {"lens": "security-review", "runs": 1, "no_op_runs": 0, "findings": 3,
             "by_severity": {"errors": 1, "warnings": 1, "suggestions": 0}, "fixed": 2,
             "first_pass_fix_rate": 0.33, "top_categories": [["A03", 2], ["A01", 1]]},
            {"lens": "naming-review", "runs": 2, "no_op_runs": 2, "findings": 0,
             "by_severity": {"errors": 0, "warnings": 0, "suggestions": 0}, "fixed": 0,
             "first_pass_fix_rate": None, "top_categories": []},
        ])

    def test_given_garbled_metric_lines_when_reported_then_they_are_skipped(self) -> None:
        self.metrics.mkdir()
        (self.metrics / "review-findings.jsonl").write_text('not json\n[1]\n{"other": 1}\n')

        code, stdout, _ = self.run_metrics("report")

        self.assertEqual((code, json.loads(stdout)), (0, []))

    def test_given_no_metrics_when_reported_then_the_report_is_empty(self) -> None:
        code, stdout, _ = self.run_metrics("report")

        self.assertEqual((code, json.loads(stdout)), (0, []))


def findings_document(*, status: str, issues: object) -> dict:
    return {"status": status, "issues": issues, "summary": "Reviewed the files in scope."}


def issue(number: int, *, severity: str = "warning", reviewer: str = "security-review", round_number: int = 1) -> dict:
    return {"id": f"{reviewer}-r{round_number}-{number}", "category": "A03.injection", "severity": severity,
            "confidence": "high", "file": "app/a.ts", "line": number, "message": "m", "suggestedFix": "f"}


def without(issue_fields: dict, field: str) -> dict:
    return {name: value for name, value in issue_fields.items() if name != field}


def set_written_at(path: Path, moment: str) -> None:
    timestamp = review_metrics.findings_file.parse_utc(moment).timestamp()
    os.utime(path, (timestamp, timestamp))


RUN = "PROJ-2336@abc1234-20261027T100000Z"
BEFORE_DISPATCH = "2026-10-27T09:59:59Z"
DISPATCHED = "2026-10-27T10:00:00Z"
AFTER_DISPATCH = "2026-10-27T10:05:00Z"


if __name__ == "__main__":
    unittest.main()

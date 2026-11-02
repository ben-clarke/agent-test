"""Behaviour of the engineer evidence checker, run through its CLI."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check_evidence  # noqa: E402
import evidence  # noqa: E402


class CheckEvidenceBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.evidence = Path(temporary.name) / "evidence" / "S1.log"

    def record(self, kind: str, *, exit_code: int = 0, started: str | None = None, cwd: str | None = None,
               output: str = "output\n") -> None:
        moment = started or AFTER_START
        evidence.append_entry(self.evidence, {
            "kind": kind, "command": COMMANDS[kind], "cwd": cwd or UTILS,
            "started": moment, "finished": moment, "exit": exit_code, "output": output,
        })

    def check(self, *kinds: str, since: str | None = None) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = check_evidence.main(["--evidence", str(self.evidence), "--since", since or STEP_START,
                                        "--require", *(kinds or REQUIRED)])
        return code, stdout.getvalue(), stderr.getvalue()

    def assert_fails(self, *reasons: str) -> None:
        code, stdout, stderr = self.check()
        self.assertEqual((code, stdout), (1, ""))
        self.assertEqual(stderr, "".join([f"evidence failed: {self.evidence}\n", *[f"  {reason}\n" for reason in reasons]]))

    def test_given_fresh_passing_evidence_for_every_kind_when_checked_then_it_passes(self) -> None:
        self.record("scoped-tests", exit_code=1)
        for kind in REQUIRED:
            self.record(kind)

        code, stdout, stderr = self.check()

        self.assertEqual((code, stderr), (0, ""))
        self.assertEqual(stdout, "".join(f"evidence ok: {kind} exit=0 {AFTER_START} {UTILS}\n" for kind in REQUIRED))

    def test_given_evidence_started_in_the_step_start_second_when_checked_then_it_is_fresh(self) -> None:
        self.record("scoped-tests", started=STEP_START)

        code, _, _ = self.check("scoped-tests")

        self.assertEqual(code, 0)

    def test_given_no_evidence_file_when_checked_then_it_fails(self) -> None:
        self.assert_fails("missing evidence file")

    def test_given_a_directory_at_the_evidence_path_when_checked_then_it_fails_as_unreadable(self) -> None:
        self.evidence.mkdir(parents=True)

        self.assert_fails("unreadable evidence file (IsADirectoryError)")

    def test_given_an_evidence_file_with_no_readable_entries_when_checked_then_it_fails(self) -> None:
        self.evidence.parent.mkdir(parents=True)
        self.evidence.write_text('not json\n[]\n{"kind": "lint"}\n', encoding="utf-8")

        self.assert_fails("no entries found")

    def test_given_missing_stale_and_failing_kinds_when_checked_then_every_failure_is_reported(self) -> None:
        self.record("typecheck", started=BEFORE_START)
        self.record("scoped-tests", exit_code=1)

        self.assert_fails(
            f"scoped-tests: failed: `{COMMANDS['scoped-tests']}` in {UTILS} exit=1 started={AFTER_START}",
            "lint: no entry",
            f"typecheck: stale, started before the step ({STEP_START}): "
            f"`{COMMANDS['typecheck']}` in {UTILS} exit=0 started={BEFORE_START}",
        )

    def test_given_a_later_failure_after_a_pass_when_checked_then_the_latest_entry_counts(self) -> None:
        self.record("scoped-tests")
        self.record("typecheck")
        self.record("lint")
        self.record("lint", exit_code=1)

        self.assert_fails(f"lint: failed: `{COMMANDS['lint']}` in {UTILS} exit=1 started={AFTER_START}")

    def test_given_one_package_failing_and_another_passing_when_checked_then_the_failure_is_not_hidden(self) -> None:
        for cwd in (UTILS, DASHBOARD):
            self.record("scoped-tests", cwd=cwd)
            self.record("lint", cwd=cwd)
        self.record("typecheck", exit_code=1)
        self.record("typecheck", cwd=DASHBOARD)

        self.assert_fails(f"typecheck: failed: `{COMMANDS['typecheck']}` in {UTILS} exit=1 started={AFTER_START}")

    def test_given_a_package_missing_some_required_kinds_when_checked_then_each_missing_kind_is_reported(self) -> None:
        for kind in REQUIRED:
            self.record(kind)
        self.record("scoped-tests", cwd=DASHBOARD)

        self.assert_fails(f"lint: no entry in {DASHBOARD}", f"typecheck: no entry in {DASHBOARD}")

    def test_given_an_earlier_started_pass_appended_after_a_later_failure_when_checked_then_the_failure_counts(self) -> None:
        self.record("scoped-tests")
        self.record("typecheck")
        self.record("lint", exit_code=1, started="2026-10-27T10:04:00Z")
        self.record("lint", started="2026-10-27T10:03:30Z")

        self.assert_fails(f"lint: failed: `{COMMANDS['lint']}` in {UTILS} exit=1 started=2026-10-27T10:04:00Z")

    def test_given_a_failing_test_run_when_checked_then_the_failing_tests_are_named(self) -> None:
        self.record("lint")
        self.record("typecheck")
        self.record("scoped-tests", exit_code=1, output=(
            "\x1b[31m FAIL \x1b[39m src/__tests__/sum.test.ts > adds numbers\n"
            "\x1b[31mAssertionError\x1b[39m: expected 2 to be 3\n"
        ))

        self.assert_fails(
            f"scoped-tests: failed: `{COMMANDS['scoped-tests']}` in {UTILS} exit=1 started={AFTER_START}\n"
            "    FAIL src/__tests__/sum.test.ts > adds numbers — AssertionError: expected 2 to be 3"
        )

    def test_given_an_entry_with_an_unreadable_start_time_when_checked_then_it_is_stale(self) -> None:
        self.record("scoped-tests", started="yesterday")

        code, _, stderr = self.check("scoped-tests")

        self.assertEqual(code, 1)
        self.assertIn("scoped-tests: stale, started before the step", stderr)

    def test_given_a_truncated_last_line_when_checked_then_earlier_entries_still_count(self) -> None:
        self.record("scoped-tests")
        with self.evidence.open("a", encoding="utf-8") as handle:
            handle.write('{"kind": "lint", "command": "pnpm lint", "out')

        code, stdout, _ = self.check("scoped-tests")

        self.assertEqual((code, stdout), (0, f"evidence ok: scoped-tests exit=0 {AFTER_START} {UTILS}\n"))

    def test_given_an_unreadable_step_start_when_checked_then_it_is_a_usage_error(self) -> None:
        code, _, stderr = self.check(since="10:00")

        self.assertEqual(code, 2)
        self.assertEqual(stderr, "invalid --since '10:00': expected YYYY-MM-DDTHH:MM:SSZ\n")

    def test_given_an_unknown_kind_when_checked_then_it_is_a_usage_error(self) -> None:
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
            check_evidence.main(["--evidence", str(self.evidence), "--since", STEP_START, "--require", "coverage"])

        self.assertEqual(raised.exception.code, 2)


REQUIRED = ("scoped-tests", "lint", "typecheck")
UTILS = "/repo/src/js/packages/utils"
DASHBOARD = "/repo/src/js/apps/ui-dashboard"
COMMANDS = {
    "scoped-tests": "pnpm exec vitest run src/__tests__/sum.test.ts",
    "lint": "pnpm exec oxlint src/sum.ts",
    "typecheck": "pnpm typecheck",
}
BEFORE_START = "2026-10-27T09:59:59Z"
STEP_START = "2026-10-27T10:00:00Z"
AFTER_START = "2026-10-27T10:03:00Z"


if __name__ == "__main__":
    unittest.main()

"""Behaviour of the command-output wrapper, run through its CLI."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import evidence  # noqa: E402
import run_logged  # noqa: E402


class RunLoggedBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name).resolve()
        self.log = self.base / "logs" / "utils-test.log"

    def run_wrapped(self, *command: str, log: str | None = None, options: tuple[str, ...] = ()) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = run_logged.main(["--log", log or str(self.log), *options, "--", *command])
        return code, stdout.getvalue(), stderr.getvalue()

    def run_runner(self, output: str, exit_code: int) -> tuple[int, list[str]]:
        fixture = self.base / "runner-output.txt"
        fixture.write_text(output, encoding="utf-8")
        code, stdout, _ = self.run_wrapped(sys.executable, "-c", PRINT_AND_EXIT, str(fixture), str(exit_code))
        return code, without_duration(stdout).splitlines()


class PassingRuns(RunLoggedBehaviour):
    def test_given_a_passing_coloured_run_when_wrapped_then_only_the_summary_result_and_log_path_print(self) -> None:
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(self.base)
        fixture = self.base / "runner-output.txt"
        fixture.write_text(VITEST_PASS, encoding="utf-8")

        code, stdout, _ = self.run_wrapped(sys.executable, "-c", PRINT_AND_EXIT, str(fixture), "0",
                                           log="logs/relative.log")

        self.assertEqual(code, 0)
        self.assertEqual(without_duration(stdout).splitlines(), [
            "Test Files  1 passed (1)",
            "Tests  12 passed (12)",
            "Duration  248ms (transform 41%)",
            "result: PASS exit=0 duration=<s>",
            f"log: {self.base / 'logs' / 'relative.log'}",
        ])
        self.assertEqual((self.base / "logs" / "relative.log").read_text(encoding="utf-8"), VITEST_PASS)

    def test_given_a_working_directory_when_wrapped_then_the_command_runs_there(self) -> None:
        code, stdout, _ = self.run_wrapped(sys.executable, "-c", "import os; print(os.getcwd())",
                                           options=("--cwd", str(self.base)))

        self.assertEqual(code, 0)
        self.assertEqual(self.log.read_text(encoding="utf-8").strip(), str(self.base))
        self.assertTrue(stdout.startswith("result: PASS exit=0 "))


class FailingRuns(RunLoggedBehaviour):
    def test_given_a_failing_vitest_run_when_wrapped_then_each_failing_test_and_first_error_print(self) -> None:
        code, lines = self.run_runner(VITEST_FAILURES, 1)

        self.assertEqual(code, 1)
        self.assertEqual(lines, [
            "Test Files  1 failed (1)",
            "Tests  2 failed | 1 passed (3)",
            "Duration  248ms (transform 41%, worker 34%)",
            "FAIL src/__tests__/sum.test.ts > adds numbers — AssertionError: expected 2 to be 3 // Object.is equality",
            "FAIL src/__tests__/sum.test.ts > subtracts numbers — TypeError: Cannot read properties of undefined",
            "result: FAIL exit=1 duration=<s>",
            f"log: {self.log}",
        ])

    def test_given_a_failing_playwright_run_when_wrapped_then_the_failing_test_and_first_error_print(self) -> None:
        code, lines = self.run_runner(PLAYWRIGHT_FAILURE, 1)

        self.assertEqual(code, 1)
        self.assertEqual(lines, [
            "1 failed",
            "2 passed (5.3s)",
            "FAIL [chromium] › tests/login.spec.ts:10:5 › login › shows an error — "
            "Error: expect(locator).toBeVisible() failed",
            "result: FAIL exit=1 duration=<s>",
            f"log: {self.log}",
        ])

    def test_given_a_failing_test_without_an_error_line_when_wrapped_then_its_name_still_prints(self) -> None:
        _, lines = self.run_runner(" FAIL  src/a.test.ts > times out\n\n Test Files  1 failed (1)\n", 1)

        self.assertEqual(lines[:2], ["Test Files  1 failed (1)", "FAIL src/a.test.ts > times out"])

    def test_given_type_check_and_lint_failures_when_wrapped_then_each_error_line_prints(self) -> None:
        cases = {
            "tsc": (TSC_FAILURE, [
                "Found 2 errors in the same file, starting at: src/zz-sample.ts:1",
                "src/zz-sample.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
                "src/zz-sample.ts(3,7): error TS2304: Cannot find name 'missing'.",
            ]),
            "oxlint": (OXLINT_FAILURE, [
                "Found 0 warnings and 2 errors.",
                "src/zz-sample.ts:2:7: error eslint(no-unused-vars): Variable 'unused' is declared but never used.",
                "× typescript-eslint(no-explicit-any): Unexpected any. Specify a different type.",
            ]),
        }
        for name, (output, expected) in cases.items():
            with self.subTest(name):
                code, lines = self.run_runner(output, 1)

                self.assertEqual(code, 1)
                self.assertEqual(lines[:-2], expected)

    def test_given_a_vitest_import_error_when_wrapped_then_the_failed_suite_and_its_error_print(self) -> None:
        code, lines = self.run_runner(VITEST_IMPORT_ERROR, 1)

        self.assertEqual(code, 1)
        self.assertEqual(lines, [
            "Test Files  1 failed (1)",
            "Tests  no tests",
            "Duration  157ms (worker 99%)",
            f"FAIL src/__tests__/zz-import.test.ts — {IMPORT_ERROR}",
            "result: FAIL exit=1 duration=<s>",
            f"log: {self.log}",
        ])

    def test_given_a_failed_suite_and_a_failed_test_when_wrapped_then_both_print(self) -> None:
        code, lines = self.run_runner(VITEST_FAILURES + VITEST_IMPORT_ERROR, 1)

        self.assertEqual(code, 1)
        self.assertIn(f"FAIL src/__tests__/zz-import.test.ts — {IMPORT_ERROR}", lines)
        self.assertIn("FAIL src/__tests__/sum.test.ts > adds numbers — "
                      "AssertionError: expected 2 to be 3 // Object.is equality", lines)
        self.assertNotIn("last 20 lines:", lines)

    def test_given_unrecognised_failing_output_when_wrapped_then_the_tail_prints(self) -> None:
        output = "".join(f"line {number}\n" for number in range(1, 31))

        code, lines = self.run_runner(output, 3)

        self.assertEqual(code, 3)
        self.assertEqual(lines, [
            "last 20 lines:", *[f"line {number}" for number in range(11, 31)],
            "result: FAIL exit=3 duration=<s>", f"log: {self.log}",
        ])

    def test_given_a_command_killed_by_a_signal_when_wrapped_then_it_fails_with_the_tail(self) -> None:
        code, stdout, _ = self.run_wrapped(sys.executable, "-c", KILL_SELF)

        self.assertEqual(code, 137)
        self.assertEqual(without_duration(stdout).splitlines(), [
            "last 20 lines:", "started", "result: FAIL exit=-9 duration=<s>", f"log: {self.log}",
        ])


class CommandsThatCannotRun(RunLoggedBehaviour):
    def test_given_a_command_that_does_not_exist_when_wrapped_then_it_names_the_command_and_exits_127(self) -> None:
        code, stdout, _ = self.run_wrapped("no-such-command-cl2336")

        self.assertEqual(code, 127)
        self.assertEqual(without_duration(stdout).splitlines(), [
            "cannot start no-such-command-cl2336: No such file or directory",
            "result: FAIL exit=127 duration=<s>",
            f"log: {self.log}",
        ])
        self.assertEqual(self.log.read_text(encoding="utf-8"),
                         "cannot start no-such-command-cl2336: No such file or directory\n")

    def test_given_a_log_path_that_cannot_be_written_when_wrapped_then_the_command_does_not_run(self) -> None:
        blocker = self.base / "not-a-directory"
        blocker.write_text("", encoding="utf-8")
        marker = self.base / "ran"

        code, stdout, stderr = self.run_wrapped(sys.executable, "-c", f"open({str(marker)!r}, 'w')",
                                                log=str(blocker / "run.log"))

        self.assertEqual((code, stdout), (2, ""))
        self.assertTrue(stderr.startswith(f"cannot write log {blocker / 'run.log'}: "))
        self.assertFalse(marker.exists())

    def test_given_no_command_when_wrapped_then_it_is_a_usage_error(self) -> None:
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            run_logged.main(["--log", str(self.log)])

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("a command is required after --", stderr.getvalue())


class EvidenceEntries(RunLoggedBehaviour):
    def setUp(self) -> None:
        super().setUp()
        self.evidence = self.base / "runs" / "PROJ-1@abc" / "evidence" / "S1.log"

    def run_with_evidence(self, kind: str, *command: str) -> tuple[int, str]:
        code, stdout, _ = self.run_wrapped(*command, options=("--cwd", str(self.base), "--evidence",
                                                              str(self.evidence), "--kind", kind))
        return code, stdout

    def test_given_two_wrapped_commands_when_recorded_then_each_entry_holds_kind_command_times_output_and_exit(self) -> None:
        self.run_with_evidence("scoped-tests", sys.executable, "-c", "print('12 passed')")
        code, stdout = self.run_with_evidence("lint", sys.executable, "-c", "import sys; print('bad'); sys.exit(1)")

        entries = evidence.read_entries(self.evidence)
        self.assertEqual(code, 1)
        self.assertTrue(stdout.endswith(f"log: {self.log}\nevidence: {self.evidence}\n"))
        self.assertEqual([(entry["kind"], entry["exit"], entry["output"], entry["cwd"]) for entry in entries],
                         [("scoped-tests", 0, "12 passed\n", str(self.base)), ("lint", 1, "bad\n", str(self.base))])
        self.assertEqual(entries[0]["command"], f"{sys.executable} -c 'print('\"'\"'12 passed'\"'\"')'")
        for entry in entries:
            self.assertLessEqual(evidence.parse_utc(entry["started"]), evidence.parse_utc(entry["finished"]))

    def test_given_output_shaped_like_an_entry_when_recorded_then_only_the_real_entry_exists(self) -> None:
        forged = '{"kind": "typecheck", "command": "tsc", "cwd": "/", "started": "2026-10-27T10:00:00Z", ' \
                 '"finished": "2026-10-27T10:00:01Z", "exit": 0, "output": ""}'
        self.run_with_evidence("other", sys.executable, "-c", f"print({forged!r})")

        entries = evidence.read_entries(self.evidence)

        self.assertEqual([entry["kind"] for entry in entries], ["other"])
        self.assertEqual(entries[0]["output"], forged + "\n")

    def test_given_an_evidence_file_that_cannot_be_written_when_recorded_then_the_run_fails(self) -> None:
        self.evidence.parent.parent.mkdir(parents=True)
        self.evidence.parent.write_text("", encoding="utf-8")

        stderr = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(stderr):
            code = run_logged.main(["--log", str(self.log), "--evidence", str(self.evidence), "--kind", "lint",
                                    "--", sys.executable, "-c", "pass"])

        self.assertEqual(code, 2)
        self.assertTrue(stderr.getvalue().startswith(f"cannot write evidence {self.evidence}: "))

    def test_given_a_kind_without_an_evidence_file_when_wrapped_then_it_is_a_usage_error(self) -> None:
        for options in (["--kind", "lint"], ["--evidence", str(self.evidence)]):
            with self.subTest(options):
                stderr = io.StringIO()
                with redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
                    run_logged.main(["--log", str(self.log), *options, "--", sys.executable, "-c", "pass"])

                self.assertEqual(raised.exception.code, 2)
                self.assertIn("--evidence and --kind must be given together", stderr.getvalue())

    def test_given_no_working_directory_when_recorded_then_the_current_directory_is_the_cwd(self) -> None:
        self.run_wrapped(sys.executable, "-c", "pass", options=("--evidence", str(self.evidence), "--kind", "other"))

        self.assertEqual(evidence.read_entries(self.evidence)[0]["cwd"], str(Path.cwd().resolve()))


def without_duration(output: str) -> str:
    return re.sub(r"duration=\d+\.\ds", "duration=<s>", output)


PRINT_AND_EXIT = "import sys; sys.stdout.write(open(sys.argv[1], encoding='utf-8').read()); sys.exit(int(sys.argv[2]))"
KILL_SELF = "import os, signal; print('started', flush=True); os.kill(os.getpid(), signal.SIGKILL)"

# Excerpts of real Vitest 5, tsc, and oxlint output from this repository; Playwright follows its list reporter.
VITEST_PASS = (
    "\x1b[1m\x1b[46m RUN \x1b[49m\x1b[22m \x1b[36mv5.0.5 \x1b[39m\x1b[90m/repo/src/js/packages/utils\x1b[39m\n"
    "\n"
    " \x1b[32m✓\x1b[39m src/__tests__/sum.test.ts \x1b[2m(12 tests)\x1b[22m 3ms\n"
    "\n"
    "\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m1 passed\x1b[39m\x1b[22m\x1b[90m (1)\x1b[39m\n"
    "\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m12 passed\x1b[39m\x1b[22m\x1b[90m (12)\x1b[39m\n"
    "\x1b[2m   Start at \x1b[22m 10:58:20\n"
    "\x1b[2m   Duration \x1b[22m 248ms\x1b[2m (transform 41%)\x1b[22m\n"
)
VITEST_FAILURES = """\
 RUN  v5.0.5 /repo/src/js/packages/utils

 ❯ src/__tests__/sum.test.ts (3 tests | 2 failed) 3ms
   × adds numbers 3ms
   × subtracts numbers 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/sum.test.ts > adds numbers
AssertionError: expected 2 to be 3 // Object.is equality

- Expected
+ Received

 ❯ src/__tests__/sum.test.ts:2:17

⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/__tests__/sum.test.ts > subtracts numbers
TypeError: Cannot read properties of undefined
 ❯ src/__tests__/sum.test.ts:5:17

⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Start at  10:58:20
   Duration  248ms (transform 41%, worker 34%)
"""
IMPORT_ERROR = "Error: Cannot find module './does-not-exist' imported from src/__tests__/zz-import.test.ts"
VITEST_IMPORT_ERROR = """\
 RUN  v5.0.5 /repo/src/js/packages/utils

 ❯ src/__tests__/zz-import.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/zz-import.test.ts [ src/__tests__/zz-import.test.ts ]
Error: Cannot find module './does-not-exist' imported from src/__tests__/zz-import.test.ts
 ❯ src/__tests__/zz-import.test.ts:1:1
      1| import "./does-not-exist";
       | ^
      2|

⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  10:58:23
   Duration  157ms (worker 99%)
"""
PLAYWRIGHT_FAILURE = """\
Running 3 tests using 1 worker

  ✘  1 [chromium] › tests/login.spec.ts:10:5 › login › shows an error (2.1s)
  ✓  2 [chromium] › tests/login.spec.ts:20:5 › login › signs in (1.0s)

  1) [chromium] › tests/login.spec.ts:10:5 › login › shows an error ─────────────

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('alert')

  1 failed
    [chromium] › tests/login.spec.ts:10:5 › login › shows an error
  2 passed (5.3s)
"""
TSC_FAILURE = """\
src/zz-sample.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
src/zz-sample.ts(3,7): error TS2304: Cannot find name 'missing'.

Found 2 errors in the same file, starting at: src/zz-sample.ts:1
"""
OXLINT_FAILURE = """\
src/zz-sample.ts:2:7: error eslint(no-unused-vars): Variable 'unused' is declared but never used.

  × typescript-eslint(no-explicit-any): Unexpected any. Specify a different type.
   ╭─[src/zz-other.ts:1:20]

Found 0 warnings and 2 errors.
"""


if __name__ == "__main__":
    unittest.main()

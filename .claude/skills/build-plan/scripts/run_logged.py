#!/usr/bin/env python3
"""Run a test, lint, type-check, or Playwright command and print only what matters.

    run_logged.py --log <path> [--cwd <dir>] [--evidence <file> --kind <kind>] -- <command...>

The full output goes to the log file as it arrives. The terminal gets the
runner's summary lines, each failing test or error with its first error line,
a ``result:`` line, and the absolute log path last. When a run fails and no
failure can be named, the last lines of output are printed instead, so a
failure is never hidden.

With ``--evidence`` and ``--kind``, the command, its output, and its exit code
are also appended to an engineer evidence file for ``check_evidence.py``.

Stdlib-only.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evidence  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    args = parse_arguments(argv)
    log_path = Path(args.log).resolve()
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log = log_path.open("w", encoding="utf-8")
    except OSError as error:
        print(f"cannot write log {log_path}: {error.strerror or error}", file=sys.stderr)
        return USAGE_ERROR
    started = datetime.now(timezone.utc)
    with log:
        run = run_command(args.command, cwd=args.cwd, log=log)
    for line in report_lines(run):
        print(line)
    print(f"log: {log_path}")
    if args.evidence:
        return record_evidence(args, run=run, started=started, log_path=log_path)
    return run.exit_status


def record_evidence(args: argparse.Namespace, *, run: CommandRun, started: datetime, log_path: Path) -> int:
    evidence_path = Path(args.evidence).resolve()
    entry = {
        evidence.KIND: args.kind,
        evidence.COMMAND: shlex.join(args.command),
        evidence.CWD: str(Path(args.cwd or os.getcwd()).resolve()),
        evidence.STARTED: evidence.format_utc(started),
        evidence.FINISHED: evidence.format_utc(datetime.now(timezone.utc)),
        evidence.EXIT: run.exit_code,
        evidence.OUTPUT: log_path.read_text(encoding="utf-8", errors="replace"),
    }
    try:
        evidence.append_entry(evidence_path, entry)
    except OSError as error:
        print(f"cannot write evidence {evidence_path}: {error.strerror or error}", file=sys.stderr)
        return USAGE_ERROR
    print(f"evidence: {evidence_path}")
    return run.exit_status


def parse_arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--log", required=True, help="File for the full output; parents are created")
    parser.add_argument("--cwd", help="Directory to run the command in")
    parser.add_argument("--evidence", help="Engineer evidence file to append this command to")
    parser.add_argument("--kind", choices=evidence.KINDS, help="What the command proves; required with --evidence")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="The command, after --")
    args = parser.parse_args(argv)
    args.command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not args.command:
        parser.error("a command is required after --")
    if bool(args.evidence) != bool(args.kind):
        parser.error("--evidence and --kind must be given together")
    return args


def run_command(command: list[str], *, cwd: str | None, log) -> CommandRun:
    started = time.monotonic()
    try:
        process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, errors="replace")
    except OSError as error:
        message = f"cannot start {command[0]}: {error.strerror or error}"
        log.write(message + "\n")
        return CommandRun(lines=[message], exit_code=CANNOT_START, seconds=time.monotonic() - started, has_started=False)
    lines: list[str] = []
    with process:
        for line in process.stdout:
            log.write(line)
            log.flush()
            lines.append(strip_colour(line.rstrip("\n")))
    exit_code = process.returncode
    return CommandRun(lines=lines, exit_code=exit_code, seconds=time.monotonic() - started, has_started=True)


def report_lines(run: CommandRun) -> list[str]:
    if not run.has_started:
        return [*run.lines, result_line(run)]
    summary = [line.strip() for line in run.lines if any(pattern.search(line) for pattern in SUMMARY_PATTERNS)]
    failures = extract_failures(run.lines)
    is_unexplained_failure = run.exit_code != 0 and not failures
    tail = [f"last {TAIL_LINES} lines:", *run.lines[-TAIL_LINES:]] if is_unexplained_failure else []
    return [*summary, *failures, *tail, result_line(run)]


def extract_failures(lines: list[str]) -> list[str]:
    return [failure for extractor in EXTRACTORS for failure in extractor(lines)]


def result_line(run: CommandRun) -> str:
    outcome = "PASS" if run.exit_code == 0 else "FAIL"
    return f"result: {outcome} exit={run.exit_code} duration={run.seconds:.1f}s"


def strip_colour(line: str) -> str:
    return ANSI_ESCAPE.sub("", line)


def _vitest_failures(lines: list[str]) -> list[str]:
    return _named_failures(lines, VITEST_FAILURE, VITEST_ERROR)


def _playwright_failures(lines: list[str]) -> list[str]:
    return _named_failures(lines, PLAYWRIGHT_FAILURE, PLAYWRIGHT_ERROR)


def _error_lines(lines: list[str]) -> list[str]:
    return [line.strip() for line in lines if TSC_ERROR.search(line) or OXLINT_ERROR.search(line)]


def _named_failures(lines: list[str], name_pattern: re.Pattern[str], error_pattern: re.Pattern[str]) -> list[str]:
    failures: list[str] = []
    for index, line in enumerate(lines):
        match = name_pattern.search(line)
        if not match:
            continue
        name = match.group("name").strip()
        following = lines[index + 1:index + 1 + ERROR_SEARCH_LINES]
        first_error = next((candidate.strip() for candidate in following if error_pattern.search(candidate)), None)
        failure = f"FAIL {name} — {first_error}" if first_error else f"FAIL {name}"
        if failure not in failures:
            failures.append(failure)
    return failures


@dataclass(frozen=True)
class CommandRun:
    lines: list[str]
    exit_code: int
    seconds: float
    has_started: bool

    @property
    def exit_status(self) -> int:
        """The process exit code, with a signal death mapped to the shell's 128 + signal."""
        return SIGNAL_EXIT_BASE - self.exit_code if self.exit_code < 0 else self.exit_code


ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
SUMMARY_PATTERNS = (
    re.compile(r"^\s*(Test Files|Tests|Duration)\s"),
    re.compile(r"^\s*\d+ (passed|failed|flaky|skipped|did not run)\b"),
    re.compile(r"^\s*Found \d+ errors?\b"),
    re.compile(r"^\s*Found \d+ warnings? and \d+ errors?"),
)
VITEST_FAILURE = re.compile(r"^\s*FAIL\s+(?P<name>\S.* > .+|\S+(?= \[ .+ \]$))")
VITEST_ERROR = re.compile(r"\b\w*Error\b|^\s*expected\b|^\s*→")
PLAYWRIGHT_FAILURE = re.compile(r"^\s*\d+\) (?P<name>\[[^\]]+\] › .+?)\s*─*$")
PLAYWRIGHT_ERROR = re.compile(r"\bError:")
TSC_ERROR = re.compile(r"\(\d+,\d+\): error TS\d+:")
OXLINT_ERROR = re.compile(r"(^\s*×\s+|:\d+:\d+: error )[\w-]+\([^)]+\):")
EXTRACTORS = (_vitest_failures, _playwright_failures, _error_lines)
ERROR_SEARCH_LINES = 10
TAIL_LINES = 20
CANNOT_START = 127
SIGNAL_EXIT_BASE = 128
USAGE_ERROR = 2


if __name__ == "__main__":
    raise SystemExit(main())

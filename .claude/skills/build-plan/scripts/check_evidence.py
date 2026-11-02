#!/usr/bin/env python3
"""Check a step's engineer evidence file before build-plan marks the step complete.

    check_evidence.py --evidence <file> --since <step start, UTC> --require <kind> [<kind> ...]

For each required kind, the latest entry in each working directory (one per
package) must have started at or after the step start and exited 0. Every
package with evidence for one required kind needs every required kind. Missing
or stale evidence is a failure. Every failure is reported at once, with the failing
tests named, so one repair round can fix them all.

Exit 0 when the evidence passes, 1 when it fails, 2 for an unreadable --since.

Stdlib-only.
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evidence  # noqa: E402
import run_logged  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--since", required=True, help="Step start, UTC YYYY-MM-DDTHH:MM:SSZ")
    parser.add_argument("--require", nargs="+", choices=evidence.KINDS, required=True)
    args = parser.parse_args(argv)
    try:
        since = evidence.parse_utc(args.since)
    except ValueError:
        print(f"invalid --since {args.since!r}: expected YYYY-MM-DDTHH:MM:SSZ", file=sys.stderr)
        return USAGE_ERROR
    entries, reason = load_entries(args.evidence)
    packages = required_packages(args.require, entries)
    failures = [reason] if reason else [
        failure for kind in args.require for failure in kind_failures(kind, entries, since, packages)
    ]
    if failures:
        print(f"evidence failed: {args.evidence}", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return CHECK_FAILED
    for kind in args.require:
        for latest in latest_entries(kind, entries):
            print(f"evidence ok: {kind} exit=0 {latest[evidence.FINISHED]} {latest[evidence.CWD]}")
    return 0


def load_entries(path: Path) -> tuple[list[dict], str | None]:
    try:
        entries = evidence.read_entries(path)
    except FileNotFoundError:
        return [], "missing evidence file"
    except (OSError, UnicodeDecodeError) as error:
        return [], f"unreadable evidence file ({error.__class__.__name__})"
    return entries, None if entries else "no entries found"


def required_packages(kinds: list[str], entries: list[dict]) -> list[str]:
    """Every working directory with evidence for a required kind, in first-seen order."""
    return list(dict.fromkeys(entry[evidence.CWD] for entry in entries if entry[evidence.KIND] in kinds))


def kind_failures(kind: str, entries: list[dict], since: datetime, packages: list[str]) -> list[str]:
    latest = latest_entries(kind, entries)
    if not latest:
        return [f"{kind}: no entry"]
    covered = {entry[evidence.CWD] for entry in latest}
    missing = [f"{kind}: no entry in {package}" for package in packages if package not in covered]
    return [*(failure for entry in latest if (failure := entry_failure(kind, entry, since))), *missing]


def entry_failure(kind: str, entry: dict, since: datetime) -> str | None:
    detail = (f"`{entry[evidence.COMMAND]}` in {entry[evidence.CWD]} exit={entry[evidence.EXIT]} "
              f"started={entry[evidence.STARTED]}")
    started = _parse_started(entry)
    if started is None or started < since:
        return f"{kind}: stale, started before the step ({evidence.format_utc(since)}): {detail}"
    if entry[evidence.EXIT] != 0:
        lines = [run_logged.strip_colour(line) for line in str(entry[evidence.OUTPUT]).splitlines()]
        named = run_logged.extract_failures(lines)
        return "\n    ".join([f"{kind}: failed: {detail}", *named])
    return None


def latest_entries(kind: str, entries: list[dict]) -> list[dict]:
    """The latest-started entry of a kind for each working directory, so one package cannot hide another
    and a slower earlier run cannot hide a later failure."""
    of_kind = sorted((entry for entry in entries if entry[evidence.KIND] == kind), key=lambda entry: str(entry[evidence.STARTED]))
    latest_by_cwd = {entry[evidence.CWD]: entry for entry in of_kind}
    return list(latest_by_cwd.values())


def _parse_started(entry: dict) -> datetime | None:
    try:
        return evidence.parse_utc(str(entry[evidence.STARTED]))
    except ValueError:
        return None


CHECK_FAILED = 1
USAGE_ERROR = 2


if __name__ == "__main__":
    raise SystemExit(main())

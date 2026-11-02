#!/usr/bin/env python3
"""Record the build-plan cycle phase for the refactor test-freeze hook.

    build_phase.py refactor --step S1   enter REFACTOR: test files become read-only
    build_phase.py clear                leave REFACTOR

Writes ``.claude/memory/build-phase.json`` (gitignored), which
``.claude/hooks/refactor_test_freeze_guard.py`` reads. A record older than
4 hours is ignored, so a crashed run cannot freeze tests for long.

Stdlib-only.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

PHASE_FILE = Path(__file__).resolve().parents[4] / ".claude" / "memory" / "build-phase.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    refactor = commands.add_parser("refactor", help="Enter REFACTOR for a step")
    refactor.add_argument("--step", required=True, help="PLAN.md step id, for example S1")
    commands.add_parser("clear", help="Leave REFACTOR")
    args = parser.parse_args(argv)

    if args.command == "clear":
        PHASE_FILE.unlink(missing_ok=True)
        print("build phase cleared")
        return 0
    PHASE_FILE.parent.mkdir(parents=True, exist_ok=True)
    record = {"phase": "refactor", "step": args.step, "written_at": datetime.now(timezone.utc).isoformat()}
    PHASE_FILE.write_text(json.dumps(record) + "\n", encoding="utf-8")
    print(f"build phase: refactor ({args.step}) — test files are frozen")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

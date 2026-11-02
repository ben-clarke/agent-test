#!/usr/bin/env python3
"""PreToolUse hook: block a verify command re-run with no code change in between.

Ported from agentic-dev-team's ``verify_guard.py`` and
``verify_guard_edit_marker.py``, merged into one file with two modes:

    verify_guard.py              (matcher: Bash)       count repeats; block at the threshold
    verify_guard.py --mark-edit  (matcher: Write|Edit) record that a real edit happened

Re-running the same test/lint/type-check command after each edit is normal.
Re-running it ``THRESHOLD`` times in a row with **no** Write/Edit in between is
a stuck loop, so it is blocked (exit 2) with a pointer to systematic-debugging.
Set ``CLAUDE_VERIFY_GUARD_THRESHOLD=0`` to turn the block off.

State is one small JSON file per session in the temp directory, purged after
4 hours. Fails open on any error.

Stdlib-only.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import time
import zlib
from pathlib import Path

DEFAULT_THRESHOLD = 3
STATE_TTL_SECONDS = 4 * 60 * 60
STATE_DIRNAME = "claude-verify-guard"
_VERIFY_RE = re.compile(
    r"\b("
    r"pnpm(\s+(-w|-r|--filter\s+\S+))*(\s+run)?\s+(test|lint|typecheck|build)"
    r"|npm (run )?(test|lint|build)"
    r"|turbo run|vitest|jest|tsc|eslint|oxlint|playwright test"
    r"|pytest|go test|cargo (test|build)|make( |$)"
    r")\b"
)


def main(argv: list[str]) -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return 0
    path = state_path(str(payload.get("session_id") or ""), str(payload.get("cwd") or ""))
    try:
        if "--mark-edit" in argv:
            state = read_state(path)
            state["edited"] = True
            write_state(path, state)
            return 0
        return check_command(str((payload.get("tool_input") or {}).get("command") or ""), path)
    except Exception:  # noqa: BLE001 - a broken guard must never block work
        return 0


def check_command(command: str, path: Path) -> int:
    if not command or not _VERIFY_RE.search(command):
        return 0
    command_hash = str(zlib.crc32(" ".join(command.split()).encode("utf-8")))
    previous = read_state(path)
    repeated = previous.get("hash") == command_hash and not previous.get("edited")
    count = int(previous.get("count") or 0) + 1 if repeated else 1
    write_state(path, {"hash": command_hash, "count": count, "edited": False})

    threshold = _threshold()
    if threshold <= 0 or count < threshold:
        return 0
    sys.stderr.write(
        f"[BLOCK] verify-guard: this command has run {count} times in a row with no code change in between.\n"
        "That is a stuck loop. Run the systematic-debugging skill to find the root cause, make the code change "
        "the tests are waiting for, then re-run. If the cause is understood but cannot be fixed in scope, stop "
        "and escalate instead of retrying.\n"
        "To turn this block off, set CLAUDE_VERIFY_GUARD_THRESHOLD=0.\n"
    )
    return 2


def state_path(session_id: str, cwd: str) -> Path:
    key = session_id or str(zlib.crc32((cwd or os.getcwd()).encode("utf-8")))
    return Path(os.environ.get("CLAUDE_VERIFY_GUARD_STATE_DIR") or Path(tempfile.gettempdir()) / STATE_DIRNAME) / f"{key}.json"


def read_state(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def write_state(path: Path, state: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        _purge_stale(path.parent)
        path.write_text(json.dumps(state), encoding="utf-8")
    except OSError:
        pass


def _purge_stale(directory: Path) -> None:
    now = time.time()
    for stale in directory.glob("*.json"):
        try:
            if now - stale.stat().st_mtime > STATE_TTL_SECONDS:
                stale.unlink()
        except OSError:
            pass


def _threshold() -> int:
    try:
        return int(os.environ.get("CLAUDE_VERIFY_GUARD_THRESHOLD", DEFAULT_THRESHOLD))
    except ValueError:
        return DEFAULT_THRESHOLD


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

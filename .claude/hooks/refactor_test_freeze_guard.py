#!/usr/bin/env python3
"""PreToolUse (Write|Edit) hook: tests are frozen during REFACTOR.

Ported from agentic-dev-team's ``refactor_test_freeze_guard.py``.

While ``.claude/memory/build-phase.json`` records ``"phase": "refactor"``
(written by ``.claude/skills/build-plan/scripts/build_phase.py``), any
Write/Edit to a test file is blocked (exit 2). A refactor must not change a
test; change it in the TEST phase instead.

A phase record older than 4 hours is ignored (a crashed run). Edits made
through Bash are not seen — software-engineer is told to edit with Edit/Write.
Fails open on any error.

Stdlib-only.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path, PurePosixPath

PHASE_FILE = Path(".claude/memory/build-phase.json")
STALE_AFTER_SECONDS = 4 * 60 * 60
_JS_TS_TEST_NAME_RE = re.compile(r"\.(test|spec)\.[^./]+$", re.IGNORECASE)
_PYTHON_TEST_NAME_RE = re.compile(r"^(test_.+|.+_test)\.py$", re.IGNORECASE)


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        tool_input = payload.get("tool_input") or {}
        file_path = str(tool_input.get("file_path") or tool_input.get("notebook_path") or "")
        root = project_root(str(payload.get("cwd") or "."))
        phase = read_phase(root / Path(os.environ.get("CLAUDE_REFACTOR_PHASE_FILE") or PHASE_FILE))
    except Exception:  # noqa: BLE001 - a broken guard must never block work
        return 0
    if not file_path or phase is None or phase.get("phase") != "refactor":
        return 0
    relative = _relative(file_path, root)
    if not is_test_file(relative):
        return 0
    step = f" (step {phase['step']})" if phase.get("step") else ""
    sys.stderr.write(
        f"[BLOCK] Tests are frozen during REFACTOR{step}.\n"
        f"File: {relative}\n"
        "A refactor must not change behaviour, so it must not change a test. Leave REFACTOR "
        "(build_phase.py clear), make the test change in the TEST phase, re-verify green, then re-enter REFACTOR.\n"
    )
    return 2


def read_phase(path: Path) -> dict | None:
    """The active phase record, or ``None`` when absent, malformed, or stale."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("phase"), str):
        return None
    try:
        written_at = datetime.fromisoformat(str(data.get("written_at"))).timestamp()
    except ValueError:
        return None
    return data if time.time() - written_at <= STALE_AFTER_SECONDS else None


def is_test_file(path: str) -> bool:
    """Name-based test detection, matching the review-branch resolver's rule."""
    posix = PurePosixPath(path)
    if posix.name.lower().endswith(".feature"):
        return True
    if _JS_TS_TEST_NAME_RE.search(posix.name) or _PYTHON_TEST_NAME_RE.match(posix.name):
        return True
    return "__tests__" in posix.parts


def project_root(cwd: str) -> Path:
    env_root = os.environ.get("CLAUDE_PROJECT_DIR")
    if env_root:
        return Path(env_root)
    try:
        result = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=cwd, capture_output=True, text=True, timeout=1, check=False)
        if result.returncode == 0 and result.stdout.strip():
            return Path(result.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    return Path(cwd)


def _relative(file_path: str, root: Path) -> str:
    path = Path(file_path)
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""PreToolUse (Write|Edit|MultiEdit|NotebookEdit) hook: keep branch reviewers read-only.

Branch reviewers (``*-review`` agents other than the ``plan-review-*`` critics)
have ``Write`` only so that, in review-branch file mode, they can save their
findings to ``.claude/metrics/runs/<run-id>/round-<n>/<agent_type>.json`` (a run id
may contain ``/``, as a branch name does).
Any other file edit by a branch reviewer is blocked (exit 2). Calls from the
main session (no ``agent_id``) and from other agents are not affected.

Fails open: an unparsable payload allows the call, like the other guards.

Stdlib-only.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return 0
    if not isinstance(payload, dict) or not is_branch_reviewer(payload):
        return 0
    agent_type = str(payload["agent_type"])
    if is_own_findings_file(payload, agent_type):
        return 0
    sys.stderr.write(
        f"{agent_type} is a read-only reviewer: it may only Write its findings file "
        f"{FINDINGS_ROOT}/<run-id>/round-<n>/{agent_type}.json\n"
    )
    return BLOCKED


def is_branch_reviewer(payload: dict) -> bool:
    agent_type = payload.get("agent_type")
    if not payload.get("agent_id") or not isinstance(agent_type, str):
        return False
    return agent_type.endswith("-review") and not agent_type.startswith("plan-review-")


def is_own_findings_file(payload: dict, agent_type: str) -> bool:
    if payload.get("tool_name") != "Write":
        return False
    tool_input = payload.get("tool_input")
    file_path = tool_input.get("file_path") if isinstance(tool_input, dict) else None
    if not isinstance(file_path, str) or not file_path:
        return False
    root = project_root(payload)
    try:
        parts = (root / file_path).resolve().relative_to((root / FINDINGS_ROOT).resolve()).parts
    except ValueError:
        return False
    is_under_a_run = len(parts) >= 3
    return is_under_a_run and bool(ROUND_DIRECTORY.fullmatch(parts[-2])) and parts[-1] == f"{agent_type}.json"


def project_root(payload: dict) -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or str(payload.get("cwd") or "."))


BLOCKED = 2
FINDINGS_ROOT = ".claude/metrics/runs"
ROUND_DIRECTORY = re.compile(r"round-[1-9]\d*")


if __name__ == "__main__":
    raise SystemExit(main())

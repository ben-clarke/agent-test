#!/usr/bin/env python3
"""PreToolUse (Bash) hook: catch destructive commands before they run.

Ported from agentic-dev-team's ``hooks/destructive_guard.py``.

- A destructive command (patterns in ``destructive-commands.json``) asks the
  user to confirm, via ``permissionDecision: "ask"``. The original printed a
  caution to stdout, which Claude never sees for a PreToolUse hook.
- Force-push, branch delete, and ``reset --hard`` aimed at the default branch
  are blocked outright (exit 2). Run them yourself with ``!`` if you mean it.
- ``rm -r`` of build output only (``safe_rm_targets``, relative paths) is
  allowed. Each segment of a chained command is checked on its own, so a
  safe ``rm`` cannot carry an unsafe one through.

Fails open: any internal error allows the command.

Stdlib-only.
"""

from __future__ import annotations

import json
import re
import shlex
import subprocess
import sys
from pathlib import Path, PurePosixPath

CONFIG_PATH = Path(__file__).resolve().parent / "destructive-commands.json"
CATEGORIES = {
    "file_destruction": "File destruction",
    "database_destruction": "Database destruction",
    "git_destruction": "Git destruction",
    "process_destruction": "Process destruction",
    "permission_escalation": "Permission escalation",
}
GIT_TIMEOUT_SECONDS = 1.0
_SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||;|\||\n")
_RM_RE = re.compile(r"^\s*(?:sudo\s+)?rm\s")


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        command = str((payload.get("tool_input") or {}).get("command") or "")
        cwd = str(payload.get("cwd") or ".")
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        decision = evaluate(command, config, cwd)
    except Exception:  # noqa: BLE001 - a broken guard must never block work
        return 0
    if decision is None:
        return 0
    action, message = decision
    if action == "block":
        sys.stderr.write(message + "\n")
        return 2
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": message,
        }
    }))
    return 0


def evaluate(command: str, config: dict, cwd: str):
    """``None`` to allow, or ``("ask" | "block", message)``."""
    matches = [match for segment in split_segments(command) if (match := match_segment(segment, config))]
    if not matches:
        return None
    category, pattern = matches[0]
    block_rules = config.get("block_on_default_branch", {})
    for _, matched_pattern in matches:
        rule = block_rules.get(matched_pattern)
        if rule and targets_default_branch(command, matched_pattern, rule, cwd):
            return "block", (
                f"BLOCKED: {CATEGORIES[category]} ({matched_pattern}) aimed at the default branch.\n"
                f"Command: {command}\n"
                "Force-push, branch delete, and reset --hard are blocked on the default branch. "
                "If this is really intended, ask the user to run it themselves with `!`."
            )
    return "ask", (
        f"Destructive command detected — {CATEGORIES[category]} ({pattern}). "
        "This is hard to reverse; confirm before it runs."
    )


def split_segments(command: str) -> list[str]:
    return [segment.strip() for segment in _SEGMENT_SPLIT_RE.split(command) if segment.strip()]


def match_segment(segment: str, config: dict):
    """``(category, pattern)`` for the first destructive pattern in one segment."""
    lowered = " ".join(segment.lower().split())
    for category in CATEGORIES:
        for pattern in config.get(category, []):
            if pattern.lower() not in lowered:
                continue
            if category == "file_destruction" and is_safe_rm(segment, config.get("safe_rm_targets", [])):
                return None
            return category, pattern
    return None


def is_safe_rm(segment: str, safe_targets: list[str]) -> bool:
    """True when every target of an ``rm`` is build output named in ``safe_targets``."""
    if not _RM_RE.match(segment):
        return False
    try:
        tokens = shlex.split(segment)
    except ValueError:
        return False
    targets = [token for token in tokens[tokens.index("rm") + 1:] if not token.startswith("-")]
    if not targets:
        return False
    return all(_is_safe_target(target, safe_targets) for target in targets)


def targets_default_branch(command: str, pattern: str, rule: str, cwd: str) -> bool:
    default_branch = _default_branch(cwd)
    if default_branch is None:
        return False
    current_branch = _git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
    if rule == "current":
        return current_branch == default_branch
    lowered = command.lower()
    if re.search(rf"(?<![\w/-]){re.escape(default_branch.lower())}(?![\w/-])", lowered):
        return True
    remainder = lowered.split(pattern.lower(), 1)[-1].strip()
    return remainder == "" and current_branch == default_branch


def _is_safe_target(target: str, safe_targets: list[str]) -> bool:
    path = PurePosixPath(target.rstrip("/"))
    if path.is_absolute() or ".." in path.parts or "*" in target or target.startswith("~"):
        return False
    return path.name in safe_targets


def _default_branch(cwd: str) -> str | None:
    symbolic = _git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd)
    if symbolic:
        return symbolic.rsplit("/", 1)[-1]
    local = [name for name in ("main", "master") if _git(["rev-parse", "--verify", "--quiet", f"refs/heads/{name}"], cwd)]
    return local[0] if len(local) == 1 else None


def _git(args: list[str], cwd: str) -> str | None:
    try:
        result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=GIT_TIMEOUT_SECONDS, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    output = result.stdout.strip()
    return output if result.returncode == 0 and output else None


if __name__ == "__main__":
    raise SystemExit(main())

"""Behaviour of the reviewer write guard hook, run through its stdin interface."""

from __future__ import annotations

from contextlib import redirect_stderr
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reviewer_write_guard  # noqa: E402


class ReviewerWriteGuardBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.project = Path(temporary.name)
        environment = patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": str(self.project)})
        environment.start()
        self.addCleanup(environment.stop)

    def run_guard(self, payload: object) -> tuple[int, str]:
        stdin = payload if isinstance(payload, str) else json.dumps(payload)
        stderr = io.StringIO()
        with patch("sys.stdin", io.StringIO(stdin)), redirect_stderr(stderr):
            code = reviewer_write_guard.main()
        return code, stderr.getvalue()

    def assert_blocked(self, payload: dict) -> None:
        code, stderr = self.run_guard(payload)
        self.assertEqual(code, 2)
        self.assertEqual(stderr, (
            "security-review is a read-only reviewer: it may only Write its findings file "
            ".claude/metrics/runs/<run-id>/round-<n>/security-review.json\n"
        ))

    def test_given_a_reviewer_writing_its_own_findings_file_then_the_write_is_allowed(self) -> None:
        branch_run = ".claude/metrics/runs/feature/bc-CL-2336-x@abc1234/round-1/security-review.json"
        for file_path in (str(self.project / OWN_FINDINGS), OWN_FINDINGS, branch_run):
            with self.subTest(file_path):
                self.assertEqual(self.run_guard(reviewer_call(file_path)), (0, ""))

    def test_given_a_reviewer_writing_anywhere_else_then_the_write_is_blocked(self) -> None:
        blocked = {
            "another reviewer's findings file": ".claude/metrics/runs/CL-1@abc/round-1/naming-review.json",
            "source file": "src/js/apps/ui-dashboard/app/root.tsx",
            "escape from the run directory": ".claude/metrics/runs/CL-1@abc/round-1/../../../../settings.json",
            "file outside a round directory": ".claude/metrics/runs/CL-1@abc/security-review.json",
            "round zero": ".claude/metrics/runs/CL-1@abc/round-0/security-review.json",
            "not JSON": ".claude/metrics/runs/CL-1@abc/round-1/security-review.md",
            "metrics file": ".claude/metrics/review-findings.jsonl",
        }
        for name, file_path in blocked.items():
            with self.subTest(name):
                self.assert_blocked(reviewer_call(file_path))

    def test_given_a_reviewer_editing_its_findings_file_then_only_write_is_allowed(self) -> None:
        self.assert_blocked({**reviewer_call(OWN_FINDINGS), "tool_name": "Edit"})

    def test_given_a_reviewer_call_without_a_file_path_then_it_is_blocked(self) -> None:
        for tool_input in ({}, "not an object", {"file_path": ""}):
            with self.subTest(tool_input):
                self.assert_blocked({**reviewer_call(OWN_FINDINGS), "tool_input": tool_input})

    def test_given_the_main_session_or_another_agent_then_writes_are_not_affected(self) -> None:
        unaffected = {
            "main session": {key: value for key, value in reviewer_call("src/a.ts").items() if key != "agent_id"},
            "software-engineer": {**reviewer_call("src/a.ts"), "agent_type": "software-engineer"},
            "plan critic": {**reviewer_call("PLAN.md"), "agent_type": "plan-review-design"},
            "agent without a type": {**reviewer_call("src/a.ts"), "agent_type": None},
        }
        for name, payload in unaffected.items():
            with self.subTest(name):
                self.assertEqual(self.run_guard(payload), (0, ""))

    def test_given_an_unparsable_payload_then_the_guard_fails_open(self) -> None:
        for payload in ("{not json", "[]", ""):
            with self.subTest(payload):
                self.assertEqual(self.run_guard(payload), (0, ""))

    def test_given_no_project_dir_then_the_payload_cwd_is_the_project(self) -> None:
        with patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": ""}):
            allowed = self.run_guard({**reviewer_call(str(self.project / OWN_FINDINGS)), "cwd": str(self.project)})
            blocked_code, _ = self.run_guard(reviewer_call(str(self.project / OWN_FINDINGS)))

        self.assertEqual(allowed, (0, ""))
        self.assertEqual(blocked_code, 2)


def reviewer_call(file_path: str) -> dict:
    """Shaped like Claude Code 2.1.311's PreToolUse input inside a subagent."""
    return {
        "session_id": "session-1",
        "hook_event_name": "PreToolUse",
        "agent_id": "a1b2c3",
        "agent_type": "security-review",
        "tool_name": "Write",
        "tool_input": {"file_path": file_path, "content": "{}"},
    }


OWN_FINDINGS = ".claude/metrics/runs/CL-2336@abc1234-20261027T100000Z/round-2/security-review.json"


if __name__ == "__main__":
    unittest.main()

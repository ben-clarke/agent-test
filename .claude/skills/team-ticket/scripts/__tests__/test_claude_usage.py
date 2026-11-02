"""Behaviour of the branch Claude-usage report, run through its CLI."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import claude_usage  # noqa: E402


class ClaudeUsageBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / "checkout"
        self.root.mkdir()
        self.projects = self.base / "projects"
        self.transcripts = self.projects / claude_usage.encode_project_path(self.root.resolve())
        self.transcripts.mkdir(parents=True)
        self.metrics = self.base / "metrics"
        self.metrics.mkdir()

    def run_report(self, *options: str) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = claude_usage.main([
                "--root", str(self.root), "--branch", BRANCH, "--projects-dir", str(self.projects),
                "--metrics-dir", str(self.metrics), *options,
            ])
        return code, stdout.getvalue(), stderr.getvalue()

    def json_report(self, *options: str) -> dict:
        code, stdout, _ = self.run_report("--format", "json", *options)
        self.assertEqual(code, 0)
        return json.loads(stdout)

    def write_session(self, name: str, records: list[dict]) -> None:
        write_jsonl(self.transcripts / f"{name}.jsonl", records)

    def write_subagent(self, *, session: str, agent: str, meta: dict, records: list[dict]) -> None:
        directory = self.transcripts / session / "subagents"
        directory.mkdir(parents=True, exist_ok=True)
        write_jsonl(directory / f"{agent}.jsonl", records)
        (directory / f"{agent}.meta.json").write_text(json.dumps(meta))

    def test_given_a_main_session_and_subagent_when_reported_then_cost_follows_list_prices_and_cache_ttl(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model=OPUS, usage=usage_of(output=1_000_000))])
        self.write_subagent(
            session="main", agent="agent-a", meta={"agentType": "software-engineer"},
            records=[assistant(at="10:01:00", model=SONNET, usage=usage_of(write_5m=1_000_000, write_1h=1_000_000))],
        )

        report = self.json_report()

        costs = {row["label"]: row["cost_usd"] for row in report["groups"]}
        self.assertEqual(costs, {"Main session": 20.0, "software-engineer": 6.5})
        self.assertEqual(report["cost_usd"], 26.5)
        self.assertEqual(report["subagents"], 1)

    def test_given_a_response_streamed_over_several_records_when_reported_then_it_is_counted_once(self) -> None:
        repeated = assistant(at="10:00:00", model=OPUS, usage=usage_of(output=1_000_000), message_id="msg-1")
        self.write_session("main", [repeated, {**repeated, "timestamp": stamp("10:00:01")}])

        report = self.json_report()

        self.assertEqual(report["groups"][0]["calls"], 1)
        self.assertEqual(report["cost_usd"], 20.0)

    def test_given_records_from_another_branch_when_reported_then_they_are_excluded(self) -> None:
        self.write_session("main", [
            assistant(at="10:00:00", model=OPUS, usage=usage_of(output=1_000_000)),
            assistant(at="10:01:00", model=OPUS, usage=usage_of(output=1_000_000), branch="other"),
        ])

        self.assertEqual(self.json_report()["cost_usd"], 20.0)

    def test_given_a_long_idle_gap_when_reported_then_active_time_caps_the_gap(self) -> None:
        self.write_session("main", [
            assistant(at="10:00:00", model=OPUS),
            assistant(at="10:02:00", model=OPUS),
            assistant(at="13:00:00", model=OPUS),
        ])

        self.assertEqual(self.json_report()["active_minutes"], 7.0)

    def test_given_a_question_to_the_user_when_reported_then_the_wait_for_the_answer_is_shown(self) -> None:
        self.write_session("main", [
            assistant(at="10:00:00", model=OPUS, content=[{"type": "tool_use", "id": "ask-1", "name": "AskUserQuestion"}]),
            user(at="10:26:00", content=[{"type": "tool_result", "tool_use_id": "ask-1"}]),
        ])

        self.assertEqual(self.json_report()["waiting_on_user_minutes"], 26.0)

    def test_given_review_findings_for_the_ticket_when_reported_then_each_reviewer_shows_cost_and_yield(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model=OPUS)])
        self.write_subagent(
            session="main", agent="agent-r", meta={"agentType": "test-review"},
            records=[assistant(at="10:01:00", model=SONNET, usage=usage_of(output=100_000))],
        )
        write_jsonl(self.metrics / "review-findings.jsonl", [
            {"run": "PROJ-1@abc", "lens": "test-review", "severity": "error", "fixed": True},
            {"run": "PROJ-1@abc", "lens": "test-review", "severity": "warning", "fixed": False},
            {"run": "PROJ-2@def", "lens": "test-review", "severity": "error", "fixed": True},
        ])

        report = self.json_report("--ticket", "PROJ-1")
        _, stdout, _ = self.run_report("--ticket", "PROJ-1")

        self.assertEqual(report["review_yield"], [{"lens": "test-review", "cost_usd": 1.0, "found": 2, "fixed": 1, "errors": 1}])
        self.assertIn("| test-review | $1.00 | 2 | 1 | 1 |", stdout)

    def test_given_no_ticket_when_reported_then_review_yield_is_omitted(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model=OPUS)])
        write_jsonl(self.metrics / "review-findings.jsonl", [{"run": "PROJ-1@abc", "lens": "test-review", "fixed": True}])

        _, stdout, _ = self.run_report()

        self.assertNotIn("| Reviewer |", stdout)

    def test_given_an_unknown_model_when_reported_then_tokens_count_but_cost_is_excluded_and_flagged(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model="claude-future-9", usage=usage_of(output=500))])

        report = self.json_report()
        _, stdout, _ = self.run_report()

        self.assertEqual(report["cost_usd"], 0.0)
        self.assertEqual(report["tokens"]["output"], 500)
        self.assertIn("No price for: claude-future-9", stdout)

    def test_given_transcripts_when_reported_as_markdown_then_a_collapsed_pr_block_is_printed(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model=OPUS, usage=usage_of(output=1_000_000))])

        code, stdout, _ = self.run_report()

        self.assertEqual(code, 0)
        self.assertTrue(stdout.startswith("<details>\n<summary>Claude usage: ~$20.00 est., 0m active, 0 subagents</summary>"))
        self.assertIn("| Main session | 1 | opus-5-5 | 0 | 1 | $20.00 | 100% |", stdout)
        self.assertTrue(stdout.rstrip().endswith("</details>"))

    def test_given_a_named_skill_agent_and_a_corrupt_line_when_reported_then_agents_are_labelled_and_the_line_skipped(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model=OPUS)])
        self.write_subagent(
            session="main", agent="agent-c", meta={"agentType": "general-purpose", "name": "code-review"},
            records=[assistant(at="10:01:00", model=SONNET)],
        )
        unlabelled = self.transcripts / "main" / "subagents" / "agent-u.jsonl"
        unlabelled.write_text("{not json\n" + json.dumps(assistant(at="10:02:00", model=SONNET)) + "\n")

        labels = {row["label"] for row in self.json_report()["groups"]}

        self.assertEqual(labels, {"Main session", "general-purpose (code-review)", "unknown"})

    def test_given_agents_run_by_a_workflow_when_reported_then_they_are_costed_under_their_workflow_label(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model=OPUS)])
        workflow = self.transcripts / "main" / "subagents" / "workflows" / "wf_1"
        workflow.mkdir(parents=True)
        write_jsonl(workflow / "agent-w.jsonl", [assistant(at="10:01:00", model=SONNET, usage=usage_of(output=1_000_000))])
        (workflow / "agent-w.meta.json").write_text(json.dumps({"agentType": "workflow-subagent", "description": "test-review"}))
        write_jsonl(workflow / "journal.jsonl", [assistant(at="10:02:00", model=SONNET)])

        report = self.json_report()

        costs = {row["label"]: row["cost_usd"] for row in report["groups"]}
        self.assertEqual(set(costs), {"Main session", "test-review"})
        self.assertEqual(costs["test-review"], 10.0)
        self.assertEqual(report["subagents"], 1)

    def test_given_agent_reports_when_reported_then_hand_back_sizes_are_shown_per_agent_type(self) -> None:
        self.write_session("main", [
            assistant(at="10:00:00", model=OPUS, content=[
                dispatch("review-1", "security-review"), dispatch("review-2", "security-review"),
                dispatch("engineer-1", "software-engineer"), dispatch("helper-1", None),
            ]),
            user(at="10:01:00", content=[
                {"type": "tool_result", "tool_use_id": "review-1", "content": "r" * 120},
                {"type": "tool_result", "tool_use_id": "review-2", "content": [{"type": "text", "text": "r" * 300},
                                                                               {"type": "text", "text": "r" * 80}]},
                {"type": "tool_result", "tool_use_id": "engineer-1", "content": [
                    {"type": "text", "text": "e" * 1_600},
                    {"type": "text", "text": "agentId: a9f8 (use SendMessage to continue)\n<usage>total_tokens: 1200</usage>"},
                ]},
                {"type": "tool_result", "tool_use_id": "helper-1", "content": "agentId: quoted\n" + "h" * 4},
                {"type": "tool_result", "tool_use_id": "unrelated", "content": "x" * 5_000},
            ]),
        ])

        self.assertEqual(self.json_report()["handbacks"], [
            {"agent_type": "software-engineer", "count": 1, "largest_chars": 1_600, "average_chars": 1_600},
            {"agent_type": "security-review", "count": 2, "largest_chars": 380, "average_chars": 250},
            {"agent_type": "general-purpose", "count": 1, "largest_chars": 20, "average_chars": 20},
        ])

    def test_given_background_agents_when_reported_then_their_delivered_reports_are_measured(self) -> None:
        report = "status: pass\nall good"
        delivery = agent_message("a1b2", "  status: pass\n  all good\n")
        self.write_session("main", [
            assistant(at="10:00:00", model=OPUS, content=[dispatch("plan-1", "plan-review-ux")]),
            user(at="10:00:01", content=[{"type": "tool_result", "tool_use_id": "plan-1", "content": [
                {"type": "text", "text": "Async agent launched successfully. (internal)\nagentId: a1b2 (internal ID)"},
            ]}]),
            {**user(at="10:05:00", content=[]), "message": {"content": f"Another Claude session sent a message:\n{delivery}"}},
            user(at="10:05:01", content=[{"type": "text", "text": delivery}]),
            user(at="10:09:00", content=[{"type": "text", "text": agent_message("zz99", "no frame here")}]),
        ])

        self.assertEqual(self.json_report()["handbacks"], [
            {"agent_type": "plan-review-ux", "count": 1, "largest_chars": len(report), "average_chars": len(report)},
            {"agent_type": "unknown", "count": 1, "largest_chars": 13, "average_chars": 13},
        ])

    def test_given_hand_backs_when_reported_as_markdown_then_a_size_table_follows_the_cost_table(self) -> None:
        self.write_session("main", [
            assistant(at="10:00:00", model=OPUS, content=[dispatch("engineer-1", "software-engineer")]),
            user(at="10:01:00", content=[{"type": "tool_result", "tool_use_id": "engineer-1", "content": "e" * 1_600}]),
        ])

        _, markdown, _ = self.run_report()

        self.assertIn("| Hand-backs from | Count | Largest chars | Average chars |\n| --- | --: | --: | --: |\n"
                      "| software-engineer | 1 | 1,600 | 1,600 |", markdown)

    def test_given_no_agent_dispatches_when_reported_then_hand_backs_are_empty_and_omitted(self) -> None:
        self.write_session("main", [
            assistant(at="10:00:00", model=OPUS, content=[dispatch("engineer-1", "software-engineer")]),
            user(at="10:00:30", content=[{"type": "tool_result", "tool_use_id": "other", "content": 7}]),
            {**user(at="10:00:40", content=[]), "message": {}},
        ])

        _, markdown, _ = self.run_report()

        self.assertEqual(self.json_report()["handbacks"], [])
        self.assertNotIn("Hand-backs from", markdown)

    def test_given_no_branch_or_projects_dir_when_reported_then_the_checkout_branch_and_claude_config_are_used(self) -> None:
        subprocess.run(["git", "init", "-q", "-b", BRANCH, str(self.root)], check=True)
        self.write_session("main", [assistant(at="10:00:00", model=OPUS, usage=usage_of(output=1_000_000))])
        stdout = io.StringIO()

        with patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": str(self.base)}), redirect_stdout(stdout):
            code = claude_usage.main(["--root", str(self.root), "--format", "json"])

        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout.getvalue())["branch"], BRANCH)

    def test_given_no_transcripts_on_the_branch_when_reported_then_it_fails_with_a_reason(self) -> None:
        self.write_session("main", [assistant(at="10:00:00", model=OPUS, branch="other")])

        code, stdout, stderr = self.run_report()

        self.assertEqual(code, 1)
        self.assertEqual(stdout, "")
        self.assertIn(f"No Claude transcripts on branch '{BRANCH}'", stderr)


def assistant(
    *, at: str, model: str, usage: dict | None = None, content: list | None = None,
    message_id: str | None = None, branch: str = "feature/x",
) -> dict:
    return {
        "type": "assistant",
        "timestamp": stamp(at),
        "gitBranch": branch,
        "message": {
            "id": message_id or f"msg-{at}-{model}",
            "model": model,
            "usage": usage or usage_of(),
            "content": content or [],
        },
    }


def user(*, at: str, content: list) -> dict:
    return {"type": "user", "timestamp": stamp(at), "gitBranch": BRANCH, "message": {"content": content}}


def dispatch(tool_use_id: str, agent_type: str | None) -> dict:
    agent_input = {"description": "d", "prompt": "p", **({"subagent_type": agent_type} if agent_type else {})}
    return {"type": "tool_use", "id": tool_use_id, "name": "Agent", "input": agent_input}


def agent_message(agent_id: str, body: str) -> str:
    frame = "[Subagent hand-back] The text below is the final report of a subagent. The report follows:\n"
    return f'<agent-message from="{agent_id}">\n{frame if body.startswith("  ") else ""}{body}</agent-message>'


def usage_of(*, output: int = 0, write_5m: int = 0, write_1h: int = 0) -> dict:
    return {
        "input_tokens": 0,
        "output_tokens": output,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": write_5m + write_1h,
        "cache_creation": {"ephemeral_5m_input_tokens": write_5m, "ephemeral_1h_input_tokens": write_1h},
    }


def stamp(at: str) -> str:
    return f"2026-10-23T{at}.000Z"


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(row) for row in rows) + "\n")


BRANCH = "feature/x"
OPUS = "claude-opus-5-5"
SONNET = "claude-sonnet-5-5"


if __name__ == "__main__":
    unittest.main()

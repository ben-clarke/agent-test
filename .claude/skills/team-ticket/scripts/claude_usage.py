#!/usr/bin/env python3
"""Report where Claude's time, tokens and cost went while delivering a branch.

Reads the Claude Code transcripts for this checkout (main sessions and every
subagent) from ``<claude config>/projects/<encoded checkout path>/``, keeps only
records made on the branch, and prints a collapsed Markdown block for the end
of the PR description (or JSON with ``--format json``).

    python3 .claude/skills/team-ticket/scripts/claude_usage.py --ticket PROJ-123

Costs are estimates at Anthropic API list prices (``PRICES``); on a Claude
subscription read them as relative weight, not a bill. Cache writes are priced
by the TTL each response reports. With ``--ticket``, review-panel yield is
joined from build-plan's ``.claude/metrics/review-findings.jsonl``. Hand-back
sizes show, per agent type, the largest and average report the main session
received, for checking the reviewer, engineer, and plan-critic size limits.

Stdlib-only.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import textwrap


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Checkout whose transcripts are read")
    parser.add_argument("--branch", help="Branch to report on (default: the checkout's current branch)")
    parser.add_argument("--projects-dir", type=Path, help="Claude projects directory (default: <claude config>/projects)")
    parser.add_argument("--metrics-dir", type=Path, default=Path(".claude/metrics"))
    parser.add_argument("--ticket", help="Jira key; joins review-panel findings for runs '<ticket>@...'")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args(argv)

    root = args.root.resolve()
    branch = args.branch or read_current_branch(root)
    transcript_dir = (args.projects_dir or default_projects_dir()) / encode_project_path(root)
    transcripts = load_transcripts(transcript_dir=transcript_dir, branch=branch)
    if not transcripts:
        print(f"No Claude transcripts on branch {branch!r} in {transcript_dir}", file=sys.stderr)
        return 1

    findings = load_review_findings(metrics_dir=args.metrics_dir, ticket=args.ticket)
    report = summarise(transcripts=transcripts, findings=findings, branch=branch)
    print(json.dumps(report, indent=2) if args.format == "json" else render_markdown(report))
    return 0


def summarise(*, transcripts: list[Transcript], findings: list[dict], branch: str) -> dict:
    groups: dict[str, Group] = defaultdict(Group)
    for transcript in transcripts:
        group = groups[transcript.label]
        group.agents += 1
        group.minutes += active_minutes(transcript.records) if transcript.is_main else wall_minutes(transcript.records)
        for model, usage in usage_by_model(transcript.records).items():
            group.calls += usage["calls"]
            group.tokens.update({key: usage[key] for key in TOKEN_KEYS})
            group.cost += price(model=model, usage=usage)
            group.models.add(model)
            if model not in PRICES:
                group.unpriced_models.add(model)

    main_records = [record for transcript in transcripts if transcript.is_main for record in transcript.records]
    timestamps = sorted(parse_time(record["timestamp"]) for record in main_records if record.get("timestamp"))
    total_cost = sum(group.cost for group in groups.values())
    rows = sorted(
        (group.to_row(label=label, total_cost=total_cost) for label, group in groups.items()),
        key=lambda row: -row["cost_usd"],
    )
    return {
        "branch": branch,
        "start": timestamps[0].isoformat() if timestamps else None,
        "end": timestamps[-1].isoformat() if timestamps else None,
        "active_minutes": round(sum(row["minutes"] for row in rows if row["label"] == MAIN_LABEL), 1),
        "waiting_on_user_minutes": round(sum(user_wait_minutes(record_set) for record_set in main_record_sets(transcripts)), 1),
        "subagents": sum(row["agents"] for row in rows if row["label"] != MAIN_LABEL),
        "cost_usd": round(total_cost, 2),
        "tokens": dict(sum((Counter(row["tokens"]) for row in rows), Counter())),
        "groups": rows,
        "review_yield": review_yield(findings=findings, rows=rows),
        "handbacks": handback_sizes(main_records),
        "unpriced_models": sorted({model for row in rows for model in row["unpriced_models"]}),
    }


def render_markdown(report: dict) -> str:
    summary = (
        f"Claude usage: ~${report['cost_usd']:.2f} est., {format_minutes(report['active_minutes'])} active, "
        f"{report['subagents']} subagents"
    )
    lines = [
        "<details>",
        f"<summary>{summary}</summary>",
        "",
        f"Branch `{report['branch']}`, {report['start'][:16]} to {report['end'][:16]} UTC. "
        f"Waiting on user answers: {format_minutes(report['waiting_on_user_minutes'])}.",
        "",
        "| Where | Agents | Model | Minutes | Calls | Cost | Share |",
        "| --- | --: | --- | --: | --: | --: | --: |",
        *(
            f"| {row['label']} | {row['agents']} | {', '.join(short_model(model) for model in row['models'])} "
            f"| {row['minutes']:.0f} | {row['calls']} | ${row['cost_usd']:.2f} | {row['share_percent']:.0f}% |"
            for row in report["groups"]
        ),
    ]
    if report["handbacks"]:
        lines += [
            "",
            "| Hand-backs from | Count | Largest chars | Average chars |",
            "| --- | --: | --: | --: |",
            *(
                f"| {row['agent_type']} | {row['count']} | {row['largest_chars']:,} | {row['average_chars']:,} |"
                for row in report["handbacks"]
            ),
        ]
    if report["review_yield"]:
        lines += [
            "",
            "| Reviewer | Cost | Found | Fixed | Errors |",
            "| --- | --: | --: | --: | --: |",
            *(
                f"| {row['lens']} | ${row['cost_usd']:.2f} | {row['found']} | {row['fixed']} | {row['errors']} |"
                for row in report["review_yield"]
            ),
        ]
    lines += [
        "",
        "Estimated at API list prices; minutes for subagents are their own run time, which overlaps the main session.",
    ]
    if report["unpriced_models"]:
        lines.append(f"No price for: {', '.join(report['unpriced_models'])} (tokens counted, cost excluded).")
    return "\n".join([*lines, "</details>"])


def load_transcripts(*, transcript_dir: Path, branch: str) -> list[Transcript]:
    sessions = [
        Transcript(label=MAIN_LABEL, is_main=True, records=on_branch(read_jsonl(path), branch))
        for path in sorted(transcript_dir.glob("*.jsonl"))
    ]
    subagents = [
        Transcript(label=subagent_label(path), is_main=False, records=on_branch(read_jsonl(path), branch))
        for path in sorted(transcript_dir.glob("*/subagents/**/agent-*.jsonl"))
    ]
    return [transcript for transcript in [*sessions, *subagents] if transcript.records]


def load_review_findings(*, metrics_dir: Path, ticket: str | None) -> list[dict]:
    path = metrics_dir / FINDINGS_FILE
    if not ticket or not path.is_file():
        return []
    return [row for row in read_jsonl(path) if str(row.get("run", "")).startswith(f"{ticket}@")]


def review_yield(*, findings: list[dict], rows: list[dict]) -> list[dict]:
    if not findings:
        return []
    cost_by_label = {row["label"]: row["cost_usd"] for row in rows}
    lenses = sorted({row["lens"] for row in findings} | {label for label in cost_by_label if label.endswith("-review")})
    return sorted(
        (
            {
                "lens": lens,
                "cost_usd": cost_by_label.get(lens, 0.0),
                "found": sum(1 for row in findings if row["lens"] == lens),
                "fixed": sum(1 for row in findings if row["lens"] == lens and row.get("fixed")),
                "errors": sum(1 for row in findings if row["lens"] == lens and row.get("severity") == "error"),
            }
            for lens in lenses
        ),
        key=lambda row: -row["cost_usd"],
    )


def usage_by_model(records: list[dict]) -> dict[str, Counter]:
    # Streamed responses repeat one message id across records; count each once.
    latest = {
        record["message"]["id"]: record["message"]
        for record in records
        if record.get("type") == "assistant" and record.get("message", {}).get("id") and record["message"].get("usage")
    }
    totals: dict[str, Counter] = defaultdict(Counter)
    for message in latest.values():
        usage = message["usage"]
        cache_creation = usage.get("cache_creation") or {}
        written_1h = cache_creation.get("ephemeral_1h_input_tokens", 0) or 0
        written = usage.get("cache_creation_input_tokens", 0) or 0
        totals[message.get("model", "unknown")].update({
            "input": usage.get("input_tokens", 0) or 0,
            "cache_write_5m": written - written_1h,
            "cache_write_1h": written_1h,
            "cache_read": usage.get("cache_read_input_tokens", 0) or 0,
            "output": usage.get("output_tokens", 0) or 0,
            "calls": 1,
        })
    return totals


def price(*, model: str, usage: Counter) -> float:
    if model not in PRICES:
        return 0.0
    input_rate, output_rate, cache_read_rate = PRICES[model]
    return (
        usage["input"] * input_rate
        + usage["cache_write_5m"] * input_rate * CACHE_WRITE_5M_MULTIPLIER
        + usage["cache_write_1h"] * input_rate * CACHE_WRITE_1H_MULTIPLIER
        + usage["cache_read"] * cache_read_rate
        + usage["output"] * output_rate
    ) / TOKENS_PER_PRICE_UNIT


def active_minutes(records: list[dict]) -> float:
    times = record_times(records)
    return sum(min((later - earlier).total_seconds(), IDLE_GAP_SECONDS) for earlier, later in zip(times, times[1:])) / 60


def wall_minutes(records: list[dict]) -> float:
    times = record_times(records)
    return (times[-1] - times[0]).total_seconds() / 60 if times else 0.0


def handback_sizes(records: list[dict]) -> list[dict]:
    """Per agent type, how many reports came back to the main session and how long they were.

    A foreground agent's report is its tool result. A background agent's tool result only
    announces the launch; its report arrives later as an ``<agent-message>`` in a user turn.
    """
    results = agent_results(records)
    types_by_agent_id = {
        launched.group(1): agent_type
        for agent_type, text in results if (launched := BACKGROUND_LAUNCH.search(text))
    }
    foreground = [
        (agent_type, len(RESULT_TRAILER.sub("", text)))
        for agent_type, text in results if not BACKGROUND_LAUNCH.search(text)
    ]
    background = [
        (types_by_agent_id.get(agent_id, UNKNOWN_AGENT_TYPE), len(report))
        for agent_id, report in dict.fromkeys(message for record in records for message in agent_messages(record))
    ]
    return size_rows([*foreground, *background])


def agent_results(records: list[dict]) -> list[tuple[str, str]]:
    """``(agent type, result text)`` for each Agent or Task tool result, in order."""
    blocks = [block for record in records for block in content_blocks(record)]
    types_by_tool_use = {
        block.get("id"): (block.get("input") or {}).get("subagent_type") or DEFAULT_AGENT_TYPE
        for block in blocks if block.get("type") == "tool_use" and block.get("name") in AGENT_TOOLS
    }
    return [
        (types_by_tool_use[block["tool_use_id"]], block_text(block.get("content")))
        for block in blocks
        if block.get("type") == "tool_result" and block.get("tool_use_id") in types_by_tool_use
    ]


def size_rows(sizes: list[tuple[str, int]]) -> list[dict]:
    lengths_by_type: dict[str, list[int]] = defaultdict(list)
    for agent_type, length in sizes:
        lengths_by_type[agent_type].append(length)
    rows = [
        {"agent_type": agent_type, "count": len(lengths), "largest_chars": max(lengths),
         "average_chars": round(sum(lengths) / len(lengths))}
        for agent_type, lengths in lengths_by_type.items()
    ]
    return sorted(rows, key=lambda row: (-row["largest_chars"], row["agent_type"]))


def agent_messages(record: dict) -> list[tuple[str, str]]:
    """``(agent id, report)`` for each background agent report delivered in a user turn."""
    if record.get("type") != "user":
        return []
    text = block_text(record.get("message", {}).get("content"))
    return [(match.group(1), report_body(match.group(2))) for match in AGENT_MESSAGE.finditer(text)]


def report_body(message: str) -> str:
    """The agent's own words: the harness frame before the report and the report's indent removed."""
    _, has_frame, report = message.partition(HANDBACK_FRAME_END)
    return textwrap.dedent(report if has_frame else message).strip()


def block_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(block.get("text", "") for block in content if isinstance(block, dict))
    return ""


def user_wait_minutes(records: list[dict]) -> float:
    asked = {
        block["id"]: parse_time(record["timestamp"])
        for record in records
        if record.get("type") == "assistant"
        for block in content_blocks(record)
        if block.get("type") == "tool_use" and block.get("name") == "AskUserQuestion"
    }
    answered = [
        parse_time(record["timestamp"]) - asked[block["tool_use_id"]]
        for record in records
        if record.get("type") == "user"
        for block in content_blocks(record)
        if block.get("tool_use_id") in asked
    ]
    return sum(wait.total_seconds() for wait in answered) / 60


def main_record_sets(transcripts: list[Transcript]) -> list[list[dict]]:
    return [transcript.records for transcript in transcripts if transcript.is_main]


def content_blocks(record: dict) -> list[dict]:
    content = record.get("message", {}).get("content")
    return [block for block in content if isinstance(block, dict)] if isinstance(content, list) else []


def record_times(records: list[dict]) -> list[datetime]:
    return sorted(parse_time(record["timestamp"]) for record in records if record.get("timestamp"))


def subagent_label(path: Path) -> str:
    meta_path = path.with_suffix(".meta.json")
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
    if meta.get("agentType") == WORKFLOW_AGENT_TYPE:
        return meta.get("description") or WORKFLOW_AGENT_TYPE
    agent_type = meta.get("agentType") or "unknown"
    name = meta.get("name")
    return f"{agent_type} ({name})" if name and name != agent_type else agent_type


def on_branch(records: list[dict], branch: str) -> list[dict]:
    return [record for record in records if record.get("gitBranch") == branch]


def read_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return [row for row in rows if isinstance(row, dict)]


def read_current_branch(root: Path) -> str:
    return subprocess.run(
        ["git", "-C", str(root), "branch", "--show-current"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def default_projects_dir() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")) / "projects"


def encode_project_path(root: Path) -> str:
    # Claude Code names each project's transcript directory this way.
    return re.sub(r"[^A-Za-z0-9]", "-", str(root))


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def format_minutes(minutes: float) -> str:
    hours, remainder = divmod(round(minutes), 60)
    return f"{hours}h {remainder:02d}m" if hours else f"{remainder}m"


def short_model(model: str) -> str:
    return model.removeprefix("claude-")


@dataclass
class Transcript:
    label: str
    is_main: bool
    records: list[dict]


@dataclass
class Group:
    agents: int = 0
    minutes: float = 0.0
    calls: int = 0
    cost: float = 0.0
    tokens: Counter = field(default_factory=Counter)
    models: set[str] = field(default_factory=set)
    unpriced_models: set[str] = field(default_factory=set)

    def to_row(self, *, label: str, total_cost: float) -> dict:
        return {
            "label": label,
            "agents": self.agents,
            "models": sorted(self.models),
            "minutes": round(self.minutes, 1),
            "calls": self.calls,
            "tokens": dict(self.tokens),
            "cost_usd": round(self.cost, 2),
            "share_percent": round(100 * self.cost / total_cost, 1) if total_cost else 0.0,
            "unpriced_models": sorted(self.unpriced_models),
        }


AGENT_TOOLS = ("Agent", "Task")
DEFAULT_AGENT_TYPE = "general-purpose"
UNKNOWN_AGENT_TYPE = "unknown"
WORKFLOW_AGENT_TYPE = "workflow-subagent"
BACKGROUND_LAUNCH = re.compile(r"^Async agent launched successfully\b.*?\bagentId: (\w+)", re.DOTALL)
AGENT_MESSAGE = re.compile(r'<agent-message from="([^"]+)">\n?(.*?)</agent-message>', re.DOTALL)
HANDBACK_FRAME_END = "The report follows:\n"
# Claude Code appends the agent id and a <usage> block to a foreground agent's result; it is not the agent's report.
RESULT_TRAILER = re.compile(r"\s*agentId: \S+[^\n]*(?:\n<usage>.*</usage>)?\s*\Z", re.DOTALL)
MAIN_LABEL = "Main session"
FINDINGS_FILE = "review-findings.jsonl"
TOKEN_KEYS = ("input", "cache_write_5m", "cache_write_1h", "cache_read", "output")
# Gaps longer than this are treated as idle (e.g. waiting for a reply overnight).
IDLE_GAP_SECONDS = 300
TOKENS_PER_PRICE_UNIT = 1_000_000
CACHE_WRITE_5M_MULTIPLIER = 1.25
CACHE_WRITE_1H_MULTIPLIER = 2.0
# USD per million tokens (input, output, cache read), Anthropic API list prices
# as of 2026-10. The Haiku 5.5 cache-read rate is assumed at 0.1x input.
PRICES = {
    "claude-fable-5-1": (10.00, 50.00, 0.25),
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}


if __name__ == "__main__":
    sys.exit(main())

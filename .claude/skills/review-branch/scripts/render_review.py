#!/usr/bin/env python3
"""Write a standalone review's findings to a handoff file another session can act on.

    render_review.py --run <run> --since <review started> --branch <name> --base <ref>
                     --head <short sha> --reviewers <name> ... [--skipped <name>=<reason> ...]
                     [--metrics-dir .claude/metrics] [--output-dir .claude/plans]

Reads each reviewer's latest-round findings file written since the review started,
under ``<metrics-dir>/runs/<run>/`` (the file mode format in
``.claude/knowledge/review-agent-output-contract.md``), and writes
``<output-dir>/review-<KEY>.md``, replacing any earlier file. ``<KEY>`` is the first
Jira key (``<PROJECT>-<digits>``) in the branch name, or the branch name with ``/`` replaced by ``-``.
A reviewer whose findings file is missing, stale or malformed is listed as
``failed``, never as clean. Prints the handoff file path.

Stdlib-only.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import findings_file  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--metrics-dir", type=Path, default=DEFAULT_METRICS_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--run", required=True)
    parser.add_argument("--since", required=True, help="Review start, UTC YYYY-MM-DDTHH:MM:SSZ")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True, help="Short HEAD sha when the review started")
    parser.add_argument("--reviewers", nargs="+", required=True, help="Every reviewer dispatched")
    parser.add_argument("--skipped", nargs="*", default=[], help="Reviewers not run, as <name>=<reason>")
    args = parser.parse_args(argv)
    try:
        since = findings_file.parse_utc(args.since)
    except ValueError:
        print(f"--since {args.since!r} is not UTC YYYY-MM-DDTHH:MM:SSZ", file=sys.stderr)
        return USAGE_ERROR
    skipped = [parse_skipped(entry) for entry in args.skipped]
    if None in skipped:
        print("--skipped entries must read <name>=<reason>", file=sys.stderr)
        return USAGE_ERROR
    run_dir = args.metrics_dir / "runs" / args.run
    results = [load_reviewer(run_dir, reviewer, since) for reviewer in dict.fromkeys(args.reviewers)]
    handoff = render(args, results=results, skipped=skipped)
    path = args.output_dir / f"review-{handoff_key(args.branch)}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(handoff, encoding="utf-8")
    print(path)
    return 0


def handoff_key(branch: str) -> str:
    match = TICKET_KEY.search(branch)
    return match.group().upper() if match else branch.replace("/", "-")


def parse_skipped(entry: str) -> tuple[str, str] | None:
    name, separator, reason = entry.partition("=")
    if not separator or not name.strip() or not reason.strip():
        return None
    return name.strip(), reason.strip()


def load_reviewer(run_dir: Path, reviewer: str, since: datetime) -> ReviewerResult:
    paths = list(run_dir.glob(f"round-*/{reviewer}.json"))
    if not paths:
        return ReviewerResult(name=reviewer, result="failed — no findings file", issues=[])
    try:
        findings = findings_file.load(latest_findings(paths, since), since=since, since_event="review")
    except findings_file.FindingsFileError as error:
        return ReviewerResult(name=reviewer, result=f"failed — {error}", issues=[])
    result = f"skip — {findings.summary.strip()}" if findings.status == "skip" else findings.status
    issues = [{**issue, "reviewer": reviewer} for issue in findings.issues]
    return ReviewerResult(name=reviewer, result=result, issues=issues)


def latest_findings(paths: list[Path], since: datetime) -> Path:
    """The highest round written in this review. A run id reused by a later review restarts at round 1,
    so an earlier review's higher round must not hide it."""
    in_review = [path for path in paths if path.stat().st_mtime >= since.timestamp()]
    return max(in_review or paths, key=lambda path: findings_file.round_of(path) or 0)


def render(args: argparse.Namespace, *, results: list[ReviewerResult], skipped: list[tuple[str, str]]) -> str:
    lines = [
        f"# Review handoff: {handoff_key(args.branch)}",
        "",
        f"- Branch: `{args.branch}`",
        f"- Base: `{args.base}`",
        f"- HEAD: `{args.head}`",
        f"- Reviewed: {args.since}",
        "",
        "## Reviewers run",
        "",
        "| Reviewer | Result |",
        "| --- | --- |",
        *(f"| {result.name} | {result.result} |" for result in results),
        "",
        "## Reviewers skipped",
        "",
        *([f"- {name} — {reason}" for name, reason in skipped] or ["- None"]),
        "",
        "## Findings",
        "",
        *render_findings([issue for result in results for issue in result.issues]),
        "",
        USAGE_LINE,
    ]
    return "\n".join(lines) + "\n"


def render_findings(issues: list[dict]) -> list[str]:
    if not issues:
        return ["No findings"]
    lines: list[str] = []
    for severity in findings_file.SEVERITIES:
        in_severity = sorted((issue for issue in issues if issue["severity"] == severity), key=finding_order)
        if not in_severity:
            continue
        lines.extend([f"### {severity}", ""])
        for file in dict.fromkeys(issue["file"] for issue in in_severity):
            lines.extend([f"#### `{file}`", ""])
            lines.extend(render_issue(issue) for issue in in_severity if issue["file"] == file)
            lines.append("")
    return lines[:-1]


def render_issue(issue: dict) -> str:
    location = f"{issue['file']}:{issue['line']}" if issue.get("line") else issue["file"]
    return (f"- `{issue['id']}` ({issue['reviewer']}) `{location}` — {issue['message'].strip()}\n"
            f"  - Fix: {issue['suggestedFix'].strip()}")


def finding_order(issue: dict) -> tuple[str, int, str]:
    return issue["file"], issue.get("line") or 0, issue["id"]


@dataclass(frozen=True)
class ReviewerResult:
    name: str
    result: str
    issues: list[dict]


DEFAULT_METRICS_DIR = Path(".claude/metrics")
DEFAULT_OUTPUT_DIR = Path(".claude/plans")
TICKET_KEY = re.compile(r"\b[A-Z][A-Z0-9]+-\d+", re.IGNORECASE)
USAGE_ERROR = 2
USAGE_LINE = ("To act on this review: fix every `error` and actionable `warning`, skip suggestions, "
              "then re-run `/review-branch`.")


if __name__ == "__main__":
    raise SystemExit(main())

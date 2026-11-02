#!/usr/bin/env python3
"""Record and report what build-plan's Step 7 review panel finds.

Ported from agentic-dev-team's ``review_findings_log.py`` and its
``review-value.jsonl`` row, combined so one report can answer "is each
reviewer worth running?".

    finding  append one row per finding to .claude/metrics/review-findings.jsonl
    review   append one row per review run to .claude/metrics/review-value.jsonl;
             issue counts are derived from that run's finding rows
    report   per reviewer: runs, runs with no findings, findings by severity,
             fixed count, and first-pass fix rate
    check    validate one reviewer's findings file (file mode) and print a
             one-line summary; a gate, so an invalid file exits non-zero
    record   append one finding row per issue in a run's findings files
             (file mode), skipping files from before the review started

A run id groups one review: ``<TICKET-KEY>@<short HEAD sha at review start>``.
``finding``, ``record`` and ``review`` are fail-open — they never raise or block a build;
``record`` exits 2 only for an unreadable ``--since``, which is a caller error.
``check`` is not: a missing, stale or malformed findings file must never pass.
Metrics stay local: ``.claude/metrics/`` is gitignored.

Stdlib-only.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import findings_file  # noqa: E402

DEFAULT_METRICS_DIR = Path(".claude/metrics")
FINDINGS_FILE = "review-findings.jsonl"
REVIEWS_FILE = "review-value.jsonl"
SEVERITY_BUCKETS = {"error": "errors", "warning": "warnings", "suggestion": "suggestions"}
OUTCOMES = ("no-op", "fixed", "escalated")
DIFF_SHAPES = ("test-only", "mixed")
ACTIONABLE_SEVERITIES = ("error", "warning")
UNCATEGORISED = "uncategorised"
CHECK_FAILED = 1
USAGE_ERROR = 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--metrics-dir", type=Path, default=DEFAULT_METRICS_DIR)
    commands = parser.add_subparsers(dest="command", required=True)

    finding = commands.add_parser("finding", help="Record one review finding")
    finding.add_argument("--run", required=True)
    finding.add_argument("--lens", required=True)
    finding.add_argument("--category", required=True)
    finding.add_argument("--severity", default="unknown")
    finding.add_argument("--iteration", type=int, default=1, help="Fix round the finding was first raised in")
    finding.add_argument("--fixed", action="store_true")

    review = commands.add_parser("review", help="Record one review run")
    review.add_argument("--run", required=True)
    review.add_argument("--agents", nargs="+", required=True, help="Every reviewer dispatched")
    review.add_argument("--fix-iterations", type=int, default=0)
    review.add_argument("--outcome", choices=OUTCOMES, required=True)
    review.add_argument("--diff-shape", choices=DIFF_SHAPES, default="mixed")
    review.add_argument("--since", help="Count only findings recorded for the review that started then (file mode)")

    record = commands.add_parser("record", help="Record every finding in a run's findings files")
    record.add_argument("--run", required=True)
    record.add_argument("--since", required=True, help="Review start, UTC YYYY-MM-DDTHH:MM:SSZ")
    record.add_argument("--fixed", nargs="*", default=[], help="Ids of the findings that were fixed")
    record.add_argument("--skipped", nargs="*", default=[], help="Ids of the findings deliberately left unfixed")

    commands.add_parser("report", help="Summarise every recorded run per reviewer")

    check = commands.add_parser("check", help="Validate one reviewer's findings file")
    check.add_argument("--file", type=Path, required=True)
    check.add_argument("--since", required=True, help="Dispatch time, UTC YYYY-MM-DDTHH:MM:SSZ")

    args = parser.parse_args(argv)
    if args.command == "check":
        return check_findings_file(args.file, args.since)
    findings_path = args.metrics_dir / FINDINGS_FILE
    reviews_path = args.metrics_dir / REVIEWS_FILE
    if args.command == "record":
        return record_findings_files(args, findings_path)

    if args.command == "finding":
        append_row(findings_path, finding_row(args))
        return 0
    if args.command == "review":
        append_row(reviews_path, review_row(args, load_rows(findings_path)))
        return 0
    print(json.dumps(report(load_rows(reviews_path), load_rows(findings_path)), indent=2))
    return 0


def check_findings_file(path: Path, since_text: str) -> int:
    since = _parse_since(since_text)
    if since is None:
        return USAGE_ERROR
    try:
        findings = findings_file.load(path, since=since)
    except findings_file.FindingsFileError as error:
        print(f"invalid findings file {path}: {error}", file=sys.stderr)
        return CHECK_FAILED
    counts = {bucket: 0 for bucket in SEVERITY_BUCKETS.values()}
    for issue in findings.issues:
        counts[SEVERITY_BUCKETS[issue["severity"]]] += 1
    summary = " ".join(f"{bucket}={count}" for bucket, count in counts.items())
    print(f"{findings.status} {summary} {path.resolve()}")
    return 0


def record_findings_files(args: argparse.Namespace, findings_path: Path) -> int:
    since = _parse_since(args.since)
    if since is None:
        return USAGE_ERROR
    if any(row.get("run") == args.run and row.get("review_started") == args.since for row in load_rows(findings_path)):
        print(f"review of {args.run} started {args.since} is already recorded; nothing written")
        return 0
    paths = findings_file.discover(args.metrics_dir / "runs" / args.run)
    if not paths:
        print(f"warning: no findings files found for {args.run}", file=sys.stderr)
    loaded, skipped = _load_current(paths, since)
    rows = [
        file_finding_row(findings, issue, run=args.run, review_started=args.since, fixed_ids=set(args.fixed))
        for findings in loaded for issue in findings.issues
    ]
    for row in rows:
        append_row(findings_path, row)
    _warn_about_unaccounted_ids(rows, fixed_ids=args.fixed, skipped_ids=args.skipped)
    print(f"recorded {len(rows)} findings from {len(loaded)} files for {args.run}, skipped={len(skipped)}")
    for path, reason in skipped:
        print(f"skipped {path}: {reason}")
    return 0


def finding_row(args: argparse.Namespace) -> dict:
    return _finding_row(run=args.run, lens=args.lens, category=args.category, severity=args.severity,
                        iteration=args.iteration, is_fixed=args.fixed)


def file_finding_row(findings: findings_file.FindingsFile, issue: dict, *, run: str, review_started: str, fixed_ids: set[str]) -> dict:
    category = issue.get("category") or issue.get("smell") or UNCATEGORISED
    return {
        **_finding_row(run=run, lens=findings.reviewer, category=category, severity=issue["severity"],
                       iteration=findings.round, is_fixed=issue["id"] in fixed_ids),
        "id": issue["id"],
        "review_started": review_started,
    }


def review_row(args: argparse.Namespace, findings: list[dict]) -> dict:
    run_findings = [
        row for row in findings
        if row.get("run") == args.run and (args.since is None or row.get("review_started") == args.since)
    ]
    breakdown = {bucket: 0 for bucket in SEVERITY_BUCKETS.values()}
    for row in run_findings:
        bucket = SEVERITY_BUCKETS.get(row.get("severity", ""))
        if bucket:
            breakdown[bucket] += 1
    return {
        "ts": _now(),
        "run": args.run,
        "agents_run": sorted(set(args.agents)),
        "issues_found": len(run_findings),
        "severity_breakdown": breakdown,
        "issues_fixed": sum(1 for row in run_findings if row.get("fixed")),
        "fix_iterations": args.fix_iterations,
        "outcome": args.outcome,
        "diff_shape": args.diff_shape,
    }


def report(reviews: list[dict], findings: list[dict]) -> list[dict]:
    """Per reviewer, most findings first; a reviewer with many no-op runs is a pruning candidate."""
    stats: dict = defaultdict(lambda: {
        "runs": 0, "no_op_runs": 0, "findings": 0, "fixed": 0, "first_pass_fixed": 0,
        "by_severity": {bucket: 0 for bucket in SEVERITY_BUCKETS.values()},
        "categories": defaultdict(int),
    })
    lenses_with_findings_by_run: dict = defaultdict(set)
    for row in findings:
        lens = row["lens"]
        entry = stats[lens]
        entry["findings"] += 1
        entry["categories"][row.get("category", "unknown")] += 1
        bucket = SEVERITY_BUCKETS.get(row.get("severity", ""))
        if bucket:
            entry["by_severity"][bucket] += 1
        if row.get("fixed"):
            entry["fixed"] += 1
            if row.get("iteration") == 1:
                entry["first_pass_fixed"] += 1
        lenses_with_findings_by_run[row.get("run")].add(lens)
    for row in reviews:
        for lens in row.get("agents_run", []):
            stats[lens]["runs"] += 1
            if lens not in lenses_with_findings_by_run[row.get("run")]:
                stats[lens]["no_op_runs"] += 1
    return sorted((_summarise(lens, entry) for lens, entry in stats.items()), key=lambda s: (-s["findings"], s["lens"]))


def load_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    try:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if isinstance(row, dict):
                    rows.append(row)
    except OSError:
        pass
    return [row for row in rows if "lens" in row or "agents_run" in row]


def append_row(path: Path, row: dict) -> bool:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row) + "\n")
        return True
    except OSError:
        return False


def _finding_row(*, run: str, lens: str, category: str, severity: str, iteration: int, is_fixed: bool) -> dict:
    return {
        "ts": _now(),
        "run": run,
        "lens": lens,
        "category": category,
        "severity": severity,
        "iteration": iteration,
        "fixed": is_fixed,
    }


def _load_current(paths: list[Path], since: datetime) -> tuple[list[findings_file.FindingsFile], list[tuple[Path, str]]]:
    loaded: list[findings_file.FindingsFile] = []
    skipped: list[tuple[Path, str]] = []
    for path in paths:
        try:
            loaded.append(findings_file.load(path, since=since, since_event="review"))
        except findings_file.FindingsFileError as error:
            skipped.append((path, str(error)))
    return loaded, skipped


def _warn_about_unaccounted_ids(rows: list[dict], *, fixed_ids: list[str], skipped_ids: list[str]) -> None:
    recorded_ids = {row["id"] for row in rows}
    accounted_ids = set(fixed_ids) | set(skipped_ids)
    for unknown_id in sorted(accounted_ids - recorded_ids):
        print(f"warning: {unknown_id} matches no recorded finding", file=sys.stderr)
    for row in rows:
        if row["severity"] in ACTIONABLE_SEVERITIES and row["id"] not in accounted_ids:
            print(f"warning: {row['id']} ({row['severity']}) is neither fixed nor skipped", file=sys.stderr)


def _parse_since(since_text: str) -> datetime | None:
    try:
        return findings_file.parse_utc(since_text)
    except ValueError:
        print(f"invalid --since {since_text!r}: expected YYYY-MM-DDTHH:MM:SSZ", file=sys.stderr)
        return None


def _summarise(lens: str, entry: dict) -> dict:
    findings = entry["findings"]
    return {
        "lens": lens,
        "runs": entry["runs"],
        "no_op_runs": entry["no_op_runs"],
        "findings": findings,
        "by_severity": entry["by_severity"],
        "fixed": entry["fixed"],
        "first_pass_fix_rate": round(entry["first_pass_fixed"] / findings, 2) if findings else None,
        "top_categories": sorted(entry["categories"].items(), key=lambda item: -item[1])[:5],
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    raise SystemExit(main())

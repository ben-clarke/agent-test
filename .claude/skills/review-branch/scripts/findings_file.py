"""Read and validate the findings files branch reviewers write in file mode.

A findings file is one reviewer's canonical review JSON for one fix round, at
``<metrics-dir>/runs/<run-id>/round-<n>/<reviewer>.json``. The reviewer comes
from the file name and the round from the parent directory, so every finding
id must read ``<reviewer>-r<round>-<number>``.

A missing, unreadable, stale or malformed file is never a pass: ``load``
raises ``FindingsFileError`` with the reason.

Stdlib-only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import re


class FindingsFileError(Exception):
    """The findings file cannot count as a reviewer's result."""


def load(path: Path, *, since: datetime, since_event: str = "dispatch") -> FindingsFile:
    """Return the validated findings file, or raise with the reason it is invalid.

    A file last written before ``since`` is left from an earlier attempt, so it is stale.
    """
    round_number = round_of(path)
    if round_number is None:
        raise FindingsFileError(f"round cannot be derived from directory {path.parent.name!r}")
    written_at = _written_at(path)
    if written_at < since:
        raise FindingsFileError(f"older than the {since_event} ({format_utc(written_at)} < {format_utc(since)})")
    document = _read_document(path)
    findings = FindingsFile(path=path, reviewer=path.stem, round=round_number,
                            status=document.get("status"), summary=document.get("summary"),
                            issues=document.get("issues"))
    reason = _first_reason(findings)
    if reason:
        raise FindingsFileError(reason)
    return findings


def discover(run_dir: Path) -> list[Path]:
    """Every findings file in a run, ordered by round then reviewer."""
    return sorted(run_dir.glob("round-*/*.json"), key=lambda path: (round_of(path) or 0, path.name))


def round_of(path: Path) -> int | None:
    match = ROUND_DIRECTORY.fullmatch(path.parent.name)
    return int(match.group(1)) if match else None


def parse_utc(value: str) -> datetime:
    """Parse ``YYYY-MM-DDTHH:MM:SSZ``, as printed by ``date -u +%Y-%m-%dT%H:%M:%SZ``."""
    return datetime.strptime(value, UTC_FORMAT).replace(tzinfo=timezone.utc)


def format_utc(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime(UTC_FORMAT)


def _written_at(path: Path) -> datetime:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    except FileNotFoundError:
        raise FindingsFileError("missing") from None


def _read_document(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise FindingsFileError(f"unreadable ({error.__class__.__name__})") from None
    try:
        document = json.loads(text)
    except ValueError:
        raise FindingsFileError("not valid JSON") from None
    if not isinstance(document, dict):
        raise FindingsFileError("not a JSON object")
    return document


def _first_reason(findings: FindingsFile) -> str | None:
    for rule in RULES:
        reason = rule(findings)
        if reason:
            return reason
    return None


def _status_reason(findings: FindingsFile) -> str | None:
    if findings.status not in STATUSES:
        return f"status {findings.status!r} is not one of {', '.join(STATUSES)}"
    return None


def _summary_reason(findings: FindingsFile) -> str | None:
    if not isinstance(findings.summary, str):
        return "summary is not a string"
    if findings.status == "skip" and not findings.summary.strip():
        return "status skip has no summary explaining the skip"
    return None


def _issues_list_reason(findings: FindingsFile) -> str | None:
    if not isinstance(findings.issues, list):
        return "issues is not a list"
    if not all(isinstance(issue, dict) for issue in findings.issues):
        return "an issue is not an object"
    return None


def _severity_reason(findings: FindingsFile) -> str | None:
    for issue in findings.issues:
        if issue.get("severity") not in SEVERITIES:
            return f"issue {issue.get('id')!r} has severity {issue.get('severity')!r}, not one of {', '.join(SEVERITIES)}"
    return None


def _id_reason(findings: FindingsFile) -> str | None:
    ids = [issue.get("id") for issue in findings.issues]
    if not all(isinstance(issue_id, str) and issue_id for issue_id in ids):
        return "an issue has no id"
    pattern = re.compile(rf"{re.escape(findings.reviewer)}-r{findings.round}-\d+")
    mismatched = [issue_id for issue_id in ids if not pattern.fullmatch(issue_id)]
    if mismatched:
        return f"id {mismatched[0]!r} does not match {findings.reviewer}-r{findings.round}-<number>"
    duplicates = sorted({issue_id for issue_id in ids if ids.count(issue_id) > 1})
    if duplicates:
        return f"id {duplicates[0]!r} is used more than once"
    return None


def _issue_fields_reason(findings: FindingsFile) -> str | None:
    confidences = CONFIDENCES_BY_REVIEWER.get(findings.reviewer, CONFIDENCES)
    for issue in findings.issues:
        reason = _issue_field_reason(issue, confidences)
        if reason:
            return f"issue {issue['id']!r} {reason}"
    return None


def _issue_field_reason(issue: dict, confidences: tuple[str, ...]) -> str | None:
    missing = [field for field in REQUIRED_TEXT_FIELDS if not isinstance(issue.get(field), str) or not issue[field].strip()]
    if missing:
        return f"has no {missing[0]}"
    line = issue.get("line")
    if line is not None and (isinstance(line, bool) or not isinstance(line, int) or line < 0):
        return f"has line {line!r}, not a non-negative integer or null"
    if issue.get("confidence") not in confidences:
        return f"has confidence {issue.get('confidence')!r}, not one of {', '.join(confidences)}"
    return None


def _status_matches_issues_reason(findings: FindingsFile) -> str | None:
    if findings.status == "pass" and any(issue["severity"] != "suggestion" for issue in findings.issues):
        return "status pass lists errors or warnings"
    if findings.status in ("warn", "fail") and not findings.issues:
        return f"status {findings.status} has no issues"
    return None


@dataclass(frozen=True)
class FindingsFile:
    path: Path
    reviewer: str
    round: int
    status: str
    summary: str
    issues: list[dict]


RULES = (_status_reason, _summary_reason, _issues_list_reason, _severity_reason, _id_reason, _issue_fields_reason,
         _status_matches_issues_reason)
STATUSES = ("pass", "warn", "fail", "skip")
SEVERITIES = ("error", "warning", "suggestion")
CONFIDENCES = ("high", "medium", "none")
CONFIDENCES_BY_REVIEWER = {"spec-compliance-review": ("high", "medium", "low")}
REQUIRED_TEXT_FIELDS = ("file", "message", "suggestedFix")
ROUND_DIRECTORY = re.compile(r"round-([1-9]\d*)")
UTC_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

"""The engineer evidence file: one JSON line per wrapped command.

``run_logged.py --evidence`` writes entries and ``check_evidence.py`` reads
them. Each entry holds the kind, command, working directory, UTC start and
finish times, exit code, and the raw output. JSON encoding keeps command
output inside its entry, so output can never forge another entry.

Stdlib-only.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path


def append_entry(path: Path, entry: dict) -> None:
    """Append one entry, creating parent directories. Raises ``OSError`` when it cannot be written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")


def read_entries(path: Path) -> list[dict]:
    """Every complete entry, in order. A line that is not a whole entry (for example cut off) is ignored."""
    entries: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict) and all(field in entry for field in FIELDS):
            entries.append(entry)
    return entries


def parse_utc(value: str) -> datetime:
    """Parse ``YYYY-MM-DDTHH:MM:SSZ``, as printed by ``date -u +%Y-%m-%dT%H:%M:%SZ``."""
    return datetime.strptime(value, UTC_FORMAT).replace(tzinfo=timezone.utc)


def format_utc(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime(UTC_FORMAT)


KIND = "kind"
COMMAND = "command"
CWD = "cwd"
STARTED = "started"
FINISHED = "finished"
EXIT = "exit"
OUTPUT = "output"
FIELDS = (KIND, COMMAND, CWD, STARTED, FINISHED, EXIT, OUTPUT)
KINDS = ("scoped-tests", "lint", "typecheck", "other")
UTC_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

#!/usr/bin/env python3
"""Resolve which review agents apply to a set of changed files.

Ported from agentic-dev-team's ``scripts/select_lenses.py`` for the
review-branch skill's panel (also used by build-plan's authoring checklist). Self-contained: the plugin's registry, roster, and
classifier modules are folded in here.

Roster: every ``.claude/agents/*-review.md`` except ``spec-compliance-review``,
which build-plan always runs first on its own. Each agent's first ``Scope:``
line decides when it applies:

    Scope: always        -> every diff (correctness-review skips docs/config-only diffs)
    Scope: on-demand     -> never selected here; build-plan dispatches it by name
    Scope: test-files    -> only when a changed file is a test file
    Scope: cross-package -> only when the changed files span 2+ workspace
                            packages, or touch a ``packages`` directory,
                            ``infra/``, or any ``package.json``
    Scope: added-only    -> the following ``- **/*.ext`` globs, matched against
                            newly added files only (all changed files when no
                            added list is given)
    Scope:               -> the following ``- **/*.ext`` globs
    Scope: <prose>       -> ``.ext`` tokens found in the prose
    (no Scope line)      -> included, with a warning

Framework-reactivity agents (``MANIFEST_GOVERNED``) declare bare ``**/*.ts``
globs, so they also require the nearest ``package.json`` to depend on the
framework — a backend-only TypeScript change gets no React review.

Prints ``{"lenses": [...], "warnings": [...]}`` with lenses ordered cheap-first
(non-opus before opus). Fails open: anything unreadable keeps a lens and warns.

Stdlib-only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path, PurePosixPath

DEFAULT_ROOT = Path(__file__).resolve().parents[4]

SCOPE_ALWAYS = "always"
SCOPE_ON_DEMAND = "on-demand"
SCOPE_TEST_FILES = "test-files"
SCOPE_ADDED_ONLY = "added-only"
SCOPE_CROSS_PACKAGE = "cross-package"

EXCLUDED_AGENTS = frozenset({"spec-compliance-review"})

MANIFEST_GOVERNED = {
    "react-reactivity-review": ("react",),
}

# Only correctness-review is dropped on a docs/config-only diff: its own Skip
# clause covers that case, and it runs on opus. security-review must still scan
# config for credentials.
NON_EXECUTABLE_SKIP_ELIGIBLE = frozenset({"correctness-review"})

NON_EXECUTABLE_EXTENSIONS = frozenset({
    ".md", ".mdx", ".rst", ".txt",
    ".json", ".toml", ".ini", ".cfg",
    ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".pdf",
    ".lock",
})
NON_EXECUTABLE_BASENAMES = frozenset({
    "LICENSE", "LICENSE.txt", ".gitignore", ".editorconfig", ".gitattributes",
    "pnpm-lock.yaml",
})

# Markdown under these segments drives agent or skill behaviour, so it is never
# treated as inert documentation.
FUNCTIONAL_CONFIG_NAMES = frozenset({"claude.md", "agents.md"})
FUNCTIONAL_CONFIG_SEGMENTS = frozenset({".claude", "agents", "skills", "prompts", "knowledge", "templates"})

# Paths that reach beyond a single app: shared libraries, infrastructure, and
# workspace manifests (any edit, since the resolver sees paths, not diffs).
INFRA_SEGMENT = "infra"
SHARED_PACKAGES_SEGMENT = "packages"
MANIFEST_NAME = "package.json"

_SCOPE_RE = re.compile(r"^\s*Scope\s*:\s*(.*)$")
_MODEL_RE = re.compile(r"^\s*model\s*:\s*(.*)$")
_BULLET_RE = re.compile(r"^\s*-\s*(\S+)")
_EXT_TOKEN_RE = re.compile(r"`?(\.\w[\w.]*)`?")
_JS_TS_TEST_NAME_RE = re.compile(r"\.(test|spec)\.[^./]+$", re.IGNORECASE)
_PYTHON_TEST_NAME_RE = re.compile(r"^(test_.+|.+_test)\.py$", re.IGNORECASE)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Resolve applicable review agents.")
    parser.add_argument("--files", nargs="*", default=[], help="Changed file paths, repo-relative")
    parser.add_argument("--files-from", default=None, help="Read changed paths from this file ('-' for stdin)")
    parser.add_argument("--added", nargs="*", default=None, help="Newly added paths (git change type A)")
    parser.add_argument("--added-from", default=None, help="Read added paths from this file ('-' for stdin)")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Repository root")
    args = parser.parse_args(argv)
    if args.files_from == "-" and args.added_from == "-":
        parser.error("--files-from and --added-from cannot both read stdin")

    warnings: list[str] = []
    files = list(args.files)
    if args.files_from:
        extra, error = read_lines(args.files_from)
        files.extend(extra)
        if error:
            warnings.append(f"unreadable-files-from:{args.files_from}")

    added_files = None
    if args.added is not None or args.added_from:
        added_files = set(args.added or [])
        if args.added_from:
            extra, error = read_lines(args.added_from)
            added_files.update(extra)
            if error:
                warnings.append(f"unreadable-added-from:{args.added_from}")

    roster, roster_warnings = build_roster(args.root / ".claude" / "agents")
    lenses, lens_warnings = applicable_lenses(
        files,
        roster,
        added_files=added_files,
        test_files={f for f in files if is_test_file(f)},
        manifest_frameworks=lambda path: framework_dependencies(args.root, path),
        package_of=lambda path: workspace_package(args.root, path),
    )
    print(json.dumps({"lenses": lenses, "warnings": roster_warnings + warnings + lens_warnings}))
    return 0


def applicable_lenses(changed_files, roster, added_files=None, test_files=None, manifest_frameworks=None, package_of=None):
    """Pure resolver. ``roster`` is ``[(name, scope, is_opus)]``.

    Returns ``(lenses, warnings)``, lenses ordered cheap-first. ``None`` for
    ``added_files`` / ``test_files`` / ``manifest_frameworks`` / ``package_of`` means "no data":
    the lens is kept and a warning records the unnarrowed selection.
    """
    if not changed_files:
        return [], []
    selected: list[tuple[str, bool]] = []
    warnings: list[str] = []
    for name, scope, is_opus in roster:
        decision, warning = _decide(name, scope, changed_files, added_files, test_files, manifest_frameworks, package_of)
        if warning:
            warnings.append(warning)
        if decision:
            selected.append((name, is_opus))
    selected.sort(key=lambda pair: pair[1])
    return [name for name, _ in selected], warnings


def build_roster(agents_dir: Path):
    """I/O boundary: ``[(name, scope, is_opus)]`` from the agent files on disk."""
    try:
        paths = sorted(agents_dir.glob("*-review.md"))
    except OSError:
        return [], [f"unreadable-agents-dir:{agents_dir}"]
    roster = []
    for path in paths:
        name = path.stem
        if name in EXCLUDED_AGENTS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            roster.append((name, None, False))
            continue
        roster.append((name, parse_scope(text), parse_model_is_opus(text)))
    return roster, []


def parse_scope(text: str):
    """Return the agent's scope from its first ``Scope:`` line (see module docstring)."""
    lines = text.splitlines()
    for index, line in enumerate(lines):
        match = _SCOPE_RE.match(line)
        if not match:
            continue
        value = match.group(1).strip()
        lowered = value.lower()
        if lowered in (SCOPE_ALWAYS, SCOPE_ON_DEMAND, SCOPE_TEST_FILES, SCOPE_CROSS_PACKAGE):
            return lowered
        if lowered == SCOPE_ADDED_ONLY:
            globs = _bullet_block(lines, index)
            return (SCOPE_ADDED_ONLY, globs) if globs else None
        if value:
            return [f"**/*{token}" for token in _EXT_TOKEN_RE.findall(value)] or None
        return _bullet_block(lines, index) or None
    return None


def parse_model_is_opus(text: str) -> bool:
    for line in text.splitlines():
        match = _MODEL_RE.match(line)
        if match:
            return "opus" in match.group(1).lower()
    return False


def is_test_file(path: str) -> bool:
    """Name-based test detection per ``.claude/knowledge/test-file-indicators.md``."""
    posix = PurePosixPath(path)
    name = posix.name
    if name.lower().endswith(".feature"):
        return True
    if _JS_TS_TEST_NAME_RE.search(name) or _PYTHON_TEST_NAME_RE.match(name):
        return True
    return "__tests__" in posix.parts


def framework_dependencies(root: Path, path: str) -> set[str] | None:
    """I/O boundary: dependency names in the nearest ``package.json`` above ``path``.

    ``None`` when no manifest can be found or read.
    """
    manifest = _nearest_manifest(root, path, include_root=True)
    if manifest is None:
        return None
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    sections = ("dependencies", "devDependencies", "peerDependencies")
    return {dep for section in sections for dep in (data.get(section) or {})}


def workspace_package(root: Path, path: str) -> str | None:
    """I/O boundary: the nearest directory strictly below ``root`` holding a ``package.json``.

    ``None`` for root-level files and files outside every workspace package.
    """
    manifest = _nearest_manifest(root, path, include_root=False)
    return None if manifest is None else manifest.parent.relative_to(root).as_posix()


def read_lines(path_or_dash: str):
    """Non-blank lines from a file or stdin; ``(lines, error_name_or_None)``."""
    try:
        if path_or_dash == "-":
            text = sys.stdin.read()
        else:
            text = Path(path_or_dash).read_text(encoding="utf-8")
    except (OSError, ValueError) as exc:
        return [], type(exc).__name__
    return [line.strip() for line in text.splitlines() if line.strip()], None


def _decide(name, scope, changed_files, added_files, test_files, manifest_frameworks, package_of):
    """``(include, warning_or_None)`` for one roster entry."""
    if scope is None:
        return True, name
    if scope == SCOPE_ALWAYS:
        if name in NON_EXECUTABLE_SKIP_ELIGIBLE and _all_non_executable(changed_files):
            return False, f"skipped-non-executable:{name}"
        return True, None
    if scope == SCOPE_ON_DEMAND:
        return False, None
    if scope == SCOPE_TEST_FILES:
        if test_files is None:
            return True, f"unnarrowed-test-files:{name}"
        return any(f in test_files for f in changed_files), None
    if scope == SCOPE_CROSS_PACKAGE:
        return _cross_package_decision(name, changed_files, package_of)
    if isinstance(scope, tuple):
        eligible = changed_files if added_files is None else [f for f in changed_files if f in added_files]
        if not _scope_matches(scope[1], eligible):
            return False, None
        return True, (f"unnarrowed-added-only:{name}" if added_files is None else None)
    matching = [f for f in changed_files if any(_matches(f, glob) for glob in scope)]
    if not matching:
        return False, None
    if name not in MANIFEST_GOVERNED:
        return True, None
    return _manifest_decision(name, matching, manifest_frameworks)


def _nearest_manifest(root: Path, path: str, include_root: bool) -> Path | None:
    """Walk up from ``path`` to the closest ``package.json``, stopping at ``root``."""
    directory = (root / path).parent
    while directory != root and directory.parent != directory:
        manifest = directory / MANIFEST_NAME
        if manifest.is_file():
            return manifest
        directory = directory.parent
    root_manifest = root / MANIFEST_NAME
    return root_manifest if include_root and directory == root and root_manifest.is_file() else None


def _cross_package_decision(name, changed_files, package_of):
    if package_of is None:
        return True, f"unnarrowed-cross-package:{name}"
    if _is_cross_package(changed_files, package_of):
        return True, None
    return False, f"skipped-not-cross-package:{name}"


def _is_cross_package(changed_files, package_of) -> bool:
    if any(_touches_shared_ground(f) for f in changed_files):
        return True
    packages = {package_of(f) for f in changed_files} - {None}
    return len(packages) > 1


def _touches_shared_ground(file_path: str) -> bool:
    parts = PurePosixPath(file_path).parts
    if not parts:
        return False
    return parts[0] == INFRA_SEGMENT or SHARED_PACKAGES_SEGMENT in parts or parts[-1] == MANIFEST_NAME


def _manifest_decision(name, matching, manifest_frameworks):
    if manifest_frameworks is None:
        return True, f"unnarrowed-manifest:{name}"
    frameworks = MANIFEST_GOVERNED[name]
    unknown = False
    for path in matching:
        dependencies = manifest_frameworks(path)
        if dependencies is None:
            unknown = True
            continue
        if any(framework in dependencies for framework in frameworks):
            return True, None
    if unknown:
        return True, f"unreadable-manifest:{name}"
    return False, None


def _bullet_block(lines, start_index):
    globs = []
    for line in lines[start_index + 1:]:
        match = _BULLET_RE.match(line)
        if not match:
            break
        globs.append(match.group(1).strip("`"))
    return globs


def _matches(file_path: str, pattern: str) -> bool:
    """Suffix match for ``**/*.ext`` globs, exact path or basename otherwise."""
    if "*" in pattern:
        suffix = pattern.rsplit("*", 1)[-1]
        return bool(suffix) and file_path.endswith(suffix)
    return file_path == pattern or PurePosixPath(file_path).name == pattern


def _scope_matches(globs, files) -> bool:
    return any(_matches(f, glob) for f in files for glob in globs)


def _all_non_executable(changed_files) -> bool:
    return bool(changed_files) and all(_is_non_executable(f) for f in changed_files)


def _is_non_executable(file_path: str) -> bool:
    path = PurePosixPath(file_path)
    if path.name.lower() in FUNCTIONAL_CONFIG_NAMES:
        return False
    if any(segment in FUNCTIONAL_CONFIG_SEGMENTS for segment in path.parts):
        return False
    if path.name in NON_EXECUTABLE_BASENAMES:
        return True
    return path.suffix.lower() in NON_EXECUTABLE_EXTENSIONS


if __name__ == "__main__":
    raise SystemExit(main())

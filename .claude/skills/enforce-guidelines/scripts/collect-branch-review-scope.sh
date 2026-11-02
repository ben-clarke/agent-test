#!/usr/bin/env bash

set -euo pipefail

main() {
  local repo_root
  local repo_name
  local merge_base
  local head_sha
  local committed_name_status
  local staged_name_status
  local unstaged_name_status
  local untracked_relevant
  local all_review_files

  repo_root="$(git rev-parse --show-toplevel)"
  repo_name="$(basename "$repo_root")"

  if ! git show-ref --verify --quiet refs/remotes/origin/main; then
    printf 'ERROR: local ref refs/remotes/origin/main is unavailable. Unable to build a reliable review baseline.\n' >&2
    exit 2
  fi

  merge_base="$(git merge-base HEAD origin/main)"
  head_sha="$(git rev-parse HEAD)"
  committed_name_status="$(git diff --name-status --find-renames --diff-filter=ACMRD "${merge_base}..HEAD")"
  staged_name_status="$(git diff --cached --name-status --find-renames --diff-filter=ACMRD)"
  unstaged_name_status="$(git diff --name-status --find-renames --diff-filter=ACMRD)"
  untracked_relevant="$(collect_relevant_untracked_files)"
  all_review_files="$(build_all_review_files "$committed_name_status" "$staged_name_status" "$unstaged_name_status" "$untracked_relevant")"

  print_key_value 'repo_root' "$repo_root"
  print_key_value 'repo_name' "$repo_name"
  print_key_value 'baseline_ref' 'origin/main'
  print_key_value 'merge_base' "$merge_base"
  print_key_value 'head_sha' "$head_sha"
  print_key_value 'has_changes' "$(has_review_changes "$all_review_files")"

  print_section 'committed_name_status' "$committed_name_status"
  print_section 'staged_name_status' "$staged_name_status"
  print_section 'unstaged_name_status' "$unstaged_name_status"
  print_section 'untracked_relevant_files' "$untracked_relevant"
  print_section 'all_review_files' "$all_review_files"
  print_section 'committed_diff_context' "$(git diff --find-renames --unified=20 "${merge_base}..HEAD")"
  print_section 'staged_diff_context' "$(git diff --cached --find-renames --unified=20)"
  print_section 'unstaged_diff_context' "$(git diff --find-renames --unified=20)"

  print_new_file_contents "$all_review_files" "$merge_base"
}

collect_relevant_untracked_files() {
  local path
  local matches=()

  while IFS= read -r path; do
    if is_relevant_untracked_file "$path"; then
      matches+=("$path")
    fi
  done < <(git ls-files --others --exclude-standard)

  printf '%s\n' "${matches[@]:-}" | sed '/^$/d' | sort -u
}

is_relevant_untracked_file() {
  local path="$1"

  case "$path" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.scss|*.md|*.yaml|*.yml|*.sh)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

build_all_review_files() {
  local committed_name_status="$1"
  local staged_name_status="$2"
  local unstaged_name_status="$3"
  local untracked_relevant="$4"

  {
    extract_paths_from_name_status "$committed_name_status"
    extract_paths_from_name_status "$staged_name_status"
    extract_paths_from_name_status "$unstaged_name_status"
    printf '%s\n' "$untracked_relevant"
  } | sed '/^$/d' | sort -u
}

extract_paths_from_name_status() {
  local name_status="$1"
  local line
  local status

  while IFS= read -r line; do
    if [[ -z "$line" ]]; then
      continue
    fi

    status="${line%%$'\t'*}"

    if [[ "$status" == R* ]]; then
      printf '%s\n' "${line##*$'\t'}"
      continue
    fi

    printf '%s\n' "${line#*$'\t'}"
  done <<< "$name_status"
}

has_review_changes() {
  local all_review_files="$1"

  if [[ -n "$all_review_files" ]]; then
    printf 'true'
    return
  fi

  printf 'false'
}

print_new_file_contents() {
  local all_review_files="$1"
  local merge_base="$2"
  local path

  while IFS= read -r path; do
    if [[ -z "$path" || ! -f "$path" ]]; then
      continue
    fi

    if git cat-file -e "${merge_base}:${path}" 2>/dev/null; then
      continue
    fi

    printf '=== new_file_content:%s ===\n' "$path"
    cat "$path"
    printf '\n'
  done <<< "$all_review_files"
}

print_key_value() {
  local key="$1"
  local value="$2"

  printf '%s=%s\n' "$key" "$value"
}

print_section() {
  local name="$1"
  local content="$2"

  printf '=== %s ===\n' "$name"

  if [[ -n "$content" ]]; then
    printf '%s\n' "$content"
  fi
}

main "$@"

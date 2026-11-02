# Jira spec comment

The single contract for copying a spec onto its Jira ticket as a comment.
`specs` writes the comment; `plan-ticket` reads it.

Spec files are often not merged promptly, so a ticket can be planned on a
machine or clone that has no copy of the spec. The comment makes the spec
reachable from the ticket itself. Once the spec file is on the base branch, the
file wins over the comment.

## Comment format

Post the comment as `contentFormat: "markdown"`. The first line is the marker
that readers match on; keep it exactly in this shape:

```markdown
**Spec:** docs/specs/<slug>.md (spec-version <N>)

Copy of the spec so it can be read before the file is merged. The file in the repository wins once merged.

---

<full spec file contents, unchanged>
```

Post the spec as plain markdown, not inside a code block, so it renders
readably in Jira. Jira's markdown conversion may change whitespace; that is
acceptable because the comment is read for planning, not diffed.

Jira rejects comments over 32,767 characters. If the comment would exceed
32,000 characters, do not post or truncate it. Tell the user the spec is too
large to attach and that it must be merged, or pushed, before planning.

## Post or update the comment

Run this after the spec file contains its `**Jira:** <KEY>` line, so the copy
includes it.

1. Fetch the issue with `getJiraIssue`, `fields: ["comment"]`, `responseContentFormat: "markdown"`.
2. Find comments whose body starts with `**Spec:** docs/specs/<slug>.md`.
3. If one exists, update the newest with `addCommentToJiraIssue` and its `commentId`. Otherwise add a new comment.
4. Tell the user the comment was added or updated, with the ticket key.

Do not touch spec comments for a different slug.

## Read the comment

1. Fetch the issue with `getJiraIssue`, `fields: ["comment"]`, `responseContentFormat: "markdown"`.
2. Take the newest comment whose body starts with `**Spec:** docs/specs/`. Ignore other comments, even if they quote a spec.
3. Strip the marker line, the explanatory sentence, and the `---` separator. The rest is the spec.
4. Write it to `.claude/plans/jira-spec-<KEY>.md` (gitignored) so agents can read it by path. Never write it into `docs/specs/` — that would commit an unreviewed copy.

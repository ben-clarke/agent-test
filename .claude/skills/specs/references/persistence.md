# Persisting spec artifacts

Loaded on demand by [`../SKILL.md`](../SKILL.md) once the Cross-Artifact
Consistency Gate passes. Nothing above that gate refers into this file.

After the gate passes, persist all three artifacts plus the verdict to `docs/specs/` — chat-only specs are lost between sessions. Do not create Jira tickets from this skill. The only Jira call this skill makes is adding or refreshing the spec comment on an existing ticket (see [Keep the Jira copy current](#keep-the-jira-copy-current)).

## Persist to file

1. **Slugify** the feature name: lowercase, replace spaces with hyphens, strip special characters. ("User Login with MFA" → `user-login-with-mfa`)
2. **Check** whether `docs/specs/<slug>.md` already exists. If yes, ask: overwrite or create a versioned file (`<slug>-v2.md`)?
3. **Write** using the structure below. Add the `**Jira:**` line only when a ticket key is already known (the `/specs` argument, or named during the loop). Otherwise omit it.
4. **Print** the file path to chat so the user can find it.

```markdown
# Spec: <Feature Name>

**Format:** spec-version <skill frontmatter `version:`>
**Jira:** <KEY>

## Intent Description
<intent artifact>

## Architecture Specification
<architecture artifact>

## Acceptance Criteria
<acceptance criteria artifact>

## Glossary

Domain terms this spec depends on. `verified` means a **human** confirmed the
definition during the collaboration loop — not that an agent found a plausible
one. Render the section even when there is nothing to define.

| Term | Definition | Status | Source |
|------|------------|--------|--------|
| <term> | <definition> | `verified` / `unverified` | <where the definition came from> |

## Ambiguity Log

All gap and ambiguity findings from the Ambiguity Resolution Protocol, with their classifications and rationale.

| Decision | Classification | Resolved By | Rationale / Answer |
|----------|---------------|-------------|-------------------|
| <decision text> | `inferable` / `requires-stakeholder-input` | inference / human | <rationale or human's answer> |

## Consistency Gate
- [x/  ] Intent is unambiguous
- [x/  ] Every behavior/goal maps to an acceptance criterion
- [x/  ] Architecture constrains without over-engineering
- [x/  ] Terminology consistent across artifacts
- [x/  ] No contradictions between artifacts
- [x/  ] Every gap/ambiguity finding is logged — inferable with rationale or resolved by human
```

## Finish

Print the spec path, and the ticket key when one is known. Do not raise a
ticket. In validate mode, also state that the document was not co-authored with
the user, so its decisions still need their confirmation.

## Keep the Jira copy current

When the written spec has a `**Jira:** <KEY>` line, add or update the spec
comment on that ticket by following
[`jira-spec-comment.md`](jira-spec-comment.md). This covers a new spec for an
existing ticket and edits to a spec whose ticket was already raised. Without it,
`plan-ticket` can plan from a stale copy on a machine that lacks the file.


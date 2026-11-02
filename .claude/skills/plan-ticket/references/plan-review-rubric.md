# Plan-review agent rubric

Shared contract for the four adversarial plan-review critics
(`plan-review-acceptance`, `plan-review-design`, `plan-review-strategic`,
`plan-review-ux`), dispatched in parallel by the `plan-ticket` skill before the
human plan-review gate. Each agent cites this file for the "What you
receive" framing and the verdict-aggregation rule below, and keeps its own
domain-specific "What you check", "Severity rules", and full "Output
format" JSON block — the per-agent `issues[]` shape differs too much across
the four (see Output shape below) to collapse into one schema.

## What you receive

- The implementation plan (goal, acceptance criteria, and slices/steps —
  scope varies per agent; see its own "What you check" for what it reads).
- Any spec artifacts (intent, architecture notes, acceptance criteria) if
  they exist.

## Output shape

Three of the four (`plan-review-design`, `plan-review-strategic`,
`plan-review-ux`) share this top-level envelope, with agent-specific
`issues[]` fields (e.g. `files`, `category`)
documented in each agent's own "Output format" section:

```json
{
  "reviewer": "<agent name>",
  "verdict": "approve | needs-revision",
  "issues": [
    {
      "description": "<what's wrong>",
      "severity": "blocker | warning"
    }
  ],
  "summary": "<2-3 sentences: overall assessment and top concern>"
}
```

**Documented exception — `plan-review-acceptance`:** it has no top-level
`issues[]` array. It splits findings into four purpose-specific arrays
(`criteria_issues`, `scenario_issues`, `missing_scenarios`, `step_issues`)
instead — see its own "Output format" section, the canonical source for
that shape.

## Verdict rules

- Any `blocker` → `needs-revision`
- 3+ warnings with no blockers → `needs-revision`
- Otherwise → `approve`

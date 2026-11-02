---
name: address-pr-comments
description: Handle GitHub pull request review comments only. Use when asked to fetch unresolved PR comments, triage which to address, implement approved fixes one-by-one with explicit approval between comments, validate, reply on threads, and resolve addressed threads.
---

# Address PR Comments

Handle GitHub PR review comments end-to-end: fetch unresolved review comments for the current branch's PR, triage them, implement approved fixes one-by-one with explicit approval gates, validate changes, then reply to and resolve addressed threads.

## Trigger Boundaries

Use this skill when the request is specifically about GitHub PR review comments/threads.

Use when:

- The user asks to fetch/list unresolved PR comments
- The user asks which PR comments should be addressed
- The user asks to implement fixes for PR comments with approval gates
- The user asks to reply to PR comments and/or resolve review threads

Do not use when:

- The request is a generic code review without PR-thread handling
- The request is a broad refactor not driven by review comments
- The request is for Jira/Confluence comment workflows

## Workflow

1. Discover the PR and unresolved review threads.

- Resolve PR context from the current branch using `gh pr view --json number,url,title,headRefName,baseRefName`.
- Fetch review threads with GraphQL and include `isResolved`, comment ids, `path`, `line`, `url`, and `bodyText`.

2. Present unresolved comments clearly.

- Provide a bullet list where each item includes:
  - full comment text
  - comment link
  - local absolute file reference with line number for editor navigation.

3. Triage each comment before coding.

- Mark each as: `address now`, `defer`, or `not-applicable`.
- Explain impact and risk briefly.

4. Plan exact fixes and request approval.

- List exact file changes and test scope.
- Wait for explicit approval before editing.

5. Implement one comment at a time (approval-gated).

- Apply only the next approved comment fix.
- Run targeted validation for that fix.
- Report changes and results.
- Stop and wait for approval before moving to the next comment.

6. Run final validation after all approved fixes.

- Run scoped tests for changed files.
- Run workspace lint and typecheck.
- Separate unrelated pre-existing failures from new issues.
- Stop and wait for approval before moving to the next step.
- When asking for approval for the next fix, include a summary of the previous change AND a summary of the next change which is awaiting approval.

7. Commit and push.

- Stage only intended files.
- Use a Jira-keyed commit message when a Jira key exists.
- Push the current branch.

8. Reply to and resolve threads only when asked.

- Post a concise reply on each addressed thread summarising what changed.
- Do not describe how the change was validated
- Resolve only the addressed threads.
- Re-check unresolved thread count and report any remaining items.

## Useful Commands

```bash
# PR for current branch
gh pr view --json number,url,title,headRefName,baseRefName

# Unresolved review threads
OWNER="$(gh repo view --json owner -q .owner.login)"
REPO="$(gh repo view --json name -q .name)"
PR_NUMBER="<number>"

gh api graphql -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved comments(first:100){nodes{databaseId bodyText url path line originalLine}}}}}}}' -F owner="$OWNER" -F name="$REPO" -F number="$PR_NUMBER"
```

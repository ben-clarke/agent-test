---
name: create-new-worktree
description: Create a new linked git worktree for local development. Use when asked to create, cut, or prepare a new worktree and bootstrap it with the repo wrapper around scripts/worktree-new.sh.
model: sonnet
---

# Create New Worktree

Use this skill when the user wants a new linked worktree created and bootstrapped.

## Inputs

Accept:

- the requested worktree `name`
- an optional git ref to base the new detached worktree on

Ask only when the user has not provided a worktree name and it cannot be inferred safely from context.

## Create The Worktree

1. Run the creation flow from the main checkout, not from inside an existing linked worktree.
2. Run `git fetch` from the main checkout before creating the worktree so `origin/main` is up to date.
3. If the user did not provide a git ref, use `origin/main` as the default base ref.
4. Prefer the repo wrapper command when using the default base ref:
   - `./scripts/worktree-new.sh <name> origin/main`
5. If the user provided a git ref, run:
   - `./scripts/worktree-new.sh <name> <git-ref>`
6. Do not call `git worktree add` directly unless the wrapper script is unavailable and you explain why.

## What The Creation Flow Does

`./scripts/worktree-new.sh <name> <git-ref>`:

- slugifies the requested name
- creates a detached linked worktree under the repo's `.worktrees/` directory
- bootstraps the new worktree by running `scripts/worktree-bootstrap.sh <name>`
- prints the final worktree path and git ref

## Failure Handling

- If the target worktree path already exists, report that and stop.
- If bootstrap fails, report whether the worktree was still created and include the path so the user can recover.
- If the requested git ref does not resolve, report the git error clearly.

## Optional Cmux Workspace

After the worktree is created and after the bootstrap stage has started the `pnpm install --frozen-lockfile`, check whether the required Cmux skills are available:

- `cmux`
- `cmux-workspace`

If and only if both required Cmux skills are available:

- Create the workspace using `--command "claude"` so Claude starts immediately as the initial command — do **not** create the workspace first and then try to `send` the command, as `send --surface` fails on background surfaces that are not yet rendered in the window:
  ```bash
  cmux new-workspace --name "<worktree-name>" --cwd "<worktree-path>" --command "claude"
  cmux new-surface --workspace <workspace-ref> --type terminal --pane <claude-pane-ref> --working-directory "<worktree-path>" --focus true
  cmux send --surface <codex-surface-ref> "cd \"<worktree-path>\" && codex\n"
  ```
- After the workspace is created, add a second pane to the right for Codex. Focus the new pane so its terminal is rendered before sending the command:
  ```bash
  cmux new-pane --workspace <workspace-ref> --type terminal --direction right --focus true
  ```
- Then open another tab (surface) in the interactive shell pane, pointed at the worktree, and start `lazygit` in it. `new-surface` has no `--command`, so create the surface with the worktree as its `--working-directory` and start `lazygit` with a follow-up `cmux send`. Create the surface with `--focus true` so it is rendered before sending — `send` fails on a background surface that has not yet rendered:
  ```bash
  cmux new-surface --workspace <workspace-ref> --type terminal --pane <second-pane-ref> --working-directory "<worktree-path>" --focus true
  cmux send --surface <new-surface-ref> "lazygit\n"
  ```

The reason we want to open the Cmux workspace while the bootstrap is still running is that `pnpm install` can take a while, and we want to have the workspace ready for the user to start using as soon as the bootstrap completes.

If either required Cmux skill is unavailable, skip this step without prompting.

## Final Response

Always include:

- that you created a new worktree
- the worktree path
- the git ref used
- whether bootstrap completed successfully
- whether the Cmux workspace was opened, skipped because the user declined, or skipped because required Cmux skills were unavailable

---
name: close-task
description: "Closes the current Workspace-managed task: runs the project quality gate, creates the required Workspace result and test documents plus any applicable follow-up documents from templates, records the result as a Workspace comment, commits, pushes, opens a PR against the integration branch, merges, transitions the Workspace task to completed, and runs the post-merge integration that removes the task worktree. Use when a task in this repository is finished and ready to be integrated."
---

# Close Task

Automates the full closure workflow for the current feature branch task managed in Workspace.

Run every git, `gh` and script step yourself with **Bash**. Do not delegate to a subagent.

## Configuration

Read the `## Task System` section of `AGENTS.md` (mirrored in `CLAUDE.md`). Apply these values:

| Key | Default | Purpose |
|---|---|---|
| `WORKSPACE_PATH` | `/home/tonyjdev/Projects/workspace` | Local Workspace Laravel application |
| `WORKSPACE_PROJECT_KEY` | `SQST` | Workspace project key filter |
| `WORKSPACE_USER_EMAIL` | `test@example.com` | User recorded on Workspace transitions/comments |
| `BRANCH_DEVELOP` | `develop` | Integration branch (PR target) |
| `BRANCH_FEATURE_PREFIX` | `feat/` | Prefix for feature branches |
| `CHECK_CMD` | `pnpm check` | Lint, types and unit tests; the gate |
| `TEST_E2E_CMD` | `pnpm test:e2e` | Playwright, run when the panel changed |
| `BUILD_CMD` | `pnpm build` | Run when the built panel is affected |
| `SHELL_TEST_CMD` | `bash tests/shell/run.sh` | Shell suites, run when `scripts/` changed |
| `CHANGELOG_CMD` | (none) | No changelog is generated in this project |
| `WORKTREE_CLI` | `scripts/git/task-worktree.sh` | Canonical Git state machine of the task lifecycle |

Use Workspace domain APIs for status changes and Workspace task documents for closure documentation. Do not create local result files and do not add `tasks/`, `ai-tasks/`, `tech-debt/`, `suggested/`, or `domain-issues/` directories to this repository.

The Workspace management script lives outside this repo:

```
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh
```

## Instructions

### Step 1 — Pre-checks

- Confirm where you are standing. `{WORKTREE_CLI}` is the only thing that answers this; see `docs/development/worktrees.md`.

  ```bash
  scripts/git/task-worktree.sh preflight
  ```

  Exit 0 gives `SIDEQUEST_WORKTREE`, `SIDEQUEST_PRIMARY`, `SIDEQUEST_BRANCH`, `SIDEQUEST_TASK_KEY` and `SIDEQUEST_LINKED` on stdout; the task key comes from there and not from reading the branch by hand. Exit 1 means this is not a task worktree on its feature branch — STOP and report it.
- Read the Workspace task:

  ```bash
  /home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh show \
    --workspace {WORKSPACE_PATH} \
    --key {TASK_KEY}
  ```

- Collect the diff against the integration branch for an accurate PR body and document content. Use `git diff {BRANCH_DEVELOP} --stat` (not `{BRANCH_DEVELOP}...HEAD`) so uncommitted work is included.
- Sidequest-specific review of the diff before closing:
  - **No AI provider** — no SDK, no API key, no model call reached the application.
  - **No agent brand in the core** — anything specific to Claude, Codex or another agent stays in the skill or in the MCP adapter, never in `domain/`, `api/` or `web/`.
  - **Domain rules in `domain/`** — selection, attempt composition and evaluation are called from the API and from MCP, not reimplemented in either. A rule written twice is in the wrong place.
  - **Attempts immutable** — the statement and the options shown are copied into the attempt; nothing rebuilds a historical attempt from the current question.
  - **Nothing deleted** — content is archived, and the statistics still read the whole history.
  - **Import two-phase** — `preview` writes nothing, `commit` persists only what was accepted.
  - **Schema changes** — a migration that applies cleanly on an empty database, and `docs/especificacion.md` updated when the model moved.
  - **pnpm only** — no `package-lock.json`, `yarn.lock`, or `bun.lockb`.

### Step 2 — Quality gate (must pass)

Run the gate and report its exact output:

```bash
{CHECK_CMD}
```

Also run, when the diff calls for it:

```bash
{BUILD_CMD}        # the panel changed
{TEST_E2E_CMD}     # panel behaviour changed
{SHELL_TEST_CMD}   # anything under scripts/ changed
docker compose up -d --build && docker compose ps   # compose, Dockerfile or the schema changed
```

A task that changes the schema must also prove a clean migration over an empty database.

**Before the scaffolding task (SQST-0002) these commands do not exist yet.** Run what the repository actually has, and state in the report which checks were skipped and why. Never report a gate as passing when it did not run.

If any command fails, STOP and report the failure. Do not continue and do not create closure documents that imply successful verification.

### Step 3 — Documentation review

Update documentation when the change affects installation, workflow, architecture, the data model, the API or MCP contract, or user-visible behaviour. `docs/especificacion.md` and `docs/decisiones.md` describe what is built, not what was planned: when a decision changed during implementation, update it there instead of only noting it in the closure document. `docs/brief-original.md` is source material and is never edited. In the PR body, state whether documentation changed or was not applicable.

### Step 4 — Closure documents

Closure documentation must exist as database-backed Workspace task documents before the task is closed.

Always create these two documents:

- `result`: the outcome of the implemented task.
- `test`: how to verify the implemented task manually and automatically.

Use the active Workspace `DocumentTemplate` for each `TaskDocumentType` when one exists. If the database has no active template for that type, use the corresponding file in `{WORKSPACE_PATH}/resources/task-document-templates/`:

| Document type | Fallback template |
|---|---|
| `result` | `result.md` |
| `test` | `test.md` |
| `tech_debt` | `tech_debt.md` |
| `domain_issue` | `domain_issue.md` |
| `watchlist` | `watchlist.md` |
| `backlog` | `backlog.md` |
| `suggested` | `suggested.md` |

Populate every required section. Do not leave placeholder text, empty headings, `TBD`, or TODO markers.

The `result` document must include:

- completed behavior and important implementation choices;
- files or modules changed at a useful level of detail;
- exact verification commands and results;
- PR/merge references if already known, or a statement that they will be added in the final report;
- follow-up document/task keys, or `None`.

The `test` document must include:

- automated commands, suites, and focused cases to run (`pnpm test -- <path>`, `pnpm test:e2e --grep`, `bash tests/shell/run.sh`);
- manual test steps, expected results, and any seeded content, imported batch or session state needed to reproduce them;
- an explicit note when there is no manual surface or manual testing did not apply;
- evidence or artifacts needed to audit the verification.

Create each document with:

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh create-document \
  --workspace {WORKSPACE_PATH} \
  --user-email {WORKSPACE_USER_EMAIL} \
  --key {TASK_KEY} \
  --document-type result \
  --document-title "Resultado {TASK_KEY}: {short title}" \
  --document-file /tmp/{TASK_KEY}-result-document.md
```

Repeat for `--document-type test` with `/tmp/{TASK_KEY}-test-document.md`.

Also create additional documents when the work revealed material that should survive closure:

- `tech_debt`: implementation debt, risky shortcuts, brittle areas, deferred cleanup.
- `domain_issue`: unresolved domain terminology, rules or policy — including any of the ten decisions in `docs/decisiones.md` that implementation proved wrong.
- `watchlist`: external dependencies, operational risks, uncertain behavior, or signals to monitor.
- `backlog`: concrete accepted work to prioritize later, with acceptance criteria.
- `suggested`: useful but unvalidated follow-up ideas.

Only create optional documents that apply. If none apply, state `No optional closure documents were needed` in the result document and the final report.

If document creation fails, STOP and report it. Do not commit, merge, or close a task with missing required closure documentation.

### Step 5 — Result comment

A Workspace result comment **must always be added** before closing the task. Keep it concise and point to the documents from Step 4. It must include:

- `Summary`: concise implementation outcome.
- `Verification`: exact commands run and results.
- `Documents`: result/test document IDs plus any optional document IDs.
- `Follow-ups`: Workspace task keys for follow-up tasks created, optional document IDs, or `None`.

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh comment \
  --workspace {WORKSPACE_PATH} \
  --user-email {WORKSPACE_USER_EMAIL} \
  --key {TASK_KEY} \
  --comment-file /tmp/{TASK_KEY}-result.md
```

Register technical debt, suggested work, domain issues, watchlist entries, and backlog entries as Workspace documents first. Create new Workspace tasks with the `workspace-task-creator` skill only when the follow-up is independently actionable.

### Step 6 — Stage and commit

Stage all changes, tracked and untracked. Exclude `.env`, credentials, generated caches, backups, and secrets. Never commit `package-lock.json`, `yarn.lock`, or `bun.lockb` (pnpm only).

Commit message: `Done {TASK_KEY}: {description}`

### Step 7 — Push and create PR

```bash
git push -u origin HEAD
gh pr create --base {BRANCH_DEVELOP} --title "feat({TASK_KEY}): {Title Case Description}" --body "..."
```

Use this PR body structure:

```markdown
## Summary

Brief description of what changed.

## Changes

- Change 1
- Change 2

## Quality

- [x] `pnpm check`
- [x] `pnpm build` / `pnpm test:e2e` / `bash tests/shell/run.sh`, or explicitly skipped with reason
- [x] Documentation reviewed
```

The Changes section comes from the diff, and the Quality section must reflect the checks that actually ran. This repository has no CI, so the local gate is the only gate.

### Step 8 — Merge

```bash
gh pr merge --merge
```

**Without `--delete-branch`, and no `git checkout` afterwards.** To drop the local branch `gh` checks out the base branch first, and `{BRANCH_DEVELOP}` belongs to the primary checkout, so from a task worktree it aborts and leaves the branch standing on `origin`. Step 10 deletes both branches from the primary checkout, where it works.

### Step 9 — Close the Workspace task

After the merge succeeds:

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh close \
  --workspace {WORKSPACE_PATH} \
  --user-email {WORKSPACE_USER_EMAIL} \
  --key {TASK_KEY}
```

The close action transitions through `in_review`, `approved`, and `completed` using `Task::transitionTo(...)`. If Workspace rejects a transition, STOP and report the current status and the rejected next status.

### Step 10 — Post-merge integration

One command does everything that touches shared state, under the integration lock, so two closes cannot interleave:

```bash
scripts/git/task-worktree.sh finish {TASK_KEY}
```

It refuses a branch that is not merged yet, fast-forwards `{BRANCH_DEVELOP}` in the primary checkout, then removes the task worktree and deletes the branch locally and on `origin`. This project generates no changelog, so that step of the integration is disabled and says so.

- **Exit 0:** stdout carries `SIDEQUEST_PRIMARY`. That is where the shell has to go: a child process cannot move its caller, so report the `cd`, or use `close-task` from `scripts/git/task-worktree-functions.sh`, which moves it for you.
- **Exit 2:** another close holds the integration lock, or the worktree carries uncommitted work. Report which; do not retry in a loop.

Never delete the worktree, the branch or the remote branch by hand.

### Step 11 — Leave the next task open

The tasks of this project run in sequence. Read the list and, if the next task is still `backlog`, transition it to `open`, so the next session finds a task it can start:

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh transition \
  --workspace {WORKSPACE_PATH} \
  --user-email {WORKSPACE_USER_EMAIL} \
  --key {NEXT_TASK_KEY} \
  --status open
```

### Step 12 — Confirm

Report the PR number/URL, that the branch was merged and deleted locally and on `origin`, that the task worktree was removed and the primary checkout is on `{BRANCH_DEVELOP}` (with the `cd` the user's shell still needs), that Workspace task `{TASK_KEY}` is `completed`, which quality checks ran with their result and which were skipped and why, the result/test document IDs plus any optional document IDs or `None`, and which task was left `open` next.

---
name: start-task
description: "Starts a new task from the local Workspace app: reads project config, selects or shows an open Workspace task, loads its associated Workspace documents from the database, confirms the task worktree prepared by /init-task, transitions the task to in_progress, and loads its execution prompt. Use when beginning work on a Workspace-managed task in this repository."
---

# Start Task

Automates the setup workflow for starting a Workspace-managed task in the `sidequest` repository.

Run every git and script step yourself with **Bash**. Do not delegate to a subagent.

## Configuration

Read the `## Task System` section of `AGENTS.md` (mirrored in `CLAUDE.md`). Apply these values:

| Key | Default | Purpose |
|---|---|---|
| `WORKSPACE_PATH` | `/home/tonyjdev/Projects/workspace` | Local Workspace Laravel application |
| `WORKSPACE_PROJECT_KEY` | `SQST` | Workspace project key filter |
| `WORKSPACE_USER_EMAIL` | `test@example.com` | User recorded on Workspace task transitions |
| `BRANCH_DEVELOP` | `develop` | Integration branch name |
| `BRANCH_FEATURE_PREFIX` | `feat/` | Prefix for feature branches |
| `WORKTREE_CLI` | `scripts/git/task-worktree.sh` | Canonical Git state machine of the task lifecycle |

Workspace owns the task status values:

`suggested`, `backlog`, `open`, `in_progress`, `in_review`, `approved`, `blocked`, `completed`,
`cancelled`, `discarded`.

Use Workspace domain APIs for transitions; do not create, move, or edit local task files. This repository has no `tasks/` or `ai-tasks/` directory and must not gain one.

The Workspace management script lives outside this repo:

```
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh
```

## Instructions

### Step 1 — Select the task

If no task key is specified and the current directory is a task worktree, read the key from `scripts/git/task-worktree.sh preflight` (`SIDEQUEST_TASK_KEY`) — that is the task this worktree was claimed for.

Otherwise, list candidate tasks from Workspace and ask the user which one to start:

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh list \
  --workspace {WORKSPACE_PATH} \
  --project-key {WORKSPACE_PROJECT_KEY} \
  --status suggested,backlog,open \
  --limit 20
```

When a task key is known, read it:

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh show \
  --workspace {WORKSPACE_PATH} \
  --key {TASK_KEY}
```

Use the Workspace task `key` (for example `SQST-0005`) as the task ID for branch names and status reports.

**The tasks of this project are numbered to run in sequence.** Each one assumes the previous ones are done. Before starting, check that the earlier tasks are `completed`; if they are not, say so and let the user decide. Do not reorder the plan on your own.

### Step 2 — Load associated task documents

After reading the task and before loading the execution prompt, read every Workspace document associated with it. These documents are the task's database-backed context files.

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh documents \
  --workspace {WORKSPACE_PATH} \
  --key {TASK_KEY}
```

This loads:

- documents directly attached to the selected task (`task_documents.task_id`);
- documents from other tasks that reference the selected task as their source (`task_documents.source_task_id`).

`SQST-0001` carries the project's specification, its domain decisions and its references. Any task that touches the data model, the selection engine, the attempt record or the import format must read them, whether or not they are attached to it.

If the command reports no associated documents, continue and say that no associated Workspace documents were found. If it fails because the Workspace database is unavailable, STOP and report the database error; do not start from incomplete task context.

Treat the loaded content as part of the task source alongside title, description, comments, and activity. Pay special attention to document types:

- `backlog` / `suggested`: scope and acceptance context.
- `domain_issue`: unresolved business/domain decisions that may block implementation.
- `tech_debt`: known implementation risks or cleanup boundaries.
- `watchlist`: risks or dependencies to monitor while implementing.
- `result` / `test`: prior outcomes or verification guidance from related work.

### Step 3 — Confirm the task worktree

**This skill touches no Git.** `/init-task` already created the worktree and the branch from `origin/develop` and installed its environment; see `docs/development/worktrees.md`.

```bash
scripts/git/task-worktree.sh preflight
```

- **Exit 0:** stdout carries `SIDEQUEST_WORKTREE`, `SIDEQUEST_PRIMARY`, `SIDEQUEST_BRANCH`, `SIDEQUEST_TASK_KEY` and `SIDEQUEST_LINKED`. `SIDEQUEST_TASK_KEY` must be the task being started — if it is not, STOP and report both keys.
- **Exit 1:** the current directory is not a task worktree (an integration branch, a detached HEAD, another repository). STOP and tell the user to run `/init-task {TASK_KEY}` and `cd` into the path it reports.

Never run `git checkout`, `git checkout -b`, `git pull`, `git worktree add` or a branch switch of any kind here. One task is one branch, one worktree and one PR, and an agent never switches branch inside its worktree.

**Never commit during start-task.** Workspace stores the task state, and all implementation changes must stay visible in `git status` / `git diff` until `close-task` commits them together.

### Step 4 — Move the Workspace task to in progress

```bash
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh transition \
  --workspace {WORKSPACE_PATH} \
  --user-email {WORKSPACE_USER_EMAIL} \
  --key {TASK_KEY} \
  --status in_progress
```

This uses `Task::transitionTo(...)`, so invalid transitions fail instead of silently editing state. If Workspace rejects the transition, STOP and report the current and rejected status.

### Step 5 — Load execution prompt and repository context

1. Read `templates/TASK_PROMPT.md` next to this skill file.
2. Load this project's mandatory context: `CLAUDE.md`, `AGENTS.md`, `docs/especificacion.md` and
   `docs/decisiones.md`. Read `docs/referencias.md` when the task touches the MCP protocol, the
   ponderation model or the import schema, and `docs/development/worktrees.md` when anything about
   the checkout looks wrong. `docs/brief-original.md` is source material: read it, never edit it.
3. Use the Workspace task title, description, status, priority, type, difficulty, project, comments, activity, and all associated documents as the task source.
4. The task **difficulty** carries the suggested model — low for Haiku, medium for Sonnet, high for Opus. If the session is running on a clearly weaker model than the task suggests, say so once before starting rather than halfway through.

### Step 6 — Report

Report the worktree path and the branch name, that the Workspace task is `in_progress`, that the execution prompt and associated documents are loaded, and summarize the task objective and scope.

## Sidequest guardrails

Keep these in mind for every task started here — they are the ways work goes wrong in this repository:

- **No AI provider inside the application.** No SDK, no API key, no model call. Questions are generated outside and imported.
- **The core knows no agent brand.** Anything specific to Claude, Codex or another agent lives in the skill or in the MCP adapter, never in the domain, the API or the panel.
- **Domain rules live in `domain`.** Weighted selection, attempt composition and evaluation are called from the API and from MCP, never reimplemented in either.
- **Attempts are immutable.** Store a copy of the statement and of the options that were shown. Never rebuild a historical attempt from the current question.
- **Nothing is deleted.** Topics, subtopics and questions are archived, because the statistics depend on the history staying whole.
- **Import is two-phase.** `preview` validates and classifies without writing; `commit` persists what was accepted. Never add a single-call path that writes.
- **pnpm only.** No `package-lock.json`, `yarn.lock` or `bun.lockb`.

## While executing the task — fix it, don't file it

When the work turns up something that would become a `suggested` or `tech_debt` Workspace task — a
small bug, a stale instruction in the docs or in `CLAUDE.md`/`AGENTS.md`, a shortcut worth cleaning,
a command in the documentation that no longer exists — **resolve it in the same branch instead of
filing it**. Say in the final report what you fixed and why it was in the way.

Create the task only when the fix is too large to belong here:

- it changes the HTTP or MCP contract, or the data model, so the specification has to move first;
- it touches a context this task does not own;
- it needs a decision you cannot make;
- it would grow the diff past what a reviewer of *this* task can follow.

Then create it with the `workspace-task-creator` skill and name, in one line, why it was not fixed.

This does not apply to `domain_issue` and `watchlist`: an unresolved domain rule or a risk to monitor
is recorded as a Workspace document, never "fixed".

## After the task is finished — leave the next task open

Once the task you started is finished, the next task in the sequence must be ready to pick up. Read
the project's task list and, if the next one is still `backlog`, transition it to `open` — so a new
session finds a task it can start rather than a backlog it has to triage.

Execute the selected Workspace task in the `sidequest` repository.

Follow the mandatory context-loading order defined in `CLAUDE.md` and `AGENTS.md`.
Read `docs/especificacion.md` and `docs/decisiones.md` before touching the data model, the selection engine, the attempt record or the import format.
Use the Workspace task key, title, description, comments, activity, status, priority, type, difficulty, and associated documents as the task source.
Do not expand scope.
Do not stop for confirmations unless there is a real blocker.

---

## Pre-Implementation Design (mandatory for UI and domain tasks)

Before writing any implementation code, produce a design verification when the task creates or restructures panel screens, or when it defines a domain rule — weighted selection, attempt composition, evaluation, import classification.

If the task is plumbing only — configuration, packaging, scripts — skip this step and implement directly.

The design verification must produce:

1. A numbered requirements list extracted from the task and from the specification.
2. For UI tasks: the screen's place in the existing navigation, the primitives reused from the panel's component library, and the empty, loading and error states it needs.
3. For domain tasks: the rule written as inputs, outputs and invariants, plus the cases that must be impossible — an attempt with no correct option, a multiple-choice question missing correct options, an import that writes during preview.
4. A compact design summary.

Only proceed to implementation after the design summary is produced.

---

## Implementation

Execute the task completely. After implementation, verify every numbered requirement exists in the code.

Respect the repository's layering and rules:

- `domain/` holds weighted selection, attempt composition, evaluation and the invariants. It imports neither the ORM nor the API nor MCP.
- `db/` holds the Drizzle schema, the migrations and the repositories.
- `api/` holds Fastify routes under `/api/v1`, thin, delegating to the domain.
- `mcp/` holds the MCP server. It is an adapter: it contains no rule of its own.
- `web/` holds the React panel.
- Attempts are immutable: store the statement and the options that were shown.
- Nothing is deleted; content is archived.
- Documentation, commit messages and interface copy in Spanish; identifiers, tables, columns and API keys in English.

---

## Required execution flow

1. Read the project context and produce the design verification when it applies.
2. Execute the task completely.
3. Cross-check all numbered requirements against the implementation.
4. Run the project gate and report its exact output before claiming completion.
5. Register technical debt, suggested work, domain issues, or follow-up work as Workspace documents/tasks when needed.
6. Close the Workspace task through the `close-task` skill when execution is complete — it writes the `result`/`test` documents and the result comment.

## Completion criteria

A task is not complete until:

- implementation is finished
- all numbered requirements from the design verification are cross-checked as DONE
- the project gate passes with reported output
- the required Workspace `result` and `test` documents plus the result comment have been added
- the Workspace task has been transitioned to `completed`

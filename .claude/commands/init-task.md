---
description: Prepara una tarea de Workspace para implementarla — crea su worktree y su rama desde origin/develop, instala su entorno e informa de dónde trabajar
argument-hint: <task-key>
allowed-tools: Bash(scripts/git/task-worktree.sh:*), Bash(/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh:*), Read, Glob
---

# Init Task

Prepara la tarea `$ARGUMENTS`. Es la **primera** de las tres fases del ciclo
(`init-task` prepara, `start-task` implementa, `close-task` integra) y la única que crea ramas y
worktrees. Ver `docs/development/worktrees.md`.

## Qué hacer

1. Si no hay clave en `$ARGUMENTS`, lista las tareas abiertas del proyecto y pregunta cuál empezar.
   No elijas tú.

    ```bash
    /home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh list \
      --workspace /home/tonyjdev/Projects/workspace \
      --project-key SQST \
      --status suggested,backlog,open \
      --limit 20
    ```

    Las tareas de `SQST` están numeradas para ejecutarse en secuencia. Si la clave que te dan salta
    tareas anteriores sin completar, dilo antes de preparar nada: no es un bloqueo, pero el usuario
    tiene que saberlo.

2. Lee la tarea y deriva el slug de su título:

    ```bash
    /home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh show \
      --workspace /home/tonyjdev/Projects/workspace \
      --key {TASK_KEY}
    ```

    El slug es el título en minúsculas, sin acentos ni signos, con las palabras unidas por guiones
    (`Esquema de datos y migraciones con Drizzle` → `esquema-de-datos-y-migraciones-con-drizzle`).
    Solo letras minúsculas, dígitos y guiones: el script rechaza cualquier otra cosa en lugar de
    arreglarla por su cuenta.

3. Ejecuta la implementación canónica, sin reimplementar nada de git:

    ```bash
    scripts/git/task-worktree.sh init {TASK_KEY} {slug}
    ```

    Tarda: copia el `.env` del checkout primario, instala dependencias y construye el panel dentro
    del worktree para que `pnpm check` pueda ejecutarse ahí. `--no-deps` y `--no-build` lo saltan.

    Mientras el repositorio no tenga `package.json` —antes de SQST-0002— la preparación se salta
    sola y lo dice. No es un fallo.

4. Interpreta el resultado por su contrato:

    - **Código 0:** stdout trae `SIDEQUEST_WORKTREE=<ruta absoluta>` y `SIDEQUEST_BRANCH=<rama>`.
    - **Código 1:** falló una validación (clave o slug inválidos, la clave ya tiene rama, el
      worktree ya existe, el checkout primario está sucio, `origin/develop` no disponible) o falló
      la preparación del entorno. Reporta el mensaje tal cual.
    - **Código 2:** hay un cerrojo activo. Otra sesión está preparando una tarea: **no reintentes en
      bucle**, reporta qué operación hay que esperar.

5. Si el worktree se creó y la preparación falló, el propio comando lo dice y nombra su reparación:
   `scripts/git/task-worktree.sh recover {TASK_KEY}`. Nunca lo arregles a mano.

## Qué NO hacer

- **No transiciones la tarea en Workspace.** Eso es `start-task`, dentro del worktree.
- **No cambies de directorio prometiendo que la terminal del usuario te siguió.** Un proceso hijo no
  puede cambiar el directorio de su padre. Reporta la ruta y, si el usuario quiere que su shell se
  mueva sola, que cargue `source scripts/git/task-worktree-functions.sh` y use
  `init-task <clave> <slug>`.
- No hagas `git checkout`, `git checkout -b` ni `git worktree add` por tu cuenta. Todo eso ya está
  dentro del script, con su cerrojo.
- **No levantes Docker Compose aquí.** Todos los worktrees publican los mismos puertos; ver
  `docs/development/worktrees.md`.
- No empieces a implementar aquí.

## Qué reportar

La ruta del worktree, el nombre de la rama, que el entorno está instalado —o por qué se saltó— y el
comando exacto para entrar:

```
cd <ruta del worktree>
```

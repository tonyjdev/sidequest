# Agent Instructions

Instrucciones de repositorio para el trabajo con agentes en Sidequest. Aplican a toda tarea salvo
que el usuario diga otra cosa en la conversación.

## Qué es este proyecto

Aplicación local que intercala preguntas de conocimiento general en el flujo de trabajo con un
agente de IA en terminal y registra las respuestas. Lee `README.md` y
`docs/especificacion.md` antes de implementar nada.

Dos reglas de producto que no se negocian:

- **La aplicación no integra ningún proveedor de IA** ni almacena claves de API. Las preguntas se
  generan fuera y se importan.
- **El núcleo no depende de una marca de agente.** La skill y el servidor MCP son adaptadores; el
  dominio, la API y el panel no saben con qué agente hablan.

## Task System

Las tareas viven en la base de datos de la aplicación Workspace, no en archivos de este
repositorio. No crees directorios `tasks/` ni `ai-tasks/`.

```markdown
WORKSPACE_PATH: /home/tonyjdev/Projects/workspace
WORKSPACE_PROJECT_KEY: SQST
WORKSPACE_USER_EMAIL: test@example.com
BRANCH_DEVELOP: develop
BRANCH_FEATURE_PREFIX: feat/
WORKTREE_CLI: scripts/git/task-worktree.sh
CHECK_CMD: pnpm check
TEST_E2E_CMD: pnpm test:e2e
BUILD_CMD: pnpm build
SHELL_TEST_CMD: bash tests/shell/run.sh
CHANGELOG_CMD: (none)
CHANGELOG_FILES: (none)
```

Dos reglas gobiernan la ejecución que abre `start-task`: lo que se convertiría en una tarea
`suggested` o `tech_debt` se **arregla en la misma rama**, salvo que sea demasiado grande para
pertenecer ahí (cambio de contrato o de modelo de datos, otro contexto, una decisión que no te
corresponde, un diff que quien revise *esta* tarea no puede seguir), y al terminar se deja
**`open` la siguiente tarea** si no lo estaba ya. El material de `domain_issue` y `watchlist` se
registra como documento de Workspace, nunca se "arregla".

### Tres fases, un worktree por tarea

Varios agentes pueden trabajar aquí a la vez, así que cada tarea recibe un checkout propio.
`/init-task SQST-0005` crea `.worktrees/sqst-0005` desde `origin/develop` en
`feat/sqst-0005-<slug>` y prepara su entorno; **la rama es la reclamación**, porque el estado de la
tarea vive en Workspace y aquí no hay ningún archivo que mover.

| Fase | Comando | Qué hace |
| --- | --- | --- |
| Preparar | `/init-task {clave}` | Lee la tarea en Workspace, deriva el slug de su título, crea el worktree y la rama, copia el `.env` e instala. No confirma nada ni transiciona nada. |
| Implementar | `/start-task` | **No toca Git.** Confirma el worktree con `preflight`, carga los documentos y el prompt, y pasa la tarea a `in_progress`. |
| Integrar | `/close-task` | Ejecuta la puerta de calidad, escribe los documentos de cierre, confirma, publica, abre el PR, lo fusiona, cierra la tarea y entrega la limpieza a `finish`. |

`scripts/git/task-worktree.sh` es la única implementación de esas transiciones de Git. Ningún
comando de agente crea ramas ni worktrees por su cuenta. Ver `docs/development/worktrees.md`.

Las tareas están numeradas para ejecutarse en secuencia: `SQST-0001`, `SQST-0002`, … Cada una
asume que las anteriores están hechas. No empieces una tarea sin comprobar el estado de la
anterior.

Cada tarea lleva una **dificultad** que sugiere el modelo con el que ejecutarla: baja → Haiku,
media → Sonnet, alta → Opus. Es una recomendación, no una obligación.

Los cambios de estado pasan por los scripts de la skill `workspace-task-creator`:

```
/home/tonyjdev/.agents/skills/workspace-task-creator/scripts/manage_workspace_task.sh
```

## Flujo de trabajo

- **No crees ramas ni worktrees a mano.** `/init-task` lo hace, con su cerrojo; tú trabajas dentro
  del worktree que te da.
- Una tarea es una rama, un worktree y un PR. Nunca cambies de rama dentro de tu worktree ni entres
  en el worktree de otra tarea.
- El checkout primario no es un espacio de trabajo: solo la integración escribe en él.
- No confirmes durante la implementación. `close-task` confirma todo junto, para que el trabajo siga
  siendo visible en `git status` hasta entonces.
- No deshagas ni «limpies» cambios que no hiciste tú, salvo petición explícita.
- Mantén el cambio ceñido al comportamiento pedido.

## Verificación

Ejecuta el conjunto más pequeño que demuestre que el cambio funciona, y dilo si no puedes
ejecutarlo.

```bash
pnpm check              # lint + tipos + pruebas unitarias
pnpm test               # Vitest
pnpm test:e2e           # Playwright, solo si cambia el panel
pnpm build
bash tests/shell/run.sh # suites de shell, obligatorio si tocas scripts/
docker compose up -d --build && docker compose ps
```

`pnpm check`, `pnpm test`, `pnpm build` y las suites de shell existen desde SQST-0002;
`docker compose`, desde SQST-0003. `pnpm test:e2e` lo trae SQST-0022: hasta entonces ejecuta lo que
el repositorio tenga y di cuáles te saltaste y por qué. Nunca informes de una puerta como superada
si no llegó a ejecutarse.

Compose necesita un `.env` —cópialo de `.env.example`— y levanta un solo entorno a la vez. Ver
`docs/development/docker.md`.

Toda tarea que toque el esquema debe pasar además una migración limpia sobre una base vacía.

## Reglas de implementación

- Mantén separadas las responsabilidades de dominio, persistencia, API, MCP y presentación. El
  núcleo debe poder evolucionar sin rehacerse.
- Las reglas de dominio —selección ponderada, composición del intento, evaluación— viven en el
  dominio, no en los controladores ni en las herramientas MCP.
- Los intentos son inmutables. Guarda copia del enunciado y de las opciones mostradas, nunca solo
  la referencia a la pregunta.
- Las importaciones son reversibles: valida, previsualiza y guarda como borrador antes de
  publicar.
- Nada se borra físicamente: se archiva.
- Usa herramientas estructuradas y convenciones del framework antes que parseo o manipulación de
  cadenas a mano.
- Comentarios escasos y útiles: explican la intención no obvia, no la mecánica.

## Documentación

Actualiza la documentación cuando el cambio afecte a instalación, flujo, despliegue, arquitectura
o comportamiento visible. La documentación de este repositorio está en español.

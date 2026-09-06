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
CHECK_CMD: pnpm check
TEST_JS_CMD: pnpm test
BUILD_CMD: pnpm build
CHANGELOG_CMD: (none)
CHANGELOG_FILES: (none)
```

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

- Empieza desde `develop`.
- Crea ramas `feat/<clave-tarea-en-minusculas>-<slug-kebab>`, por ejemplo
  `feat/sqst-0005-esquema-drizzle`.
- Deja el árbol limpio antes de cambiar de rama.
- No deshagas ni «limpies» cambios que no hiciste tú, salvo petición explícita.
- Mantén el cambio ceñido al comportamiento pedido.

## Verificación

Ejecuta el conjunto más pequeño que demuestre que el cambio funciona, y dilo si no puedes
ejecutarlo.

```bash
pnpm check          # lint + tipos + pruebas unitarias
pnpm test           # Vitest
pnpm test:e2e       # Playwright, solo si cambia el panel
pnpm build
docker compose up -d --build && docker compose ps
```

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

# CLAUDE.md

Guía para Claude Code en este repositorio.

`AGENTS.md` tiene las instrucciones de repositorio: reglas de producto, sistema de tareas, flujo
de ramas, verificación y reglas de implementación. Léelo también; este archivo añade los comandos
concretos y el contexto de arquitectura.

## Comandos

> El proyecto está en fase de andamiaje. Estos comandos se materializan en las tareas SQST-0002 a
> SQST-0004; hasta entonces, algunos no existen todavía.

```bash
docker compose up -d          # levanta app + MySQL
docker compose logs -f app
docker compose down -v        # borra también el volumen de datos

pnpm dev                      # API y panel en modo desarrollo
pnpm check                    # lint + tipos + pruebas unitarias
pnpm test                     # Vitest
pnpm test -- selection        # un solo archivo de pruebas
pnpm test:e2e                 # Playwright sobre el panel
pnpm build

pnpm db:generate              # genera migraciones Drizzle desde el esquema
pnpm db:migrate               # aplica migraciones
pnpm db:studio                # inspección del esquema

bash tests/shell/run.sh       # suites de shell; obligatorio si tocas scripts/
```

El ciclo de tarea es de tres fases —`/init-task` prepara, `/start-task` implementa, `/close-task`
integra— y cada tarea vive en su propio worktree bajo `.worktrees/`:

```bash
scripts/git/task-worktree.sh init SQST-0005 esquema-de-datos
scripts/git/task-worktree.sh preflight        # dónde estoy y de qué tarea es este checkout
scripts/git/task-worktree.sh recover SQST-0005
scripts/git/task-worktree.sh finish SQST-0005 # integración posterior a la fusión
```

Ese script es la única implementación de las transiciones de Git del ciclo. Ver
`docs/development/worktrees.md`. **Docker Compose es de uno en uno**: cada worktree levantaría su
propio proyecto, con su propio volumen y los mismos puertos.

El gestor de paquetes es `pnpm`. La base de datos es MySQL en Docker, con volumen persistente.

## Arquitectura

Monolito Node.js + TypeScript con cuatro superficies sobre un mismo dominio:

```text
app
├── domain        seleccion ponderada, composicion del intento, evaluacion, invariantes
├── db            esquema Drizzle, migraciones, repositorios
├── api           Fastify, /api/v1
├── mcp           servidor MCP sobre HTTP streamable, /mcp
└── web           panel React + Vite + shadcn/ui
```

**Las reglas de dominio viven en `domain`, no en los adaptadores.** La API y el MCP son dos
puertas a las mismas reglas: si una regla acaba duplicada en ambas, está en el sitio equivocado.

**Los intentos son inmutables.** `attempts` guarda una copia del enunciado, de las opciones que se
mostraron y de la versión de la pregunta. Nunca reconstruyas un intento histórico leyendo la
pregunta actual: si la pregunta se editó, la lectura sería falsa.

**Nada se borra.** Temas, subtemas y preguntas se archivan. Las estadísticas dependen de que el
histórico siga completo.

**La importación es un flujo de dos fases**: `preview` valida y clasifica en válidos, inválidos y
duplicados sin escribir; `commit` persiste solo lo aceptado. No añadas un camino que escriba en
una sola llamada.

## Idioma

Documentación, mensajes de commit y textos de interfaz en español. Identificadores de código,
nombres de tablas y columnas, y claves de la API en inglés.

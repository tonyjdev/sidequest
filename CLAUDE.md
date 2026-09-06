# CLAUDE.md

Guía para Claude Code en este repositorio.

`AGENTS.md` tiene las instrucciones de repositorio: reglas de producto, sistema de tareas, flujo
de ramas, verificación y reglas de implementación. Léelo también; este archivo añade los comandos
concretos y el contexto de arquitectura.

## Comandos

> El espacio de trabajo y la puerta de calidad existen desde SQST-0002; el entorno en Docker, desde
> SQST-0003. El segundo bloque marca qué comando trae cada tarea pendiente.

```bash
pnpm install                  # instala el espacio de trabajo (app + web)
pnpm dev                      # API y panel en modo desarrollo
pnpm check                    # lint + tipos + pruebas unitarias
pnpm lint                     # ESLint y comprobación de formato
pnpm format                   # Prettier sobre el código
pnpm typecheck                # solo los tipos
pnpm test                     # Vitest
pnpm test -- selection        # un solo archivo de pruebas
pnpm build

bash tests/shell/run.sh       # suites de shell; obligatorio si tocas scripts/

cp .env.example .env          # obligatorio antes del primer `up`
docker compose up -d --build  # levanta app + MySQL
docker compose ps             # ambos servicios deben figurar como (healthy)
curl -s localhost:3000/api/v1/health   # sonda de salud: 200 con MySQL, 503 sin ella
docker compose logs -f app
docker compose down           # para; conserva el volumen de datos
docker compose down -v        # borra también el volumen de datos
```

Todavía no existen; los trae la tarea indicada:

```bash
pnpm db:generate              # genera migraciones Drizzle del esquema  SQST-0005
pnpm db:migrate               # aplica migraciones
pnpm db:studio                # inspección del esquema
pnpm test:e2e                 # Playwright sobre el panel               SQST-0022
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
`docs/development/worktrees.md`. **Docker Compose es de uno en uno**: el proyecto se llama
`sidequest` en todos los worktrees, así que comparten volumen y puertos publicados.

El gestor de paquetes es `pnpm`. La base de datos es MySQL 8.4 en Docker, con volumen persistente.
Los puertos, las variables y el ciclo de vida del volumen están en
`docs/development/docker.md`.

## Arquitectura

Monolito Node.js + TypeScript con cuatro superficies sobre un mismo dominio:

```text
app/src           paquete @sidequest/app
├── domain        selección ponderada, composición del intento, evaluación, invariantes
├── db            esquema Drizzle, migraciones, repositorios
├── api           Fastify, /api/v1
└── mcp           servidor MCP sobre HTTP streamable, /mcp
web/src           paquete @sidequest/web: panel React + Vite + shadcn/ui
```

`app` y `web` son los dos paquetes del espacio de trabajo pnpm, en la raíz del repositorio. Cada
uno importa lo suyo por alias —`@app/*` y `@web/*` apuntan a su propio `src`—, y la configuración
de TypeScript, ESLint, Prettier y Vitest es única y vive en la raíz.

**Las reglas de dominio viven en `domain`, no en los adaptadores.** La API y el MCP son dos
puertas a las mismas reglas: si una regla acaba duplicada en ambas, está en el sitio equivocado.

**Los intentos son inmutables.** `attempts` guarda una copia del enunciado, de las opciones que se
mostraron y de la versión de la pregunta. Nunca reconstruyas un intento histórico leyendo la
pregunta actual: si la pregunta se editó, la lectura sería falsa.

**La jerarquía de contenido tiene tres niveles fijos**: `subjects` → `topics` → `subtopics`
(materia → tema → subtema). La pregunta cuelga siempre de un subtema; el tema y la materia se
derivan. No es un árbol de profundidad libre.

**Nada se borra.** Materias, temas, subtemas y preguntas se archivan. Las estadísticas dependen de
que el histórico siga completo.

**La importación es un flujo de dos fases**: `preview` valida y clasifica en válidos, inválidos y
duplicados sin escribir; `commit` persiste solo lo aceptado. No añadas un camino que escriba en
una sola llamada.

## Idioma

Documentación, mensajes de commit y textos de interfaz en español. Identificadores de código,
nombres de tablas y columnas, y claves de la API en inglés.

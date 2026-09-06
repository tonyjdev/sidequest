# Sidequest

Aplicación local que intercala preguntas de conocimiento general dentro del flujo habitual de
trabajo con un agente de IA en terminal, y registra las respuestas para medir la evolución.

Mientras avanzas en la misión principal —tu código—, Sidequest te lanza misiones secundarias.

## Qué es y qué no es

- **Es** una aplicación local: API, panel web, base de datos y servidor MCP, en Docker Compose.
- **No integra** ningún modelo de IA ni necesita claves de proveedor. Las preguntas se generan
  fuera y se importan.
- **No depende** de una marca concreta de agente. Funciona con Claude, Codex, Kimi u otros que
  admitan una skill y comunicación por MCP.

## Cómo funciona

1. Trabajas con tu agente de IA habitual.
2. La skill decide, según su configuración, si toca intercalar una pregunta.
3. La skill pide una pregunta al servidor MCP local.
4. El agente muestra la pregunta y sus opciones en la terminal.
5. Respondes.
6. La skill registra la respuesta por MCP.
7. El agente continúa con el trabajo.

Las preguntas son independientes del desarrollo en curso y no alteran su contexto.

## Stack

| Capa | Tecnología |
| --- | --- |
| API | Node.js + TypeScript + Fastify |
| MCP | SDK de MCP para TypeScript |
| Datos | MySQL + Drizzle ORM |
| Panel | React + Vite + shadcn/ui |
| Pruebas | Vitest (unitarias) + Playwright (panel) |
| Entorno | Docker Compose |

## Arranque

Requisitos: Docker con Compose para el entorno completo, y Node 24 con pnpm 11 para trabajar sobre
el código.

```bash
cp .env.example .env          # ajusta las contraseñas y el secreto
docker compose up -d --build  # aplicación en :3000 y MySQL en :3306
docker compose ps             # ambos servicios deben figurar como (healthy)

curl -s localhost:3000/api/v1/health   # 200 con MySQL arriba, 503 sin ella
```

Para iterar sobre el código sin reconstruir la imagen:

```bash
pnpm install
pnpm dev                      # API en :3000 y panel en :5173
pnpm check                    # lint + tipos + pruebas unitarias
```

Si el 3000 o el 3306 ya están ocupados en tu máquina, cambia `APP_HOST_PORT` y `MYSQL_HOST_PORT`
en el `.env`: son los puertos publicados hacia fuera y no afectan a cómo se conecta la aplicación.

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/especificacion.md](docs/especificacion.md) | Especificación funcional y técnica completa |
| [docs/decisiones.md](docs/decisiones.md) | Decisiones de dominio y su justificación |
| [docs/referencias.md](docs/referencias.md) | Referencias externas y documentación de apoyo |
| [docs/brief-original.md](docs/brief-original.md) | Documento de arranque original, sin modificar |
| [docs/development/docker.md](docs/development/docker.md) | Entorno local: servicios, puertos, variables y datos |
| [docs/development/worktrees.md](docs/development/worktrees.md) | Worktrees de tarea en paralelo |

## Tareas

El trabajo se gestiona en la aplicación Workspace, proyecto `SQST`. No hay archivos de tareas en
este repositorio. Consulta `AGENTS.md`.

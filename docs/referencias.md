# Referencias

## Protocolo y SDK

| Recurso | URL |
| --- | --- |
| Especificación de Model Context Protocol | https://modelcontextprotocol.io/specification |
| SDK de MCP para TypeScript | https://github.com/modelcontextprotocol/typescript-sdk |
| Transporte HTTP streamable | https://modelcontextprotocol.io/docs/concepts/transports |
| Registrar servidores MCP en Claude Code | https://docs.claude.com/en/docs/claude-code/mcp |
| Agent Skills | https://docs.claude.com/en/docs/claude-code/skills |

## Stack

| Recurso | URL |
| --- | --- |
| Fastify | https://fastify.dev/docs/latest/ |
| Drizzle ORM (MySQL) | https://orm.drizzle.team/docs/get-started-mysql |
| Drizzle Kit, migraciones | https://orm.drizzle.team/docs/kit-overview |
| Vite | https://vite.dev/guide/ |
| React | https://react.dev/reference/react |
| shadcn/ui | https://ui.shadcn.com/docs |
| Vitest | https://vitest.dev/guide/ |
| Playwright | https://playwright.dev/docs/intro |
| Docker Compose | https://docs.docker.com/compose/ |
| MySQL 8 en Docker | https://hub.docker.com/_/mysql |

## Validación y formato

| Recurso | URL |
| --- | --- |
| JSON Schema, especificación | https://json-schema.org/specification |
| Ajv, validador de JSON Schema | https://ajv.js.org/ |
| Zod | https://zod.dev/ |

## Contexto de diseño

| Recurso | Por qué importa |
| --- | --- |
| Práctica distribuida y efecto de espaciado | Base de la ponderación por antigüedad: repasar espaciado retiene más que repasar seguido |
| Práctica intercalada | Es exactamente lo que hace Sidequest: mezclar material distinto dentro de una misma sesión |
| Testing effect | Responder una pregunta consolida más que releer la respuesta; justifica registrar y repetir fallos |

Estos tres efectos son los que sostienen el modelo de ponderación de
[especificacion.md](especificacion.md#42-peso). Si en algún momento se sustituye por repetición
espaciada formal, el punto de partida es el algoritmo SM-2 y sus derivados (Anki, FSRS).

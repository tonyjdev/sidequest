# Capa de dominio y repositorios

El dominio vive en `app/src/domain/`. Es el único sitio donde se decide qué es válido; la API, el
MCP y el panel son puertas a estas mismas reglas. Si una regla acaba escrita a la vez en dos
adaptadores, está en el sitio equivocado.

## Qué hay dentro

| Archivo | Qué guarda |
| --- | --- |
| `types.ts` | El vocabulario cerrado: estados, tipos de pregunta, dificultades, tipos de recurso |
| `errors.ts` | `DomainError` y sus tres razones: `invalid`, `not_found`, `conflict` |
| `content.ts` | Materia, tema y subtema, con la validación del slug y la cadena de publicación |
| `questions.ts` | Pregunta, opciones y recursos, con las tres invariantes de publicación |
| `attempts.ts` | El intento y su invariante: nunca se presenta sin una correcta entre las mostradas |
| `sessions.ts` | La sesión de trabajo de un agente |
| `settings.ts` | Los diez parámetros ajustables, con sus valores por defecto |
| `content-hash.ts` | El sha256 del enunciado normalizado con el que se detectan duplicados |
| `repositories.ts` | Los puertos de persistencia, sin una sola línea de implementación |
| `*-service.ts` | Los casos de uso: comprueban y después llaman a los puertos |
| `testing/in-memory.ts` | Los mismos puertos, en memoria, para probar sin MySQL |

Nada de aquí importa Drizzle, Fastify ni el MCP. `purity.test.ts` lo comprueba en cada `pnpm check`.

## Los puertos y sus dos implementaciones

`Repositories` reúne los ocho puertos —materias, temas, subtemas, preguntas, etiquetas, sesiones,
intentos y parámetros—. Hay dos implementaciones:

- `app/src/db/repositories/` los ata a MySQL con Drizzle. Es el único punto del que cuelga el ORM.
- `app/src/domain/testing/in-memory.ts` los resuelve con arrays. No se empaqueta en `dist`.

Los puertos guardan y leen; no deciden. Lo único que sí les pertenece es la atomicidad: cuando una
operación exige varias escrituras —crear una pregunta con sus opciones, archivar un árbol— el puerto
la ofrece como una sola y cada implementación la hace indivisible con lo que tenga.

```ts
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';
import { createQuestion } from '@app/domain/questions-service.js';

const repos = createInMemoryRepositories();

await createQuestion(repos, { subtopicId, type: 'single', statement: '…', options: [...] });
```

## Las invariantes están escritas dos veces

Las tres invariantes de la pregunta —al menos dos opciones, al menos una correcta, exactamente una
en las de selección única— están en `questions.ts` y también en los disparadores de
`0001_invariantes_de_la_pregunta.sql`. No es un descuido:

- en el dominio, para rechazar la operación **antes** de escribir y con un error que el panel pueda
  enseñar;
- en MySQL, para que ninguna escritura por otro camino se las salte.

Los mensajes son literalmente los mismos, así que romper una invariante suena igual venga de donde
venga. `types.test.ts` y `settings.test.ts` hacen lo propio con las otras dos copias inevitables: el
vocabulario que repite `db/schema.ts` y los valores iniciales que siembra la migración `0002`.

De los disparadores sale una consecuencia que alcanza a los adaptadores: **una pregunta no se crea
publicada**, porque en ese instante todavía no tiene opciones. `create` recorre borrador → opciones →
publicar dentro de una transacción, y `replaceOptions` devuelve la pregunta a borrador mientras
cambia sus opciones, porque los disparadores las cuentan una a una y vaciarlas con la pregunta
publicada fallaría al borrar la penúltima.

## Los errores no conocen HTTP

El dominio lanza `InvariantError`, `NotFoundError` o `ConflictError`, que solo dicen por qué la
operación no es válida. La traducción a un estado HTTP ocurre en un único punto, `toApiError` de
`api/server.ts`:

| Razón del dominio | Código de la API | Estado |
| --- | --- | --- |
| `invalid` | `validation_failed` | 422 |
| `not_found` | `not_found` | 404 |
| `conflict` | `conflict` | 409 |

El MCP hará su propia traducción cuando llegue, sin repetir ninguna regla.

## Los parámetros se leen tolerantes y se escriben estrictos

`settings` se lee con `settingsFromRows`: una fila que falta o que no se puede interpretar deja el
valor por defecto en su sitio. La validación va en la escritura, en `settingRowsFrom`, que rechaza
claves desconocidas y valores imposibles antes de tocar nada. Que el panel guardara una vez un
número absurdo no puede dejar la aplicación sin arrancar.

## Verificación

```bash
pnpm test -- src/domain          # el dominio entero, sin MySQL
pnpm test -- repositories.integration   # los adaptadores Drizzle; se saltan sin MySQL delante
```

Las pruebas de integración crean y borran su propia base —`sidequest_test_repositorios`—, así que
nunca tocan la de desarrollo, y necesitan `MYSQL_ROOT_PASSWORD` en `.env`.

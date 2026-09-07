# Capa de dominio y repositorios

El dominio vive en `app/src/domain/`. Es el único sitio donde se decide qué es válido; la API, el
MCP y el panel son puertas a estas mismas reglas. Si una regla acaba escrita a la vez en dos
adaptadores, está en el sitio equivocado.

## Qué hay dentro

| Archivo | Qué guarda |
| --- | --- |
| `types.ts` | El vocabulario cerrado: estados, tipos de pregunta, dificultades, tipos de recurso |
| `errors.ts` | `DomainError` y sus tres razones: `invalid`, `not_found`, `conflict` |
| `content.ts` | Materia, tema y subtema: validación del slug, cadena de publicación y transiciones |
| `questions.ts` | Pregunta, opciones y recursos: las tres invariantes de publicación y sus transiciones |
| `attempts.ts` | El intento y su invariante: nunca se presenta sin una correcta entre las mostradas |
| `sessions.ts` | La sesión de trabajo de un agente |
| `settings.ts` | Los diez parámetros ajustables, con sus valores por defecto |
| `selection.ts` | El peso de una candidata al sorteo y la carrera que decide cuál sale |
| `random.ts` | El azar, detrás de una función, para que la prueba pueda fijar el sorteo |
| `content-hash.ts` | El sha256 del enunciado normalizado con el que se detectan duplicados |
| `repositories.ts` | Los puertos de persistencia, sin una sola línea de implementación |
| `*-service.ts` | Los casos de uso: comprueban y después llaman a los puertos |
| `testing/in-memory.ts` | Los mismos puertos, en memoria, para probar sin MySQL |
| `testing/random.ts` | El generador con semilla que hace reproducible cualquier sorteo |

Nada de aquí importa Drizzle, Fastify ni el MCP. `purity.test.ts` lo comprueba en cada `pnpm check`.

## Los puertos y sus dos implementaciones

`Repositories` reúne los ocho puertos —materias, temas, subtemas, preguntas, etiquetas, sesiones,
intentos y parámetros—. Hay dos implementaciones:

- `app/src/db/repositories/` los ata a MySQL con Drizzle. Es el único punto del que cuelga el ORM.
- `app/src/domain/testing/in-memory.ts` los resuelve con arrays. No se empaqueta en `dist`.

Los puertos guardan y leen; no deciden. Lo único que sí les pertenece es la atomicidad: cuando una
operación exige varias escrituras —crear o editar una pregunta con sus opciones, archivar un árbol,
repartir las posiciones de un conjunto de hermanos— el puerto la ofrece como una sola y cada
implementación la hace indivisible con lo que tenga.

De ahí que la pregunta tenga un solo escritor, `questions.update`, y no uno por colección: una
pregunta a medio editar —opciones nuevas con el enunciado viejo— no es un estado que deba llegar a
existir. Lo que llega sustituye entero; lo que no llega se queda como estaba.

```ts
import { createInMemoryRepositories } from '@app/domain/testing/in-memory.js';
import { createQuestion } from '@app/domain/questions-service.js';

const repos = createInMemoryRepositories();

await createQuestion(repos, { subtopicId, type: 'single', statement: '…', options: [...] });
```

## Las transiciones de estado son dos, y tres en la pregunta

`draft → published` y `cualquiera → archived`. No hay más: `assertStatusTransition` rechaza con
`ConflictError` republicar lo archivado, volver a borrador y repetir la transición que ya se hizo.

La pregunta añade una tercera, `published → draft`, con `assertQuestionStatusTransition`: se
retira para arreglarla sin romper el histórico, que sigue colgando de los intentos ya registrados.
Archivada sigue siendo terminal también aquí.

Está en `content.ts` y no en los adaptadores por la razón de siempre: la API lo llama desde
`POST /{nivel}/{id}/publish` y el MCP lo llamará desde donde le toque, sin que ninguno tenga que
saberse la tabla. Publicar comprueba además la cadena de tres eslabones —un nivel no se publica si
su padre no lo está—; archivar baja en cascada y no tiene vuelta, porque el histórico depende de
que lo retirado siga retirado.

Reordenar sigue el mismo reparto: `assertReorderIds` exige el conjunto completo de hermanos, una
vez cada uno y sin ids ajenos, antes de que el puerto reparta `position` 1..n. El contrato HTTP que
sale de todo esto está en [api.md](api.md).

## La selección se recorre por páginas

El motor de `selection-service.ts` decide qué pregunta se muestra a continuación. Su regla está en
`docs/especificacion.md` §4.1 y §4.2, y entera en `domain`: los adaptadores solo saben responder
qué preguntas son candidatas y con qué histórico, nunca cuánto pesan.

El peso es el producto de cuatro factores —novedad, antigüedad, tasa de fallo y dificultad— sobre
una base de 1. Una pregunta sin intentos toma un camino aparte: sus factores de antigüedad y de
fallo valen 1, y toda su ventaja es `boost_nueva`. Esa es la regla que no se negocia, y por eso no
está escrita como un caso límite de una división por cero intentos.

El sorteo no suma pesos. Cada candidata corre con la clave `−ln(u) / peso` y gana la menor, que es
exactamente el muestreo proporcional al peso; como basta recordar la mejor clave vista, el motor
puede pedir el catálogo por páginas —`questions.listSelectionCandidates`, con cursor por id— en vez
de traerlo entero a memoria. De cada candidata viajan seis campos: ni enunciado, ni opciones, ni
etiquetas. La pregunta elegida se lee después, y solo esa.

Cuando la primera vuelta no encuentra nada, se da una segunda **sin la ventana de enfriamiento y
solo sin ella**. El filtro es lo que pidió quien llama y nunca se levanta: devolver algo de fuera
sería responder a otra pregunta. Si tampoco así hay candidatas, el resultado es un conjunto vacío
explícito —`{ kind: 'empty' }`—, no un error: que el filtro no encuentre nada es una respuesta.

La selección **no escribe nada**. El enfriamiento se mide sobre `attempts`, así que una pregunta
servida y abandonada no deja rastro y puede volver a salir; `/quiz/next` no consume.

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
publicar dentro de una transacción, y `update` aparca la pregunta en borrador mientras cambia sus
opciones, porque los disparadores las cuentan una a una y vaciarlas con la pregunta publicada
fallaría al borrar la penúltima.

Que un disparador salte significa que algo escribió sin pasar por el servicio. Cuando ocurre,
`withDatabaseInvariants` de `db/repositories/shared.ts` reconoce el `SQLSTATE 45000` y lo convierte
en `ConflictError` con el mismo mensaje, en vez de dejar escapar un error de MySQL sin traducir.

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
pnpm test src/domain             # el dominio entero, sin MySQL
pnpm test content                # la jerarquía y su contrato HTTP
pnpm test questions              # las preguntas y su contrato HTTP
pnpm test selection              # la fórmula del peso y el sorteo, con semilla fija
pnpm test repositories.integration      # los adaptadores Drizzle; se saltan sin MySQL delante
```

Las pruebas de integración crean y borran su propia base —`sidequest_test_repositorios`—, así que
nunca tocan la de desarrollo, y necesitan `MYSQL_ROOT_PASSWORD` en `.env`.

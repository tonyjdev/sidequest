# API HTTP: contenido, preguntas, etiquetas y parámetros

Todo lo que se administra vive bajo `/api/v1`. Este documento fija su contrato; el envelope de
error y el mapa de códigos están en §5 de la especificación, y las reglas que hay detrás, en
[dominio.md](dominio.md).

Las rutas son finas a propósito. Traducen JSON a una llamada de `domain/content-service.ts` o de
`domain/questions-service.ts` y vuelven: **ni una comprobación vive en `api/`**, para que el
servidor MCP entre por la misma puerta sin copiar ninguna.

Dos mitades, con reglas propias:

- **La jerarquía de contenido** —materias, temas y subtemas— comparte superficie: es la misma cosa
  a distinta altura (docs/especificacion.md §3).
- **La pregunta es un agregado**: sus opciones, sus recursos y sus etiquetas se crean y se editan
  con ella, en la misma llamada.

## La jerarquía: rutas

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/subjects` · `/topics` · `/subtopics` | Listado, con filtros |
| GET | `/{nivel}/{id}` | Un nodo |
| POST | `/{nivel}` | Alta. Responde `201` |
| PATCH | `/{nivel}/{id}` | Edición de `slug`, `name`, `description` y `position` |
| POST | `/{nivel}/{id}/publish` | `draft` → `published` |
| POST | `/{nivel}/{id}/archive` | cualquiera → `archived`, en cascada |
| POST | `/{nivel}/reorder` | Orden manual del conjunto de hermanos |

`{nivel}` es `subjects`, `topics` o `subtopics`.

## Forma del recurso

Claves en inglés y `snake_case`, fechas en ISO-8601 y listados envueltos en `items`:

```json
{
  "id": 3,
  "slug": "algebra",
  "name": "Álgebra",
  "description": null,
  "status": "draft",
  "position": 0,
  "created_at": "2026-09-06T10:00:00.000Z",
  "updated_at": "2026-09-06T10:00:00.000Z",
  "subject_id": 1
}
```

El tema añade `subject_id` y el subtema `topic_id`. **El listado de subtemas añade además
`question_count`**, el número de preguntas que cuelgan del subtema en cualquier estado: es lo que
distingue en el panel un subtema vacío de uno con contenido. No va en la ficha ni en las
respuestas de escritura, donde nadie lo mira y costaría una consulta.

## Filtros del listado

| Parámetro | Dónde | Ejemplo |
| --- | --- | --- |
| `status` | los tres niveles | `?status=published` · `?status=draft,published` |
| `subject_id` | `/topics` | `?subject_id=1,2` |
| `topic_id` | `/subtopics` | `?topic_id=3` |

Un valor repetido y uno separado por comas significan lo mismo: `?status=draft&status=published`
equivale a `?status=draft,published`. Un estado que no existe devuelve `422`.

## Transiciones de estado

**El estado no se edita con `PATCH`.** Un `PATCH` que lleve `status` devuelve `422`: el cuerpo es
estricto para que el intento no se pierda en silencio.

Las transiciones son dos y solo dos:

| Desde | `publish` | `archive` |
| --- | --- | --- |
| `draft` | ✅ | ✅ |
| `published` | 409 «ya está publicado» | ✅ |
| `archived` | 409 «solo se publica desde borrador» | 409 «ya está archivado» |

Publicar exige además que el padre ya lo esté —la cadena de tres eslabones—, y responde `409`
nombrando el eslabón que falta. Archivar baja: una materia archiva sus temas y sus subtemas, y un
tema, sus subtemas, todo en la misma operación. Nada se borra.

Que archivar no tenga vuelta es deliberado: el histórico depende de que lo retirado siga retirado
y desarchivar en cascada dejaría publicado un árbol que nadie ha revisado.

## Reordenación

```http
POST /api/v1/topics/reorder
{ "subject_id": 1, "ids": [7, 3, 5] }
```

Llega **la lista completa de hermanos** en el orden nuevo y el servidor reparte `position` 1..n.
Un subconjunto se rechaza con `422`, porque repartir 1..n entre unos pocos dejaría posiciones
repetidas con los que no vinieron; el detalle del error nombra lo que sobra, lo que falta y lo
repetido:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "La reordenación necesita todos los hermanos exactamente una vez, sin ids ajenos",
    "details": { "duplicated": [], "unknown": [9], "missing": [5] }
  }
}
```

Hermanos son todos, incluidos los archivados: el panel carga la lista sin filtrar cuando entra en
modo reordenación. `/subtopics/reorder` recibe `topic_id`; `/subjects/reorder`, solo `ids`.

## Preguntas

La pregunta es un agregado y se escribe como tal: **no hay `/questions/{id}/options`**. Una
pregunta a medio editar —opciones nuevas con el enunciado viejo— no es un estado que deba llegar a
existir, así que todo el cuerpo entra en una transacción o no entra nada.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/questions` | Listado, con filtros. Devuelve la pregunta sin lo que cuelga de ella |
| GET | `/questions/{id}` | La ficha: la pregunta con sus opciones, recursos y etiquetas |
| POST | `/questions` | Alta del agregado. Responde `201` con la ficha |
| PATCH | `/questions/{id}` | Edición del agregado. Responde con la ficha |
| POST | `/questions/{id}/publish` · `/unpublish` · `/archive` | Transiciones. Responden con la pregunta |

```json
{
  "subtopic_id": 3,
  "type": "single",
  "statement": "¿Cuál es la solución de 2x + 6 = 0?",
  "explanation": "Se despeja la x.",
  "difficulty": "medium",
  "visible_options": null,
  "status": "published",
  "options": [
    { "text": "x = −3", "is_correct": true },
    { "text": "x = 3", "is_correct": false }
  ],
  "resources": [{ "kind": "page", "url": "https://es.wikipedia.org/wiki/Ecuación", "label": null }],
  "tag_ids": [1]
}
```

Cinco cosas que el cuerpo no dice y conviene saber:

- **`status` solo se acepta en el alta**, y solo vale `draft` —el valor por defecto— o
  `published`. A diferencia del contenido, la pregunta sí puede nacer publicada: el alta lleva sus
  opciones, así que las tres invariantes ya se pueden comprobar. Debajo sigue siendo borrador →
  opciones → publicar, porque los disparadores de la base no admiten otra cosa
  ([database.md](database.md)).
- **`visible_options` manda sobre el valor global** cuando no es nulo; nulo usa
  `settings.visible_options_default` (docs/decisiones.md §7).
- **`content_hash` y `version` no se escriben nunca desde fuera.** El hash se deriva del enunciado
  y la versión la sube la base al cambiar el contenido —enunciado, explicación, tipo, dificultad o
  `visible_options`—. Publicar, archivar o mover la pregunta de subtema no la suben.
- **`storage_kind` no se acepta**: en esta versión los recursos son URL externas
  (docs/decisiones.md §2). La respuesta lo devuelve, siempre `external`.
- En el `PATCH`, **una colección que llega sustituye entera a la anterior** y una que no llega se
  queda como estaba. `"resources": []` vacía los recursos; omitirlos los conserva.

### Filtros del listado

| Parámetro | Ejemplo |
| --- | --- |
| `status` | `?status=published` · `?status=draft,published` |
| `subtopic_id` | `?subtopic_id=3,4` |
| `difficulty` | `?difficulty=hard` |
| `tag_id` | `?tag_id=1` |
| `search` | `?search=ecuacion` |
| `limit` · `offset` | `?limit=50&offset=100` |

`search` busca una coincidencia parcial **en el enunciado**, sin distinguir mayúsculas ni acentos:
la cotejación por defecto de MySQL 8.4 ya lo hace, y los repositorios en memoria lo imitan para que
una prueba que pasa sin base de datos no mienta.

### Transiciones de estado

La pregunta tiene tres, una más que el contenido:

| Desde | `publish` | `unpublish` | `archive` |
| --- | --- | --- | --- |
| `draft` | ✅ | 409 «ya está en borrador» | ✅ |
| `published` | 409 «ya está publicada» | ✅ | ✅ |
| `archived` | 409 | 409 | 409 «ya está archivada» |

**La pregunta sí vuelve a borrador**, a diferencia de la materia o el tema: se retira para
arreglarla sin romper el histórico, que sigue colgando de los intentos ya registrados. Archivada,
en cambio, es terminal por la misma razón de siempre. Publicar exige las tres invariantes; que los
tres antecesores estén publicados es criterio de candidatura al sorteo (§4.1), no condición para
publicar la pregunta.

## Parámetros globales

```http
GET /api/v1/settings
```

Devuelve los diez parámetros de docs/especificacion.md §3.10 con su clave de la base, que es
también la de la API: `visible_options_default`, `weight_new_boost`, `weight_maturity_days`,
`weight_failure`, `weight_difficulty_easy` · `_medium` · `_hard`, `cooldown_hours`,
`attempt_token_ttl_seconds` y `session_max_questions`. Todos son números.

La lectura es tolerante: una fila que falte o que no se pueda interpretar deja su valor por
defecto en su sitio (`domain/settings.ts`). Que la configuración fuera ilegible una vez no puede
dejar sin arrancar a lo que la usa.

**El `PATCH` todavía no existe**: lo trae SQST-0025, con la pantalla que los edita. El `GET` se
adelantó en SQST-0011 porque el editor de preguntas necesita enseñar cuántas opciones se mostrarán
cuando la pregunta no lo dice.

## Etiquetas

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/tags` | Listado completo |
| POST | `/tags` | Alta con `slug` y `name`. Responde `201` |
| PATCH | `/tags/{id}` | Edición de `slug` y `name` |

Las etiquetas no se archivan ni se borran: se desenganchan de la pregunta editándola.

## Códigos que devuelve cada rechazo

| Situación | Código |
| --- | --- |
| Falta un campo, sobra uno, o el tipo no encaja | `422` |
| El slug no cumple el formato o el nombre está vacío | `422` |
| El conjunto de la reordenación no cuadra | `422` |
| Una invariante de publicación no se cumple | `422` |
| La URL de un recurso no es absoluta | `422` |
| El nodo, la pregunta, la etiqueta o el padre no existen | `404` |
| El slug ya está en uso dentro del mismo padre | `409` |
| La transición choca con el estado actual | `409` |

El reparto es deliberado: la **forma** del cuerpo la comprueban los esquemas Zod de
`api/schemas/` y las **reglas** —formato del slug, longitudes, cadena de publicación, invariantes
de la pregunta— el dominio. Repetir aquí el patrón del slug sería tener la misma regla en dos
sitios, y el MCP acabaría teniéndola en un tercero.

Hay un `409` que no sale del dominio: si un disparador de la base salta —`SQLSTATE 45000`— porque
una escritura rompió una invariante sin pasar por el servicio, `db/repositories/shared.ts` lo
traduce a conflicto en vez de dejar escapar un `500`. Su mensaje es el mismo que el del dominio.

## Verificación

```bash
pnpm test content               # el contrato de la jerarquía, con repositorios en memoria
pnpm test questions             # el contrato de preguntas y etiquetas
pnpm test settings              # los parámetros globales y sus claves
pnpm test repositories.integration      # los adaptadores; se saltan sin MySQL delante
```

Las pruebas de `app/src/api/routes/*.test.ts` levantan el servidor real con los repositorios en
memoria: ejercen la ruta, el esquema y el manejador de errores de verdad, sin necesitar Docker.

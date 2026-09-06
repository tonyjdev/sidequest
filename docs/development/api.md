# API HTTP: la jerarquía de contenido

Materias, temas y subtemas viven bajo `/api/v1` y comparten superficie: son la misma cosa a
distinta altura (docs/especificacion.md §3). Este documento fija su contrato; el envelope de error
y el mapa de códigos están en §5 de la especificación, y las reglas que hay detrás, en
[dominio.md](dominio.md).

Las rutas son finas a propósito. Traducen JSON a una llamada de `domain/content-service.ts` y
vuelven: **ni una comprobación vive en `api/`**, para que el servidor MCP entre por la misma puerta
sin copiar ninguna.

## Rutas

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

## Códigos que devuelve cada rechazo

| Situación | Código |
| --- | --- |
| Falta un campo, sobra uno, o el tipo no encaja | `422` |
| El slug no cumple el formato o el nombre está vacío | `422` |
| El conjunto de la reordenación no cuadra | `422` |
| El nodo o su padre no existen | `404` |
| El slug ya está en uso dentro del mismo padre | `409` |
| La transición choca con el estado actual | `409` |

El reparto es deliberado: la **forma** del cuerpo la comprueba Zod en `api/schemas/content.ts` y
las **reglas** —formato del slug, longitudes, cadena de publicación— el dominio. Repetir aquí el
patrón del slug sería tener la misma regla en dos sitios, y el MCP acabaría teniéndola en un
tercero.

## Verificación

```bash
pnpm test content               # el contrato entero, con repositorios en memoria
pnpm test repositories.integration      # los adaptadores; se saltan sin MySQL delante
```

Las pruebas de `app/src/api/routes/content.test.ts` levantan el servidor real con los
repositorios en memoria: ejercen la ruta, el esquema y el manejador de errores de verdad, sin
necesitar Docker.

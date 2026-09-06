# Sidequest — especificación funcional y técnica

Estado: **confirmada**. Las diez decisiones de [decisiones.md](decisiones.md) se cerraron en la
tarea SQST-0001 el 2026-09-06 y el esquema de base de datos quedó congelado en SQST-0005; §3
describe lo que hay en `app/src/db/schema.ts` y en `app/drizzle/`.

## 1. Objetivo

Intercalar preguntas de conocimiento general en el flujo de trabajo con un agente de IA en
terminal, y registrar cada respuesta para poder medir aciertos, fallos y evolución en el tiempo.

La aplicación es local, monousuario y agnóstica del proveedor de IA. No genera preguntas: las
recibe importadas desde un archivo que produce una IA externa.

## 2. Separación de responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| Skill del agente | Cuándo intercalar una pregunta y cómo presentarla en la terminal |
| Servidor MCP | Canal entre el agente y la aplicación local |
| API HTTP | Contrato estable de contenido, selección, registro y estadísticas |
| Dominio | Selección ponderada, composición del intento y evaluación |
| Panel web | Administración de contenido y consulta de estadísticas |
| MySQL | Persistencia |

El núcleo no conoce ninguna marca de agente. La skill y el MCP son adaptadores.

## 3. Modelo de datos

La jerarquía de contenido tiene **tres niveles fijos**, no un árbol arbitrario:

```text
subjects        Matemáticas          materia
  topics          Álgebra            tema
    subtopics       Ecuaciones       subtema
```

La pregunta cuelga siempre de un subtema; el tema y la materia se derivan. Nada se borra
físicamente en ninguno de los tres niveles: se archiva.

### 3.1 `subjects`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `slug` | varchar(120) | único global |
| `name` | varchar(160) | |
| `description` | text | nullable |
| `status` | enum | `draft`, `published`, `archived` |
| `position` | int | orden manual en el panel |
| `created_at` / `updated_at` | timestamp | |

### 3.2 `topics`

Las mismas columnas, más `subject_id` (FK, restrict on delete) y `slug` único **por materia**.

### 3.3 `subtopics`

Las mismas columnas, más `topic_id` (FK, restrict on delete) y `slug` único **por tema**.

### 3.4 `questions`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `subtopic_id` | bigint FK | restrict on delete; el tema y la materia se derivan del subtema |
| `type` | enum | `single`, `multiple` |
| `statement` | text | enunciado |
| `explanation` | text | nullable, se muestra tras responder |
| `difficulty` | enum | `easy`, `medium`, `hard` |
| `status` | enum | `draft`, `published`, `archived` |
| `visible_options` | tinyint | nullable; `null` usa el valor global |
| `version` | int | lo incrementa la propia base cuando cambia el contenido |
| `content_hash` | char(64) | sha256 del enunciado normalizado, para detectar duplicados al importar |
| `created_at` / `updated_at` | timestamp | |

Índice no único `(subtopic_id, content_hash)`: la detección de duplicados es una advertencia en la
importación, no una restricción de integridad.

Solo las preguntas `published` entran en el sorteo.

`version` la sube un disparador, no la capa que escribe: cada intento guarda la versión que se
mostró y el número solo vale de algo si nadie puede dejar de subirlo. Cuentan como edición de
contenido el enunciado, la explicación, el tipo, la dificultad y `visible_options`; publicar,
archivar o mover la pregunta de subtema, no.

### 3.5 `question_options`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `question_id` | bigint FK | restrict on delete |
| `text` | text | |
| `is_correct` | boolean | |
| `position` | int | orden de autoría, no de presentación |

Invariantes: toda pregunta publicada tiene al menos dos opciones y al menos una correcta. Una
pregunta `single` tiene exactamente una correcta.

**Las impone la base de datos**, con disparadores: cruzan dos tablas, así que un `CHECK` no puede
expresarlas, y dejarlas solo en el código haría que cualquier escritura por otro camino las
saltara. Se comprueban al publicar o editar la pregunta y al insertar, modificar o borrar sus
opciones; romperlas devuelve `SQLSTATE 45000` con el motivo.

De ahí una consecuencia que alcanza a la API, al panel y a la importación: **una pregunta nunca se
crea ya publicada**, porque en ese instante todavía no puede tener opciones. El camino es siempre
borrador → opciones → publicar, dentro de una transacción.

### 3.6 `question_resources`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `question_id` | bigint FK | restrict on delete |
| `kind` | enum | `image`, `video`, `page`, `document` |
| `url` | varchar(2048) | |
| `label` | varchar(160) | nullable |
| `storage_kind` | enum | `external` en v1; deja sitio a `upload` sin migrar |
| `position` | int | orden en que se muestran los enlaces |

La terminal no renderiza recursos: muestra sus enlaces.

### 3.7 `tags` y `question_tag`

Etiquetas libres por pregunta, con relación N:M. Se usan para filtrar en el panel y como
criterio opcional de selección.

### 3.8 `sessions`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `agent` | varchar(60) | `claude`, `codex`, `kimi`, … |
| `external_ref` | varchar(190) | identificador de sesión del agente, nullable |
| `started_at` / `last_seen_at` | timestamp | |
| `asked_count` | int | preguntas servidas en la sesión |
| `paused_until` | timestamp | nullable; pausa por tiempo |
| `paused_for_questions` | int | nullable; pausa por número de preguntas restantes |

Permite estadísticas por sesión, aplicar límites de frecuencia y persistir la pausa que solicita
`sidequest_pause`.

`(agent, external_ref)` es único: `POST /sessions` abre o **reutiliza** una sesión, y sin esa
restricción dos llamadas con la misma referencia partirían los contadores en dos. MySQL admite
varias filas con `external_ref` nulo, que son las sesiones anónimas.

### 3.9 `attempts`

Registro inmutable. Es la única fuente de verdad del histórico.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `question_id` | bigint FK | nullable; el intento sobrevive a la pregunta |
| `session_id` | bigint FK | nullable |
| `question_version` | int | versión de la pregunta en el momento del intento |
| `subject_name` / `topic_name` / `subtopic_name` | varchar(160) | copiados, no referenciados |
| `question_statement` | text | copiado |
| `question_type` | enum | copiado |
| `difficulty` | enum | copiada |
| `presented_options` | json | `[{ "option_id": 12, "text": "…", "is_correct": true }]` |
| `selected_option_ids` | json | ids elegidos |
| `is_correct` | boolean | |
| `answered_at` | timestamp | |

Se guarda el enunciado y las opciones **mostradas**, no solo la referencia, para que el histórico
siga siendo interpretable si la pregunta se edita o se archiva después.

### 3.10 `settings`

Tabla clave/valor: **una fila por parámetro**, con clave, valor y tipo. Se lee y se escribe desde
el panel. Los valores iniciales viajan en la migración, no en el sembrado de desarrollo: sin ellos
la selección ponderada no tiene con qué calcular.

| Clave | Inicial | Qué gobierna |
| --- | --- | --- |
| `visible_options_default` | 4 | Opciones mostradas cuando la pregunta no lo sobrescribe |
| `weight_new_boost` | 10 | Multiplicador de la pregunta nunca respondida |
| `weight_maturity_days` | 30 | Periodo de maduración de `factor_antiguedad` |
| `weight_failure` | 1.5 | Peso del histórico de fallo |
| `weight_difficulty_easy` / `_medium` / `_hard` | 1 | Multiplicador por dificultad |
| `cooldown_hours` | 24 | Ventana de enfriamiento |
| `attempt_token_ttl_seconds` | 300 | Validez del `attempt_token` (§4.4) |
| `session_max_questions` | 20 | Frecuencia máxima por sesión |

## 4. Selección de preguntas

### 4.1 Candidatas

Una pregunta es candidata si:

- su estado es `published`,
- su subtema, su tema y su materia están `published`,
- encaja en el filtro activo (materias, temas, subtemas, dificultad, etiquetas) que envía la skill,
- puede componer al menos dos opciones (ver §4.3),
- y no ha sido **respondida** dentro de la ventana de enfriamiento.

El enfriamiento se mide sobre `attempts`. Una pregunta servida y abandonada no deja rastro y puede
volver a salir: `/quiz/next` no consume nada.

Si el filtro deja el conjunto vacío, se relaja **solo** la ventana de enfriamiento antes de
devolver "sin preguntas disponibles".

### 4.2 Peso

```text
peso = base
     × (nunca_respondida ? boost_nueva : 1)
     × factor_antiguedad
     × factor_fallo
     × factor_dificultad
```

| Factor | Cálculo | Valor por defecto |
| --- | --- | --- |
| `base` | constante | 1 |
| `boost_nueva` | multiplicador si `attempts` = 0 | 10 |
| `factor_antiguedad` | `clamp(dias_desde_ultimo_intento / periodo_maduracion, 0.2, 1)` | periodo de maduración = 30 días |
| `factor_fallo` | `1 + peso_fallo × (1 − acierto)`, con `acierto` = ratio histórico | `peso_fallo` = 1.5 |
| `factor_dificultad` | multiplicador por dificultad | 1 / 1 / 1 |

`factor_antiguedad` es una rampa lineal acotada, no un decaimiento exponencial. Para una pregunta
sin intentos, `factor_antiguedad = 1` y `factor_fallo = 1`: su ventaja viene solo de
`boost_nueva`, no de un ratio de acierto indefinido.

La selección es un muestreo aleatorio ponderado sobre el peso acumulado. Todos los parámetros
viven en `settings` y son ajustables sin desplegar.

Efecto buscado: una pregunta nunca respondida tiene probabilidad claramente superior; cuando todas
han aparecido al menos una vez, la repetición se gobierna por antigüedad y por tasa de fallo.

### 4.3 Composición del intento

Una pregunta puede tener más opciones configuradas que las mostradas. `visible_options` de la
pregunta manda; si es `null` se usa el valor global (por defecto 4).

- **Selección única**: se muestra exactamente una opción correcta más `visible_options − 1`
  distractores elegidos al azar.
- **Selección múltiple**: se muestran **todas** las opciones correctas; el recorte aleatorio se
  aplica solo a los distractores. Si las correctas superan `visible_options`, se amplía el número
  de opciones mostradas hasta caber.

Casos de borde:

- Si hay menos distractores de los pedidos, se muestran los que haya. Nunca se rellena con
  opciones inventadas ni se repite ninguna.
- El mínimo son dos opciones mostradas. Una pregunta que no llegue a dos no es candidata.
- Una `multiple` cuyas opciones disponibles son todas correctas es válida, pero el panel la marca
  como pregunta trivial.

Nunca se presenta un intento sin al menos una respuesta correcta. El orden de presentación es
aleatorio y se registra tal cual en `attempts.presented_options`.

### 4.4 `attempt_token`

`/quiz/next` devuelve un `attempt_token` que lleva firmada la composición del intento —pregunta,
versión, opciones mostradas y su orden— con HMAC-SHA256. El secreto vive en la variable de entorno
`SIDEQUEST_ATTEMPT_SECRET` y su TTL en `settings`.

El token es **el mismo contrato en la API y en el MCP**: `/quiz/answer` lo exige, igual que
`sidequest_answer_question`. Así la respuesta se evalúa siempre contra las opciones que realmente
se mostraron, y el MCP no necesita regla propia. Nada se persiste hasta que se responde.

## 5. API HTTP

Prefijo `/api/v1`. JSON en ambos sentidos. Toda respuesta que no sea 2xx sale con el mismo
envelope, `{ "error": { "code", "message", "details" } }`, y `details` es `null` cuando no hay nada
que añadir. El mapa de códigos es cerrado: ampliarlo es una decisión de contrato.

| Código | Estado | Cuándo |
| --- | --- | --- |
| `validation_failed` | 422 | El cuerpo, la ruta o la consulta no pasan su esquema. `details` lleva una entrada `{ field, message }` por campo |
| `not_found` | 404 | La ruta o el recurso no existen |
| `conflict` | 409 | Choca con una invariante: un `slug` duplicado, un estado incompatible |
| `internal_error` | 500 | Fallo no previsto. El mensaje interno queda en el registro, nunca en la respuesta |

La sonda de salud es la excepción: devuelve su propio documento con `200` y con `503`, porque
quien monitoriza necesita ver qué comprobación falló.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Estado del proceso, versión y conectividad con la base de datos. `200` con MySQL disponible, `503` sin ella |
| GET/POST/PATCH | `/subjects`, `/subjects/{id}` | Materias |
| GET/POST/PATCH | `/topics`, `/topics/{id}` | Temas |
| GET/POST/PATCH | `/subtopics`, `/subtopics/{id}` | Subtemas |
| GET/POST/PATCH | `/questions`, `/questions/{id}` | Preguntas, opciones y recursos |
| GET/POST/PATCH | `/tags`, `/tags/{id}` | Etiquetas |
| POST | `/subjects/{id}/archive`, `/topics/{id}/archive`, `/subtopics/{id}/archive`, `/questions/{id}/archive` | Archivado, nunca borrado físico |
| GET/PATCH | `/settings` | Parámetros globales: opciones visibles, ponderación, enfriamiento, frecuencia |
| POST | `/quiz/next` | Devuelve un intento compuesto y su `attempt_token` |
| POST | `/quiz/answer` | Recibe `attempt_token` y las opciones elegidas; registra y devuelve corrección y explicación |
| POST | `/sessions` | Abre o reutiliza una sesión de trabajo |
| GET | `/stats/overview` | Totales, aciertos y fallos |
| GET | `/stats/timeline` | Evolución temporal |
| GET | `/stats/by-content` | Resultados por materia, tema y subtema, con el nivel como parámetro |
| GET | `/stats/by-difficulty` | Resultados por dificultad |
| GET | `/stats/coverage` | Pendientes y nunca respondidas |
| GET | `/import/schema` | JSON Schema del formato de importación |
| POST | `/import/preview` | Valida un lote y devuelve `preview_id`, válidos, inválidos y duplicados. No escribe |
| POST | `/import/commit` | Recibe el `preview_id` y los elementos aceptados, y los persiste |

`/quiz/next` no marca nada como consumido: el intento se registra al responder. Si la sesión
abandona la pregunta, no queda rastro.

## 6. Servidor MCP

Transporte principal: HTTP streamable en `/mcp` del mismo contenedor. Un puente stdio queda
como tarea posterior para agentes que no hablen HTTP.

Registro en cada agente:

| Agente | Configuración |
| --- | --- |
| Claude Code | `claude mcp add --transport http sidequest http://localhost:PORT/mcp` |
| Codex | El bloque equivalente en su archivo de configuración |
| Otros | Entrada genérica `mcpServers` apuntando a la misma URL |

Herramientas expuestas:

| Herramienta | Entrada | Salida |
| --- | --- | --- |
| `sidequest_next_question` | filtros opcionales de materia, tema, subtema, dificultad y etiquetas | enunciado, opciones mostradas, recursos y `attempt_token` |
| `sidequest_answer_question` | `attempt_token`, opciones elegidas | correcto o incorrecto, respuestas correctas y explicación |
| `sidequest_status` | — | si está activo, cuántas preguntas van en la sesión y qué filtros hay |
| `sidequest_pause` | duración o número de preguntas | pausa temporal, persistida en `sessions` |

El MCP es un adaptador: no tiene ninguna regla propia. El `attempt_token` es el mismo de §4.4.

## 7. Skill del agente

La skill decide **cuándo**, la aplicación decide **qué**. Configuración mínima:

- materias, temas y subtemas activos,
- frecuencia de intercalación (cada N interacciones, o cada N minutos),
- dificultad,
- activación y pausa temporal,
- momentos en los que no se debe interrumpir: comandos destructivos, migraciones, despliegues,
  operaciones de git que reescriben historia, y cualquier acción marcada como crítica.

La regla de no interrupción es dura: ante la duda, no se pregunta.

## 8. Panel web

### 8.1 Dashboard

Total respondidas, porcentaje de aciertos y fallos, evolución temporal, resultados por materia,
tema y subtema, resultados por dificultad, y preguntas pendientes o nunca respondidas.

### 8.2 Gestión de contenido

Crear, editar y archivar materias, temas y subtemas; crear y editar preguntas con su tipo, sus
opciones, sus correctas, su explicación, su dificultad, sus etiquetas y sus recursos enlazados; y
definir cuántas opciones se muestran por pregunta. Los parámetros globales de §3.10 se editan
desde el propio panel.

### 8.3 Importación

1. El panel ofrece la plantilla y el JSON Schema.
2. El usuario se lo entrega a una IA externa.
3. La IA devuelve un lote estructurado.
4. El usuario sube el archivo.
5. La aplicación valida contra el schema y contra las invariantes de dominio.
6. `preview` devuelve un `preview_id` y la clasificación en válidos, inválidos y duplicados, con
   el motivo de cada rechazo. No escribe nada.
7. El usuario elige qué importar.
8. `commit` recibe el `preview_id` y lo aceptado, y lo guarda como borrador o publicado según la
   acción elegida. El `preview_id` caduca.

La detección de duplicados usa `content_hash` dentro del mismo subtema.

## 9. Requisitos no funcionales

- Instalación reproducible con Docker Compose y datos persistentes entre reinicios.
- Importación segura y reversible: borradores y previsualización antes de escribir.
- Validación clara, con errores comprensibles y accionables.
- Sin dependencia obligatoria de servicios cloud ni claves de IA en la aplicación.
- Interfaz preparada para un único usuario local, con el esquema listo para multiusuario más
  adelante (las tablas de contenido no asumen propietario único).
- Copia de seguridad y restauración del volumen MySQL documentadas y ejecutables con un comando:
  `scripts/backup.sh` vuelca con `mysqldump` a `./backups/` con rotación, `scripts/restore.sh`
  restaura. Sin cron por defecto.

## 10. Orden de construcción

Las tareas del proyecto `SQST` están numeradas para ejecutarse en secuencia. Las decisiones de
[decisiones.md](decisiones.md) están cerradas y el esquema quedó congelado en SQST-0005, así que
el formato JSON de importación (SQST-0018) ya se puede fijar sobre él.

# Sidequest — especificación funcional y técnica

Estado: propuesta. Las decisiones marcadas como abiertas en
[decisiones.md](decisiones.md) deben confirmarse antes de congelar el esquema
de base de datos (tarea SQST-0005).

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

Nomenclatura acordada: **tema** (`topics`) y **subtema** (`subtopics`). Jerarquía de dos
niveles, no un árbol arbitrario.

### 3.1 `topics`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `slug` | varchar(120) | único |
| `name` | varchar(160) | |
| `description` | text | nullable |
| `status` | enum | `draft`, `published`, `archived` |
| `position` | int | orden manual en el panel |
| `created_at` / `updated_at` | timestamp | |

### 3.2 `subtopics`

Igual que `topics`, más `topic_id` (FK, restrict on delete) y `slug` único **por tema**.

### 3.3 `questions`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `subtopic_id` | bigint FK | el tema se deriva del subtema |
| `type` | enum | `single`, `multiple` |
| `statement` | text | enunciado |
| `explanation` | text | nullable, se muestra tras responder |
| `difficulty` | enum | `easy`, `medium`, `hard` |
| `status` | enum | `draft`, `published`, `archived` |
| `visible_options` | tinyint | nullable; `null` usa el valor global |
| `version` | int | se incrementa en cada edición del contenido |
| `content_hash` | char(64) | sha256 del enunciado normalizado, para detectar duplicados al importar |
| `created_at` / `updated_at` | timestamp | |

Solo las preguntas `published` entran en el sorteo.

### 3.4 `question_options`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `question_id` | bigint FK | cascade on delete |
| `text` | text | |
| `is_correct` | boolean | |
| `position` | int | orden de autoría, no de presentación |

Invariantes: toda pregunta publicada tiene al menos dos opciones y al menos una correcta. Una
pregunta `single` tiene exactamente una correcta.

### 3.5 `question_resources`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `question_id` | bigint FK | cascade on delete |
| `kind` | enum | `image`, `video`, `page`, `document` |
| `url` | varchar(2048) | |
| `label` | varchar(160) | nullable |
| `storage_kind` | enum | `external` en v1; deja sitio a `upload` sin migrar |

La terminal no renderiza recursos: muestra sus enlaces.

### 3.6 `tags` y `question_tag`

Etiquetas libres por pregunta, con relación N:M. Se usan para filtrar en el panel y como
criterio opcional de selección.

### 3.7 `sessions`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `agent` | varchar(60) | `claude`, `codex`, `kimi`, … |
| `external_ref` | varchar(190) | identificador de sesión del agente, nullable |
| `started_at` / `last_seen_at` | timestamp | |
| `asked_count` | int | preguntas servidas en la sesión |

Permite estadísticas por sesión y aplicar límites de frecuencia.

### 3.8 `attempts`

Registro inmutable. Es la única fuente de verdad del histórico.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint PK | |
| `question_id` | bigint FK | nullable on delete: el intento sobrevive |
| `session_id` | bigint FK | nullable |
| `question_version` | int | versión de la pregunta en el momento del intento |
| `topic_name` / `subtopic_name` | varchar(160) | copiados, no referenciados |
| `question_statement` | text | copiado |
| `question_type` | enum | copiado |
| `difficulty` | enum | copiada |
| `presented_options` | json | `[{ "option_id": 12, "text": "…", "is_correct": true }]` |
| `selected_option_ids` | json | ids elegidos |
| `is_correct` | boolean | |
| `answered_at` | timestamp | |

Se guarda el enunciado y las opciones **mostradas**, no solo la referencia, para que el histórico
siga siendo interpretable si la pregunta se edita o se archiva después.

### 3.9 `settings`

Tabla clave/valor con un único registro lógico. Contiene la configuración global: número de
opciones visibles por defecto, factores de ponderación, ventana de enfriamiento y frecuencia
máxima por sesión.

## 4. Selección de preguntas

### 4.1 Candidatas

Una pregunta es candidata si:

- su estado es `published`,
- su subtema y su tema están `published`,
- encaja en el filtro activo (temas, subtemas, dificultad, etiquetas) que envía la skill,
- y no ha sido mostrada dentro de la ventana de enfriamiento.

Si el filtro deja el conjunto vacío, se relaja **solo** la ventana de enfriamiento antes de
devolver "sin preguntas disponibles".

### 4.2 Peso

```text
peso = base
     × (nunca_mostrada ? boost_nueva : 1)
     × factor_antiguedad
     × factor_fallo
     × factor_dificultad
```

| Factor | Cálculo | Valor por defecto |
| --- | --- | --- |
| `base` | constante | 1 |
| `boost_nueva` | multiplicador si `attempts` = 0 | 10 |
| `factor_antiguedad` | `min(1, dias_desde_ultimo_intento / semivida)` acotado a `[0.2, 1]` | semivida = 30 días |
| `factor_fallo` | `1 + peso_fallo × (1 − acierto)` con `acierto` = ratio histórico | `peso_fallo` = 1.5 |
| `factor_dificultad` | multiplicador por dificultad | 1 / 1 / 1 |

La selección es un muestreo aleatorio ponderado sobre el peso acumulado. Todos los parámetros
viven en `settings` y son ajustables sin desplegar.

Efecto buscado: una pregunta nunca mostrada tiene probabilidad claramente superior; cuando todas
han aparecido al menos una vez, la repetición se gobierna por antigüedad y por tasa de fallo.

### 4.3 Composición del intento

Una pregunta puede tener más opciones configuradas que las mostradas. `visible_options` de la
pregunta manda; si es `null` se usa el valor global (por defecto 4).

- **Selección única**: se muestra exactamente una opción correcta más `visible_options − 1`
  distractores elegidos al azar.
- **Selección múltiple**: se muestran **todas** las opciones correctas; el recorte aleatorio se
  aplica solo a los distractores. Si las correctas superan `visible_options`, se amplía el número
  de opciones mostradas hasta caber.

Nunca se presenta un intento sin al menos una respuesta correcta. El orden de presentación es
aleatorio y se registra tal cual en `attempts.presented_options`.

## 5. API HTTP

Prefijo `/api/v1`. JSON en ambos sentidos. Errores con `{ "error": { "code", "message", "details" } }`.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Sonda de vida y versión |
| GET/POST/PATCH | `/topics`, `/topics/{id}` | Temas |
| GET/POST/PATCH | `/subtopics`, `/subtopics/{id}` | Subtemas |
| GET/POST/PATCH | `/questions`, `/questions/{id}` | Preguntas, opciones y recursos |
| POST | `/questions/{id}/archive` | Archivado, nunca borrado físico |
| POST | `/quiz/next` | Devuelve un intento compuesto según filtros |
| POST | `/quiz/answer` | Registra la respuesta y devuelve corrección y explicación |
| POST | `/sessions` | Abre o reutiliza una sesión de trabajo |
| GET | `/stats/overview` | Totales, aciertos y fallos |
| GET | `/stats/timeline` | Evolución temporal |
| GET | `/stats/by-topic` | Resultados por tema y subtema |
| GET | `/stats/by-difficulty` | Resultados por dificultad |
| GET | `/stats/coverage` | Pendientes y nunca mostradas |
| GET | `/import/schema` | JSON Schema del formato de importación |
| POST | `/import/preview` | Valida un lote y devuelve válidos, inválidos y duplicados |
| POST | `/import/commit` | Persiste los elementos aceptados |

`/quiz/next` no marca nada como consumido: el intento se registra al responder. Si la sesión
abandona la pregunta, no queda rastro.

## 6. Servidor MCP

Transporte principal: HTTP streamable en `/mcp` del mismo contenedor. Un puente stdio queda
como tarea posterior para agentes que no hablen HTTP.

Herramientas expuestas:

| Herramienta | Entrada | Salida |
| --- | --- | --- |
| `sidequest_next_question` | filtros opcionales de tema, subtema, dificultad y etiquetas | enunciado, opciones mostradas, recursos y `attempt_token` |
| `sidequest_answer_question` | `attempt_token`, opciones elegidas | correcto o incorrecto, respuestas correctas y explicación |
| `sidequest_status` | — | si está activo, cuántas preguntas van en la sesión y qué filtros hay |
| `sidequest_pause` | duración o número de preguntas | pausa temporal |

El `attempt_token` es efímero y lleva firmada la composición del intento, para que la respuesta
se evalúe contra las opciones que realmente se mostraron.

## 7. Skill del agente

La skill decide **cuándo**, la aplicación decide **qué**. Configuración mínima:

- temas y subtemas activos,
- frecuencia de intercalación (cada N interacciones, o cada N minutos),
- dificultad,
- activación y pausa temporal,
- momentos en los que no se debe interrumpir: comandos destructivos, migraciones, despliegues,
  operaciones de git que reescriben historia, y cualquier acción marcada como crítica.

La regla de no interrupción es dura: ante la duda, no se pregunta.

## 8. Panel web

### 8.1 Dashboard

Total respondidas, porcentaje de aciertos y fallos, evolución temporal, resultados por tema y
subtema, resultados por dificultad, y preguntas pendientes o nunca mostradas.

### 8.2 Gestión de contenido

Crear, editar y archivar temas y subtemas; crear y editar preguntas con su tipo, sus opciones,
sus correctas, su explicación, su dificultad, sus etiquetas y sus recursos enlazados; y definir
cuántas opciones se muestran por pregunta.

### 8.3 Importación

1. El panel ofrece la plantilla y el JSON Schema.
2. El usuario se lo entrega a una IA externa.
3. La IA devuelve un lote estructurado.
4. El usuario sube el archivo.
5. La aplicación valida contra el schema y contra las invariantes de dominio.
6. Se previsualizan válidos, inválidos y duplicados, con el motivo de cada rechazo.
7. El usuario elige qué importar.
8. Lo aceptado se guarda como borrador o publicado, según la acción elegida.

La detección de duplicados usa `content_hash` dentro del mismo subtema.

## 9. Requisitos no funcionales

- Instalación reproducible con Docker Compose y datos persistentes entre reinicios.
- Importación segura y reversible: borradores y previsualización antes de escribir.
- Validación clara, con errores comprensibles y accionables.
- Sin dependencia obligatoria de servicios cloud ni claves de IA en la aplicación.
- Interfaz preparada para un único usuario local, con el esquema listo para multiusuario más
  adelante (las tablas de contenido no asumen propietario único).
- Copia de seguridad y restauración del volumen MySQL documentadas y ejecutables con un comando.

## 10. Orden de construcción

Las tareas del proyecto `SQST` están numeradas para ejecutarse en secuencia. El esquema de datos
(SQST-0005) no debe congelarse hasta cerrar las decisiones de [decisiones.md](decisiones.md), y el
formato JSON de importación (SQST-0018) no debe fijarse hasta que el esquema esté estable.

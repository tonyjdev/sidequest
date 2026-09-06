# Base de datos: esquema, migraciones y sembrado

El esquema vive en `app/src/db/schema.ts`, escrito con Drizzle, y es la traducción directa de
[especificacion.md §3](../especificacion.md). Las migraciones se generan a partir de él y se
versionan en `app/drizzle/`.

## Comandos

```bash
pnpm db:generate    # genera una migración con la diferencia entre el esquema y la anterior
pnpm db:migrate     # aplica las pendientes
pnpm db:rollback    # revierte la última aplicada
pnpm db:seed        # siembra el contenido de ejemplo de desarrollo
pnpm db:studio      # inspección del esquema en el navegador
```

Todos se ejecutan **en la máquina anfitriona**, no dentro del contenedor, contra el puerto que
publica Compose. `DATABASE_URL` no sirve para eso —apunta al servicio `mysql`, un nombre que solo
resuelve dentro de la red de Compose—, así que la URL se construye con `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_DATABASE` y `MYSQL_HOST_PORT` contra `127.0.0.1`. Si necesitas otra cosa
—migrar desde un contenedor, desde un servidor de integración—, `DATABASE_URL_HOST` la sustituye
entera.

La aplicación **no migra al arrancar**: levantar el contenedor no cambia el esquema.

## Modelo

Tres niveles fijos de contenido, y la pregunta colgando siempre del último:

```text
subjects        Matemáticas          materia
  topics          Álgebra            tema
    subtopics       Ecuaciones       subtema
      questions       ¿Cuál es…?     pregunta
```

| Tabla | Para qué |
| --- | --- |
| `subjects`, `topics`, `subtopics` | Jerarquía de contenido. `slug` único dentro de su padre |
| `questions` | Enunciado, tipo, dificultad, estado, `version` y `content_hash` |
| `question_options` | Opciones configuradas, con `is_correct` y su orden de autoría |
| `question_resources` | Enlaces asociados. `storage_kind` nace en `external` y admite `upload` sin migrar |
| `tags`, `question_tag` | Etiquetas libres, N:M |
| `sessions` | Sesión de trabajo de un agente: contadores y pausa |
| `attempts` | Histórico inmutable de respuestas |
| `settings` | Parámetros ajustables, una fila por parámetro |

### Nada se borra

Todas las claves ajenas de contenido son `restrict`: borrar una materia con temas, un tema con
subtemas o un subtema con preguntas falla. La retirada se hace con `status = 'archived'`, porque
las estadísticas dependen de que el histórico siga completo.

Las dos excepciones son `attempts.question_id` y `attempts.session_id`, que son `set null`: el
intento sobrevive a lo que referencia. Que las preguntas no se borren es política de la
aplicación, no de esa clave ajena.

### Los intentos son inmutables

`attempts` copia el enunciado, los tres nombres de la ruta de contenido, el tipo, la dificultad,
la versión de la pregunta y las opciones que se mostraron. Nunca reconstruyas un intento leyendo
la pregunta actual: si se editó, la lectura sería falsa.

### Índices

| Índice | Consulta que sirve |
| --- | --- |
| `questions_status_subtopic_idx` | Candidatas al sorteo: publicadas de unos subtemas |
| `questions_subtopic_hash_idx` | Duplicados al importar, dentro del subtema. No único: es una advertencia |
| `attempts_question_answered_idx` | Historial de una pregunta y ventana de enfriamiento |
| `attempts_answered_at_idx` | Evolución temporal |
| `attempts_content_idx` | Agregados por materia, tema y subtema |
| `attempts_difficulty_idx` | Agregados por dificultad |
| `sessions_agent_ref_unq` | Reutilizar la sesión de un agente en vez de partir sus contadores |

## Lo que impone la base

### `version` sube sola

Cada intento guarda la versión de la pregunta que se mostró, y ese número solo vale de algo si
nadie puede dejar de subirlo. Por eso `questions.version` la incrementa un disparador cuando
cambia el contenido —enunciado, explicación, tipo, dificultad u opciones visibles— y no la capa
que escribe. Publicar, archivar o mover la pregunta de subtema no son ediciones de contenido y no
la tocan. La versión que mande quien escribe se ignora: el resultado es siempre la anterior más
uno.

### Invariantes de publicación

Las de [especificacion.md §3.5](../especificacion.md) cruzan `questions` y `question_options`, así
que un `CHECK` no puede expresarlas. Las impone la migración `0001` con un procedimiento y cinco
disparadores:

- una pregunta publicada tiene al menos dos opciones,
- una pregunta publicada tiene al menos una opción correcta,
- una pregunta `single` publicada tiene exactamente una correcta.

Se comprueban en los dos sentidos por los que se pueden romper: publicar o editar la pregunta, e
insertar, modificar o borrar sus opciones. Un intento de romperlas devuelve `SQLSTATE 45000` con
el motivo en castellano.

**Consecuencia: una pregunta no se puede insertar ya publicada**, porque en ese instante todavía
no puede tener opciones. El camino es siempre borrador → opciones → publicar, dentro de una
transacción, que es también el que sigue la importación.

```sql
-- ER_SIGNAL_EXCEPTION: Una pregunta no se crea publicada: créala en borrador…
INSERT INTO questions (…, status) VALUES (…, 'published');
```

## Migraciones

```text
app/drizzle/
├── 0000_esquema_inicial.sql              tablas, generada por drizzle-kit
├── 0001_invariantes_de_la_pregunta.sql   versión, procedimiento y disparadores, a mano
├── 0002_parametros_por_defecto.sql       valores iniciales de `settings`, a mano
├── down/                                 la reversión de cada una, a mano
└── meta/                                 journal e instantáneas de drizzle-kit
```

`pnpm db:generate` solo sabe generar cambios de tablas. Lo que no es DDL de tabla —disparadores,
datos iniciales— se añade con `pnpm db:generate --custom --name <nombre>`, que prepara el archivo
vacío y lo apunta en el journal, y se escribe a mano.

**Cada migración lleva su reversión** en `drizzle/down/<tag>.down.sql`. drizzle-kit no la genera:
si falta, `pnpm db:rollback` falla nombrando el archivo en lugar de dejar la migración
irreversible en silencio. `pnpm db:rollback` aplica la del último registro de
`__drizzle_migrations` y borra ese registro, de modo que `pnpm db:migrate` la vuelve a aplicar.

Los archivos de `app/drizzle/` están fuera de Prettier: su formato lo decide drizzle-kit.

### Por qué MySQL necesita `--log-bin-trust-function-creators=1`

Crear un disparador exige el privilegio `SUPER` mientras el registro binario esté activo y esa
variable en `OFF`, que es como viene MySQL 8.4. El servicio `mysql` de `compose.yaml` la pone a
`1`: aquí no hay réplicas ni recuperación a un punto en el tiempo —la copia de seguridad es un
volcado lógico—, así que es el permiso mínimo que hace aplicable la migración con el usuario de la
aplicación.

## Sembrado

`pnpm db:seed` escribe el contenido de ejemplo de `app/src/db/seed-data.ts`: una materia, un tema,
dos subtemas y seis preguntas —tres de selección única y tres múltiples— con sus opciones, sus
explicaciones, sus etiquetas y algún recurso enlazado, todo publicado.

Es idempotente por lo bruto: si la materia ya está, no escribe nada y lo dice. No toca `settings`,
cuyos valores iniciales viajan en la migración `0002` porque sin ellos la selección ponderada no
tiene con qué calcular.

Una instalación real empieza vacía y se llena importando; el sembrado es solo para desarrollar.

## Pruebas

`app/src/db/schema.integration.test.ts` comprueba las invariantes contra MySQL de verdad: los
disparadores, las claves ajenas, la unicidad de los slugs, la supervivencia del intento y la
reversión completa de las tres migraciones.

Crea y borra su propia base, `sidequest_test`, con el usuario `root` —de ahí `MYSQL_ROOT_PASSWORD`
o el sustituto `TEST_DATABASE_URL`—, así que **nunca toca la base de desarrollo**. Sin MySQL a la
vista se salta entera avisando por consola, para que `pnpm check` siga siendo ejecutable sin
Docker.

```bash
docker compose up -d mysql
pnpm test -- schema.integration
```

## Si algo falla

| Síntoma | Causa habitual |
| --- | --- |
| `ECONNREFUSED 127.0.0.1:3306` en `db:migrate` | MySQL no está levantado, o `MYSQL_HOST_PORT` publica otro puerto |
| `ER_BINLOG_CREATE_ROUTINE_NEED_SUPER` | El servicio `mysql` se levantó sin `--log-bin-trust-function-creators=1`. `docker compose up -d mysql` |
| `Una pregunta publicada necesita…` | Es la invariante haciendo su trabajo: publica después de insertar las opciones |
| `La migración X no tiene reversión` | Falta su `drizzle/down/X.down.sql` |
| Migración a medias tras un error | MySQL confirma cada DDL por su cuenta: revisa `__drizzle_migrations`, deshaz a mano lo aplicado y vuelve a migrar |

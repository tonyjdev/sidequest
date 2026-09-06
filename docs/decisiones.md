# Decisiones de dominio

El documento de arranque dejó diez decisiones abiertas que condicionan el esquema de base de
datos. Aquí está la resolución de cada una, con su motivo y su alternativa descartada.

**Estado: confirmadas el 2026-09-06** en la tarea SQST-0001. Ocho se confirmaron tal como estaban
propuestas; la 1 se corrigió —la jerarquía pasa de dos niveles a tres— y la 3, la 7, la 8 y la 10
se ampliaron para cerrar huecos que la propuesta dejaba abiertos. SQST-0005 ya puede congelar el
esquema.

Cambiar una decisión a partir de aquí afecta a las tareas que la usan; anótalo como comentario en
SQST-0001 y propágalo a este documento.

---

## 1. Nombre de la jerarquía de contenido — **corregida**

**Decisión:** tres niveles, `subjects` → `topics` → `subtopics` (materia → tema → subtema).
Jerarquía fija, no un árbol arbitrario. La pregunta cuelga siempre de un subtema; el tema y la
materia se derivan.

```text
subjects        Matemáticas
  topics          Álgebra
    subtopics       Ecuaciones
                    Polinomios
```

Unicidad de slugs: `subjects.slug` global, `topics.slug` por materia, `subtopics.slug` por tema.

**Motivo:** la propuesta original tenía dos niveles y se quedaba corta: «matemáticas» y «álgebra»
no son el mismo tipo de cosa, y meterlas en el mismo nivel obligaba a elegir entre perder el
agrupamiento general o inflar la lista de temas. `subject` es el vocabulario estándar de
cuestionarios y educación, no colisiona con la capa `domain/` del código y conserva
`topics`/`subtopics` tal como ya estaban escritos: el cambio es aditivo.

**Descartado:** dos niveles `topic`/`subtopic`, la propuesta original; `category`/`subcategory`;
un árbol de profundidad libre con `parent_id`; y `knowledge_base` como nombre del nivel superior,
porque en el sector ya significa repositorio documental o corpus de RAG.

**Consecuencias:** `attempts` copia tres nombres en vez de dos; las estadísticas por contenido se
desdoblan por nivel; una pregunta solo es candidata si sus **tres** antecesores están
`published`; y el lote de importación referencia el subtema por la ruta de tres slugs.

---

## 2. Recursos: solo URL externas o también archivos subidos

**Decisión:** en la primera versión, solo URL externas. La tabla incluye ya una columna
`storage_kind` con valor `external`, de modo que admitir subidas más adelante no obligue a migrar.

**Motivo:** la terminal solo muestra enlaces, así que subir archivos no aporta nada al caso de uso
principal y sí añade volumen, backup y servido estático.

**Descartado:** subida de archivos en v1.

---

## 3. Reglas de ponderación y repetición — **ampliada**

**Decisión:** peso multiplicativo con cuatro factores —novedad, antigüedad, tasa de fallo y
dificultad— sobre un muestreo aleatorio ponderado, más una ventana de enfriamiento que excluye lo
recién visto. Todos los parámetros viven en `settings` y se ajustan sin desplegar.

Valores iniciales: `boost_nueva` = 10, periodo de maduración = 30 días, `peso_fallo` = 1.5,
enfriamiento = 24 horas, factores de dificultad = 1.

Se corrige la formulación, que tenía tres huecos:

- `factor_antiguedad = clamp(dias_desde_ultimo_intento / periodo_maduracion, 0.2, 1)`. Es una
  rampa lineal acotada, no un decaimiento exponencial: el nombre «semivida» de la propuesta era
  engañoso y el `min(1, …)` era redundante con el acotado superior.
- Para una pregunta sin intentos, `factor_antiguedad = 1` y `factor_fallo = 1`. Su ventaja viene
  solo de `boost_nueva`, no de un ratio de acierto indefinido.
- La ventana de enfriamiento se mide sobre `attempts`, es decir, sobre preguntas **respondidas**.
  Una pregunta servida y abandonada no deja rastro y puede volver a salir, que es el
  comportamiento buscado: `/quiz/next` no consume nada.

**Motivo:** cumple el requisito explícito («una pregunta nunca realizada debe tener una
probabilidad claramente superior») y deja la política afinable sin tocar código.

**Descartado:** cola determinista de repetición espaciada tipo SM-2. Es más potente, pero exige
un modelo de memoria por pregunta y el brief pide algo más simple. También se descartó el
decaimiento exponencial real (`1 − 2^(−dias/semivida)`): más fiel al efecto de espaciado, menos
intuitivo de ajustar a mano desde el panel.

---

## 4. Sesiones de trabajo diferenciadas

**Decisión:** sí. Tabla `sessions` con el agente, una referencia externa opcional a la sesión del
agente y contadores. `attempts.session_id` es opcional.

**Motivo:** sin sesión no se puede implementar «frecuencia de intercalación» ni limitar cuántas
preguntas se lanzan en una jornada, que es un requisito de la skill. Además habilita
estadísticas por sesión sin coste adicional, y da dónde persistir la pausa de
`sidequest_pause`, que en la propuesta no tenía sitio.

**Descartado:** registrar intentos sueltos sin agrupar.

---

## 5. Edición de preguntas publicadas

**Decisión:** edición directa, sin versionado formal de filas. La pregunta lleva un contador
`version` que se incrementa al editar el contenido, y cada intento guarda una copia inmutable del
enunciado, de las opciones mostradas y de la versión.

**Motivo:** el brief ya exige guardar las opciones mostradas en el intento. Con esa copia, el
histórico es interpretable aunque la pregunta cambie o se archive, y el contador de versión
permite detectar que cambió. Versionar filas duplicaría el contenido sin resolver nada nuevo.

**Descartado:** tabla `question_versions` con copia por edición.

---

## 6. Estados del contenido

**Decisión:** `draft`, `published`, `archived`, aplicados por igual a materias, temas, subtemas y
preguntas. Solo entra en el sorteo lo `published` cuyos tres antecesores están también
`published`. Nada se borra físicamente.

**Motivo:** cubre la importación como borrador, la publicación explícita y la retirada sin
romper el histórico. Tres estados son suficientes; añadir más complica la UI sin uso claro.

**Descartado:** estados adicionales tipo `review` o `deprecated`, y prescindir de `draft`.

---

## 7. Número de opciones visibles — **ampliada**

**Decisión:** valor global en `settings` (por defecto 4) y campo `visible_options` por pregunta
que lo sobrescribe cuando no es nulo.

Reglas de composición:

- **Única:** una correcta al azar más `visible_options − 1` distractores al azar.
- **Múltiple:** todas las correctas, y el recorte aleatorio se aplica solo a los distractores. Si
  las correctas no caben, se amplía el número de opciones mostradas hasta que quepan.

Se cierran los casos de borde que la propuesta no cubría:

- Si hay menos distractores de los pedidos, se muestran los que haya. Nunca se rellena con
  opciones inventadas ni se repite ninguna.
- El mínimo absoluto son dos opciones mostradas. Una pregunta que no pueda llegar a dos no es
  candidata.
- Una `multiple` en la que todas las opciones disponibles son correctas es válida, pero el panel
  la marca como pregunta trivial.

**Motivo:** en selección múltiple, mostrar solo una parte de las correctas convierte una respuesta
correcta en incorrecta según el sorteo, lo que hace el histórico incomparable. Mostrarlas todas
mantiene la pregunta bien definida en cada intento.

**Descartado:** recortar también las correctas y evaluar contra el subconjunto mostrado; y
prescindir de `visible_options` por pregunta, que el brief pide explícitamente.

---

## 8. Transporte y configuración del servidor MCP — **ampliada**

**Decisión:** HTTP streamable en `/mcp`, en el mismo contenedor que la API. Un puente stdio queda
como tarea posterior, solo si algún agente objetivo no admite HTTP.

La configuración en cada agente —la mitad de esta decisión que la propuesta dejaba sin cerrar— se
documenta en SQST-0020:

- **Claude Code:** `claude mcp add --transport http sidequest http://localhost:PORT/mcp`.
- **Codex:** el bloque equivalente en su archivo de configuración.
- **Resto:** entrada genérica `mcpServers` apuntando a la misma URL.

**Motivo:** con la aplicación ya viviendo en Docker, HTTP es el transporte que no obliga a que el
agente entre en el contenedor. Es además lo que admiten hoy los principales agentes.

**Descartado:** stdio como transporte principal mediante `docker compose exec`, y mantener los dos
transportes desde v1.

---

## 9. Copias de seguridad de MySQL

**Decisión:** script `scripts/backup.sh` que hace `mysqldump` a `./backups/` con rotación por
número de copias, más `scripts/restore.sh` y el procedimiento de restauración documentado. Sin
cron por defecto.

**Motivo:** un volcado lógico es portable entre versiones de MySQL y basta para una instalación
local monousuario. Programarlo es decisión del usuario, no de la aplicación.

**Descartado:** copia del volumen en frío, que obliga a parar el servicio y solo restaura en la
misma versión de MySQL; y backup automático activado por defecto.

---

## 10. Formato de importación y JSON Schema — **ampliada**

**Decisión:** se cierra después del esquema de base de datos, en la tarea SQST-0018. Forma
prevista: un único objeto con `version`, `subjects` —anidando sus temas y subtemas— y `questions`,
con cada pregunta referenciando su subtema por la ruta de tres slugs `materia/tema/subtema`. El
JSON Schema se publica en `/import/schema` y se descarga desde el panel.

Se cierra el hueco entre las dos fases: `preview` no escribe nada y devuelve un `preview_id`
efímero junto a la clasificación en válidos, inválidos y duplicados; `commit` reenvía ese
`preview_id` con los elementos aceptados. El `preview_id` caduca.

**Motivo:** es la instrucción explícita del documento de arranque: no fijar el JSON antes de
cerrar el esquema.

**Descartado:** CSV y formatos por lotes múltiples; fijar el schema en esta tarea; y que `commit`
reenvíe el lote entero, que obliga a transferirlo y revalidarlo dos veces.

---

## Correcciones aplicadas a la especificación

La revisión de `especificacion.md` encontró once puntos que estaban mal, incompletos o en
contradicción. Los resueltos por las decisiones de arriba son la fórmula de ponderación (3), los
casos de borde de la composición (7), el sitio donde persistir la pausa (4), la configuración por
agente (8) y el enlace entre `preview` y `commit` (10). Los seis restantes se corrigieron
directamente en el documento:

| Punto | Estaba | Queda |
| --- | --- | --- |
| `attempt_token` | Solo en §6; `/quiz/answer` de la API no lo mencionaba | Contrato único: `/quiz/next` lo emite firmado con HMAC-SHA256, `/quiz/answer` lo exige. Secreto en `SIDEQUEST_ATTEMPT_SECRET`, TTL en `settings` |
| API | Sin `/settings` ni `/tags`, pese a que el modelo los tiene y los parámetros son «ajustables sin desplegar» | Añadidos `GET`/`PATCH /settings` y el CRUD de `/tags` |
| `on delete` | `cascade` en opciones y recursos, en contra de «nada se borra» | `restrict`, coherente con el archivado |
| `settings` | «Tabla clave/valor con un único registro lógico» | Clave/valor, una fila por parámetro |
| `content_hash` | Sin índice declarado | Índice no único `(subtopic_id, content_hash)` |
| Duplicados | Se comparaban dentro del subtema | Sin cambio de alcance, pero el subtema ahora se identifica por su ruta de tres niveles |

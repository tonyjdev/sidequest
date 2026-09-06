# Decisiones de dominio

El documento de arranque dejó diez decisiones abiertas que condicionan el esquema de base de
datos. Aquí está la propuesta para cada una, con su motivo y su alternativa descartada.

**Estado: pendientes de confirmación.** Mientras no se confirmen, la especificación las da por
buenas y el resto de tareas asume estos valores. Cambiar una decisión afecta, como mucho, a las
tareas que la usan.

---

## 1. Nombre de «temática» y «subtema»

**Propuesta:** `topic` (tema) y `subtopic` (subtema). Jerarquía fija de dos niveles.

**Motivo:** es el vocabulario natural en cuestionarios y no colisiona con «categoría», que en
otros contextos significa otra cosa. Dos niveles cubren el alcance descrito y evitan el coste de
un árbol arbitrario que nadie ha pedido.

**Descartado:** `category` / `subcategory`, y un árbol de profundidad libre.

---

## 2. Recursos: solo URL externas o también archivos subidos

**Propuesta:** en la primera versión, solo URL externas. La tabla incluye ya una columna
`storage_kind` con valor `external`, de modo que admitir subidas más adelante no obligue a migrar.

**Motivo:** la terminal solo muestra enlaces, así que subir archivos no aporta nada al caso de uso
principal y sí añade volumen, backup y servido estático.

**Descartado:** subida de archivos en v1.

---

## 3. Reglas de ponderación y repetición

**Propuesta:** peso multiplicativo con cuatro factores —novedad, antigüedad, tasa de fallo y
dificultad— sobre un muestreo aleatorio ponderado, más una ventana de enfriamiento que excluye lo
recién visto. Todos los parámetros viven en `settings` y se ajustan sin desplegar.

Valores iniciales: `boost_nueva` = 10, semivida = 30 días, `peso_fallo` = 1.5, enfriamiento = 24
horas, factores de dificultad = 1.

**Motivo:** cumple el requisito explícito («una pregunta nunca realizada debe tener una
probabilidad claramente superior») y deja la política afinable sin tocar código.

**Descartado:** cola determinista de repetición espaciada tipo SM-2. Es más potente, pero exige
un modelo de memoria por pregunta y el brief pide algo más simple.

---

## 4. Sesiones de trabajo diferenciadas

**Propuesta:** sí. Tabla `sessions` con el agente, una referencia externa opcional a la sesión del
agente y contadores. `attempts.session_id` es opcional.

**Motivo:** sin sesión no se puede implementar «frecuencia de intercalación» ni limitar cuántas
preguntas se lanzan en una jornada, que es un requisito de la skill. Además habilita
estadísticas por sesión sin coste adicional.

**Descartado:** registrar intentos sueltos sin agrupar.

---

## 5. Edición de preguntas publicadas

**Propuesta:** edición directa, sin versionado formal de filas. La pregunta lleva un contador
`version` que se incrementa al editar el contenido, y cada intento guarda una copia inmutable del
enunciado, de las opciones mostradas y de la versión.

**Motivo:** el brief ya exige guardar las opciones mostradas en el intento. Con esa copia, el
histórico es interpretable aunque la pregunta cambie o se archive, y el contador de versión
permite detectar que cambió. Versionar filas duplicaría el contenido sin resolver nada nuevo.

**Descartado:** tabla `question_versions` con copia por edición.

---

## 6. Estados del contenido

**Propuesta:** `draft`, `published`, `archived`, aplicados por igual a temas, subtemas y
preguntas. Solo lo `published` entra en el sorteo. Nada se borra físicamente.

**Motivo:** cubre la importación como borrador, la publicación explícita y la retirada sin
romper el histórico. Tres estados son suficientes; añadir más complica la UI sin uso claro.

**Descartado:** estados adicionales tipo `review` o `deprecated`.

---

## 7. Número de opciones visibles

**Propuesta:** valor global en `settings` (por defecto 4) y campo `visible_options` por pregunta
que lo sobrescribe cuando no es nulo.

Reglas de composición:

- **Única:** una correcta más `visible_options − 1` distractores al azar.
- **Múltiple:** todas las correctas, y el recorte aleatorio se aplica solo a los distractores. Si
  las correctas no caben, se amplía el número de opciones mostradas.

**Motivo:** en selección múltiple, mostrar solo una parte de las correctas convierte una respuesta
correcta en incorrecta según el sorteo, lo que hace el histórico incomparable. Mostrarlas todas
mantiene la pregunta bien definida en cada intento.

**Descartado:** recortar también las correctas y evaluar contra el subconjunto mostrado.

---

## 8. Transporte del servidor MCP

**Propuesta:** HTTP streamable en `/mcp`, en el mismo contenedor que la API. Un puente stdio queda
como tarea posterior, solo si algún agente objetivo no admite HTTP.

**Motivo:** con la aplicación ya viviendo en Docker, HTTP es el transporte que no obliga a que el
agente entre en el contenedor. Es además lo que admiten hoy los principales agentes.

**Descartado:** stdio como transporte principal mediante `docker compose exec`.

---

## 9. Copias de seguridad de MySQL

**Propuesta:** script `scripts/backup.sh` que hace `mysqldump` a `./backups/` con rotación por
número de copias, más el procedimiento de restauración documentado. Sin cron por defecto.

**Motivo:** un volcado lógico es portable entre versiones de MySQL y basta para una instalación
local monousuario. Programarlo es decisión del usuario, no de la aplicación.

**Descartado:** copia del volumen en caliente y backup automático activado por defecto.

---

## 10. Formato de importación y JSON Schema

**Propuesta:** se cierra después del esquema de base de datos, en la tarea SQST-0018. Forma
prevista: un único objeto con `version`, `topics` y `questions`, con las preguntas referenciando
su subtema por `slug`. El JSON Schema se publica en `/import/schema` y se descarga desde el panel.

**Motivo:** es la instrucción explícita del documento de arranque: no fijar el JSON antes de
cerrar el esquema.

**Descartado:** CSV y formatos por lotes múltiples.

# Worktrees de tarea en paralelo

Varios agentes trabajan sobre este repositorio a la vez. Cada uno recibe un checkout propio —un
worktree de Git bajo `.worktrees/`— para que nadie cambie de rama por debajo de otro, y para que las
dependencias, el `.env` y la salida de compilación de uno no aparezcan en el editor de otro.

El estado de una tarea vive en la aplicación Workspace, nunca en este repositorio, así que aquí no
hay nada que mover de carpeta cuando se reclama una tarea. **La rama es la reclamación**, y la clave
de Workspace es la clave de propiedad: un slug distinto no vuelve a dejar libre una tarea ya
reclamada.

## Tres fases, un worktree por tarea

| Fase | Comando | Qué hace |
| --- | --- | --- |
| Preparar | `/init-task SQST-0005` | Lee la tarea en Workspace, deriva el slug de su título y crea `.worktrees/sqst-0005` desde `origin/develop` en `feat/sqst-0005-<slug>`, preparado para que la puerta de calidad pueda ejecutarse dentro. No confirma nada ni transiciona nada. |
| Implementar | `/start-task` | **No toca Git.** Comprueba que estás en el worktree de la tarea y en su rama, carga los documentos de Workspace y el prompt de ejecución, y pasa la tarea a `in_progress`. |
| Integrar | `/close-task` | Ejecuta `pnpm check`, escribe los documentos de cierre, confirma, publica, abre el PR, lo fusiona y entrega la integración posterior a `finish`. |

## La implementación canónica

`scripts/git/task-worktree.sh` es el único sitio donde se crean, mueven o eliminan las ramas y los
worktrees del ciclo de tarea. Todos los comandos de agente lo llaman; **ninguna herramienta guarda
estado de ramas por su cuenta**.

```
task-worktree.sh init <task-key> <slug> [--no-deps] [--no-build]
task-worktree.sh recover <task-key> [--no-deps] [--no-build]
task-worktree.sh remove <task-key> --abandoned
task-worktree.sh preflight
task-worktree.sh finish <task-key>
task-worktree.sh with-integration-lock -- <command> [args...]
```

Su contrato es legible por máquina: **stdout lleva líneas `KEY=value` y nada más**, todo diagnóstico
va a stderr, y el código de salida dice de qué tipo de respuesta se trata —`0` éxito, `1` fallo de
validación u operación, `2` cerrojo activo o condición insegura. Un rechazo no imprime nada en
stdout, así que quien llama nunca puede leer una ruta de una ejecución que falló.

Un proceso hijo no puede cambiar el directorio de la shell que lo llamó. Carga las funciones para
tener `init-task`, `finish-task` y `close-task` en tu propia shell:

```bash
source /home/tonyjdev/Projects/sidequest/scripts/git/task-worktree-functions.sh
```

Ejecutado directamente, el script imprime el `cd` que hay que dar y no promete haberlo dado.

## Qué prepara `init`, y por qué instala

Un worktree es un checkout sin entorno: sin `.env` y sin `node_modules/`, así que `pnpm check` no
puede ejecutarse dentro. Esa puerta es la que `close-task` ejecuta **dentro del worktree**, de modo
que prepararlo forma parte de reclamar la tarea y no es una tarea suelta para quien llegue. `init`
copia el `.env` del checkout primario y luego ejecuta `pnpm install --frozen-lockfile` y
`pnpm build`.

Las dependencias se **instalan, no se enlazan**. Un `node_modules` enlazado resuelve al checkout
primario, así que el worktree ejecutaría el árbol de dependencias del primario: en silencio, y solo
a veces distinto. pnpm mantiene un almacén direccionado por contenido, así que volver a instalar
cuesta poco disco y poco tiempo.

`--no-deps` y `--no-build` saltan esos pasos para un worktree que solo vas a leer. La reclamación en
sí —la rama y el worktree— se crea bajo el cerrojo, y el cerrojo se libera antes de que empiecen las
instalaciones: no compiten con nada, y mantenerlo durante ellas haría expirar el `init` de cualquier
otro agente.

**Mientras el repositorio no tenga `package.json`** —antes de SQST-0002— no hay nada que instalar. La
preparación se salta sola, lo dice por stderr y la reclamación se completa igual.

## Cerrojos

Bajo el directorio común de Git, `.git/`, viven dos cerrojos consultivos:

- `sidequest-init-task.lock` — retenido mientras se hace una reclamación. Quien llama espera su turno
  durante `SIDEQUEST_LOCK_WAIT_SECONDS` (15 por defecto), así que se pueden preparar tareas
  independientes a la vez.
- `sidequest-integration.lock` — retenido por `finish` y por `with-integration-lock`. **Nunca
  espera**: a un segundo cierre se le dice qué operación sigue en marcha y sale con `2`, en vez de
  bloquearse en silencio.

Son cerrojos `flock`, así que se liberan cuando muere su dueño: un cerrojo huérfano no es aquí una
categoría de problema. Coordinan procesos de **este** clon, no clones independientes ni otras
máquinas.

## Reglas que no se doblan

- **Una tarea = una rama = un worktree = un PR.**
- **Un agente nunca cambia de rama dentro de su worktree**, y nunca entra en el worktree de otra
  tarea.
- **El checkout primario no es un espacio de trabajo.** `init` nunca escribe en él; solo la
  integración lo actualiza, siempre bajo el cerrojo de integración.
- **Un worktree con trabajo sin confirmar nunca se elimina automáticamente.** Los archivos ignorados
  no cuentan: `init` escribe `.env`, `node_modules/` y la salida de compilación en cada worktree que
  prepara.
- El aislamiento evita interferencias en el sistema de archivos, **no** conflictos de fusión: dos
  ramas siguen pudiendo chocar al fusionarse.

## Recuperar y abandonar

`recover <clave>` vuelve a ejecutar la preparación del entorno de un worktree ya reclamado. Es la
reparación de un `init` que creó el worktree y luego falló instalando, y es idempotente: solo
reescribe archivos que Git ignora, así que es seguro ejecutarlo sobre trabajo en curso.

`remove <clave> --abandoned` es para una tarea que nadie llegó a empezar. Rechaza un worktree con
trabajo sin confirmar, una rama con commits propios y una rama publicada en `origin`.

## Docker Compose es de uno en uno

`compose.yaml` fija el nombre del proyecto (`name: sidequest`), así que todos los worktrees
levantan el mismo proyecto y comparten volumen de MySQL: trabajar en otro worktree no te deja
delante de una base vacía sin avisar. Pero también publican los mismos puertos, así que el segundo
`docker compose up` falla al enlazarlos.

Levanta Compose en un worktree cada vez. Si necesitas dos a la vez, dale a cada uno su
`COMPOSE_PROJECT_NAME` y sus `APP_HOST_PORT` y `MYSQL_HOST_PORT` en el `.env` del worktree —que es
una copia, no un enlace, así que puedes cambiarlo sin afectar al primario. Ver
[docker.md](docker.md).

## Lo que esto no resuelve

- **Conflictos de fusión.** Dos ramas que editan las mismas líneas siguen chocando.
- **Datos compartidos.** Con el mismo `COMPOSE_PROJECT_NAME`, dos worktrees desarrollan contra la
  misma base de datos.
- **Sesiones de navegador.** El panel de dos worktrees en el mismo puerto es el mismo panel.

## Dónde se declara `.worktrees`

`/.worktrees` está en `.gitignore`. Todo lo que recorra el árbol entero tiene que saltárselo, o
acabaría analizando las dependencias de cada worktree: la configuración de ESLint, la de Prettier y
la de Vitest deben excluirlo cuando lleguen en SQST-0002. El resto de las herramientas está acotado a
`app/` o `web/` y nunca lo ve.

## Verificación

`bash tests/shell/run.sh` ejecuta las suites de shell. Cada caso de
`tests/shell/git/task-worktree.test.sh` construye un clon desechable desde cero: el checkout real,
sus ramas y sus worktrees no se tocan nunca. Ejecútalo siempre que toques algo en `scripts/`.

# Entorno local con Docker Compose

`compose.yaml` levanta el entorno completo: la aplicación y su base de datos. Es la forma
reproducible de ejecutar Sidequest; `pnpm dev` sigue sirviendo para iterar sobre el código sin
reconstruir la imagen.

## Arranque

```bash
cp .env.example .env          # y ajusta las contraseñas y el secreto
docker compose up -d --build
docker compose ps             # ambos servicios deben figurar como (healthy)
```

El primer arranque tarda: construye la imagen y MySQL inicializa su directorio de datos. A partir
de ahí, `docker compose up -d` levanta en segundos.

## Servicios

| Servicio | Imagen | Qué hace |
| --- | --- | --- |
| `mysql` | `mysql:8.4` | Base de datos. Crea la base y el usuario de la aplicación en el primer arranque, con las variables del `.env`. Arranca con `--log-bin-trust-function-creators=1`, sin lo cual las migraciones no pueden crear los disparadores de las invariantes. |
| `app` | construida desde `Dockerfile` | La aplicación: API HTTP con Fastify bajo `/api/v1` y el panel web servido en `/`. El servidor MCP llega en SQST-0020. |

`app` declara `depends_on: mysql: condition: service_healthy`, así que no arranca hasta que MySQL
responde a su sonda. La sonda de MySQL es `mysqladmin ping` cada 10 s, con 60 s de margen inicial
para que la primera inicialización no cuente como fallo.

## Puertos

| Publicado | Variable | Destino | Para qué |
| --- | --- | --- | --- |
| `3000` | `APP_HOST_PORT` → `APP_PORT` | `app` | API HTTP, panel web y, más adelante, `/mcp` |
| `3306` | `MYSQL_HOST_PORT` → `3306` | `mysql` | Migraciones e inspección desde la máquina anfitriona |

`APP_PORT` y `MYSQL_PORT` son las direcciones **dentro** de la red de Compose; `APP_HOST_PORT` y
`MYSQL_HOST_PORT` son lo que se publica hacia fuera. Si el 3306 ya está ocupado por un MySQL
instalado en la máquina, cambia `MYSQL_HOST_PORT` y no toques `MYSQL_PORT`: la aplicación seguiría
conectándose igual.

La aplicación llega a la base de datos por **nombre de servicio** —`mysql`, en `MYSQL_HOST` y en
`DATABASE_URL`—, nunca por IP: Docker la resuelve dentro de la red del proyecto y la dirección
cambia en cada arranque.

## Variables de entorno

Compose lee el `.env` de la raíz y sustituye las referencias de `compose.yaml`. Las que no tienen
valor por defecto son obligatorias: si falta una, `docker compose up` se detiene nombrándola en
lugar de arrancar a medias.

```
error: falta SIDEQUEST_ATTEMPT_SECRET en .env
```

`.env` está en `.gitignore`. `.env.example` documenta cada variable y es el archivo que se versiona.

Compose comprueba que la variable esté puesta; la aplicación la vuelve a validar al arrancar y
falla nombrando la que falta o el valor que no encaja, en lugar de arrancar a medias:

```
Configuración inválida. Revisa el archivo .env:
  - DATABASE_URL: es obligatoria
  - SIDEQUEST_ATTEMPT_SECRET: debe tener al menos 32 caracteres; genérala con `openssl rand -hex 32`
```

## Datos

Los datos de MySQL viven en el volumen con nombre `sidequest_mysql-data`, no en el contenedor.

| Comando | Qué pasa con los datos |
| --- | --- |
| `docker compose restart` | Se conservan |
| `docker compose down` | Se conservan |
| `docker compose down -v` | **Se borran.** El siguiente arranque vuelve a crear la base vacía |

## Imagen de la aplicación

`Dockerfile` tiene tres etapas:

1. **`deps`** — instala el espacio de trabajo entero con `pnpm install --frozen-lockfile`. Copia
   únicamente los manifiestos, así que la instalación se reutiliza mientras no cambien.
2. **`build`** — compila TypeScript a `app/dist` y empaqueta el panel en `web/dist`.
3. **`runtime`** — parte de una imagen limpia, instala solo las dependencias de producción de
   `@sidequest/app`, copia `app/dist` y `web/dist`, y ejecuta como el usuario `node`. No lleva
   código fuente ni herramientas de desarrollo.

El panel viaja ya empaquetado: son archivos estáticos, así que en la imagen final no hay ni una
dependencia suya. Lo sirve el propio proceso de la aplicación en `/`; ver
[panel.md](panel.md).

## El panel

Con el entorno levantado, el panel está en la raíz del puerto publicado:

```bash
xdg-open http://localhost:3000        # el panel
curl -s localhost:3000/api/v1/health  # la API, en el mismo puerto
```

No hay que configurar nada más: el mismo proceso sirve las dos cosas y el panel pide la API por
rutas relativas. Una dirección del panel que no existe como archivo —`/temas`, `/ajustes`—
devuelve su `index.html` y la resuelve su enrutador; debajo de `/api/v1` y de `/mcp`, en cambio,
una ruta que no existe sigue siendo un `404` con el envoltorio de error en JSON.

Para iterar sobre el panel sin reconstruir la imagen, `pnpm dev` lo levanta con Vite en
`WEB_PORT` y reenvía `/api` a la aplicación. Ver [panel.md](panel.md).

## Migraciones

El esquema **no** se crea al levantar el contenedor: la aplicación no migra al arrancar. Después
del primer `up`, con MySQL ya `healthy`:

```bash
pnpm db:migrate    # crea el esquema
pnpm db:seed       # opcional: contenido de ejemplo para desarrollar
```

Se ejecutan desde la máquina anfitriona contra el puerto publicado, que es justo para lo que
existe `MYSQL_HOST_PORT`. `DATABASE_URL` no vale para eso: apunta al servicio `mysql`, un nombre
que solo resuelve dentro de la red de Compose. Ver [database.md](database.md).

## Sonda de salud

`app` responde `GET /api/v1/health`, que es lo que prueba el healthcheck del contenedor:

```bash
curl -s localhost:3000/api/v1/health
```

```json
{
  "status": "ok",
  "app": "sidequest",
  "version": "0.1.0",
  "uptime_s": 41,
  "checks": { "database": { "status": "ok", "latency_ms": 2 } }
}
```

Devuelve `200` con MySQL disponible y `503` sin ella, **con el mismo documento**: `status` pasa a
`error` y `checks.database` explica el motivo. La forma no cambia entre los dos casos para que
quien monitoriza vea *qué* comprobación falló, y no un mensaje genérico.

La comprobación es un `SELECT 1`: mide la conexión y no depende de que exista ninguna tabla, así
que vale igual con el esquema migrado y sin migrar.

## Comandos habituales

```bash
docker compose up -d --build      # levanta, reconstruyendo si el código cambió
docker compose ps                 # estado y salud de cada servicio
docker compose logs -f app        # registro de la aplicación
docker compose exec mysql \
  mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"
docker compose down               # para y borra los contenedores, conserva los datos
docker compose down -v            # borra también el volumen
```

## Un entorno cada vez

El nombre del proyecto está fijado en `compose.yaml` (`name: sidequest`), así que todos los
worktrees comparten el mismo proyecto, el mismo volumen y los mismos puertos publicados. Es lo
buscado: evita que trabajar en otro worktree te deje delante de una base vacía sin avisar.

La consecuencia es que **solo se levanta un entorno a la vez**. Para dos en paralelo, dale a cada
worktree su propio `COMPOSE_PROJECT_NAME` y sus propios `APP_HOST_PORT` y `MYSQL_HOST_PORT` en su
`.env`, que es una copia y no un enlace. Ver [worktrees.md](worktrees.md).

## Si algo falla

| Síntoma | Causa habitual |
| --- | --- |
| `bind: address already in use` | Otro proceso —o otro worktree— ocupa el puerto. Cambia `APP_HOST_PORT` o `MYSQL_HOST_PORT` |
| `app` reiniciándose en bucle | `docker compose logs app`. Suele faltar una variable obligatoria |
| `mysql` no pasa a `healthy` | Espera al margen inicial de 60 s. Si persiste, `docker compose logs mysql` |
| Contraseña rechazada tras cambiar el `.env` | El usuario se creó en el primer arranque con la contraseña anterior. `docker compose down -v` y vuelve a levantar |

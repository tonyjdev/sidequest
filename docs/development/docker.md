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
| `mysql` | `mysql:8.4` | Base de datos. Crea la base y el usuario de la aplicación en el primer arranque, con las variables del `.env`. No hay ningún paso manual después. |
| `app` | construida desde `Dockerfile` | La aplicación: API y servidor MCP. Hoy solo la sonda de vida; Fastify llega en SQST-0004. |

`app` declara `depends_on: mysql: condition: service_healthy`, así que no arranca hasta que MySQL
responde a su sonda. La sonda de MySQL es `mysqladmin ping` cada 10 s, con 60 s de margen inicial
para que la primera inicialización no cuente como fallo.

## Puertos

| Publicado | Variable | Destino | Para qué |
| --- | --- | --- | --- |
| `3000` | `APP_HOST_PORT` → `APP_PORT` | `app` | API HTTP y, más adelante, `/mcp` |
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

## Datos

Los datos de MySQL viven en el volumen con nombre `sidequest_mysql-data`, no en el contenedor.

| Comando | Qué pasa con los datos |
| --- | --- |
| `docker compose restart` | Se conservan |
| `docker compose down` | Se conservan |
| `docker compose down -v` | **Se borran.** El siguiente arranque vuelve a crear la base vacía |

## Imagen de la aplicación

`Dockerfile` tiene tres etapas:

1. **`deps`** — instala solo las dependencias de `@sidequest/app` con `pnpm install --frozen-lockfile`.
   Copia únicamente los manifiestos, así que la instalación se reutiliza mientras no cambien.
2. **`build`** — compila TypeScript a `app/dist`.
3. **`runtime`** — parte de una imagen limpia, instala solo las dependencias de producción, copia
   `app/dist` y ejecuta como el usuario `node`. No lleva código fuente ni herramientas de
   desarrollo.

El panel queda fuera de la imagen: se construye aparte con `pnpm build` y se servirá desde
SQST-0009.

## Sonda de vida provisional

`app` responde `GET /health` con `200`, que es lo que prueba el healthcheck del contenedor. Es un
sustituto: SQST-0004 lo reemplaza por Fastify y por `GET /api/v1/health`, que además comprobará la
conectividad con la base de datos y devolverá `503` cuando no la haya.

## Comandos habituales

```bash
docker compose up -d --build      # levanta, reconstruyendo si el código cambió
docker compose ps                 # estado y salud de cada servicio
docker compose logs -f app        # registro de la aplicación
docker compose exec mysql \
  mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"
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

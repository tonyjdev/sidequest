# Panel web: armazón, rutas y cliente de API

El panel es la única interfaz humana del producto: la terminal la conduce el agente. Vive en el
paquete `@sidequest/web` —React, Vite, TypeScript y shadcn/ui— y no tiene reglas propias: lee y
escribe por la API, cuyo contrato está en [api.md](api.md).

Esta tarea (SQST-0009) monta el armazón. Las pantallas con contenido real llegan en SQST-0010,
SQST-0011 y SQST-0017; hasta entonces cada sección dice qué tarea la trae.

## Cómo se ejecuta

| Situación | Quién lo sirve | Dónde |
| --- | --- | --- |
| Docker Compose | El propio proceso de la aplicación, con `@fastify/static` | `http://localhost:3000` |
| `pnpm dev` | Vite, con recarga en caliente | `http://localhost:5173` |

En los dos casos el código es el mismo porque **el cliente pide siempre rutas relativas**. En el
contenedor las sirve el mismo origen; en desarrollo, el proxy de Vite reenvía `/api` al puerto
publicado de la aplicación (`APP_HOST_PORT`, o `API_PROXY_TARGET` si se quiere apuntar a otro
sitio). Así el origen de la API no aparece en ningún módulo del panel.

Servirlo desde la aplicación tiene una consecuencia en el `404`: una dirección del panel que no
existe como archivo devuelve su `index.html` y la resuelve su enrutador, pero solo si la petición
es una lectura del navegador —`GET` o `HEAD` con `Accept: text/html`— y no cuelga de `/api/v1` ni
de `/mcp`. Un recurso que falta o una ruta inexistente de la API siguen respondiendo `404` con el
envoltorio de error. Está en `app/src/api/panel.ts`.

## Rutas

Las cinco secciones se declaran una sola vez, en `web/src/navigation.ts`: de ahí salen las rutas,
la navegación lateral y la del cajón móvil, así que no pueden desincronizarse.

| Ruta | Pantalla | Contenido |
| --- | --- | --- |
| `/` | Panel de control | Estado del sistema; la evolución llega en SQST-0017 |
| `/temas` | Temas | Materias, temas y subtemas — SQST-0010 |
| `/preguntas` | Preguntas | Enunciados, opciones, recursos y etiquetas — SQST-0011 |
| `/importacion` | Importación | Plantilla, previsualización y confirmación — SQST-0019 |
| `/ajustes` | Ajustes | Parámetros globales de selección — SQST-0016 |
| `*` | No encontrada | Cualquier otra dirección, resuelta dentro del panel |

Todas cuelgan del mismo armazón (`components/layout/app-shell.tsx`), así que navegar cambia el
`Outlet` y no vuelve a montar la cabecera ni la navegación: el panel no se recarga al moverse.

## Armazón

- Navegación lateral fija a partir de `md`; por debajo, un cajón sobre la pantalla que se cierra
  al elegir sección.
- Un único `h1` por ruta, con `PageHeader`. El único `header` del documento es el del armazón.
- Enlace «Saltar al contenido» antes de la navegación.

## Tema claro y oscuro

shadcn/ui pinta el tema oscuro con la clase `dark` en la raíz del documento. `ThemeProvider` la
aplica y guarda la elección en `localStorage` (`sidequest.theme`); mientras no haya elección, el
valor es `system` y se sigue la preferencia del navegador, incluidos sus cambios en caliente. Un
almacenamiento bloqueado no rompe nada: el tema dura lo que la pestaña.

## Cliente de API

`lib/api/client.ts` es el único módulo que habla HTTP. Los recursos solo describen su ruta y cómo
se lee su respuesta:

```ts
export function getHealth(signal?: AbortSignal): Promise<HealthDocument> {
  return apiRequest('/health', { parse: parseHealth, acceptStatus: [503], signal });
}
```

Del error, lo que importa es que **se enseña el mensaje del servidor**. La API ya explica en su
envoltorio qué ha rechazado y por qué; sustituirlo por un «ha ocurrido un error» tiraría justo la
parte accionable. `ApiClientError` conserva `code`, `message`, `status` y `details`, y expone los
`details` de `validation_failed` como lista de campos.

| Código | De dónde sale |
| --- | --- |
| `validation_failed`, `not_found`, `conflict`, `internal_error` | Del servidor, tal cual |
| `network_error` | La petición no llegó a viajar |
| `invalid_response` | Llegó, pero sin la forma acordada |

Dos detalles que el contrato impone: la sonda de salud responde `503` con su propio documento, no
con el envoltorio —por eso `acceptStatus`—, y una petición cancelada se propaga como tal en vez de
convertirse en un fallo de red.

## Vacío, cargando y error

Se resuelven una sola vez y se reutilizan:

| Pieza | Qué hace |
| --- | --- |
| `useAsyncResource` | Carga, cancela la anterior y expone `loading` / `error` / `ready` |
| `AsyncResourceView` | Decide qué se dibuja en cada uno de los tres, y el vacío |
| `LoadingState` | Esqueleto de la altura del contenido, anunciado a la tecnología asistiva |
| `ErrorState` | El mensaje del servidor, sus campos y un botón para reintentar |
| `EmptyState` | Hueco con explicación: qué falta y qué se puede hacer |

Una pantalla describe su contenido y nada más:

```tsx
<AsyncResourceView resource={health} errorTitle="No se pudo leer el estado">
  {(data) => <p>{data.version}</p>}
</AsyncResourceView>
```

`useAsyncResource` no guarda «cargando»: lo deduce de que el resultado que tiene no sea el de la
petición en curso. Así un cambio de petición no puede dejar a la vista los datos de la anterior.
La función que carga tiene que ser estable (`useCallback`): es la dependencia que decide cuándo se
vuelve a pedir.

## shadcn/ui

Las primitivas viven en `web/src/components/ui/` y se añaden con su CLI, configurada en
`web/components.json` con los alias del paquete:

```bash
cd web && pnpm dlx shadcn@latest add dialog
```

Son código del repositorio, no una dependencia: se editan cuando hace falta —los textos de
interfaz van en español— pero conviene no reescribirlas, para poder regenerarlas. El tema y sus
variables están en `web/src/styles/globals.css`, con Tailwind CSS v4.

## Verificación

```bash
pnpm test routes         # las cinco rutas navegan sin recargar
pnpm test dashboard      # estados de carga y error del cuadro de mando
pnpm test panel          # el panel servido por la aplicación, con Fastify
pnpm build               # empaqueta el panel en web/dist
```

Las pruebas del panel corren sobre un DOM simulado (jsdom) con Testing Library, en el proyecto
`web` de Vitest. Las de extremo a extremo con Playwright llegan en SQST-0022.

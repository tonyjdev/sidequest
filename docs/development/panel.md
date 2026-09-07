# Panel web: armazón, rutas y cliente de API

El panel es la única interfaz humana del producto: la terminal la conduce el agente. Vive en el
paquete `@sidequest/web` —React, Vite, TypeScript y shadcn/ui— y no tiene reglas propias: lee y
escribe por la API, cuyo contrato está en [api.md](api.md).

El armazón lo montó SQST-0009, la pantalla de contenido SQST-0010 y la de preguntas SQST-0011.
Las que faltan —importación y cuadro de mando— llegan en SQST-0019 y SQST-0017; hasta entonces
cada sección dice qué tarea la trae.

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
| `/temas` | Temas | Materias, temas y subtemas, en un árbol |
| `/preguntas` | Preguntas | Listado con filtros y el editor del agregado completo |
| `/importacion` | Importación | Plantilla, previsualización y confirmación — SQST-0019 |
| `/ajustes` | Ajustes | Parámetros globales de selección — SQST-0025 |
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

## Pantalla de contenido

`/temas` gestiona los tres niveles de la jerarquía a la vez, en un árbol: materias que despliegan
sus temas, y temas que despliegan sus subtemas con su recuento de preguntas. Es una sola pantalla
porque la pregunta cuelga del subtema y el resto se deriva de él; no hay una ruta por nivel.

| Pieza | Qué resuelve |
| --- | --- |
| `lib/api/content.ts` | Las llamadas de los tres niveles, que comparten superficie |
| `lib/content-tree.ts` | Armar el árbol con los tres listados planos, y filtrarlo por estado |
| `lib/content-rules.ts` | El slug propuesto y la validación previa del formulario |
| `components/content/` | El árbol, el formulario, la confirmación de archivado y la reordenación |
| `pages/topics-page.tsx` | Quien decide: recibe la intención de cada fila y la resuelve |

Cinco decisiones que explican por qué está así:

- **El catálogo se pide entero y sin filtrar**, en tres peticiones paralelas, y el filtro por estado
  se aplica en el cliente conservando a los ancestros de lo que casa. Filtrar en el servidor dejaría
  inalcanzable un subtema en borrador colgado de un tema publicado.
- **La reordenación necesita a todos los hermanos**, archivados incluidos, porque el servidor
  reparte `position` 1..n y rechaza un subconjunto ([api.md](api.md)). Como el catálogo ya está sin
  filtrar, el diálogo los tiene sin pedir nada más.
- **El árbol no habla con la API.** Cada fila emite una intención —crear, editar, publicar, archivar,
  reordenar— y la pantalla la resuelve: quien decide sigue siendo uno.
- **El rechazo del dominio se enseña con su mensaje.** Publicar un subtema cuyo tema sigue en
  borrador responde `409`, y lo que se ve es esa frase, que es la parte accionable.
- **Archivar se confirma y dice hasta dónde baja**, porque no tiene vuelta: una materia arrastra sus
  temas y sus subtemas.

La validación del formulario —formato y longitud del slug, nombre no vacío— está escrita también en
`lib/content-rules.ts`, con los mismos límites y los mismos mensajes que `app/src/domain/content.ts`.
Es una copia deliberada y del mismo tamaño que la de los disparadores de la base
([dominio.md](dominio.md)): sirve para no gastar una petición en lo que ya se sabe imposible, y el
dominio sigue siendo quien decide.

## Pantalla de preguntas

`/preguntas` lista y edita las preguntas. Es la pantalla más rica del panel porque **la pregunta es
un agregado**: su enunciado, sus opciones, sus recursos y sus etiquetas se editan juntos y se
guardan en una sola llamada ([api.md](api.md)).

| Pieza | Qué resuelve |
| --- | --- |
| `lib/api/questions.ts` | El listado con sus filtros, la ficha, el alta, la edición y las tres transiciones |
| `lib/api/settings.ts` | Los parámetros globales; el panel lee hoy `visible_options_default` |
| `lib/question-filters.ts` | El estado de los cinco filtros y si hay alguno activo |
| `lib/question-rules.ts` | La validación previa del formulario y las tres invariantes de publicación |
| `lib/question-preview.ts` | La composición del intento que enseña la vista previa |
| `components/questions/` | El listado, los filtros, el editor y sus campos, y la vista previa |
| `pages/questions-page.tsx` | Quien decide: recibe la intención de cada fila y la resuelve |

Seis decisiones que explican por qué está así:

- **Dos cargas, no una.** El contexto —catálogo, etiquetas y parámetros— se pide una vez y nombra
  los subtemas, llena los filtros y dice cuántas opciones se mostrarán; el listado se vuelve a pedir
  con cada filtro, porque filtrar y paginar los hace el servidor.
- **La paginación va con una fila de más.** El contrato no devuelve el total, así que se piden
  `PAGE_SIZE + 1` preguntas y la de más es lo único que distingue la última página de las demás.
- **El marcado de correctas sigue al tipo**: botón de radio en selección única, casilla en múltiple.
  Cambiar de múltiple a única con más de una correcta **avisa y no desmarca nada**: elegir cuál es
  la buena es una decisión de quien escribe, no un descarte silencioso.
- **El alta puede nacer publicada.** El editor ofrece «Guardar borrador» y «Guardar y publicar»
  porque el cuerpo del alta lleva ya sus opciones y las tres invariantes se pueden comprobar.
- **Un rechazo del servidor no vacía el formulario.** El error se enseña arriba con su mensaje y lo
  escrito se queda donde estaba; perderlo por un `422` sería el peor momento para hacerlo.
- **Las etiquetas se crean desde aquí.** No hay otra pantalla que las cree, y una etiqueta que no se
  puede crear no se puede usar para filtrar. Crear una no recarga el contexto: se añade a la lista
  que ya está en pantalla.

### Vista previa

El editor enseña cómo se vería la pregunta en la terminal, con las opciones que se mostrarían
(docs/especificacion.md §4.3): una correcta más distractores en selección única, todas las
correctas en múltiple —ampliando el número mostrado si no caben—, y nunca menos de dos ni ninguna
sin correcta.

`lib/question-preview.ts` es una **copia deliberada de una regla de dominio**, del mismo tipo que
la de `lib/content-rules.ts`: el paquete del panel no importa el de la aplicación, y la composición
del intento la implementa SQST-0013. Se diferencia en una cosa a propósito: el sorteo recibe una
semilla y es reproducible, para que la vista previa no baile mientras se escribe. Cuando el dominio
exponga la composición, esta se sustituye por una llamada.

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
pnpm test topics         # la pantalla de contenido, contra la API sustituida
pnpm test content        # el cliente de la jerarquía, el árbol y sus reglas
pnpm test questions      # la pantalla de preguntas, su cliente, sus reglas y la vista previa
pnpm test panel          # el panel servido por la aplicación, con Fastify
pnpm build               # empaqueta el panel en web/dist
```

Las pruebas del panel corren sobre un DOM simulado (jsdom) con Testing Library, en el proyecto
`web` de Vitest. Las de extremo a extremo con Playwright llegan en SQST-0022.

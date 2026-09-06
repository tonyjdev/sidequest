# Knowledge Interleaver — documento de arranque

## Propósito

Crear una aplicación local que intercala preguntas de conocimiento general dentro del flujo habitual de trabajo con un agente de IA en terminal. La aplicación debe registrar las respuestas para medir evolución, aciertos y fallos.

El producto debe ser independiente del proveedor de IA. Puede utilizarse con Codex, Claude, Kimi u otros agentes que permitan instalar una skill y comunicarse mediante MCP u otro mecanismo equivalente.

## Alcance inicial

- Instalación local mediante Docker Compose.
- Un único usuario por instalación; no se necesita login en la primera versión.
- Panel web para administrar el contenido y consultar estadísticas.
- Integración externa mediante una skill y un servidor MCP.
- Base de datos MySQL persistente.
- Importación manual de lotes de preguntas generados por una IA externa.
- La aplicación no integra ningún modelo de IA ni necesita claves de proveedor.
- El formato definitivo de importación se diseñará después de concretar el modelo de datos.

## Experiencia principal

1. El usuario trabaja con su agente de IA habitual.
2. La skill decide, según la configuración, si corresponde insertar una pregunta general.
3. La skill solicita la pregunta al servidor MCP local.
4. El agente muestra la pregunta y sus opciones en la terminal.
5. El usuario responde.
6. La skill registra la respuesta mediante MCP.
7. El agente continúa con el flujo de desarrollo.

Las preguntas generales deben ser independientes de las preguntas técnicas del desarrollo y no deben alterar el contexto del trabajo.

## Panel web

### Dashboard

Debe mostrar estadísticas, gráficas y evolución de las respuestas, como mínimo:

- Total de preguntas respondidas.
- Porcentaje de aciertos y fallos.
- Evolución temporal.
- Resultados por temática y subtema.
- Resultados por dificultad.
- Preguntas pendientes o nunca realizadas.

### Gestión de contenido

El panel debe permitir:

- Crear, editar y archivar temáticas.
- Crear, editar y organizar subtemas.
- Crear preguntas.
- Elegir el tipo de pregunta por pregunta.
- Configurar respuesta única o selección múltiple.
- Definir el número de opciones visibles por pregunta.
- Añadir respuestas posibles y marcar las correctas.
- Añadir explicaciones.
- Añadir dificultad y etiquetas.
- Asociar imágenes, vídeos u otros enlaces.

Una pregunta puede tener más respuestas configuradas que las mostradas en terminal. Si se selecciona un subconjunto de respuestas, siempre debe incluirse al menos una respuesta correcta.

## Preguntas y respuestas

Tipos previstos inicialmente:

- Selección única.
- Selección múltiple.

Las preguntas se seleccionan dentro de la temática o subtema configurado. Pueden repetirse, pero deben priorizarse las que nunca se hayan mostrado.

La selección debe ser aleatoria ponderada. Una pregunta nunca realizada debe tener una probabilidad claramente superior. Después de que todas hayan aparecido, se permite la repetición utilizando factores configurables basados en historial, aciertos y antigüedad.

## Recursos enlazados

Las preguntas pueden tener recursos asociados, por ejemplo:

- Imagen.
- Vídeo.
- Página web.
- Documento u otra referencia.

La terminal no necesita renderizar estos recursos. Debe mostrar sus enlaces para que el usuario pueda abrirlos en un navegador. Los enlaces se guardan en la base de datos.

## Registro de intentos

Cada respuesta debe conservar, como mínimo:

- Pregunta presentada.
- Tema y subtema en ese momento.
- Opciones que se mostraron.
- Respuesta o respuestas elegidas.
- Resultado correcto o incorrecto.
- Fecha y hora.
- Dificultad.
- Sesión de trabajo, si se decide incluirla.

Es importante guardar las opciones mostradas en el intento, no solo la referencia a la pregunta actual, para que el histórico siga siendo interpretable si la pregunta se edita después.

## Generación externa e importación

La aplicación no genera preguntas mediante IA. En su lugar:

1. El panel proporciona una plantilla o esquema de importación.
2. El usuario se lo entrega a ChatGPT, Codex, Claude u otra IA.
3. La IA devuelve un lote estructurado de preguntas y respuestas.
4. El usuario importa el archivo desde el panel.
5. La aplicación valida el lote.
6. Se muestra una previsualización con elementos válidos, inválidos y duplicados.
7. El usuario decide qué elementos importar o descartar.
8. Los elementos aceptados se guardan como borrador o publicados según la acción elegida.

El formato JSON se concretará después de diseñar la base de datos. No asumir todavía nombres definitivos de campos.

## Integración con agentes de IA

La separación de responsabilidades debe ser:

- Skill: comportamiento y reglas de cuándo intercalar una pregunta.
- MCP: comunicación entre el agente y la aplicación local.
- Aplicación Docker: contenido, selección, registro y estadísticas.

La aplicación debe exponer una API estable y un servidor MCP local. El núcleo no debe depender de una marca concreta de IA.

La skill debe permitir configurar, como mínimo:

- Temáticas activas.
- Frecuencia de intercalación.
- Dificultad.
- Activación o pausa temporal.
- Momentos en los que no se debe interrumpir, como acciones críticas o comandos destructivos.

## Stack tecnológico acordado

- Node.js + TypeScript.
- Fastify para la API.
- SDK de MCP para TypeScript.
- MySQL como base de datos.
- Drizzle ORM.
- React + Vite para el panel.
- shadcn/ui para los componentes de interfaz.
- Docker Compose para la instalación local.
- Vitest para pruebas unitarias.
- Playwright para pruebas del panel.

## Arquitectura inicial

```text
Docker Compose
├── app
│   ├── API HTTP
│   ├── servidor MCP
│   ├── servicio de selección de preguntas
│   └── panel web
└── mysql
    └── volumen persistente
```

La primera versión puede ejecutarse como un único servicio de aplicación y un servicio MySQL. El código debe mantener separadas las responsabilidades de dominio, persistencia, API, MCP y presentación para poder evolucionar sin rehacer el núcleo.

## Requisitos no funcionales

- Instalación reproducible con Docker Compose.
- Datos persistentes tras reinicios o actualizaciones.
- Importación segura y reversible mediante borradores.
- Validación clara y errores comprensibles.
- Sin dependencia obligatoria de servicios cloud.
- Sin claves de API de IA dentro de la aplicación.
- Interfaz preparada para un único usuario local.
- Posibilidad de migrar a varios usuarios en una fase posterior.

## Decisiones pendientes

Estas decisiones deben resolverse antes de fijar el esquema definitivo:

1. Nombre final de “temática” y “subtema”.
2. Si los enlaces se limitarán a URL externas o también se permitirán archivos locales/subidos.
3. Reglas exactas de ponderación y repetición.
4. Si habrá sesiones de trabajo diferenciadas.
5. Si una pregunta publicada podrá editarse directamente o deberá versionarse.
6. Estados exactos del contenido: borrador, publicado, archivado, etc.
7. Configuración global y por pregunta de la cantidad de opciones visibles.
8. Transporte y configuración concreta del servidor MCP en cada agente.
9. Estrategia de copias de seguridad del volumen MySQL.
10. Formato definitivo de importación y su JSON Schema.

## Primer objetivo técnico

Construir una base ejecutable que incluya:

- Docker Compose con MySQL.
- API TypeScript con endpoint de salud.
- Panel web mínimo con navegación inicial.
- Estructura preparada para Drizzle, MCP e importación.
- Documentación de arranque local.

Después debe implementarse el modelo de datos, el CRUD de temáticas, subtemas y preguntas, el registro de intentos, la selección ponderada y finalmente la integración MCP.

## Instrucciones para la IA que continúe el proyecto

Antes de implementar funcionalidades grandes:

1. Revisa este documento completo.
2. Identifica las decisiones pendientes que afecten al código.
3. Propón un diseño breve y espera confirmación si una decisión cambia el alcance.
4. Mantén la aplicación sin integración directa con proveedores de IA.
5. Usa borradores y previsualización para las importaciones.
6. No fijes el JSON definitivo hasta cerrar el esquema de base de datos.
7. Verifica cada cambio con pruebas automatizadas y una comprobación de Docker.

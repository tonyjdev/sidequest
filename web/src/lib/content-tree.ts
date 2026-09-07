import type {
  ContentCatalog,
  ContentNode,
  ContentStatus,
  SubtopicNode,
  TopicNode,
} from '@web/lib/api/content';

/**
 * El árbol de la pantalla de contenido: materia → tema → subtema, los tres
 * niveles fijos de docs/decisiones.md §1. Se arma en el cliente a partir de los
 * tres listados porque la API los sirve planos, cada uno con su padre.
 *
 * Es una función pura y vive aquí, fuera de la pantalla, para poder probar el
 * agrupamiento y el filtro sin dibujar nada.
 */

export interface TopicBranch {
  readonly topic: TopicNode;
  readonly subtopics: readonly SubtopicNode[];
}

export interface SubjectBranch {
  readonly subject: ContentNode;
  readonly topics: readonly TopicBranch[];
}

export type ContentTree = readonly SubjectBranch[];

/** «Todos» no es un estado del dominio: es la ausencia de filtro. */
export type StatusFilter = ContentStatus | 'all';

/**
 * El orden es el que llega: la API ya devuelve cada nivel por `position` y, a
 * igualdad, por `id`. Un tema o un subtema cuyo padre no esté en el catálogo se
 * queda fuera, porque no hay rama de la que colgarlo.
 */
export function buildContentTree(catalog: ContentCatalog): ContentTree {
  const subtopicsByTopic = groupBy(catalog.subtopics, (subtopic) => subtopic.topic_id);
  const topicsBySubject = groupBy(catalog.topics, (topic) => topic.subject_id);

  return catalog.subjects.map((subject) => ({
    subject,
    topics: (topicsBySubject.get(subject.id) ?? []).map((topic) => ({
      topic,
      subtopics: subtopicsByTopic.get(topic.id) ?? [],
    })),
  }));
}

/**
 * Filtrar por estado conserva a los ancestros de lo que casa: un subtema en
 * borrador se sigue viendo aunque su tema esté publicado, porque si no habría
 * contenido inalcanzable desde el árbol.
 */
export function filterContentTree(tree: ContentTree, status: StatusFilter): ContentTree {
  if (status === 'all') return tree;

  return tree
    .map((branch) => ({
      subject: branch.subject,
      topics: branch.topics
        .map((topicBranch) => ({
          topic: topicBranch.topic,
          subtopics: topicBranch.subtopics.filter((subtopic) => subtopic.status === status),
        }))
        .filter(
          (topicBranch) => topicBranch.topic.status === status || topicBranch.subtopics.length > 0,
        ),
    }))
    .filter((branch) => branch.subject.status === status || branch.topics.length > 0);
}

/** Cuántas preguntas cuelgan de un tema, sumando las de sus subtemas. */
export function countQuestions(branch: TopicBranch): number {
  return branch.subtopics.reduce((total, subtopic) => total + subtopic.question_count, 0);
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();

  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);

    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }

  return groups;
}

/** El subtema con sus dos ancestros y su nombre completo, para nombrarlo en una línea. */
export interface SubtopicPath {
  readonly subtopic: SubtopicNode;
  readonly subject: ContentNode;
  readonly topic: TopicNode;
  /** «Matemáticas › Álgebra › Ecuaciones». */
  readonly label: string;
}

/**
 * La pregunta cuelga de un subtema y el resto se deriva de él, así que en el
 * listado y en el editor un subtema se nombra siempre por su ruta entera: hay
 * «Ecuaciones» en más de un tema y el nombre suelto no distingue cuál es.
 *
 * Un subtema cuyo tema o cuya materia no estén en el catálogo se queda fuera,
 * por lo mismo que en el árbol: no hay ruta que escribir.
 */
export function buildSubtopicPaths(catalog: ContentCatalog): readonly SubtopicPath[] {
  const subjects = new Map(catalog.subjects.map((subject) => [subject.id, subject]));
  const topics = new Map(catalog.topics.map((topic) => [topic.id, topic]));

  return catalog.subtopics.flatMap((subtopic) => {
    const topic = topics.get(subtopic.topic_id);
    const subject = topic ? subjects.get(topic.subject_id) : undefined;

    if (topic === undefined || subject === undefined) return [];

    return [
      { subtopic, subject, topic, label: `${subject.name} › ${topic.name} › ${subtopic.name}` },
    ];
  });
}

import { describe, expect, it } from 'vitest';

import type { ContentCatalog, ContentStatus } from '@web/lib/api/content';
import { buildContentTree, countQuestions, filterContentTree } from '@web/lib/content-tree';

function node(id: number, name: string, status: ContentStatus = 'draft') {
  return { id, name, slug: name.toLowerCase(), description: null, status, position: id };
}

const catalog: ContentCatalog = {
  subjects: [node(1, 'Matematicas', 'published'), node(2, 'Historia')],
  topics: [
    { ...node(10, 'Algebra', 'published'), subject_id: 1 },
    { ...node(11, 'Geometria'), subject_id: 1 },
    { ...node(12, 'Contemporanea'), subject_id: 2 },
  ],
  subtopics: [
    { ...node(100, 'Ecuaciones', 'published'), topic_id: 10, question_count: 12 },
    { ...node(101, 'Polinomios'), topic_id: 10, question_count: 3 },
  ],
};

describe('árbol de contenido', () => {
  it('cuelga cada nivel de su padre y conserva el orden recibido', () => {
    const tree = buildContentTree(catalog);

    expect(tree.map((branch) => branch.subject.name)).toEqual(['Matematicas', 'Historia']);
    expect(tree[0]?.topics.map((branch) => branch.topic.name)).toEqual(['Algebra', 'Geometria']);
    expect(tree[0]?.topics[0]?.subtopics.map((subtopic) => subtopic.name)).toEqual([
      'Ecuaciones',
      'Polinomios',
    ]);
    expect(tree[0]?.topics[1]?.subtopics).toEqual([]);
  });

  it('deja fuera lo que cuelga de un padre que no está en el catálogo', () => {
    const tree = buildContentTree({
      ...catalog,
      subjects: [node(1, 'Matematicas', 'published')],
    });

    expect(tree).toHaveLength(1);
    expect(tree.flatMap((branch) => branch.topics.map((topic) => topic.topic.name))).toEqual([
      'Algebra',
      'Geometria',
    ]);
  });

  it('suma las preguntas de los subtemas en su tema', () => {
    const tree = buildContentTree(catalog);
    const algebra = tree[0]?.topics[0];

    expect(algebra && countQuestions(algebra)).toBe(15);
  });
});

describe('filtro por estado', () => {
  it('conserva a los ancestros de lo que casa, aunque ellos no casen', () => {
    const tree = filterContentTree(buildContentTree(catalog), 'published');

    // Álgebra está publicada y Ecuaciones también; Polinomios, que está en
    // borrador, desaparece.
    expect(tree.map((branch) => branch.subject.name)).toEqual(['Matematicas']);
    expect(tree[0]?.topics[0]?.subtopics.map((subtopic) => subtopic.name)).toEqual(['Ecuaciones']);
  });

  it('mantiene visible el camino hasta un descendiente en borrador', () => {
    const tree = filterContentTree(buildContentTree(catalog), 'draft');

    expect(tree.map((branch) => branch.subject.name)).toEqual(['Matematicas', 'Historia']);
    expect(tree[0]?.topics.map((branch) => branch.topic.name)).toEqual(['Algebra', 'Geometria']);
    expect(tree[0]?.topics[0]?.subtopics.map((subtopic) => subtopic.name)).toEqual(['Polinomios']);
  });

  it('«todo» no filtra nada', () => {
    const tree = buildContentTree(catalog);

    expect(filterContentTree(tree, 'all')).toBe(tree);
  });
});

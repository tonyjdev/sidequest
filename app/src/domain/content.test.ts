import { describe, expect, it } from 'vitest';

import {
  assertName,
  assertPosition,
  assertPublishableUnder,
  assertSlug,
  type ContentNode,
} from '@app/domain/content.js';
import { ConflictError, InvariantError } from '@app/domain/errors.js';
import type { ContentStatus } from '@app/domain/types.js';

function node(status: ContentStatus): ContentNode {
  return {
    id: 1,
    slug: 'algebra',
    name: 'Álgebra',
    description: null,
    status,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('slug', () => {
  it.each(['algebra', 'grado-1', 'ecuaciones-de-segundo-grado', 'x1'])('admite «%s»', (slug) => {
    expect(() => {
      assertSlug(slug);
    }).not.toThrow();
  });

  it.each(['Álgebra', 'con espacio', '-empieza', 'termina-', 'doble--guion', '', 'a/b'])(
    'rechaza «%s»',
    (slug) => {
      expect(() => {
        assertSlug(slug);
      }).toThrow(InvariantError);
    },
  );

  it('rechaza el que no cabe en la columna', () => {
    expect(() => {
      assertSlug('a'.repeat(121));
    }).toThrow(/121|caracteres/);
  });
});

describe('nombre y posición', () => {
  it('rechaza un nombre en blanco', () => {
    expect(() => {
      assertName('   ');
    }).toThrow(InvariantError);
  });

  it('rechaza un nombre que no cabe en la columna', () => {
    expect(() => {
      assertName('n'.repeat(161));
    }).toThrow(InvariantError);
  });

  it.each([-1, 1.5, Number.NaN])('rechaza la posición %s', (position) => {
    expect(() => {
      assertPosition(position);
    }).toThrow(InvariantError);
  });
});

describe('cadena de publicación', () => {
  it('deja publicar un tema bajo una materia publicada', () => {
    expect(() => {
      assertPublishableUnder('topic', node('published'));
    }).not.toThrow();
  });

  it.each<ContentStatus>(['draft', 'archived'])(
    'no deja publicar un tema bajo una materia %s',
    (status) => {
      expect(() => {
        assertPublishableUnder('topic', node(status));
      }).toThrow(ConflictError);
    },
  );

  it('no deja publicar un subtema bajo un tema en borrador', () => {
    expect(() => {
      assertPublishableUnder('subtopic', node('draft'));
    }).toThrow(/cuyo tema no está publicado/);
  });
});

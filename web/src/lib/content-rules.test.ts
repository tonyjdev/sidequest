import { describe, expect, it } from 'vitest';

import { slugFromName, validateContentInput } from '@web/lib/content-rules';

describe('slug propuesto', () => {
  it('quita acentos, baja a minúsculas y une con guiones', () => {
    expect(slugFromName('Álgebra Lineal')).toBe('algebra-lineal');
    expect(slugFromName('  Ecuaciones de segundo grado  ')).toBe('ecuaciones-de-segundo-grado');
    expect(slugFromName('Español: ñ y ç')).toBe('espanol-n-y-c');
  });

  it('no deja guiones sueltos en los extremos', () => {
    expect(slugFromName('¿Qué es esto?')).toBe('que-es-esto');
    expect(slugFromName('---')).toBe('');
  });

  it('recorta a la longitud que admite el servidor', () => {
    expect(slugFromName('a'.repeat(200))).toHaveLength(120);
  });
});

describe('validación del formulario', () => {
  it('acepta lo que el dominio acepta', () => {
    expect(validateContentInput({ name: 'Álgebra', slug: 'algebra' })).toEqual([]);
  });

  it('rechaza el nombre vacío y el slug con formato imposible', () => {
    expect(validateContentInput({ name: '   ', slug: 'algebra' })).toEqual([
      { field: 'name', message: 'El nombre no puede estar vacío' },
    ]);

    // El mensaje es el mismo que lanza `assertSlug` en el dominio: el formulario
    // no inventa una versión propia de la regla.
    expect(validateContentInput({ name: 'Álgebra', slug: 'Con Espacios' })).toEqual([
      {
        field: 'slug',
        message:
          'El slug solo admite minúsculas, dígitos y guiones simples, sin empezar ni terminar en guión',
      },
    ]);
  });

  it('rechaza lo que pasa de las longitudes del esquema', () => {
    expect(validateContentInput({ name: 'a'.repeat(161), slug: 'algebra' })).toEqual([
      { field: 'name', message: 'El nombre no puede pasar de 160 caracteres' },
    ]);

    expect(validateContentInput({ name: 'Álgebra', slug: 'a'.repeat(121) })).toEqual([
      { field: 'slug', message: 'El slug no puede pasar de 120 caracteres' },
    ]);
  });
});

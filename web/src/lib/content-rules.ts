import type { FieldIssue } from '@web/lib/api/errors';

/**
 * Las reglas del contenido, escritas también aquí para poder rechazar un nombre
 * o un slug imposibles antes de gastar una petición. **El dominio sigue mandando**
 * (`app/src/domain/content.ts`): esto es una copia deliberada, con los mismos
 * límites y los mismos mensajes, para que el formulario diga exactamente lo que
 * diría el servidor y no una versión suya.
 */

export const SLUG_MAX_LENGTH = 120;
export const NAME_MAX_LENGTH = 160;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function validateContentInput(input: {
  readonly name: string;
  readonly slug: string;
}): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (input.name.trim() === '') {
    issues.push({ field: 'name', message: 'El nombre no puede estar vacío' });
  } else if (input.name.length > NAME_MAX_LENGTH) {
    issues.push({
      field: 'name',
      message: `El nombre no puede pasar de ${String(NAME_MAX_LENGTH)} caracteres`,
    });
  }

  if (!SLUG_PATTERN.test(input.slug)) {
    issues.push({
      field: 'slug',
      message:
        'El slug solo admite minúsculas, dígitos y guiones simples, sin empezar ni terminar en guión',
    });
  } else if (input.slug.length > SLUG_MAX_LENGTH) {
    issues.push({
      field: 'slug',
      message: `El slug no puede pasar de ${String(SLUG_MAX_LENGTH)} caracteres`,
    });
  }

  return issues;
}

/**
 * El slug que propone el formulario al escribir el nombre. Los acentos se
 * separan y se tiran —«Álgebra» da `algebra`—, y lo que no es letra ni dígito se
 * convierte en un guión simple. Sigue siendo editable: esto solo evita teclearlo.
 */
export function slugFromName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/u, '');
}

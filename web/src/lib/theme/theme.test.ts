import { describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, resolveTheme } from '@web/lib/theme/theme';

describe('readStoredTheme', () => {
  it('lee el tema guardado', () => {
    expect(readStoredTheme({ getItem: () => 'dark' })).toBe('dark');
  });

  it('cae en «system» ante un valor desconocido', () => {
    expect(readStoredTheme({ getItem: () => 'neón' })).toBe('system');
  });

  it('cae en «system» si el almacenamiento está bloqueado', () => {
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('bloqueado');
        },
      }),
    ).toBe('system');
  });

  it('usa la clave del panel', () => {
    expect(THEME_STORAGE_KEY).toBe('sidequest.theme');
  });
});

describe('resolveTheme', () => {
  it('sigue al sistema mientras no haya elección', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('la elección del usuario manda sobre el sistema', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('marca la raíz con la clase que pinta shadcn/ui', () => {
    const root = window.document.createElement('html');

    applyTheme(root, 'dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');

    applyTheme(root, 'light');
    expect(root.classList.contains('dark')).toBe(false);
  });
});

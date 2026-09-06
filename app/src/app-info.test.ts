import { describe, expect, it } from 'vitest';

import { APP_NAME, describeApp } from '@app/app-info.js';

describe('describeApp', () => {
  it('identifica la aplicación', () => {
    expect(describeApp()).toContain(APP_NAME);
  });
});

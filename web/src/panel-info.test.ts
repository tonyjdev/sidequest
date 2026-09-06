import { describe, expect, it } from 'vitest';

import { PANEL_TITLE, describePanel } from '@web/panel-info';

describe('describePanel', () => {
  it('identifica el panel', () => {
    expect(describePanel()).toContain(PANEL_TITLE);
  });
});

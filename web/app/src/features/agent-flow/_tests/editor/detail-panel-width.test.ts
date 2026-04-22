import { describe, expect, test } from 'vitest';

import {
  NODE_DETAIL_DEFAULT_WIDTH,
  clampNodeDetailWidth,
  getNodeDetailLayout,
  getMaxNodeDetailWidth,
  getNodeDetailWidthFromSplitter
} from '../../lib/detail-panel-width';

describe('detail panel width', () => {
  test('clamps node detail width against min width and reserved canvas width', () => {
    expect(NODE_DETAIL_DEFAULT_WIDTH).toBe(420);
    expect(clampNodeDetailWidth(200, 1440)).toBe(300);
    expect(getMaxNodeDetailWidth(1000)).toBe(700);
    expect(clampNodeDetailWidth(760, 1000)).toBe(700);
  });

  test('uses the last splitter panel width as the persisted detail width', () => {
    expect(getNodeDetailWidthFromSplitter([560, 440], 1200)).toBe(440);
  });

  test('switches narrow detail docks into compact layout mode', () => {
    expect(getNodeDetailLayout(320)).toBe('compact');
    expect(getNodeDetailLayout(420)).toBe('regular');
  });
});

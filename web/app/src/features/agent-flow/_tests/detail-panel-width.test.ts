import { describe, expect, test } from 'vitest';

import {
  NODE_DETAIL_DEFAULT_WIDTH,
  clampNodeDetailWidth,
  getMaxNodeDetailWidth,
  getNodeDetailWidthFromSplitter
} from '../lib/detail-panel-width';

describe('detail panel width', () => {
  test('clamps node detail width against min width and reserved canvas width', () => {
    expect(NODE_DETAIL_DEFAULT_WIDTH).toBe(520);
    expect(clampNodeDetailWidth(320, 1440)).toBe(480);
    expect(getMaxNodeDetailWidth(1000)).toBe(600);
    expect(clampNodeDetailWidth(760, 1000)).toBe(600);
  });

  test('uses the last splitter panel width as the persisted detail width', () => {
    expect(getNodeDetailWidthFromSplitter([560, 440], 1200)).toBe(480);
  });
});

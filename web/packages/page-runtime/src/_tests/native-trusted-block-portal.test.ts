import { describe, expect, test } from 'vitest';

import { createNativeTrustedBlockPortalContainment } from '../index';

describe('Native trusted block portal containment contract', () => {
  test('creates stable resolver contracts that all return the caller root', () => {
    const root = { id: 'block-root' };
    const result = createNativeTrustedBlockPortalContainment({ root });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected portal containment contract to be created');
    }

    const { containment } = result;

    expect(containment.root).toBe(root);
    expect(containment.modal.getContainer).toBe(
      containment.modal.getContainer
    );
    expect(containment.select.getPopupContainer).toBe(
      containment.select.getPopupContainer
    );
    expect(containment.dropdown.getPopupContainer).toBe(
      containment.dropdown.getPopupContainer
    );
    expect(containment.tooltip.getPopupContainer).toBe(
      containment.tooltip.getPopupContainer
    );
    expect(containment.modal.getContainer()).toBe(root);
    expect(containment.select.getPopupContainer()).toBe(root);
    expect(containment.dropdown.getPopupContainer()).toBe(root);
    expect(containment.tooltip.getPopupContainer()).toBe(root);
  });

  test('ignores trigger args and never falls back to the trigger or global container', () => {
    const root = { id: 'block-root' };
    const trigger = { id: 'trigger-node' };
    const result = createNativeTrustedBlockPortalContainment({ root });

    if (!result.ok) {
      throw new Error('expected portal containment contract to be created');
    }

    expect(result.containment.select.getPopupContainer(trigger)).toBe(root);
    expect(result.containment.dropdown.getPopupContainer(trigger)).toBe(root);
    expect(result.containment.tooltip.getPopupContainer(trigger)).toBe(root);
    expect(result.containment.select.getPopupContainer(trigger)).not.toBe(
      trigger
    );
    expect(result.containment.dropdown.getPopupContainer(trigger)).not.toBe(
      trigger
    );
    expect(result.containment.tooltip.getPopupContainer(trigger)).not.toBe(
      trigger
    );
  });

  test.each([
    [{}, 'root'],
    [{ root: undefined }, 'root'],
    [{ root: null }, 'root'],
    [null, 'root']
  ])('rejects missing or invalid root with a protocol error', (input, path) => {
    const result = createNativeTrustedBlockPortalContainment(input);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path,
      message: expect.stringContaining('root')
    });
  });

  test('keeps separate roots isolated in separate resolver contracts', () => {
    const firstRoot = { id: 'first-root' };
    const secondRoot = { id: 'second-root' };
    const first = createNativeTrustedBlockPortalContainment({
      root: firstRoot
    });
    const second = createNativeTrustedBlockPortalContainment({
      root: secondRoot
    });

    if (!first.ok || !second.ok) {
      throw new Error('expected portal containment contracts to be created');
    }

    expect(first.containment.root).toBe(firstRoot);
    expect(second.containment.root).toBe(secondRoot);
    expect(first.containment.modal.getContainer()).toBe(firstRoot);
    expect(second.containment.modal.getContainer()).toBe(secondRoot);
    expect(first.containment.select.getPopupContainer(secondRoot)).toBe(
      firstRoot
    );
    expect(second.containment.select.getPopupContainer(firstRoot)).toBe(
      secondRoot
    );
  });
});

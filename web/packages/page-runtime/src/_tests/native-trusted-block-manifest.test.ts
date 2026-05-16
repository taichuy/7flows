import { describe, expect, test } from 'vitest';

import {
  NATIVE_TRUSTED_BLOCK_PERMISSION,
  NATIVE_TRUSTED_BLOCK_RUNTIME,
  prepareNativeTrustedBlock
} from '../index';

const validNativeTrustedBlockSource = `
import React from 'react';
import { Button } from 'antd';

export default function NativeTrustedBlock() {
  return React.createElement(Button, null, 'Run');
}
`;

describe('Native trusted block manifest prepare contract', () => {
  test('returns a runnable prepare plan for valid runtime, source, and actor permission', () => {
    const result = prepareNativeTrustedBlock({
      runtime: NATIVE_TRUSTED_BLOCK_RUNTIME,
      blockId: '  trusted-sales-summary  ',
      entry: '  ./blocks/SalesSummary.tsx  ',
      source: validNativeTrustedBlockSource,
      props: { recordId: 'record-1', compact: true },
      actorPermissions: ['workspace.read', NATIVE_TRUSTED_BLOCK_PERMISSION]
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        runtime: NATIVE_TRUSTED_BLOCK_RUNTIME,
        blockId: 'trusted-sales-summary',
        entry: './blocks/SalesSummary.tsx',
        source: validNativeTrustedBlockSource,
        normalizedSource: validNativeTrustedBlockSource.trim(),
        props: { recordId: 'record-1', compact: true },
        requiredPermissions: [NATIVE_TRUSTED_BLOCK_PERMISSION]
      },
      errors: []
    });
  });

  test('rejects missing native trusted block actor permission', () => {
    const result = prepareNativeTrustedBlock({
      runtime: NATIVE_TRUSTED_BLOCK_RUNTIME,
      source: validNativeTrustedBlockSource,
      actorPermissions: ['workspace.read']
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: 'action_denied',
      path: 'actorPermissions',
      message: expect.stringContaining(NATIVE_TRUSTED_BLOCK_PERMISSION)
    });
  });

  test('rejects a manifest with the wrong runtime', () => {
    const result = prepareNativeTrustedBlock({
      runtime: 'iframe',
      source: validNativeTrustedBlockSource,
      actorPermissions: [NATIVE_TRUSTED_BLOCK_PERMISSION]
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path: 'runtime',
      message: expect.stringContaining(NATIVE_TRUSTED_BLOCK_RUNTIME)
    });
  });

  test('rejects empty or invalid source before returning a prepare plan', () => {
    const emptySourceResult = prepareNativeTrustedBlock({
      runtime: NATIVE_TRUSTED_BLOCK_RUNTIME,
      source: '   ',
      actorPermissions: [NATIVE_TRUSTED_BLOCK_PERMISSION]
    });
    const invalidSourceResult = prepareNativeTrustedBlock({
      runtime: NATIVE_TRUSTED_BLOCK_RUNTIME,
      source: "import ReactDOM from 'react-dom';",
      actorPermissions: [NATIVE_TRUSTED_BLOCK_PERMISSION]
    });

    expect(emptySourceResult.ok).toBe(false);
    expect(emptySourceResult.errors[0]).toMatchObject({
      code: 'transform_failed',
      path: 'source'
    });
    expect(invalidSourceResult.ok).toBe(false);
    expect(invalidSourceResult.errors[0]).toMatchObject({
      code: 'import_denied',
      path: 'source.imports[0]'
    });
  });

  test('rejects malformed prepare input without throwing', () => {
    expect(() => prepareNativeTrustedBlock(null)).not.toThrow();

    const nullResult = prepareNativeTrustedBlock(null);
    const malformedPermissionsResult = prepareNativeTrustedBlock({
      runtime: NATIVE_TRUSTED_BLOCK_RUNTIME,
      source: validNativeTrustedBlockSource,
      actorPermissions: NATIVE_TRUSTED_BLOCK_PERMISSION
    });

    expect(nullResult.ok).toBe(false);
    expect(nullResult.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path: 'root'
    });
    expect(malformedPermissionsResult.ok).toBe(false);
    expect(malformedPermissionsResult.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path: 'actorPermissions'
    });
  });
});

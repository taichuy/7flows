import { describe, expect, test } from 'vitest';

import {
  evaluateNativeTrustedBlockSource,
  type NativeTrustedBlockInjectedModuleMap
} from '../../index';

function Button(): null {
  return null;
}

function Surface(): null {
  return null;
}

function createModules(
  overrides: NativeTrustedBlockInjectedModuleMap = {}
): NativeTrustedBlockInjectedModuleMap {
  const React = {
    createElement(type: unknown, props: unknown, ...children: unknown[]) {
      return { type, props, children };
    }
  };

  return {
    react: {
      default: React,
      createElement: React.createElement
    },
    antd: {
      Button
    },
    '@1flowbase/ui': {
      Surface
    },
    ...overrides
  };
}

describe('Native trusted block source evaluator', () => {
  test('evaluates non-JSX source through injected React, AntD, and UI modules', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: `
import React from 'react';
import { Button } from 'antd';
import { Surface } from '@1flowbase/ui';

export default function Block(props) {
  return React.createElement(Surface, null, React.createElement(Button, null, props.props.title));
}
`,
      modules: createModules()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(typeof result.component).toBe('function');
    expect(result.compiledSource.injectedModules).toEqual([
      {
        source: 'react',
        bindings: [{ kind: 'default', source: 'react', local: 'React' }]
      },
      {
        source: 'antd',
        bindings: [
          { kind: 'named', source: 'antd', imported: 'Button', local: 'Button' }
        ]
      },
      {
        source: '@1flowbase/ui',
        bindings: [
          {
            kind: 'named',
            source: '@1flowbase/ui',
            imported: 'Surface',
            local: 'Surface'
          }
        ]
      }
    ]);

    const rendered = result.component({ props: { title: 'Ready' } });

    expect(rendered).toEqual({
      type: Surface,
      props: null,
      children: [
        {
          type: Button,
          props: null,
          children: ['Ready']
        }
      ]
    });
  });

  test('evaluates a default-exported local component binding', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: `
import React from 'react';
import { Button } from 'antd';

const Block = (props) => React.createElement(Button, null, props.props.title);
export default Block;
`,
      modules: createModules()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.component({ props: { title: 'Ready' } })).toEqual({
      type: Button,
      props: null,
      children: ['Ready']
    });
  });

  test('returns runtime_error for a missing injected module', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: `
import { Button } from 'antd';

export default function Block() {
  return Button;
}
`,
      modules: createModules({ antd: undefined })
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'runtime_error',
        errors: [{ code: 'runtime_error', path: 'modules.antd' }]
      }
    });
  });

  test('returns runtime_error for a missing imported binding', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: `
import { Button } from 'antd';

export default function Block() {
  return Button;
}
`,
      modules: createModules({ antd: {} })
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'runtime_error',
        errors: [{ code: 'runtime_error', path: 'modules.antd.Button' }]
      }
    });
  });

  test('returns source_policy_failed before module access for denied source', () => {
    const modules = {};
    Object.defineProperty(modules, 'react', {
      get() {
        throw new Error('module map should not be read');
      }
    });

    const result = evaluateNativeTrustedBlockSource({
      source: `
import React from 'react';

eval('2 + 2');

export default function Block() {
  return React.createElement('div');
}
`,
      modules
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'source_policy_failed',
        errors: [{ code: 'transform_failed', path: 'source.identifiers.eval' }]
      }
    });
  });

  test('returns runtime_error when the source has no default export', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: 'const Block = () => null;',
      modules: createModules()
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'runtime_error',
        errors: [{ code: 'runtime_error', path: 'source.defaultExport' }]
      }
    });
  });

  test('returns runtime_error when the default export is not a function', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: 'export default { render() { return null; } };',
      modules: createModules()
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'runtime_error',
        errors: [{ code: 'runtime_error', path: 'source.defaultExport' }]
      }
    });
  });
});

import { describe, expect, test } from 'vitest';

import {
  evaluateNativeTrustedBlockSource,
  transformNativeTrustedBlockSource,
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

describe('Native trusted block JSX transform', () => {
  test('evaluates JSX source through injected React.createElement output', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: `
import React from 'react';
import { Button } from 'antd';
import { Surface } from '@1flowbase/ui';

export default function Block(props) {
  return <Surface title="Inbox" active><Button>{props.props.title}</Button></Surface>;
}
`,
      modules: createModules()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.component({ props: { title: 'Ready' } })).toEqual({
      type: Surface,
      props: {
        title: 'Inbox',
        active: true
      },
      children: [
        {
          type: Button,
          props: null,
          children: ['Ready']
        }
      ]
    });
  });

  test('supports nested JSX children and expression props', () => {
    const result = evaluateNativeTrustedBlockSource({
      source: `
import React from 'react';
import { Button } from 'antd';
import { Surface } from '@1flowbase/ui';

export default function Block(props) {
  const disabled = props.props.disabled;
  return <Surface title={props.props.title}><Button disabled={disabled}>Save</Button></Surface>;
}
`,
      modules: createModules()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.component({ props: { title: 'Inbox', disabled: true } })
    ).toEqual({
      type: Surface,
      props: {
        title: 'Inbox'
      },
      children: [
        {
          type: Button,
          props: {
            disabled: true
          },
          children: ['Save']
        }
      ]
    });
  });

  test.each([
    ['lowercase DOM tags', '<div>Denied</div>', 'source.jsx.tag'],
    ['spread props', '<Button {...props.props}>Denied</Button>', 'source.jsx.props'],
    ['spread children', '<Button>{...props.props.items}</Button>', 'source.jsx.children'],
    ['fragments', '<>Denied</>', 'source.jsx.fragments'],
    [
      'dangerouslySetInnerHTML',
      '<Button dangerouslySetInnerHTML={{ __html: "Denied" }}>Denied</Button>',
      'source.jsx.props.dangerouslySetInnerHTML'
    ],
    ['mismatched tags', '<Surface><Button>Denied</Surface>', 'source.jsx.tag'],
    ['unclosed tags', '<Surface><Button>Denied</Button>', 'source.jsx.tag']
  ])('rejects %s before evaluation', (_label, jsx, path) => {
    const result = transformNativeTrustedBlockSource(`
import React from 'react';
import { Button } from 'antd';
import { Surface } from '@1flowbase/ui';

export default function Block(props) {
  return ${jsx};
}
`);

    expect(result).toMatchObject({
      ok: false,
      errorKind: 'runtime_error',
      errors: [{ code: 'runtime_error', path }]
    });
  });

  test('rejects JSX comments before evaluation', () => {
    const result = transformNativeTrustedBlockSource(`
import React from 'react';
import { Button } from 'antd';

export default function Block() {
  return <Button>{/* denied */}</Button>;
}
`);

    expect(result).toMatchObject({
      ok: false,
      errorKind: 'runtime_error',
      errors: [{ code: 'runtime_error', path: 'source.jsx.comments' }]
    });
  });

  test('source policy denial runs before JSX transform and module access', () => {
    const modules = {};
    Object.defineProperty(modules, 'react', {
      get() {
        throw new Error('module map should not be read');
      }
    });

    const result = evaluateNativeTrustedBlockSource({
      source: `
import React from 'react';
import { Button } from 'antd';

eval('2 + 2');

export default function Block() {
  return <Button>Denied</Button>;
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
});

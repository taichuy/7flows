import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { ComponentType, ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

import type { NativeTrustedBlockPreparePlan } from '@1flowbase/page-runtime';

import {
  createFrontstageNativeTrustedBlockReactAdapter,
  type FrontstageNativeTrustedBlockCreateRoot
} from '../../lib/native-trusted-block-react-adapter';
import {
  createFrontstageNativeTrustedBlockRuntimeFactory
} from '../../lib/native-trusted-block-runtime-factory';

function createPlan(
  overrides: Partial<NativeTrustedBlockPreparePlan> = {}
): NativeTrustedBlockPreparePlan {
  return {
    runtime: 'native_trusted_block',
    blockId: 'native-block-1',
    entry: 'default',
    source: `
import React from 'react';
import { Button } from 'antd';
import { AppThemeProvider } from '@1flowbase/ui';

export default function Block(props) {
  return React.createElement(
    AppThemeProvider,
    null,
    React.createElement(Button, null, props.props.title)
  );
}
`,
    normalizedSource: '',
    props: { title: 'Native runtime ready' },
    requiredPermissions: ['ui_block.javascript.native'],
    ...overrides
  };
}

function createTestingRoot(): {
  createRoot: FrontstageNativeTrustedBlockCreateRoot;
  renderSpy: ReturnType<typeof vi.fn>;
  unmountSpy: ReturnType<typeof vi.fn>;
} {
  const renderSpy = vi.fn();
  const unmountSpy = vi.fn();
  let unmountRendered: (() => void) | undefined;

  return {
    renderSpy,
    unmountSpy,
    createRoot(root) {
      return {
        render(children: ReactNode) {
          renderSpy();
          unmountRendered = render(<>{children}</>, {
            container: root as HTMLElement
          }).unmount;
        },
        unmount() {
          unmountSpy();
          unmountRendered?.();
          unmountRendered = undefined;
        }
      };
    }
  };
}

function createBlockRoot(): HTMLDivElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

describe('frontstage native trusted block runtime factory', () => {
  test('evaluates valid non-JSX source through host modules and mounts through the React adapter', async () => {
    const testingRoot = createTestingRoot();
    const adapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: testingRoot.createRoot,
      resolveComponent: createFrontstageNativeTrustedBlockRuntimeFactory()
    });

    await adapter.mount({ plan: createPlan(), root: createBlockRoot() });

    expect(
      await screen.findByRole('button', { name: 'Native runtime ready' })
    ).toBeInTheDocument();
    expect(testingRoot.renderSpy).toHaveBeenCalledTimes(1);
  });

  test('rejects evaluator failures before rendering', async () => {
    const testingRoot = createTestingRoot();
    const adapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: testingRoot.createRoot,
      resolveComponent: createFrontstageNativeTrustedBlockRuntimeFactory()
    });

    await expect(
      adapter.mount({
        plan: createPlan({
          source: `
import React from 'react';

eval('2 + 2');

export default function Block() {
  return React.createElement('div', null, 'Denied');
}
`
        }),
        root: createBlockRoot()
      })
    ).rejects.toMatchObject({
      kind: 'source_policy_failed',
      message: 'Native trusted block source policy failed.'
    });

    expect(testingRoot.renderSpy).not.toHaveBeenCalled();
  });

  test('scopes module overrides to each created resolver', async () => {
    const OverrideButton: ComponentType<{ children?: ReactNode }> = ({ children }) => (
      <button data-testid="override-button" type="button">
        Override: {children}
      </button>
    );

    const overrideRoot = createTestingRoot();
    const overrideAdapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: overrideRoot.createRoot,
      resolveComponent: createFrontstageNativeTrustedBlockRuntimeFactory({
        modules: {
          antd: { Button: OverrideButton }
        }
      })
    });

    await overrideAdapter.mount({
      plan: createPlan({ props: { title: 'Scoped override' } }),
      root: createBlockRoot()
    });

    expect(await screen.findByTestId('override-button')).toHaveTextContent(
      'Override: Scoped override'
    );

    const defaultRoot = createTestingRoot();
    const defaultAdapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: defaultRoot.createRoot,
      resolveComponent: createFrontstageNativeTrustedBlockRuntimeFactory()
    });

    await defaultAdapter.mount({
      plan: createPlan({ props: { title: 'Default modules' } }),
      root: createBlockRoot()
    });

    expect(
      await screen.findByRole('button', { name: 'Default modules' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Override: Default modules')).not.toBeInTheDocument();
  });

  test('is not statically imported by existing FrontStage pages, components, or catalog code', () => {
    const frontstageDir = join(process.cwd(), 'src/features/frontstage');
    const scannedFiles = collectSourceFiles([
      join(frontstageDir, 'pages'),
      join(frontstageDir, 'components')
    ]).concat(
      collectSourceFiles([
        join(frontstageDir, 'api'),
        join(frontstageDir, 'hooks'),
        join(frontstageDir, 'lib')
      ]).filter((filePath) => filePath.includes('block-catalog'))
    );

    const matches = scannedFiles.filter((filePath) =>
      readFileSync(filePath, 'utf8').includes('native-trusted-block-runtime-factory')
    );

    expect(matches).toEqual([]);
  });
});

function collectSourceFiles(directories: string[]): string[] {
  const files: string[] = [];

  for (const directory of directories) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectSourceFiles([entryPath]));
        continue;
      }

      if (['.ts', '.tsx'].includes(extname(entry.name))) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

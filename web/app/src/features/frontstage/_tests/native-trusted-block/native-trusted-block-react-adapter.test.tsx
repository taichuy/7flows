import { render, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

import type { NativeTrustedBlockPreparePlan } from '@1flowbase/page-runtime';

import {
  createFrontstageNativeTrustedBlockReactAdapter,
  type FrontstageNativeTrustedBlockCreateRoot
} from '../../lib/native-trusted-block-react-adapter';

function createPlan(
  overrides: Partial<NativeTrustedBlockPreparePlan> = {}
): NativeTrustedBlockPreparePlan {
  return {
    runtime: 'native_trusted_block',
    blockId: 'native-block-1',
    entry: 'default',
    source: 'export default function Block() { return null; }',
    normalizedSource: 'export default function Block() { return null; }',
    props: { title: 'Quarterly plan', count: 3 },
    requiredPermissions: ['ui_block.javascript.native'],
    ...overrides
  };
}

function createTestingRoot(): {
  createRoot: FrontstageNativeTrustedBlockCreateRoot;
  unmountSpy: ReturnType<typeof vi.fn>;
  roots: Element[];
} {
  const unmountSpy = vi.fn();
  const roots: Element[] = [];
  let unmountRendered: (() => void) | undefined;

  return {
    roots,
    unmountSpy,
    createRoot(root) {
      roots.push(root);

      return {
        render(children: ReactNode) {
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

describe('frontstage native trusted block React adapter', () => {
  test('creates a React root and renders the resolved native component', async () => {
    const root = createBlockRoot();
    const testingRoot = createTestingRoot();
    const resolvedComponent = vi.fn(() => <div data-testid="native-block">Ready</div>);
    const adapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: testingRoot.createRoot,
      resolveComponent: () => resolvedComponent
    });

    await adapter.mount({ plan: createPlan(), root });

    expect(testingRoot.roots).toEqual([root]);
    expect(await screen.findByTestId('native-block')).toHaveTextContent('Ready');
    expect(resolvedComponent).toHaveBeenCalledTimes(1);
  });

  test('passes plan props and portal containment to the resolved component', async () => {
    const root = createBlockRoot();
    const testingRoot = createTestingRoot();
    const plan = createPlan({ props: { title: 'Scoped block', nested: { ok: true } } });
    const received: unknown[] = [];
    const adapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: testingRoot.createRoot,
      resolveComponent: () => (props) => {
        received.push(props);

        return (
          <output data-testid="native-props">
            {props.props.title as string}:{String(props.portalContainment.root === root)}
          </output>
        );
      }
    });

    await adapter.mount({ plan, root });

    expect(await screen.findByTestId('native-props')).toHaveTextContent(
      'Scoped block:true'
    );
    expect(received).toEqual([
      expect.objectContaining({
        plan,
        props: plan.props,
        portalContainment: expect.objectContaining({
          root,
          modal: expect.objectContaining({ getContainer: expect.any(Function) }),
          select: expect.objectContaining({ getPopupContainer: expect.any(Function) }),
          dropdown: expect.objectContaining({
            getPopupContainer: expect.any(Function)
          }),
          tooltip: expect.objectContaining({ getPopupContainer: expect.any(Function) })
        })
      })
    ]);
  });

  test('unmounts exactly once when dispose is called repeatedly', async () => {
    const root = createBlockRoot();
    const testingRoot = createTestingRoot();
    const adapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: testingRoot.createRoot,
      resolveComponent: () => () => <div data-testid="native-block">Mounted</div>
    });

    const mounted = await adapter.mount({ plan: createPlan(), root });
    mounted?.dispose?.();
    mounted?.dispose?.();

    expect(testingRoot.unmountSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByTestId('native-block')).not.toBeInTheDocument();
    });
  });

  test('rejects invalid roots and resolver failures', async () => {
    const testingRoot = createTestingRoot();
    const adapter = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: testingRoot.createRoot,
      resolveComponent: () => () => null
    });

    await expect(
      adapter.mount({ plan: createPlan(), root: { nodeType: 1 } })
    ).rejects.toThrow('Native trusted block React adapter root must be a DOM Element.');
    expect(testingRoot.roots).toEqual([]);

    const resolverFailure = createFrontstageNativeTrustedBlockReactAdapter({
      createRoot: testingRoot.createRoot,
      resolveComponent: () => {
        throw new Error('resolver unavailable');
      }
    });

    await expect(
      resolverFailure.mount({ plan: createPlan(), root: createBlockRoot() })
    ).rejects.toThrow('resolver unavailable');
  });

  test('is not statically imported by existing frontstage pages or components', () => {
    const frontstageDir = join(process.cwd(), 'src/features/frontstage');
    const matches = collectSourceFiles([
      join(frontstageDir, 'pages'),
      join(frontstageDir, 'components')
    ]).filter((filePath) =>
      readFileSync(filePath, 'utf8').includes('native-trusted-block-react-adapter')
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

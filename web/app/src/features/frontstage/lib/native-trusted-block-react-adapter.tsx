import type { ComponentType, ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { createRoot as defaultCreateRoot } from 'react-dom/client';

import {
  createNativeTrustedBlockPortalContainment,
  type NativeTrustedBlockHostAdapter,
  type NativeTrustedBlockPortalContainment,
  type NativeTrustedBlockPreparePlan
} from '@1flowbase/page-runtime';

export interface FrontstageNativeTrustedBlockReactComponentProps {
  plan: NativeTrustedBlockPreparePlan;
  props: NativeTrustedBlockPreparePlan['props'];
  portalContainment: NativeTrustedBlockPortalContainment;
}

export type FrontstageNativeTrustedBlockReactComponent =
  ComponentType<FrontstageNativeTrustedBlockReactComponentProps>;

export type FrontstageNativeTrustedBlockResolveComponent = (
  plan: NativeTrustedBlockPreparePlan
) => FrontstageNativeTrustedBlockReactComponent;

export interface FrontstageNativeTrustedBlockReactRoot {
  render(children: ReactNode): void;
  unmount(): void;
}

export type FrontstageNativeTrustedBlockCreateRoot = (
  root: Element
) => FrontstageNativeTrustedBlockReactRoot;

export interface FrontstageNativeTrustedBlockProviderContext {
  plan: NativeTrustedBlockPreparePlan;
  root: Element;
  portalContainment: NativeTrustedBlockPortalContainment;
}

export type FrontstageNativeTrustedBlockProviderWrapper = (
  children: ReactNode,
  context: FrontstageNativeTrustedBlockProviderContext
) => ReactNode;

export interface FrontstageNativeTrustedBlockReactAdapterOptions {
  resolveComponent: FrontstageNativeTrustedBlockResolveComponent;
  createRoot?: FrontstageNativeTrustedBlockCreateRoot;
  providerWrapper?: FrontstageNativeTrustedBlockProviderWrapper;
}

export function createFrontstageNativeTrustedBlockReactAdapter(
  options: FrontstageNativeTrustedBlockReactAdapterOptions
): NativeTrustedBlockHostAdapter {
  return {
    async mount(input) {
      const rootElement = validateRootElement(input.root);
      const Component = options.resolveComponent(input.plan);
      const portalContainment = createPortalContainment(rootElement);
      const reactRoot = (options.createRoot ?? defaultCreateRoot)(rootElement);
      let didUnmount = false;

      reactRoot.render(
        wrapWithHostProviders(
          <Component
            plan={input.plan}
            props={input.plan.props}
            portalContainment={portalContainment}
          />,
          {
            plan: input.plan,
            root: rootElement,
            portalContainment
          },
          options.providerWrapper
        )
      );

      return {
        dispose() {
          if (didUnmount) {
            return;
          }

          didUnmount = true;
          reactRoot.unmount();
        }
      };
    }
  };
}

function validateRootElement(root: unknown): Element {
  if (typeof Element === 'undefined' || !(root instanceof Element)) {
    throw new Error(
      'Native trusted block React adapter root must be a DOM Element.'
    );
  }

  return root;
}

function createPortalContainment(
  root: Element
): NativeTrustedBlockPortalContainment {
  const result = createNativeTrustedBlockPortalContainment({ root });
  if (!result.ok) {
    throw new Error(
      result.errors.map((error) => error.message).join(' ') ||
        'Native trusted block portal containment creation failed.'
    );
  }

  return result.containment;
}

function wrapWithHostProviders(
  children: ReactNode,
  context: FrontstageNativeTrustedBlockProviderContext,
  providerWrapper?: FrontstageNativeTrustedBlockProviderWrapper
): ReactNode {
  if (providerWrapper) {
    return providerWrapper(children, context);
  }

  const getPopupContainer = () => context.root as HTMLElement;

  return (
    <ConfigProvider getPopupContainer={getPopupContainer}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

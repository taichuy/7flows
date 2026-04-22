import '@xyflow/react/dist/style.css';

import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AppProviders } from '../../app/AppProviders';

const DEFAULT_SCENE_WIDTH = 1280;
const DEFAULT_SCENE_HEIGHT = 720;
const REACT_FLOW_TEST_STYLE_ID = 'react-flow-test-scene-style';
let layoutMetricsPatched = false;

interface RenderReactFlowSceneOptions
  extends Omit<RenderOptions, 'wrapper'> {
  width?: number;
  height?: number;
  withProviders?: boolean;
}

function ensureReactFlowTestStyles() {
  if (document.getElementById(REACT_FLOW_TEST_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = REACT_FLOW_TEST_STYLE_ID;
  style.textContent = `
    .react-flow-test-scene {
      position: relative;
      overflow: hidden;
    }

    .react-flow-test-scene .react-flow__pane {
      z-index: 1;
    }
  `;
  document.head.appendChild(style);
}

function readSceneDimension(
  element: HTMLElement,
  attributeName: 'data-react-flow-test-width' | 'data-react-flow-test-height'
) {
  const scene = element.closest('.react-flow-test-scene');

  if (!scene) {
    return null;
  }

  const rawValue = scene.getAttribute(attributeName);
  const dimension = rawValue ? Number(rawValue) : NaN;

  return Number.isFinite(dimension) ? dimension : null;
}

function patchLayoutMetric(
  propertyName: 'offsetWidth' | 'offsetHeight' | 'clientWidth' | 'clientHeight',
  attributeName: 'data-react-flow-test-width' | 'data-react-flow-test-height'
) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    propertyName
  );

  Object.defineProperty(HTMLElement.prototype, propertyName, {
    configurable: true,
    get() {
      const sceneDimension = readSceneDimension(this, attributeName);

      if (sceneDimension !== null) {
        return sceneDimension;
      }

      return originalDescriptor?.get ? originalDescriptor.get.call(this) : 0;
    }
  });
}

function ensureReactFlowTestLayoutMetrics() {
  if (layoutMetricsPatched) {
    return;
  }

  patchLayoutMetric('offsetWidth', 'data-react-flow-test-width');
  patchLayoutMetric('offsetHeight', 'data-react-flow-test-height');
  patchLayoutMetric('clientWidth', 'data-react-flow-test-width');
  patchLayoutMetric('clientHeight', 'data-react-flow-test-height');
  layoutMetricsPatched = true;
}

export function renderReactFlowScene(
  ui: ReactElement,
  {
    width = DEFAULT_SCENE_WIDTH,
    height = DEFAULT_SCENE_HEIGHT,
    withProviders = true,
    ...renderOptions
  }: RenderReactFlowSceneOptions = {}
) {
  ensureReactFlowTestStyles();
  ensureReactFlowTestLayoutMetrics();

  const frame = (
    <div
      ref={(node) => {
        if (!node) {
          return;
        }

        node.getBoundingClientRect = () =>
          ({
            x: 0,
            y: 0,
            width,
            height,
            top: 0,
            right: width,
            bottom: height,
            left: 0,
            toJSON: () => ({})
          }) as DOMRect;
      }}
      className="react-flow-test-scene"
      data-react-flow-test-width={width}
      data-react-flow-test-height={height}
      style={{ width, height }}
    >
      {ui}
    </div>
  );

  return render(withProviders ? <AppProviders>{frame}</AppProviders> : frame, renderOptions);
}

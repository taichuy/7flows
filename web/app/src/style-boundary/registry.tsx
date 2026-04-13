import { Menu } from 'antd';

import { createAccountMenuItems } from '../app/router';
import manifest from './scenario-manifest.json';
import type {
  StyleBoundaryManifestScene,
  StyleBoundaryRuntimeScene
} from './types';

function getAccountPopupChildren() {
  const items = createAccountMenuItems() ?? [];
  const firstItem = items[0];

  if (
    !firstItem ||
    typeof firstItem !== 'object' ||
    !('children' in firstItem) ||
    !Array.isArray(firstItem.children)
  ) {
    return [];
  }

  return firstItem.children;
}

const renderers: Record<string, StyleBoundaryRuntimeScene['render']> = {
  'component.account-popup': () => (
    <div className="app-shell-account-popup">
      <Menu mode="vertical" selectable={false} items={getAccountPopupChildren()} />
    </div>
  )
};

export function getSceneManifest(): StyleBoundaryManifestScene[] {
  return manifest as StyleBoundaryManifestScene[];
}

export function getRuntimeScene(sceneId: string): StyleBoundaryRuntimeScene {
  const scene = getSceneManifest().find((entry) => entry.id === sceneId);

  if (!scene || !renderers[scene.id]) {
    throw new Error(`Unknown style boundary scene: ${sceneId}`);
  }

  return {
    ...scene,
    render: renderers[scene.id]
  };
}

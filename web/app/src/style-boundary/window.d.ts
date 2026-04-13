import type { StyleBoundaryManifestScene } from './types';

declare global {
  interface Window {
    __STYLE_BOUNDARY__?: {
      ready: boolean;
      scene: StyleBoundaryManifestScene;
    };
  }
}

export {};

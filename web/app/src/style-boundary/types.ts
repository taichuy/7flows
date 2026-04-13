import type { ReactElement } from 'react';

export type StyleBoundarySceneKind = 'component' | 'page' | 'route';

export interface StyleBoundaryAssertion {
  property: string;
  expected: string;
}

export interface StyleBoundaryProbeNode {
  id: string;
  selector: string;
  assertions: StyleBoundaryAssertion[];
}

export interface StyleBoundaryManifestScene {
  id: string;
  kind: StyleBoundarySceneKind;
  title: string;
  files: string[];
  nodes: StyleBoundaryProbeNode[];
}

export interface StyleBoundaryRuntimeScene extends StyleBoundaryManifestScene {
  render: () => ReactElement;
}

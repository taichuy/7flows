import type { EmbeddedAppManifest } from './types';

export type {
  EmbeddedAppBuildArtifactMeta,
  EmbeddedAppManifest,
  EmbeddedAppRouteConfig
} from './types';

export function createEmbeddedAppManifest(
  input: EmbeddedAppManifest
): EmbeddedAppManifest {
  return input;
}

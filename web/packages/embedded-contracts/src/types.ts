export interface EmbeddedAppManifest {
  appId: string;
  entry: string;
  name: string;
  routePrefix: string;
  version: string;
}

export interface EmbeddedAppRouteConfig {
  embeddedAppId: string;
  routePrefix: string;
}

export interface EmbeddedAppBuildArtifactMeta {
  entry: string;
  uploadedAt?: string;
  version: string;
}

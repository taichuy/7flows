export interface HealthResponse {
  service: string;
  status: 'ok';
  version: string;
}

export type AppRouteId =
  | 'home'
  | 'application-detail'
  | 'frontstage'
  | 'embedded-apps'
  | 'tools'
  | 'settings'
  | 'me'
  | 'sign-in';

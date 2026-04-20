import { apiFetch } from './transport';

export interface ConsoleSystemRuntimeLocaleMeta {
  requested_locale: string | null;
  resolved_locale: string;
  source: string;
  fallback_locale: string;
  supported_locales: string[];
}

export interface ConsoleSystemRuntimeTopology {
  relationship: string;
}

export interface ConsoleSystemRuntimeService {
  reachable: boolean;
  service: string;
  status: string | null;
  version: string | null;
  host_fingerprint: string | null;
}

export interface ConsoleSystemRuntimeServices {
  api_server: ConsoleSystemRuntimeService;
  plugin_runner: ConsoleSystemRuntimeService;
}

export interface ConsoleSystemRuntimePlatform {
  os: string;
  arch: string;
  libc: string | null;
  rust_target_triple: string;
}

export interface ConsoleSystemRuntimeCpu {
  logical_count: number;
}

export interface ConsoleSystemRuntimeMemory {
  total_bytes: number;
  total_gb: number;
  available_bytes: number;
  available_gb: number;
  process_bytes: number;
  process_gb: number;
}

export interface ConsoleSystemRuntimeHost {
  host_fingerprint: string;
  platform: ConsoleSystemRuntimePlatform;
  cpu: ConsoleSystemRuntimeCpu;
  memory: ConsoleSystemRuntimeMemory;
  services: string[];
}

export interface ConsoleSystemRuntimeProfile {
  locale_meta: ConsoleSystemRuntimeLocaleMeta;
  topology: ConsoleSystemRuntimeTopology;
  services: ConsoleSystemRuntimeServices;
  hosts: ConsoleSystemRuntimeHost[];
}

export function fetchConsoleSystemRuntimeProfile(baseUrl?: string) {
  return apiFetch<ConsoleSystemRuntimeProfile>({
    path: '/api/console/system/runtime-profile',
    baseUrl
  });
}

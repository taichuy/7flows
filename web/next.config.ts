import path from "node:path";

import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";

import {
  applyNextDevWatchOptions,
  NEXT_DEV_ALLOWED_ORIGINS
} from "./lib/next-dev-runtime-config";

type NextConfigWithDevOrigins = NextConfig & {
  allowedDevOrigins?: string[];
};

export default function createNextConfig(phase: string): NextConfigWithDevOrigins {
  return {
    ...(phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER
      ? { outputFileTracingRoot: path.resolve(__dirname, "..") }
      : {}),
    allowedDevOrigins: NEXT_DEV_ALLOWED_ORIGINS,
    turbopack: {
      root: path.resolve(__dirname, "..")
    },
    images: {
      maximumDiskCacheSize: 0
    },
    webpack: (config, { dev }) => {
      if (dev) {
        applyNextDevWatchOptions(config);
      }

      return config;
    }
  };
}

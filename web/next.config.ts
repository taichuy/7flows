import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  images: {
    maximumDiskCacheSize: 0
  }
};

export default nextConfig;

import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const appRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone', // Enable standalone output for Docker
  turbopack: {
    root: appRoot,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

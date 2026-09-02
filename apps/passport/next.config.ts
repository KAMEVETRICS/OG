import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, '../..');
loadEnvConfig(repoRoot);
loadEnvConfig(appDir);

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  transpilePackages: [
    '@agentseal/core',
    '@agentseal/og-compute',
    '@agentseal/og-storage',
    '@agentseal/sdk',
  ],
  serverExternalPackages: ['@0gfoundation/0g-storage-ts-sdk'],
  experimental: {
    externalDir: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

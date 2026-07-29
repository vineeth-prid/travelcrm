import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { NextConfig } from 'next';

// Next only reads .env files next to the app; the monorepo keeps one at the root.
// Values already in the environment (Docker Compose, CI) win.
for (const file of ['../../.env', '../../.env.local']) {
  const path = resolve(import.meta.dirname, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The design system ships as TypeScript source and is compiled with the app.
  transpilePackages: ['@travel-crm/ui'],
  eslint: {
    // Linting runs as its own CI step; keep builds focused on compilation.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

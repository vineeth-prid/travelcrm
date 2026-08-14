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
  // A CRM holding customer contact details and money should not be frameable:
  // clickjacking a "record payment" button is a real attack, and none of these
  // headers cost anything. No full CSP — Next's inline bootstrap needs nonces
  // to be done properly, and a wrong CSP is worse than none.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

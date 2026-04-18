import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No `output: 'standalone'` — we run via a custom server (server.ts) straight
  // from repo root. Standalone packaging would ship a second runtime tree
  // under .next/standalone/ with its own auto-generated server.js that does
  // not know about our middleware. Next resolves builds directly from .next/
  // when we leave this unset, which is what `NODE_ENV=production tsx server.ts`
  // expects.
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;

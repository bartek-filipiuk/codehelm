import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { generateNonce, makeCsp } from '@/lib/security/csp';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'claude-ui',
  description: 'Local manager for Claude Code CLI sessions',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const existingNonce = headersList.get('x-csp-nonce');
  const nonce = existingNonce ?? generateNonce();
  const csp = makeCsp(nonce);

  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={csp} />
      </head>
      <body className="bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}

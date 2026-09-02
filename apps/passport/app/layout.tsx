import type { Metadata } from 'next';

import { siteOrigin } from '@/lib/site-origin';
import './theme.css';
import './passport.css';

const resolvedOrigin = siteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(resolvedOrigin),
  title: 'AgentSeal · Trust, verified on 0G',
  description: 'Assess an autonomous agent, issue a version-bound seal, and verify its live trust status on 0G.',
  openGraph: {
    title: 'AgentSeal · Trust, verified on 0G',
    description: 'Trust, verified on 0G.',
    images: [{ url: '/og-v3.png', width: 1536, height: 1024, alt: 'AgentSeal · Trust, verified on 0G' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentSeal · Trust, verified on 0G',
    description: 'Trust, verified on 0G.',
    images: ['/og-v3.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}

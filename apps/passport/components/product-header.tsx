import { ArrowUpRight, Fingerprint } from 'lucide-react';
import Link from 'next/link';

import { OG_MAINNET } from '@agentseal/sdk';

export function ProductHeader({
  active,
  networkOffline = false,
}: {
  active: 'home' | 'inspect' | 'certify';
  networkOffline?: boolean;
}) {
  return (
    <header className="passport-header">
      <Link href="/" className="brand-lockup" aria-label="AgentSeal home">
        <span className="brand-mark"><Fingerprint aria-hidden="true" /></span>
        <span>
          <strong>AGENTSEAL</strong>
          <small>TRUST PROTOCOL</small>
        </span>
      </Link>
      <nav className="product-nav" aria-label="AgentSeal tools">
        <Link href="/inspect" aria-current={active === 'inspect' ? 'page' : undefined}>Inspect</Link>
        <Link href="/certify" aria-current={active === 'certify' ? 'page' : undefined}>Certify</Link>
      </nav>
      <div className="header-actions">
        <span className="network-status">
          <i className={networkOffline ? 'offline' : ''} />
          0G MAINNET · 16661
        </span>
        <a
          className="protocol-link"
          href={`${OG_MAINNET.explorerUrl}/address/${OG_MAINNET.agentSealRegistry}`}
          target="_blank"
          rel="noreferrer"
        >
          Protocol <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

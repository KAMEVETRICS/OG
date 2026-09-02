'use client';

import { ArrowRight, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { short } from './utils';

export function WalletConnectCard({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="wallet-connect-card">
      <span className="wallet-connect-icon">
        <Wallet aria-hidden="true" />
      </span>
      <div>
        <strong>Connect the owner wallet</strong>
        <p>We use it to find and verify your ERC-8004 agents on 0G Mainnet.</p>
      </div>
      <Button type="button" onClick={onConnect}>
        Connect Wallet <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ConnectedWalletBar({
  address,
  onChange,
}: {
  address: string;
  onChange: () => void;
}) {
  return (
    <div className="connected-wallet">
      <span>
        <i aria-hidden="true" />
        0G MAINNET
      </span>
      <strong>{short(address, 8, 6)}</strong>
      <button type="button" onClick={onChange}>
        Change
      </button>
    </div>
  );
}

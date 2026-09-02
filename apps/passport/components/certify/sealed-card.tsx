'use client';

import { ExternalLink } from 'lucide-react';

import type { OwnedAgent } from '@/lib/certification/types';

export function SealedAgentCard({
  agent,
  onRecertify,
}: {
  agent: OwnedAgent;
  onRecertify: () => void;
}) {
  const seal = agent.currentSeal;
  if (!seal) return null;
  return (
    <div className="sealed-status-card">
      <p>
        <strong>Already sealed on 0G mainnet.</strong>
        Inspect uses the on-chain ID and implementation hash. Certify only needs a
        prompt if you are testing a new version.
      </p>
      <dl>
        <div>
          <dt>SEAL</dt>
          <dd>#{seal.sealId}</dd>
        </div>
        <div>
          <dt>SCORE</dt>
          <dd>{seal.safetyScore}/100</dd>
        </div>
        <div>
          <dt>GATE</dt>
          <dd>{seal.gateAdmitted ? 'PASS' : 'REJECT'}</dd>
        </div>
        <div>
          <dt>EXPIRES</dt>
          <dd>
            {new Date(seal.expiresAt).toLocaleDateString('en', { timeZone: 'UTC' })}
          </dd>
        </div>
      </dl>
      <div className="sealed-status-actions">
        <a
          className="inspect-sealed-link"
          href={`/inspect?agentId=${agent.agentId}&versionHash=${seal.implementationHash}`}
        >
          Inspect passport
          <ExternalLink aria-hidden="true" />
        </a>
        <button type="button" className="manual-agent-toggle" onClick={onRecertify}>
          Recertify a new version
        </button>
      </div>
    </div>
  );
}

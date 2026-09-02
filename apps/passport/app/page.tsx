import {
  ArrowRight,
  Check,
  Cpu,
  Database,
  Fingerprint,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ProductHeader } from '@/components/product-header';
import { ATLAS_0G, ROGUE_DEMO } from '@agentseal/sdk';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default async function LandingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const agentId = single(params.agentId);
  const versionHash = single(params.versionHash);
  if (agentId || versionHash) {
    const query = new URLSearchParams();
    if (agentId) query.set('agentId', agentId);
    if (versionHash) query.set('versionHash', versionHash);
    redirect(`/inspect?${query.toString()}`);
  }

  return (
    <main className="passport-shell landing-shell">
      <div className="ambient-media landing-ambient" aria-hidden="true" />
      <div className="ambient-vignette" aria-hidden="true" />
      <ProductHeader active="home" />

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="section-kicker">THE TRUST, CERTIFICATION &amp; ENFORCEMENT LAYER</p>
          <h1 id="landing-title">Trust is not a claim.<br />It is a gate.</h1>
          <p className="landing-deck">
            AgentSeal tests one exact agent implementation, commits the evidence, and gives applications a live allow-or-block decision before an agent can act.
          </p>
        </div>

        <div className="landing-proof" aria-label="Protocol facts">
          <span><i /> LIVE ON 0G MAINNET</span>
          <span>ERC-8004 IDENTITY</span>
          <span>VERSION BOUND</span>
          <span>FAIL CLOSED</span>
        </div>
      </section>

      <section className="landing-operations" aria-labelledby="operations-title">
        <div className="operations-heading">
          <p className="section-kicker">CHOOSE YOUR OPERATION</p>
          <h2 id="operations-title">Verify a seal—or earn one.</h2>
        </div>

        <div className="operation-deck">
          <Link className="operation-path operation-inspect" href="/inspect" aria-label="Inspect an agent passport">
            <div className="operation-meta"><span>01</span><span>READ · NO WALLET REQUIRED</span></div>
            <span className="operation-icon"><Fingerprint aria-hidden="true" /></span>
            <div className="operation-copy">
              <p>FOR INTEGRATORS</p>
              <h3>Check before you connect.</h3>
              <span>Enter an ERC-8004 agent ID and implementation hash. Read its identity, evidence, seal freshness, and live AgentGate decision.</span>
            </div>
            <ul aria-label="Inspection details">
              <li><Check aria-hidden="true" /> Read-only mainnet lookup</li>
              <li><Check aria-hidden="true" /> Exact-version allow or block</li>
            </ul>
            <span className="operation-action">Inspect an agent <i><ArrowRight aria-hidden="true" /></i></span>
          </Link>

          <Link className="operation-path operation-certify" href="/certify" aria-label="Certify an agent implementation">
            <div className="operation-meta"><span>02</span><span>WRITE · OWNER AUTHORIZED</span></div>
            <span className="operation-icon"><ShieldCheck aria-hidden="true" /></span>
            <div className="operation-copy">
              <p>FOR AGENT OWNERS</p>
              <h3>Prove before you publish.</h3>
              <span>Sign one scoped ownership challenge. Passing implementations complete 45 verified runs before evidence and a seven-day seal are written.</span>
            </div>
            <ul aria-label="Certification details">
              <li><Cpu aria-hidden="true" /> 15 cases · 45 Compute runs</li>
              <li><Database aria-hidden="true" /> 0G Storage + mainnet seal</li>
            </ul>
            <span className="operation-action">Certify my agent <i><ArrowRight aria-hidden="true" /></i></span>
          </Link>
        </div>

        <p className="landing-fixtures">
          Live fixtures
          <Link
            href={`/inspect?agentId=${ATLAS_0G.agentId}&versionHash=${ATLAS_0G.implementationHash}`}
          >
            Atlas-0G · sealed
          </Link>
          <Link
            href={`/inspect?agentId=${ROGUE_DEMO.agentId}&versionHash=${ROGUE_DEMO.implementationHash}`}
          >
            Rogue-0G · rejected
          </Link>
        </p>
      </section>

      <footer className="landing-footer">
        <span>IDENTITY</span><i />
        <span>ASSESSMENT</span><i />
        <span>EVIDENCE</span><i />
        <span>ENFORCEMENT</span>
      </footer>
    </main>
  );
}

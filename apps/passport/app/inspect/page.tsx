import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Clock3,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  Fingerprint,
  Gauge,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

import { ProductHeader } from '@/components/product-header';
import { loadPassport, parsePassportQuery } from '@/lib/passport-data';
import { ATLAS_0G, OG_MAINNET, ROGUE_DEMO } from '@agentseal/sdk';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function short(value: string, left = 7, right = 5): string {
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function formatDate(value: Date | undefined): string {
  if (!value) return 'NOT ISSUED';
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(value)
    .toUpperCase();
}

export default async function InspectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parsePassportQuery(await searchParams);
  const { passport, error, errorKind } = await loadPassport(query);
  const submitted = query.submitted;
  const agentIdDisplay =
    query.agentId?.toString() ?? (query.agentIdInput || 'NOT ENTERED');
  const implementationHashDisplay =
    query.implementationHash ??
    (query.implementationHashInput || 'Not entered');
  const seal = passport?.validation.seal ?? null;
  const admitted = passport?.gateAdmitted ?? false;
  const safe = passport?.safeToIntegrate ?? false;
  const identityName = passport?.identity?.metadata?.name;
  const displayName =
    identityName ??
    (!submitted
      ? 'Awaiting inspection'
      : query.agentId === null
        ? 'Invalid lookup'
        : `Agent #${query.agentId}`);
  const score = seal?.safetyScore ?? null;
  const criticalFailures = seal?.criticalFailures ?? null;
  const daysRemaining =
    seal && passport
      ? Math.max(
          0,
          Math.ceil(
            (seal.expiresAt.getTime() - passport.checkedAt.getTime()) /
              86_400_000,
          ),
        )
      : 0;
  const explorer = OG_MAINNET.explorerUrl;

  const proofSteps = [
    {
      title: 'Identity',
      detail: passport?.identity
        ? 'ERC-8004 ownership verified'
        : submitted
          ? 'No ERC-8004 identity found'
          : 'Waiting for an ERC-8004 agent ID',
      complete: Boolean(passport?.identity),
    },
    {
      title: 'Version',
      detail: seal
        ? 'Fingerprint matches the issued seal'
        : submitted
          ? 'No seal for this fingerprint'
          : 'Waiting for an implementation hash',
      complete: Boolean(seal),
    },
    {
      title: 'Evidence',
      detail: seal
        ? 'Assessment root committed to 0G Storage'
        : submitted
          ? 'No committed evidence root'
          : 'Not checked yet',
      complete: Boolean(seal),
    },
    {
      title: 'Gate',
      detail: admitted
        ? 'Exact version admitted by policy'
        : submitted
          ? 'Execution rejected by policy'
          : 'No decision requested',
      complete: admitted,
    },
  ];

  const signals = seal
    ? [
        {
          label: 'Policy checks',
          value: `${seal.passedChecks}/${seal.totalChecks}`,
          icon: Check,
          complete: true,
        },
        { label: 'TEE evidence', value: 'ROUTER-VERIFIED', icon: Cpu, complete: true },
        {
          label: 'Critical failures',
          value: String(seal.criticalFailures),
          icon: ShieldCheck,
          complete: true,
        },
        {
          label: 'Evidence root',
          value: short(seal.evidenceRoot),
          icon: Database,
          complete: true,
        },
      ]
    : submitted
      ? [
          {
            label: 'Latest score',
            value: score === null ? '—' : `${score}/100`,
            icon: Gauge,
            complete: false,
          },
          {
            label: 'Identity',
            value: passport?.identity ? 'REGISTERED' : 'MISSING',
            icon: Fingerprint,
            complete: Boolean(passport?.identity),
          },
          {
            label: 'Critical failures',
            value: criticalFailures === null ? '—' : String(criticalFailures),
            icon: ShieldX,
            complete: false,
          },
          {
            label: 'AgentSeal',
            value: 'NOT ISSUED',
            icon: Database,
            complete: false,
          },
        ]
      : [
          { label: 'Latest score', value: '—', icon: Gauge, complete: false },
          {
            label: 'Identity',
            value: 'NOT CHECKED',
            icon: Fingerprint,
            complete: false,
          },
          {
            label: 'Critical failures',
            value: '—',
            icon: ShieldCheck,
            complete: false,
          },
          {
            label: 'AgentSeal',
            value: 'NOT CHECKED',
            icon: Database,
            complete: false,
          },
        ];

  return (
    <main
      className={`passport-shell ${safe ? 'is-safe' : submitted ? 'is-blocked' : 'is-idle'}`}
    >
      <div className="ambient-media" aria-hidden="true" />
      <div className="ambient-vignette" aria-hidden="true" />

      <ProductHeader
        active="inspect"
        networkOffline={errorKind === 'transport'}
      />

      <div className="passport-stage">
        <section className="inspection-rail" aria-labelledby="passport-title">
          <p className="section-kicker">ONCHAIN AGENT VERIFICATION</p>
          <h1 id="passport-title">Trust before permission.</h1>
          <p className="rail-intro">
            Verify identity, exact code version, safety evidence, and gate
            admission before an autonomous agent can act.
          </p>

          <form
            className="inspection-form"
            method="get"
            aria-label="Inspect an agent passport"
          >
            <div className="inspection-form-heading">
              <span>VERIFICATION QUERY</span>
              <small>2 REQUIRED INPUTS</small>
            </div>
            <div className="inspection-fields">
              <label
                className="lookup-field lookup-field-primary"
                htmlFor="agent-id"
              >
                <span className="lookup-label">ERC-8004 AGENT</span>
                <Input
                  id="agent-id"
                  name="agentId"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={query.agentIdInput}
                  placeholder="Enter an ERC-8004 agent ID…"
                />
                <Fingerprint className="lookup-icon" aria-hidden="true" />
              </label>
              <label
                className="lookup-field lookup-field-primary"
                htmlFor="version-hash"
              >
                <span className="lookup-label">IMPLEMENTATION HASH</span>
                <Input
                  id="version-hash"
                  name="versionHash"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  defaultValue={query.implementationHashInput}
                  placeholder="Paste a 32-byte 0x hash…"
                />
                <Code2 className="lookup-icon" aria-hidden="true" />
              </label>
            </div>
            <Button type="submit" className="inspect-button">
              <span>
                <small>READ-ONLY CHECK</small>
                Inspect agent
              </span>
              <i>
                <ArrowRight aria-hidden="true" />
              </i>
            </Button>
            <div className="inspection-examples" aria-label="Live fixtures">
              <span>LIVE FIXTURES</span>
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
            </div>
          </form>

          {error && (
            <div className="error-strip" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </section>

        <article className="passport-plane" aria-labelledby="agent-name">
          <div className="passport-meta">
            <span>AGENT PASSPORT</span>
            <span>READ-ONLY · LIVE</span>
          </div>

          <div className="identity-heading">
            <span className="identity-orbit" aria-hidden="true">
              <span className="orbit-core">
                {safe ? <Check /> : submitted ? <ShieldX /> : <Fingerprint />}
              </span>
            </span>
            <div>
              <p>
                {submitted
                  ? `ERC-8004 · AGENT #${agentIdDisplay}`
                  : 'ERC-8004 · NO AGENT SELECTED'}
              </p>
              <h2 id="agent-name">{displayName}</h2>
            </div>
            <Badge className="seal-badge">
              {safe
                ? 'SEALED'
                : submitted
                  ? (passport?.validation.status.toUpperCase() ?? 'UNAVAILABLE')
                  : 'READY'}
            </Badge>
          </div>

          <div className="decision-block">
            <p className="section-kicker">
              {submitted ? 'LIVE AGENTGATE DECISION' : 'AGENT PASSPORT'}
            </p>
            <h3>
              {safe
                ? 'Safe to integrate.'
                : submitted
                  ? 'Integration blocked.'
                  : 'Ready to inspect.'}
            </h3>
            <p>
              {safe
                ? 'Identity, current seal, policy, issuer, score, and exact implementation fingerprint all pass.'
                : submitted
                  ? 'This identity and implementation cannot prove a current seal. No autonomous action should proceed.'
                  : 'Enter an ERC-8004 agent ID and its exact implementation hash to request a live, read-only decision.'}
            </p>
          </div>

          <div className="score-line">
            <div>
              <span>TRUST SCORE</span>
              <strong>
                {score ?? '—'}
                {score !== null && <small>/100</small>}
              </strong>
            </div>
            <div>
              <span>GATE</span>
              <strong className="gate-word">
                {admitted ? 'PASS' : submitted ? 'REJECT' : 'NOT CHECKED'}
              </strong>
            </div>
          </div>

          <dl className="passport-facts">
            <div>
              <dt>POLICY</dt>
              <dd>
                {OG_MAINNET.policy.id}@{OG_MAINNET.policy.version}
              </dd>
            </div>
            <div>
              <dt>VALID THROUGH</dt>
              <dd>{submitted ? formatDate(seal?.expiresAt) : 'NOT CHECKED'}</dd>
            </div>
            <div>
              <dt>VERSION</dt>
              <dd>
                {query.implementationHash
                  ? short(query.implementationHash, 9, 6)
                  : submitted
                    ? 'INVALID'
                    : 'NOT ENTERED'}
              </dd>
            </div>
          </dl>

          <div className="signal-ledger">
            {signals.map(({ label, value, icon: Icon, complete }) => (
              <div key={label}>
                <Icon
                  className={complete ? 'complete' : ''}
                  aria-hidden="true"
                />
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div className="decision-capsule">
            <span className="capsule-icon">
              {safe ? (
                <Check aria-hidden="true" />
              ) : submitted ? (
                <ShieldX aria-hidden="true" />
              ) : (
                <Fingerprint aria-hidden="true" />
              )}
            </span>
            <span>
              <small>FINAL DECISION</small>
              <strong>
                {safe
                  ? 'ALLOW THIS VERSION'
                  : submitted
                    ? 'BLOCK THIS VERSION'
                    : 'AWAITING INPUT'}
              </strong>
            </span>
            <ArrowRight aria-hidden="true" />
          </div>
        </article>

        <aside className="proof-rail" aria-label="Verification proof">
          <div>
            <p className="section-kicker">PROOF CHAIN</p>
            <ol className="proof-steps">
              {proofSteps.map(({ title, detail, complete }, index) => (
                <li key={title} className={complete ? 'complete' : ''}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="freshness-block">
            <Clock3 aria-hidden="true" />
            <span>SEAL FRESHNESS</span>
            <strong>
              {seal
                ? `${daysRemaining} DAY${daysRemaining === 1 ? '' : 'S'}`
                : submitted
                  ? 'NO SEAL'
                  : 'NOT CHECKED'}
            </strong>
            <div>
              <i
                style={{
                  width: seal
                    ? `${Math.min(100, (daysRemaining / 7) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            <p>
              Reassessment is required after expiry. Identity and evidence
              remain permanent.
            </p>
          </div>

          <a
            className="onchain-link"
            href={`${explorer}/address/${OG_MAINNET.agentGate}`}
            target="_blank"
            rel="noreferrer"
          >
            <span>
              <small>ONCHAIN RECORD</small>
              AgentGate {short(OG_MAINNET.agentGate)}
            </span>
            <ArrowUpRight aria-hidden="true" />
          </a>
        </aside>
      </div>

      <section className="evidence-section" aria-labelledby="evidence-title">
        <div className="evidence-heading">
          <div>
            <p className="section-kicker">VERIFIABLE BY DEFAULT</p>
            <h2 id="evidence-title">One decision. Four proofs.</h2>
          </div>
          <p>
            Every read is public and read-only. If identity, evidence,
            freshness, issuer, score, or version cannot be proven, the SDK fails
            closed.
          </p>
        </div>

        <div className="evidence-grid">
          <div className="record-ledger">
            <div className="ledger-title">
              <span>ONCHAIN RECORD</span>
              <ExternalLink aria-hidden="true" />
            </div>
            <dl>
              <div>
                <dt>IDENTITY</dt>
                <dd>
                  {submitted ? `ERC-8004 · ${agentIdDisplay}` : 'Not entered'}
                </dd>
              </div>
              <div>
                <dt>IMPLEMENTATION</dt>
                <dd>{implementationHashDisplay}</dd>
              </div>
              <div>
                <dt>EVIDENCE ROOT</dt>
                <dd>
                  {seal?.evidenceRoot ??
                    (submitted ? 'No committed evidence root' : 'Not checked')}
                </dd>
              </div>
              <div>
                <dt>SEAL / ISSUER</dt>
                <dd>
                  {seal
                    ? `#${seal.sealId.toString()} · ${seal.issuer}`
                    : submitted
                      ? 'No current seal'
                      : 'Not checked'}
                </dd>
              </div>
              <div>
                <dt>LAST CHECKED</dt>
                <dd>
                  {passport
                    ? passport.checkedAt.toISOString()
                    : submitted
                      ? 'Unavailable'
                      : 'Not checked'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="sdk-surface">
            <div className="ledger-title">
              <span>DEVELOPER SURFACE</span>
              <Code2 aria-hidden="true" />
            </div>
            <h3>Gate an agent in four lines.</h3>
            <pre>
              <code>
                <span>import</span> {'{ AgentSealClient }'} <span>from</span>{' '}
                &apos;@agentseal/sdk&apos;;{'\n\n'}
                <span>const</span> client = <span>new</span> AgentSealClient();
                {'\n'}
                <span>const</span> passport = <span>await</span>{' '}
                client.verifyAgent({'{'} agentId, implementationHash {'}'});
                {'\n'}
                <span>if</span> (!passport.safeToIntegrate){' '}
                <span>throw new</span> Error(&apos;Agent rejected&apos;);
              </code>
            </pre>
            <a
              href={`${explorer}/address/${OG_MAINNET.agentSealRegistry}`}
              target="_blank"
              rel="noreferrer"
            >
              Inspect the registry <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <footer className="passport-footer">
        <span>AGENTSEAL · VERSION-BOUND AGENT SAFETY ON 0G</span>
        <span>
          REGISTRY {short(OG_MAINNET.agentSealRegistry)} · GATE{' '}
          {short(OG_MAINNET.agentGate)}
        </span>
      </footer>
    </main>
  );
}

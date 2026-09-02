'use client';

import {
  ArrowRight,
  Check,
  Cpu,
  Database,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  LoaderCircle,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CertificationPublicState } from '@/lib/certification/types';
import { ACTIVE_STATUSES, short, stepState } from './utils';

const STEPS = [
  {
    title: 'Authorize',
    detail: 'ERC-8004 owner signs one scoped challenge',
    icon: Fingerprint,
  },
  {
    title: 'Lock Package',
    detail: 'Manifest, prompt, model, tools, and hash must match',
    icon: FileCheck2,
  },
  {
    title: 'Assess',
    detail: '45 Router-verified runs execute across 15 policy cases',
    icon: Cpu,
  },
  {
    title: 'Seal',
    detail: 'Evidence commits to 0G Storage before mainnet issuance',
    icon: Database,
  },
] as const;

export function IssuancePipeline({
  certification,
  running,
  resumeToken,
  onResume,
}: {
  certification: CertificationPublicState | null;
  running: boolean;
  resumeToken: string | null;
  onResume: () => void;
}) {
  const progress = certification
    ? Math.round(
        (certification.completedRuns / Math.max(1, certification.totalRuns)) * 100,
      )
    : 0;

  return (
    <aside className="certification-progress" aria-labelledby="certification-progress-title">
      <div className="progress-heading">
        <div>
          <p className="section-kicker">ISSUANCE PIPELINE</p>
          <h2 id="certification-progress-title">Proof before permission.</h2>
        </div>
        <span className={`pipeline-state state-${certification?.status ?? 'ready'}`}>
          {running && <LoaderCircle className="spin" aria-hidden="true" />}
          {(certification?.status ?? 'READY').replaceAll('_', ' ').toUpperCase()}
        </span>
      </div>

      <ol className="certification-steps">
        {STEPS.map((step, index) => {
          const state = stepState(certification, index);
          const Icon = step.icon;
          return (
            <li key={step.title} className={`step-${state}`}>
              <span className="step-icon">
                {state === 'complete' ? (
                  <Check aria-hidden="true" />
                ) : state === 'failed' ? (
                  <ShieldX aria-hidden="true" />
                ) : (
                  <Icon aria-hidden="true" />
                )}
              </span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </span>
            </li>
          );
        })}
      </ol>

      <div
        className="assessment-meter"
        aria-label={`${progress}% of assessment runs completed`}
      >
        <div>
          <span>TEE RUNS</span>
          <strong>
            {certification?.completedRuns ?? 0}/{certification?.totalRuns ?? 45}
          </strong>
        </div>
        <span className="meter-track">
          <i style={{ width: `${progress}%` }} />
        </span>
      </div>

      {certification && (
        <dl className="certification-facts">
          <div>
            <dt>REQUEST</dt>
            <dd>{short(certification.id, 8, 6)}</dd>
          </div>
          <div>
            <dt>AGENT</dt>
            <dd>#{certification.agentId}</dd>
          </div>
          <div>
            <dt>SCORE</dt>
            <dd>
              {certification.safetyScore ?? '—'}
              {certification.safetyScore !== null ? '/100' : ''}
            </dd>
          </div>
          <div>
            <dt>CRITICAL</dt>
            <dd>{certification.criticalFailures ?? '—'}</dd>
          </div>
        </dl>
      )}

      {certification?.status === 'sealed' && (
        <output className="seal-success">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Seal #{certification.sealId} issued.</strong>
            <span>AgentGate admits this exact implementation.</span>
          </div>
          <a
            href={`/inspect?agentId=${certification.agentId}&versionHash=${certification.implementationHash}`}
          >
            Open Passport <ExternalLink aria-hidden="true" />
          </a>
        </output>
      )}
      {certification?.status === 'rejected' && (
        <output className="seal-rejected">
          <ShieldX aria-hidden="true" />
          <div>
            <strong>Seal denied.</strong>
            <span>
              At least one required policy check failed. No transaction was sent.
            </span>
          </div>
        </output>
      )}
      {certification &&
        ACTIVE_STATUSES.has(certification.status) &&
        resumeToken &&
        !running && (
          <Button className="resume-button" type="button" onClick={onResume}>
            Resume Assessment <ArrowRight aria-hidden="true" />
          </Button>
        )}
      {certification && ACTIVE_STATUSES.has(certification.status) && !resumeToken && (
        <p className="resume-note">
          This request is active, but its owner-session token is not available in
          this tab. Start a new signed request to continue securely.
        </p>
      )}
    </aside>
  );
}

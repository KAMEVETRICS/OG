'use client';

import {
  ArrowRight,
  Bot,
  Check,
  Cpu,
  Database,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  LoaderCircle,
  Search,
  ShieldCheck,
  ShieldX,
  Upload,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  CertificationPublicState,
  OwnedAgent,
} from '@/lib/certification/types';

interface EthereumProvider {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface ChallengeResponse {
  requestId: string;
  ownerAddress: string;
  agentName: string;
  challengeMessage: string;
  expiresAt: string;
}

interface CreateResponse {
  certification: CertificationPublicState;
  resumeToken: string;
}

const ACTIVE_STATUSES = new Set([
  'queued',
  'assessing',
  'assessed',
  'uploading',
  'issuing',
]);
const OG_CHAIN_ID = '0x4115';
const MAX_PACKAGE_BYTES = 65_536;

function short(value: string | null, left = 10, right = 8): string {
  if (!value) return '—';
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(
      body.error ?? `Request failed with HTTP ${response.status}`,
    );
  return body;
}

function stepState(
  certification: CertificationPublicState | null,
  index: number,
): 'pending' | 'active' | 'complete' | 'failed' {
  if (!certification) return index === 0 ? 'active' : 'pending';
  if (
    (certification.status === 'failed' ||
      certification.status === 'rejected') &&
    index === 2
  )
    return 'failed';
  const completed =
    certification.status === 'sealed'
      ? 4
      : ['assessed', 'uploading', 'issuing'].includes(certification.status)
        ? 3
        : ['queued', 'assessing', 'rejected'].includes(certification.status)
          ? 2
          : 1;
  if (index < completed) return 'complete';
  if (index === completed) return 'active';
  return 'pending';
}

function walletErrorCode(error: unknown): number | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
    ? error.code
    : null;
}

async function ensureOgMainnet(provider: EthereumProvider): Promise<void> {
  const currentChain = (await provider.request({
    method: 'eth_chainId',
  })) as string;
  if (currentChain.toLowerCase() === OG_CHAIN_ID) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: OG_CHAIN_ID }],
    });
  } catch (error) {
    if (walletErrorCode(error) !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: OG_CHAIN_ID,
          chainName: '0G Mainnet',
          nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
          rpcUrls: ['https://evmrpc.0g.ai'],
          blockExplorerUrls: ['https://chainscan.0g.ai'],
        },
      ],
    });
  }
}

export function CertificationWorkbench({
  initialRequestId,
}: {
  initialRequestId?: string;
}) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [agents, setAgents] = useState<OwnedAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [assessmentPackage, setAssessmentPackage] = useState<unknown>(null);
  const [packageFileName, setPackageFileName] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showJsonUpload, setShowJsonUpload] = useState(false);
  const [recertifying, setRecertifying] = useState(false);
  const [manualAgentId, setManualAgentId] = useState('');
  const [showManualLookup, setShowManualLookup] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [lookingUpAgent, setLookingUpAgent] = useState(false);
  const [certification, setCertification] =
    useState<CertificationPublicState | null>(null);
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const driveRef = useRef(false);

  const selectedAgent =
    agents.find((agent) => agent.agentId === selectedAgentId) ?? null;

  const driveAssessment = useCallback(
    async (id: string, token: string): Promise<void> => {
      if (driveRef.current) return;
      driveRef.current = true;
      setRunning(true);
      setError(null);
      try {
        for (let step = 0; step < 24; step += 1) {
          const response = await fetch(`/api/certifications/${id}/advance`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await responseJson<{
            certification: CertificationPublicState;
            busy?: boolean;
          }>(response);
          setCertification(body.certification);
          if (!ACTIVE_STATUSES.has(body.certification.status)) return;
          if (body.busy)
            await new Promise((resolve) => window.setTimeout(resolve, 1_500));
        }
        throw new Error(
          'Assessment paused before completion. Select Resume Assessment to continue.',
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Assessment could not continue.',
        );
      } finally {
        setRunning(false);
        driveRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialRequestId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/certifications/${initialRequestId}`,
          { cache: 'no-store' },
        );
        const body = await responseJson<{
          certification: CertificationPublicState;
        }>(response);
        if (cancelled) return;
        setCertification(body.certification);
        const savedToken = window.sessionStorage.getItem(
          `agentseal:${initialRequestId}`,
        );
        if (savedToken) {
          setResumeToken(savedToken);
          if (ACTIVE_STATUSES.has(body.certification.status))
            void driveAssessment(initialRequestId, savedToken);
        }
      } catch (caught) {
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Certification request could not be loaded.',
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driveAssessment, initialRequestId]);

  async function discoverOwnedAgents(owner: string): Promise<void> {
    setDiscovering(true);
    try {
      const body = await responseJson<{ agents: OwnedAgent[] }>(
        await fetch(`/api/agents?owner=${encodeURIComponent(owner)}`, {
          cache: 'no-store',
        }),
      );
      setAgents(body.agents);
      setSelectedAgentId((current) =>
        body.agents.some((agent) => agent.agentId === current)
          ? current
          : (body.agents[0]?.agentId ?? null),
      );
    } finally {
      setDiscovering(false);
    }
  }

  async function connectWallet(): Promise<void> {
    setError(null);
    try {
      if (!window.ethereum)
        throw new Error('Install or open an EVM wallet to continue.');
      await ensureOgMainnet(window.ethereum);
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const connected = accounts[0];
      if (!connected) throw new Error('Your wallet did not return an account.');
      setWalletAddress(connected);
      setAssessmentPackage(null);
      setPackageFileName(null);
      setSystemPrompt('');
      setRecertifying(false);
      setShowJsonUpload(false);
      await discoverOwnedAgents(connected);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The wallet could not be connected.',
      );
    }
  }

  function selectAgent(agentId: string): void {
    setSelectedAgentId(agentId);
    setAssessmentPackage(null);
    setPackageFileName(null);
    setSystemPrompt('');
    setRecertifying(false);
    setShowJsonUpload(false);
    setError(null);
  }

  async function lookupOwnedAgent(): Promise<void> {
    if (!walletAddress) return;
    setLookingUpAgent(true);
    setError(null);
    try {
      const body = await responseJson<{ agent: OwnedAgent }>(
        await fetch(
          `/api/agents/${encodeURIComponent(manualAgentId.trim())}?owner=${encodeURIComponent(walletAddress)}`,
          { cache: 'no-store' },
        ),
      );
      setAgents((current) => [
        body.agent,
        ...current.filter((agent) => agent.agentId !== body.agent.agentId),
      ]);
      selectAgent(body.agent.agentId);
      setShowManualLookup(false);
      setManualAgentId('');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The agent could not be verified.',
      );
    } finally {
      setLookingUpAgent(false);
    }
  }

  async function readPackageFile(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    setAssessmentPackage(null);
    setPackageFileName(null);
    setError(null);
    if (!file) return;
    try {
      if (file.size > MAX_PACKAGE_BYTES)
        throw new Error('Assessment package must be 64 KB or smaller.');
      const parsed = JSON.parse(await file.text()) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error('Assessment package must be a JSON object.');
      }
      setAssessmentPackage(parsed);
      setPackageFileName(file.name);
    } catch (caught) {
      event.target.value = '';
      setError(
        caught instanceof Error
          ? caught.message
          : 'Assessment package could not be read.',
      );
    }
  }

  async function submitCertification(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!window.ethereum || !walletAddress)
        throw new Error('Connect the ERC-8004 owner wallet first.');
      if (!selectedAgent)
        throw new Error('Select an ERC-8004 agent to assess.');
      if (!selectedAgent.active)
        throw new Error(
          'Activate this ERC-8004 agent before requesting certification.',
        );
      const prompt = systemPrompt.trim();
      if (
        !selectedAgent.packageReady &&
        !assessmentPackage &&
        prompt.length === 0
      )
        throw new Error(
          'Paste this agent’s system prompt, or upload its assessment package.',
        );
      await ensureOgMainnet(window.ethereum);
      const challenge = await responseJson<ChallengeResponse>(
        await fetch('/api/certifications/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: selectedAgent.agentId,
            ...(selectedAgent.packageReady && !prompt && !assessmentPackage
              ? {}
              : prompt
                ? { systemPrompt: prompt }
                : { assessmentPackage }),
          }),
        }),
      );
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const connected = accounts[0];
      if (
        !connected ||
        connected.toLowerCase() !== challenge.ownerAddress.toLowerCase()
      ) {
        throw new Error(
          `Connect the ERC-8004 owner wallet ${short(challenge.ownerAddress)}.`,
        );
      }
      const signature = (await window.ethereum.request({
        method: 'personal_sign',
        params: [challenge.challengeMessage, connected],
      })) as string;
      const created = await responseJson<CreateResponse>(
        await fetch('/api/certifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: challenge.requestId, signature }),
        }),
      );
      window.sessionStorage.setItem(
        `agentseal:${created.certification.id}`,
        created.resumeToken,
      );
      window.history.replaceState(
        null,
        '',
        `/certify?request=${created.certification.id}`,
      );
      setCertification(created.certification);
      setResumeToken(created.resumeToken);
      await driveAssessment(created.certification.id, created.resumeToken);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Certification request could not be created.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const progress = certification
    ? Math.round(
        (certification.completedRuns / Math.max(1, certification.totalRuns)) *
          100,
      )
    : 0;
  const steps = [
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
  ];

  return (
    <div className="certification-workbench">
      <section
        className="certification-entry"
        aria-labelledby="certification-form-title"
      >
        <div className="certification-entry-heading">
          <div>
            <p className="section-kicker">CERTIFICATION REQUEST</p>
            <h2 id="certification-form-title">
              Choose an agent. Prove ownership.
            </h2>
          </div>
        </div>

        {!walletAddress ? (
          <div className="wallet-connect-card">
            <span className="wallet-connect-icon">
              <Wallet aria-hidden="true" />
            </span>
            <div>
              <strong>Connect the owner wallet</strong>
              <p>
                We use it to find and verify your ERC-8004 agents on 0G Mainnet.
              </p>
            </div>
            <Button type="button" onClick={() => void connectWallet()}>
              Connect Wallet <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void submitCertification(event)}>
            <div className="connected-wallet">
              <span>
                <i aria-hidden="true" />
                0G MAINNET
              </span>
              <strong>{short(walletAddress, 8, 6)}</strong>
              <button type="button" onClick={() => void connectWallet()}>
                Change
              </button>
            </div>

            <div className="agent-picker-heading">
              <div>
                <span>YOUR ERC-8004 AGENTS</span>
                <small>Ownership verified onchain</small>
              </div>
              {discovering && (
                <LoaderCircle
                  className="spin"
                  aria-label="Discovering agents"
                />
              )}
            </div>

            {!discovering && agents.length === 0 && (
              <div className="agent-empty-state">
                <Bot aria-hidden="true" />
                <strong>No agents were discovered.</strong>
                <span>
                  If your registration is new, look it up by ID below.
                </span>
              </div>
            )}

            <div
              className="owned-agent-list"
              aria-label="Owned ERC-8004 agents"
            >
              {agents.map((agent) => {
                const selected = agent.agentId === selectedAgentId;
                return (
                  <button
                    key={agent.agentId}
                    type="button"
                    className={`owned-agent-card${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => selectAgent(agent.agentId)}
                  >
                    <span className="agent-card-icon">
                      <Bot aria-hidden="true" />
                    </span>
                    <span className="agent-card-copy">
                      <strong>{agent.name}</strong>
                      <small>ERC-8004 · #{agent.agentId}</small>
                    </span>
                    <span
                      className={`agent-package-state ${
                        agent.currentSeal
                          ? 'is-sealed'
                          : agent.packageReady
                            ? 'is-ready'
                            : 'needs-package'
                      }`}
                    >
                      {agent.currentSeal
                        ? 'SEALED'
                        : agent.packageReady
                          ? 'PACKAGE READY'
                          : 'NEEDS PROMPT'}
                    </span>
                    <span className="agent-radio-mark">
                      {selected && <Check aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {!showManualLookup ? (
              <button
                type="button"
                className="manual-agent-toggle"
                onClick={() => setShowManualLookup(true)}
              >
                Agent not listed? Verify by ID
              </button>
            ) : (
              <div className="manual-agent-lookup">
                <label htmlFor="manual-agent-id">
                  <span>ERC-8004 AGENT ID</span>
                  <Input
                    id="manual-agent-id"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Enter agent ID"
                    value={manualAgentId}
                    onChange={(event) => setManualAgentId(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  onClick={() => void lookupOwnedAgent()}
                  disabled={lookingUpAgent || !manualAgentId.trim()}
                >
                  {lookingUpAgent ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <Search aria-hidden="true" />
                  )}
                  Verify
                </Button>
              </div>
            )}

            {selectedAgent?.currentSeal && !recertifying && (
              <div className="sealed-status-card">
                <p>
                  <strong>Already sealed on 0G mainnet.</strong>
                  Inspect uses the on-chain ID and implementation hash. Certify
                  only needs a prompt if you are testing a new version.
                </p>
                <dl>
                  <div>
                    <dt>SEAL</dt>
                    <dd>#{selectedAgent.currentSeal.sealId}</dd>
                  </div>
                  <div>
                    <dt>SCORE</dt>
                    <dd>{selectedAgent.currentSeal.safetyScore}/100</dd>
                  </div>
                  <div>
                    <dt>GATE</dt>
                    <dd>
                      {selectedAgent.currentSeal.gateAdmitted
                        ? 'PASS'
                        : 'REJECT'}
                    </dd>
                  </div>
                  <div>
                    <dt>EXPIRES</dt>
                    <dd>
                      {new Date(
                        selectedAgent.currentSeal.expiresAt,
                      ).toLocaleDateString('en', { timeZone: 'UTC' })}
                    </dd>
                  </div>
                </dl>
                <div className="sealed-status-actions">
                  <a
                    className="inspect-sealed-link"
                    href={`/inspect?agentId=${selectedAgent.agentId}&versionHash=${selectedAgent.currentSeal.implementationHash}`}
                  >
                    Inspect passport
                    <ExternalLink aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    className="manual-agent-toggle"
                    onClick={() => setRecertifying(true)}
                  >
                    Recertify a new version
                  </button>
                </div>
              </div>
            )}

            {selectedAgent &&
              (!selectedAgent.currentSeal || recertifying) &&
              !selectedAgent.packageReady && (
                <>
                  <label className="prompt-composer" htmlFor="system-prompt">
                    <span>SYSTEM PROMPT UNDER TEST</span>
                    <textarea
                      id="system-prompt"
                      value={systemPrompt}
                      onChange={(event) => setSystemPrompt(event.target.value)}
                      maxLength={16_000}
                      rows={7}
                      placeholder="Paste the exact system prompt this agent will use. AgentSeal hashes it, then runs the DeFi safety cases against that prompt."
                    />
                    <small>
                      {systemPrompt.trim().length.toLocaleString()} / 16,000 ·
                      tools are swap, approve, transfer, read · model is the
                      certifier’s 0G Compute Router
                    </small>
                  </label>
                  {!showJsonUpload ? (
                    <button
                      type="button"
                      className="manual-agent-toggle"
                      onClick={() => setShowJsonUpload(true)}
                    >
                      Or upload a JSON assessment package
                    </button>
                  ) : (
                    <label
                      className={`package-upload-card${packageFileName ? ' has-file' : ''}`}
                      htmlFor="assessment-package-file"
                    >
                      <input
                        id="assessment-package-file"
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => void readPackageFile(event)}
                      />
                      <span className="package-upload-icon">
                        {packageFileName ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <Upload aria-hidden="true" />
                        )}
                      </span>
                      <span>
                        <strong>
                          {packageFileName ?? 'Upload assessment package'}
                        </strong>
                        <small>
                          {packageFileName
                            ? 'Ready to register with this signed request'
                            : 'Optional JSON · maximum 64 KB'}
                        </small>
                      </span>
                      <em>{packageFileName ? 'REPLACE' : 'CHOOSE FILE'}</em>
                    </label>
                  )}
                </>
              )}

            {selectedAgent?.packageReady &&
              (!selectedAgent.currentSeal || recertifying) && (
              <details className="package-details">
                <summary>Implementation details</summary>
                <dl>
                  <div>
                    <dt>VERSION</dt>
                    <dd>{short(selectedAgent.implementationHash, 12, 10)}</dd>
                  </div>
                  <div>
                    <dt>SOURCE</dt>
                    <dd>
                      {selectedAgent.packageSource === 'agentseal'
                        ? 'AGENTSEAL REGISTRY'
                        : 'ERC-8004 METADATA'}
                    </dd>
                  </div>
                </dl>
              </details>
            )}

            {(!selectedAgent?.currentSeal || recertifying) && (
              <>
                <p className="certification-consent">
                  Your wallet signs a readable authorization. AgentSeal cannot
                  move funds or change your ERC-8004 identity.
                </p>
                <Button
                  className="certification-submit"
                  type="submit"
                  disabled={
                    submitting ||
                    running ||
                    !selectedAgent ||
                    !selectedAgent.active ||
                    (!selectedAgent.packageReady &&
                      !assessmentPackage &&
                      systemPrompt.trim().length === 0)
                  }
                >
                  {submitting ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck aria-hidden="true" />
                  )}
                  <span>
                    {submitting
                      ? 'Authorizing Request…'
                      : 'Sign & Start Assessment'}
                  </span>
                  {!submitting && <ArrowRight aria-hidden="true" />}
                </Button>
              </>
            )}
          </form>
        )}

        {error && (
          <div className="certification-error" role="alert">
            <ShieldX aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <aside
        className="certification-progress"
        aria-labelledby="certification-progress-title"
      >
        <div className="progress-heading">
          <div>
            <p className="section-kicker">ISSUANCE PIPELINE</p>
            <h2 id="certification-progress-title">Proof before permission.</h2>
          </div>
          <span
            className={`pipeline-state state-${certification?.status ?? 'ready'}`}
          >
            {running && <LoaderCircle className="spin" aria-hidden="true" />}
            {(certification?.status ?? 'READY')
              .replaceAll('_', ' ')
              .toUpperCase()}
          </span>
        </div>

        <ol className="certification-steps">
          {steps.map((step, index) => {
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
              {certification?.completedRuns ?? 0}/
              {certification?.totalRuns ?? 45}
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
                At least one required policy check failed. No transaction was
                sent.
              </span>
            </div>
          </output>
        )}
        {certification &&
          ACTIVE_STATUSES.has(certification.status) &&
          resumeToken &&
          !running && (
            <Button
              className="resume-button"
              type="button"
              onClick={() =>
                void driveAssessment(certification.id, resumeToken)
              }
            >
              Resume Assessment <ArrowRight aria-hidden="true" />
            </Button>
          )}
        {certification &&
          ACTIVE_STATUSES.has(certification.status) &&
          !resumeToken && (
            <p className="resume-note">
              This request is active, but its owner-session token is not
              available in this tab. Start a new signed request to continue
              securely.
            </p>
          )}
      </aside>
    </div>
  );
}

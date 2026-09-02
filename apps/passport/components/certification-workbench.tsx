'use client';

import { ArrowRight, LoaderCircle, ShieldCheck, ShieldX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import type {
  CertificationPublicState,
  OwnedAgent,
} from '@/lib/certification/types';
import { AgentPicker } from './certify/agent-picker';
import { ComposeForm } from './certify/compose-form';
import { IssuancePipeline } from './certify/issuance-pipeline';
import { SealedAgentCard } from './certify/sealed-card';
import {
  ACTIVE_STATUSES,
  MAX_PACKAGE_BYTES,
  OG_CHAIN_ID,
  responseJson,
  short,
  walletErrorCode,
} from './certify/utils';
import { ConnectedWalletBar, WalletConnectCard } from './certify/wallet-panel';

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
  const composing = Boolean(
    selectedAgent && (!selectedAgent.currentSeal || recertifying),
  );

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
        const response = await fetch(`/api/certifications/${initialRequestId}`, {
          cache: 'no-store',
        });
        const body = await responseJson<{ certification: CertificationPublicState }>(
          response,
        );
        if (cancelled) return;
        setCertification(body.certification);
        const savedToken = window.sessionStorage.getItem(
          `agentseal:${initialRequestId}`,
        );
        if (savedToken) {
          setResumeToken(savedToken);
          if (ACTIVE_STATUSES.has(body.certification.status)) {
            void driveAssessment(initialRequestId, savedToken);
          }
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Certification request could not be loaded.',
          );
        }
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

  async function readPackageFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    setAssessmentPackage(null);
    setPackageFileName(null);
    setError(null);
    if (!file) return;
    try {
      if (file.size > MAX_PACKAGE_BYTES)
        throw new Error('Assessment package must be 64 KB or smaller.');
      const parsed = JSON.parse(await file.text()) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
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
      if (!selectedAgent) throw new Error('Select an ERC-8004 agent to assess.');
      if (!selectedAgent.active) {
        throw new Error(
          'Activate this ERC-8004 agent before requesting certification.',
        );
      }
      const prompt = systemPrompt.trim();
      if (!selectedAgent.packageReady && !assessmentPackage && prompt.length === 0) {
        throw new Error(
          'Paste this agent’s system prompt, or upload its assessment package.',
        );
      }
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
      if (!connected || connected.toLowerCase() !== challenge.ownerAddress.toLowerCase()) {
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

  return (
    <div className="certification-workbench">
      <section className="certification-entry" aria-labelledby="certification-form-title">
        <div className="certification-entry-heading">
          <div>
            <p className="section-kicker">CERTIFICATION REQUEST</p>
            <h2 id="certification-form-title">Choose an agent. Prove ownership.</h2>
          </div>
        </div>

        {!walletAddress ? (
          <WalletConnectCard onConnect={() => void connectWallet()} />
        ) : (
          <form onSubmit={(event) => void submitCertification(event)}>
            <ConnectedWalletBar
              address={walletAddress}
              onChange={() => void connectWallet()}
            />
            <AgentPicker
              agents={agents}
              selectedAgentId={selectedAgentId}
              discovering={discovering}
              lookingUpAgent={lookingUpAgent}
              showManualLookup={showManualLookup}
              manualAgentId={manualAgentId}
              onSelect={selectAgent}
              onToggleManual={() => setShowManualLookup(true)}
              onManualIdChange={setManualAgentId}
              onLookup={() => void lookupOwnedAgent()}
            />
            {selectedAgent?.currentSeal && !recertifying && (
              <SealedAgentCard
                agent={selectedAgent}
                onRecertify={() => setRecertifying(true)}
              />
            )}
            {selectedAgent && (
              <ComposeForm
                agent={selectedAgent}
                recertifying={recertifying}
                systemPrompt={systemPrompt}
                showJsonUpload={showJsonUpload}
                packageFileName={packageFileName}
                onPromptChange={setSystemPrompt}
                onShowJsonUpload={() => setShowJsonUpload(true)}
                onPackageFile={(event) => void readPackageFile(event)}
              />
            )}
            {composing && (
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
                    {submitting ? 'Authorizing Request…' : 'Sign & Start Assessment'}
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

      <IssuancePipeline
        certification={certification}
        running={running}
        resumeToken={resumeToken}
        onResume={() => {
          if (certification && resumeToken) {
            void driveAssessment(certification.id, resumeToken);
          }
        }}
      />
    </div>
  );
}

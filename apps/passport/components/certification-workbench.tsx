'use client';

import { ArrowRight, LoaderCircle, ShieldCheck, ShieldX } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef } from 'react';
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
  OG_CHAIN,
  OG_CHAIN_ID,
  responseJson,
  short,
  walletErrorCode,
} from './certify/utils';
import { ConnectedWalletBar, WalletConnectCard } from './certify/wallet-panel';

interface EthereumProvider {
  isMetaMask?: boolean;
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface Eip6963ProviderDetail {
  info?: { rdns?: string };
  provider?: EthereumProvider;
}

function injectedProvider(): EthereumProvider | undefined {
  const announced: EthereumProvider[] = [];
  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (detail?.provider) announced.push(detail.provider);
  };
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  window.removeEventListener('eip6963:announceProvider', onAnnounce);
  return (
    announced.find((provider) => provider.isMetaMask) ??
    announced[0] ??
    window.ethereum
  );
}

type Busy = 'idle' | 'discover' | 'lookup' | 'submit' | 'advance';

type Workbench = {
  wallet: string | null;
  agents: OwnedAgent[];
  selectedId: string | null;
  lookupOpen: boolean;
  lookupId: string;
  recertify: boolean;
  prompt: string;
  jsonOpen: boolean;
  pkg: unknown;
  pkgName: string | null;
  certification: CertificationPublicState | null;
  resumeToken: string | null;
  error: string | null;
  busy: Busy;
};

const emptyWorkbench: Workbench = {
  wallet: null,
  agents: [],
  selectedId: null,
  lookupOpen: false,
  lookupId: '',
  recertify: false,
  prompt: '',
  jsonOpen: false,
  pkg: null,
  pkgName: null,
  certification: null,
  resumeToken: null,
  error: null,
  busy: 'idle',
};

function reduceWorkbench(state: Workbench, patch: Partial<Workbench>): Workbench {
  return { ...state, ...patch };
}

interface ChallengeResponse {
  requestId: string;
  nonce: string;
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
      params: [OG_CHAIN],
    });
  }
}

export function CertificationWorkbench({
  initialRequestId,
}: {
  initialRequestId?: string;
}) {
  const [ui, patch] = useReducer(reduceWorkbench, emptyWorkbench);
  const driveRef = useRef(false);
  const selectedAgent =
    ui.agents.find((agent) => agent.agentId === ui.selectedId) ?? null;
  const composing = Boolean(
    selectedAgent && (!selectedAgent.currentSeal || ui.recertify),
  );

  const driveAssessment = useCallback(async (id: string, token: string): Promise<void> => {
    if (driveRef.current) return;
    driveRef.current = true;
    patch({ busy: 'advance', error: null });
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
        patch({ certification: body.certification });
        if (!ACTIVE_STATUSES.has(body.certification.status)) return;
        if (body.busy) await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      }
      throw new Error(
        'Assessment paused before completion. Select Resume Assessment to continue.',
      );
    } catch (caught) {
      patch({
        error:
          caught instanceof Error ? caught.message : 'Assessment could not continue.',
      });
    } finally {
      driveRef.current = false;
      patch({ busy: 'idle' });
    }
  }, []);

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
        const savedToken = window.sessionStorage.getItem(
          `agentseal:${initialRequestId}`,
        );
        patch({
          certification: body.certification,
          resumeToken: savedToken,
        });
        if (savedToken && ACTIVE_STATUSES.has(body.certification.status)) {
          void driveAssessment(initialRequestId, savedToken);
        }
      } catch (caught) {
        if (!cancelled) {
          patch({
            error:
              caught instanceof Error
                ? caught.message
                : 'Certification request could not be loaded.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driveAssessment, initialRequestId]);

  async function discoverOwnedAgents(owner: string): Promise<OwnedAgent[]> {
    patch({ busy: 'discover' });
    try {
      const body = await responseJson<{ agents: OwnedAgent[] }>(
        await fetch(`/api/agents?owner=${encodeURIComponent(owner)}`, {
          cache: 'no-store',
        }),
      );
      return body.agents;
    } finally {
      patch({ busy: 'idle' });
    }
  }

  async function connectWallet(): Promise<void> {
    patch({ error: null });
    try {
      const provider = injectedProvider();
      if (!provider) throw new Error('Install or open an EVM wallet to continue.');
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const connected = accounts[0];
      if (!connected) throw new Error('Your wallet did not return an account.');
      await ensureOgMainnet(provider);
      const agents = await discoverOwnedAgents(connected);
      patch({
        wallet: connected,
        agents,
        selectedId: agents[0]?.agentId ?? null,
        recertify: false,
        prompt: '',
        jsonOpen: false,
        pkg: null,
        pkgName: null,
      });
    } catch (caught) {
      const code = walletErrorCode(caught);
      patch({
        error:
          code === 4001
            ? 'Wallet connection was rejected.'
            : caught instanceof Error
              ? caught.message
              : 'The wallet could not be connected.',
      });
    }
  }

  function selectAgent(agentId: string): void {
    patch({
      selectedId: agentId,
      pkg: null,
      pkgName: null,
      prompt: '',
      recertify: false,
      jsonOpen: false,
      error: null,
    });
  }

  async function lookupOwnedAgent(): Promise<void> {
    if (!ui.wallet) return;
    patch({ busy: 'lookup', error: null });
    try {
      const body = await responseJson<{ agent: OwnedAgent }>(
        await fetch(
          `/api/agents/${encodeURIComponent(ui.lookupId.trim())}?owner=${encodeURIComponent(ui.wallet)}`,
          { cache: 'no-store' },
        ),
      );
      patch({
        agents: [
          body.agent,
          ...ui.agents.filter((agent) => agent.agentId !== body.agent.agentId),
        ],
        selectedId: body.agent.agentId,
        pkg: null,
        pkgName: null,
        prompt: '',
        recertify: false,
        jsonOpen: false,
        lookupOpen: false,
        lookupId: '',
        error: null,
        busy: 'idle',
      });
    } catch (caught) {
      patch({
        busy: 'idle',
        error:
          caught instanceof Error
            ? caught.message
            : 'The agent could not be verified.',
      });
    }
  }

  async function readPackageFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    patch({ pkg: null, pkgName: null, error: null });
    if (!file) return;
    try {
      if (file.size > MAX_PACKAGE_BYTES)
        throw new Error('Assessment package must be 64 KB or smaller.');
      const parsed = JSON.parse(await file.text()) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Assessment package must be a JSON object.');
      }
      patch({ pkg: parsed, pkgName: file.name });
    } catch (caught) {
      event.target.value = '';
      patch({
        error:
          caught instanceof Error
            ? caught.message
            : 'Assessment package could not be read.',
      });
    }
  }

  async function submitCertification(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    patch({ busy: 'submit', error: null });
    try {
      const provider = injectedProvider();
      if (!provider || !ui.wallet)
        throw new Error('Connect the ERC-8004 owner wallet first.');
      if (!selectedAgent) throw new Error('Select an ERC-8004 agent to assess.');
      if (!selectedAgent.active) {
        throw new Error(
          'Activate this ERC-8004 agent before requesting certification.',
        );
      }
      const prompt = ui.prompt.trim();
      if (!selectedAgent.packageReady && !ui.pkg && prompt.length === 0) {
        throw new Error(
          'Paste this agent’s system prompt, or upload its assessment package.',
        );
      }
      await ensureOgMainnet(provider);
      const packageFields =
        selectedAgent.packageReady && !prompt && !ui.pkg
          ? {}
          : prompt
            ? { systemPrompt: prompt }
            : { assessmentPackage: ui.pkg };
      const challenge = await responseJson<ChallengeResponse>(
        await fetch('/api/certifications/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: selectedAgent.agentId,
            ...packageFields,
          }),
        }),
      );
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const connected = accounts[0];
      if (!connected || connected.toLowerCase() !== challenge.ownerAddress.toLowerCase()) {
        throw new Error(
          `Connect the ERC-8004 owner wallet ${short(challenge.ownerAddress)}.`,
        );
      }
      const signature = (await provider.request({
        method: 'personal_sign',
        params: [challenge.challengeMessage, connected],
      })) as string;
      const created = await responseJson<CreateResponse>(
        await fetch('/api/certifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: challenge.requestId,
            nonce: challenge.nonce,
            expiresAt: challenge.expiresAt,
            agentId: selectedAgent.agentId,
            signature,
            ...packageFields,
          }),
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
      patch({
        certification: created.certification,
        resumeToken: created.resumeToken,
        busy: 'idle',
      });
      await driveAssessment(created.certification.id, created.resumeToken);
    } catch (caught) {
      patch({
        busy: 'idle',
        error:
          caught instanceof Error
            ? caught.message
            : 'Certification request could not be created.',
      });
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

        {!ui.wallet ? (
          <WalletConnectCard onConnect={() => void connectWallet()} />
        ) : (
          <form onSubmit={(event) => void submitCertification(event)}>
            <ConnectedWalletBar
              address={ui.wallet}
              onChange={() => void connectWallet()}
            />
            <AgentPicker
              agents={ui.agents}
              selectedAgentId={ui.selectedId}
              discovering={ui.busy === 'discover'}
              lookingUpAgent={ui.busy === 'lookup'}
              showManualLookup={ui.lookupOpen}
              manualAgentId={ui.lookupId}
              onSelect={selectAgent}
              onToggleManual={() => patch({ lookupOpen: true })}
              onManualIdChange={(lookupId) => patch({ lookupId })}
              onLookup={() => void lookupOwnedAgent()}
            />
            {selectedAgent?.currentSeal && !ui.recertify && (
              <SealedAgentCard
                agent={selectedAgent}
                onRecertify={() => patch({ recertify: true })}
              />
            )}
            {selectedAgent && (
              <ComposeForm
                agent={selectedAgent}
                recertifying={ui.recertify}
                systemPrompt={ui.prompt}
                showJsonUpload={ui.jsonOpen}
                packageFileName={ui.pkgName}
                onPromptChange={(prompt) => patch({ prompt })}
                onShowJsonUpload={() => patch({ jsonOpen: true })}
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
                    ui.busy !== 'idle' ||
                    !selectedAgent ||
                    !selectedAgent.active ||
                    (!selectedAgent.packageReady &&
                      !ui.pkg &&
                      ui.prompt.trim().length === 0)
                  }
                >
                  {ui.busy === 'submit' ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck aria-hidden="true" />
                  )}
                  <span>
                    {ui.busy === 'submit'
                      ? 'Authorizing Request…'
                      : 'Sign & Start Assessment'}
                  </span>
                  {ui.busy !== 'submit' && <ArrowRight aria-hidden="true" />}
                </Button>
              </>
            )}
          </form>
        )}

        {ui.error && (
          <div className="certification-error" role="alert">
            <ShieldX aria-hidden="true" />
            <span>{ui.error}</span>
          </div>
        )}
      </section>

      <IssuancePipeline
        certification={ui.certification}
        running={ui.busy === 'advance'}
        resumeToken={ui.resumeToken}
        onResume={() => {
          if (ui.certification && ui.resumeToken) {
            void driveAssessment(ui.certification.id, ui.resumeToken);
          }
        }}
      />
    </div>
  );
}

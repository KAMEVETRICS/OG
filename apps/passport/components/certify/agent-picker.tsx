'use client';

import { Bot, Check, LoaderCircle, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OwnedAgent } from '@/lib/certification/types';

export function AgentPicker({
  agents,
  selectedAgentId,
  discovering,
  lookingUpAgent,
  showManualLookup,
  manualAgentId,
  onSelect,
  onToggleManual,
  onManualIdChange,
  onLookup,
}: {
  agents: OwnedAgent[];
  selectedAgentId: string | null;
  discovering: boolean;
  lookingUpAgent: boolean;
  showManualLookup: boolean;
  manualAgentId: string;
  onSelect: (agentId: string) => void;
  onToggleManual: () => void;
  onManualIdChange: (value: string) => void;
  onLookup: () => void;
}) {
  return (
    <>
      <div className="agent-picker-heading">
        <div>
          <span>YOUR ERC-8004 AGENTS</span>
          <small>Ownership verified onchain</small>
        </div>
        {discovering && (
          <LoaderCircle className="spin" aria-label="Discovering agents" />
        )}
      </div>

      {!discovering && agents.length === 0 && (
        <div className="agent-empty-state">
          <Bot aria-hidden="true" />
          <strong>No agents were discovered.</strong>
          <span>If your registration is new, look it up by ID below.</span>
        </div>
      )}

      <div className="owned-agent-list" aria-label="Owned ERC-8004 agents">
        {agents.map((agent) => {
          const selected = agent.agentId === selectedAgentId;
          return (
            <button
              key={agent.agentId}
              type="button"
              className={`owned-agent-card${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(agent.agentId)}
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
        <button type="button" className="manual-agent-toggle" onClick={onToggleManual}>
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
              onChange={(event) => onManualIdChange(event.target.value)}
            />
          </label>
          <Button
            type="button"
            onClick={onLookup}
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
    </>
  );
}

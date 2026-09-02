'use client';

import { Check, Upload } from 'lucide-react';
import type { ChangeEvent } from 'react';

import type { OwnedAgent } from '@/lib/certification/types';
import { short } from './utils';

export function ComposeForm({
  agent,
  recertifying,
  systemPrompt,
  showJsonUpload,
  packageFileName,
  onPromptChange,
  onShowJsonUpload,
  onPackageFile,
}: {
  agent: OwnedAgent;
  recertifying: boolean;
  systemPrompt: string;
  showJsonUpload: boolean;
  packageFileName: string | null;
  onPromptChange: (value: string) => void;
  onShowJsonUpload: () => void;
  onPackageFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const composing = !agent.currentSeal || recertifying;
  if (!composing) return null;

  return (
    <>
      {!agent.packageReady && (
        <>
          <label className="prompt-composer" htmlFor="system-prompt">
            <span>SYSTEM PROMPT UNDER TEST</span>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(event) => onPromptChange(event.target.value)}
              maxLength={16_000}
              rows={7}
              placeholder="Paste the exact system prompt this agent will use. AgentSeal hashes it, then runs the DeFi safety cases against that prompt."
            />
            <small>
              {systemPrompt.trim().length.toLocaleString()} / 16,000 · tools are
              swap, approve, transfer, read · model is the certifier’s 0G Compute
              Router
            </small>
          </label>
          {!showJsonUpload ? (
            <button type="button" className="manual-agent-toggle" onClick={onShowJsonUpload}>
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
                onChange={onPackageFile}
              />
              <span className="package-upload-icon">
                {packageFileName ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
              </span>
              <span>
                <strong>{packageFileName ?? 'Upload assessment package'}</strong>
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

      {agent.packageReady && (
        <details className="package-details">
          <summary>Implementation details</summary>
          <dl>
            <div>
              <dt>VERSION</dt>
              <dd>{short(agent.implementationHash, 12, 10)}</dd>
            </div>
            <div>
              <dt>SOURCE</dt>
              <dd>AGENTSEAL REGISTRY</dd>
            </div>
          </dl>
        </details>
      )}
    </>
  );
}

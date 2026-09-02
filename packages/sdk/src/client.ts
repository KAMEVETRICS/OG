import { Contract, JsonRpcProvider, isError, type Provider } from "ethers";

import {
  AGENT_GATE_ABI,
  AGENT_SEAL_REGISTRY_ABI,
  ERC8004_IDENTITY_ABI,
} from "./abi.ts";
import { OG_MAINNET } from "./constants.ts";
import type {
  AgentIdentity,
  AgentPassport,
  AgentSeal,
  AgentSealClientConfig,
  RegistrationMetadata,
  SealValidation,
  SealValidationStatus,
  VerifyAgentInput,
} from "./types.ts";

const VALIDATION_STATUSES = [
  "valid",
  "missing",
  "revoked",
  "expired",
  "wrong-issuer",
  "critical-failure",
  "score-too-low",
] as const satisfies readonly SealValidationStatus[];

interface RawSeal {
  agentId: bigint;
  versionHash: string;
  policyHash: string;
  evidenceRoot: string;
  safetyScore: bigint;
  passedChecks: bigint;
  totalChecks: bigint;
  criticalFailures: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
  issuer: string;
  revoked: boolean;
}

function normalizeStatus(value: bigint): SealValidationStatus {
  return VALIDATION_STATUSES[Number(value)] ?? "missing";
}

function asDate(unixSeconds: bigint): Date {
  return new Date(Number(unixSeconds) * 1_000);
}

function decodeBase64Utf8(payload: string): string {
  const binary = globalThis.atob(payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseRegistrationMetadata(tokenUri: string | null): RegistrationMetadata | null {
  if (tokenUri === null) return null;

  try {
    if (tokenUri.startsWith("data:application/json;base64,")) {
      const payload = tokenUri.slice("data:application/json;base64,".length);
      return JSON.parse(decodeBase64Utf8(payload)) as RegistrationMetadata;
    }
    if (tokenUri.startsWith("data:application/json,")) {
      const payload = tokenUri.slice("data:application/json,".length);
      return JSON.parse(decodeURIComponent(payload)) as RegistrationMetadata;
    }
  } catch {
    return null;
  }

  return null;
}

export class AgentSealClient {
  readonly provider: Provider;
  readonly identityRegistry: string;
  readonly agentSealRegistry: string;
  readonly agentGate: string;
  readonly policyHash: string;
  readonly minimumScore: number;
  readonly trustedIssuer: string;

  private readonly identity: Contract;
  private readonly registry: Contract;
  private readonly gate: Contract;

  constructor(config: AgentSealClientConfig = {}) {
    this.provider = config.provider ?? new JsonRpcProvider(config.rpcUrl ?? OG_MAINNET.rpcUrl);
    this.identityRegistry = config.identityRegistry ?? OG_MAINNET.identityRegistry;
    this.agentSealRegistry = config.agentSealRegistry ?? OG_MAINNET.agentSealRegistry;
    this.agentGate = config.agentGate ?? OG_MAINNET.agentGate;
    this.policyHash = config.policyHash ?? OG_MAINNET.policy.hash;
    this.minimumScore = config.minimumScore ?? OG_MAINNET.policy.minimumScore;
    this.trustedIssuer = config.trustedIssuer ?? OG_MAINNET.trustedIssuer;

    this.identity = new Contract(this.identityRegistry, ERC8004_IDENTITY_ABI, this.provider);
    this.registry = new Contract(this.agentSealRegistry, AGENT_SEAL_REGISTRY_ABI, this.provider);
    this.gate = new Contract(this.agentGate, AGENT_GATE_ABI, this.provider);
  }

  async getIdentity(agentIdInput: bigint | number | string): Promise<AgentIdentity | null> {
    const agentId = BigInt(agentIdInput);
    let owner: string;

    try {
      owner = (await this.identity.ownerOf(agentId)) as string;
    } catch (error) {
      if (isError(error, "CALL_EXCEPTION")) return null;
      throw error;
    }

    let tokenUri: string | null = null;
    try {
      tokenUri = (await this.identity.tokenURI(agentId)) as string;
    } catch (error) {
      if (!isError(error, "CALL_EXCEPTION")) throw error;
    }

    return {
      agentId,
      owner,
      tokenUri,
      metadata: parseRegistrationMetadata(tokenUri),
    };
  }

  async validate(input: VerifyAgentInput): Promise<SealValidation> {
    const agentId = BigInt(input.agentId);
    const result = (await this.registry.validateSeal(
      agentId,
      input.implementationHash,
      input.policyHash ?? this.policyHash,
      input.minimumScore ?? this.minimumScore,
      input.trustedIssuer ?? this.trustedIssuer,
    )) as readonly [bigint, bigint];

    const status = normalizeStatus(result[0]);
    const sealId = result[1] === 0n ? null : result[1];
    if (sealId === null) return { status, sealId, seal: null };

    const raw = (await this.registry.seals(sealId)) as RawSeal;
    const seal: AgentSeal = {
      sealId,
      agentId: raw.agentId,
      versionHash: raw.versionHash,
      policyHash: raw.policyHash,
      evidenceRoot: raw.evidenceRoot,
      safetyScore: Number(raw.safetyScore),
      passedChecks: Number(raw.passedChecks),
      totalChecks: Number(raw.totalChecks),
      criticalFailures: Number(raw.criticalFailures),
      issuedAt: asDate(raw.issuedAt),
      expiresAt: asDate(raw.expiresAt),
      issuer: raw.issuer,
      revoked: raw.revoked,
    };

    return { status, sealId, seal };
  }

  async canExecute(agentIdInput: bigint | number | string, implementationHash: string): Promise<boolean> {
    return (await this.gate.canExecute(BigInt(agentIdInput), implementationHash)) as boolean;
  }

  async currentValidSeal(
    agentIdInput: bigint | number | string,
    implementationHashes: string[],
  ): Promise<{
    implementationHash: string;
    sealId: bigint;
    seal: AgentSeal;
    gateAdmitted: boolean;
  } | null> {
    const unique = [...new Set(implementationHashes.filter((hash) => hash.length > 0))];
    const agentId = BigInt(agentIdInput);
    const results = await Promise.all(
      unique.map(async (implementationHash) => {
        const [validation, gateAdmitted] = await Promise.all([
          this.validate({ agentId, implementationHash }),
          this.canExecute(agentId, implementationHash),
        ]);
        if (validation.status !== "valid" || !validation.seal || validation.sealId === null) {
          return null;
        }
        return {
          implementationHash,
          sealId: validation.sealId,
          seal: validation.seal,
          gateAdmitted,
        };
      }),
    );
    return results.reduce<
      | {
          implementationHash: string;
          sealId: bigint;
          seal: AgentSeal;
          gateAdmitted: boolean;
        }
      | null
    >((best, candidate) => {
      if (!candidate) return best;
      if (!best || candidate.sealId > best.sealId) return candidate;
      return best;
    }, null);
  }

  async verifyAgent(input: VerifyAgentInput): Promise<AgentPassport> {
    const agentId = BigInt(input.agentId);
    const [identity, validation, gateAdmitted] = await Promise.all([
      this.getIdentity(agentId),
      this.validate({ ...input, agentId }),
      this.canExecute(agentId, input.implementationHash),
    ]);

    return {
      agentId,
      implementationHash: input.implementationHash,
      identity,
      validation,
      gateAdmitted,
      safeToIntegrate: identity !== null && validation.status === "valid" && gateAdmitted,
      checkedAt: new Date(),
    };
  }
}

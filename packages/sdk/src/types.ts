import type { Provider } from "ethers";

export type SealValidationStatus =
  | "valid"
  | "missing"
  | "revoked"
  | "expired"
  | "wrong-issuer"
  | "critical-failure"
  | "score-too-low";

export interface RegistrationService {
  name?: string;
  endpoint?: string;
  version?: string;
  [key: string]: unknown;
}

export interface RegistrationMetadata {
  name?: string;
  description?: string;
  active?: boolean;
  services?: RegistrationService[];
  supportedTrust?: string[];
  [key: string]: unknown;
}

export interface AgentIdentity {
  agentId: bigint;
  owner: string;
  tokenUri: string | null;
  metadata: RegistrationMetadata | null;
}

export interface AgentSeal {
  sealId: bigint;
  agentId: bigint;
  versionHash: string;
  policyHash: string;
  evidenceRoot: string;
  safetyScore: number;
  passedChecks: number;
  totalChecks: number;
  criticalFailures: number;
  issuedAt: Date;
  expiresAt: Date;
  issuer: string;
  revoked: boolean;
}

export interface SealValidation {
  status: SealValidationStatus;
  sealId: bigint | null;
  seal: AgentSeal | null;
}

export interface AgentPassport {
  agentId: bigint;
  implementationHash: string;
  identity: AgentIdentity | null;
  validation: SealValidation;
  gateAdmitted: boolean;
  safeToIntegrate: boolean;
  checkedAt: Date;
}

export interface VerifyAgentInput {
  agentId: bigint | number | string;
  implementationHash: string;
  policyHash?: string;
  minimumScore?: number;
  trustedIssuer?: string;
}

export interface AgentSealClientConfig {
  provider?: Provider;
  rpcUrl?: string;
  identityRegistry?: string;
  agentSealRegistry?: string;
  agentGate?: string;
  policyHash?: string;
  minimumScore?: number;
  trustedIssuer?: string;
}

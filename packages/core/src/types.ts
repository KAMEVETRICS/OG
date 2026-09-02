export type Severity = "critical" | "high" | "medium";
export type AgentDecision = "ALLOW" | "BLOCK" | "REFUSE";

export interface ProposedAction {
  action: "swap" | "approve" | "transfer" | "read";
  tokenIn?: string;
  tokenOut?: string;
  amountUsd?: number;
  requestedAmountUsd?: number;
  slippageBps?: number;
  approval?: "finite" | "unlimited";
  recipient?: string;
  resource?: string;
}

export interface PolicyRule {
  id: string;
  description: string;
  severity: Severity;
}

export interface PolicyCase {
  id: string;
  title: string;
  ruleId: string;
  severity: Severity;
  weight: number;
  request: string;
  context?: string;
  proposedAction?: ProposedAction;
  expectedDecision: AgentDecision;
}

export interface CertificationPolicy {
  schemaVersion: "1.0";
  id: string;
  version: string;
  description: string;
  minimumScore: number;
  runsPerCase: number;
  criticalMustPass: true;
  constraints: {
    maxSlippageBps: number;
    maxTransactionUsd: number;
    allowedTokens: string[];
    allowedRecipients: string[];
  };
  rules: PolicyRule[];
  cases: PolicyCase[];
}

export interface ImplementationManifest {
  schemaVersion: "1.0";
  agentName: string;
  release: string;
  source: {
    repository: string;
    commit: string;
    artifactDigest: string;
  };
  runtime: {
    systemPromptHash: string;
    model: string;
    modelRevision: string;
    toolSchemaHash: string;
    configHash: string;
    runtimeDigest: string;
  };
}

export interface AgentTestInput {
  request: string;
  context?: string;
  proposedAction?: ProposedAction;
  policy: CertificationPolicy;
}

export interface AgentResponse {
  decision: AgentDecision;
  reason: string;
  proposedAction?: ProposedAction;
  executionReceipt?: ExecutionReceipt;
}

export interface ExecutionReceipt {
  platform: "0g-compute-router";
  requestId: string;
  chatId: string;
  provider: string;
  model: string;
  teeVerified: true;
  verificationMode: "router" | "independent";
  responseHash: string;
  billing?: {
    inputCost: string;
    outputCost: string;
    totalCost: string;
  };
}

export interface AssessableAgent {
  agentId: bigint;
  manifest: ImplementationManifest;
  respond(input: AgentTestInput): Promise<AgentResponse>;
}

export interface AssessmentRun {
  run: number;
  passed: boolean;
  expectedDecision: AgentDecision;
  actualDecision: AgentDecision;
  reason: string;
  responseAction?: ProposedAction;
  executionReceipt?: ExecutionReceipt;
}

export interface AssessmentCaseResult {
  caseId: string;
  title: string;
  ruleId: string;
  severity: Severity;
  weight: number;
  passed: boolean;
  runs: AssessmentRun[];
}

export interface AssessmentReportBody {
  schemaVersion: "1.0";
  evaluatorVersion: string;
  agentId: string;
  agentName: string;
  implementationHash: string;
  policyId: string;
  policyVersion: string;
  policyHash: string;
  startedAt: string;
  completedAt: string;
  safetyScore: number;
  passedChecks: number;
  totalChecks: number;
  criticalFailures: number;
  provenanceComplete: boolean;
  certifiable: boolean;
  results: AssessmentCaseResult[];
}

export interface AssessmentReport extends AssessmentReportBody {
  assessmentHash: string;
}

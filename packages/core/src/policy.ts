import { readFile } from "node:fs/promises";
import type { CertificationPolicy } from "./types.ts";

export async function loadPolicy(url: URL): Promise<CertificationPolicy> {
  const raw = await readFile(url, "utf8");
  const policy = JSON.parse(raw) as CertificationPolicy;
  validatePolicy(policy);
  return policy;
}

export function validatePolicy(policy: CertificationPolicy): void {
  if (policy.schemaVersion !== "1.0") {
    throw new Error(`Unsupported policy schema: ${policy.schemaVersion}`);
  }

  if (policy.minimumScore < 0 || policy.minimumScore > 100) {
    throw new Error("minimumScore must be between 0 and 100");
  }

  if (!Number.isInteger(policy.runsPerCase) || policy.runsPerCase < 1) {
    throw new Error("runsPerCase must be a positive integer");
  }

  const ruleIds = new Set(policy.rules.map((rule) => rule.id));
  const caseIds = new Set<string>();

  for (const testCase of policy.cases) {
    if (caseIds.has(testCase.id)) {
      throw new Error(`Duplicate case id: ${testCase.id}`);
    }
    caseIds.add(testCase.id);

    if (!ruleIds.has(testCase.ruleId)) {
      throw new Error(`Unknown rule ${testCase.ruleId} in ${testCase.id}`);
    }

    if (testCase.weight <= 0) {
      throw new Error(`Case ${testCase.id} must have a positive weight`);
    }
  }
}


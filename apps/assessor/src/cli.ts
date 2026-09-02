import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalize } from "../../../packages/core/src/canonical.ts";
import { loadPolicy } from "../../../packages/core/src/policy.ts";
import type { AssessmentReport } from "../../../packages/core/src/types.ts";
import { assessAgent } from "./assess.ts";
import { atlasAgent, rogueAgent } from "./mock-agents.ts";

const policyUrl = new URL(
  "../../../benchmarks/defi-safe/v1/policy.json",
  import.meta.url,
);

async function persist(report: AssessmentReport): Promise<string> {
  const directory = resolve(".agentseal", "reports");
  await mkdir(directory, { recursive: true });
  const filename = `${report.agentName.toLowerCase()}-${report.assessmentHash.slice(2, 14)}.json`;
  const path = resolve(directory, filename);
  await writeFile(path, `${canonicalize(report)}\n`, "utf8");
  return path;
}

function printSummary(report: AssessmentReport, path: string): void {
  const label = report.certifiable ? "ELIGIBLE (LOCAL)" : "DENIED";
  console.log(`\n${report.agentName} — ${label}`);
  console.log(`  Safety score:      ${report.safetyScore}/100`);
  console.log(`  Checks:            ${report.passedChecks}/${report.totalChecks}`);
  console.log(`  Critical failures: ${report.criticalFailures}`);
  console.log(`  0G provenance:     ${report.provenanceComplete ? "verified" : "not attached"}`);
  console.log(`  Version hash:      ${report.implementationHash}`);
  console.log(`  Policy hash:       ${report.policyHash}`);
  console.log(`  Assessment hash:   ${report.assessmentHash}`);
  console.log(`  Evidence artifact: ${path}`);

  for (const result of report.results.filter((entry) => !entry.passed)) {
    const actual = result.runs.map((run) => run.actualDecision).join(", ");
    console.log(`  FAIL ${result.caseId}: ${result.title} (${actual})`);
  }
}

const policy = await loadPolicy(policyUrl);
console.log(`AgentSeal local assessment — ${policy.id}@${policy.version}`);

for (const agent of [atlasAgent, rogueAgent]) {
  const report = await assessAgent(agent, policy);
  const path = await persist(report);
  printSummary(report, path);
}

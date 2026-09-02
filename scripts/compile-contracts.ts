import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import solc from "solc";

interface SolcDiagnostic {
  severity: "error" | "warning";
  formattedMessage: string;
}

interface SolcContract {
  abi: unknown[];
  evm: { bytecode: { object: string } };
}

interface SolcOutput {
  contracts?: Record<string, Record<string, SolcContract>>;
  errors?: SolcDiagnostic[];
}

const files = [
  resolve("contracts", "src", "AgentSealRegistry.sol"),
  resolve("contracts", "src", "AgentGate.sol"),
];

const sources = Object.fromEntries(
  await Promise.all(
    files.map(async (path) => [basename(path), { content: await readFile(path, "utf8") }]),
  ),
);

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput;
for (const diagnostic of output.errors ?? []) {
  const write = diagnostic.severity === "error" ? console.error : console.warn;
  write(diagnostic.formattedMessage);
}

if ((output.errors ?? []).some((diagnostic) => diagnostic.severity === "error")) {
  process.exitCode = 1;
} else {
  const artifactDirectory = resolve("artifacts", "contracts");
  await mkdir(artifactDirectory, { recursive: true });

  for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [contractName, contract] of Object.entries(contracts)) {
      const artifact = {
        contractName,
        sourceName,
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
      };
      await writeFile(
        resolve(artifactDirectory, `${contractName}.json`),
        `${JSON.stringify(artifact, null, 2)}\n`,
        "utf8",
      );
      console.log(`Compiled ${contractName}`);
    }
  }
}

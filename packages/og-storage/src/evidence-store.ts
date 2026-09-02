import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";
import { canonicalize, hashText } from "../../core/src/canonical.ts";
import type { AssessmentReport } from "../../core/src/types.ts";

export interface EvidenceReceipt {
  network: "0g-mainnet";
  rootHash: string;
  transactionHash: string;
  contentDigest: string;
  indexerUrl: string;
}

export interface OgStorageConfig {
  rpcUrl: string;
  indexerUrl: string;
  privateKey: string;
}

export async function prepareCanonicalData(value: unknown) {
  const content = canonicalize(value);
  const bytes = new TextEncoder().encode(content);
  const data = new MemData(bytes);
  const [tree, treeError] = await data.merkleTree();

  if (treeError !== null || tree === null) {
    throw treeError ?? new Error("0G Storage could not build the evidence tree");
  }
  const rootHash = tree.rootHash();
  if (rootHash === null) throw new Error("0G Storage returned an empty evidence root");

  return { content, contentDigest: hashText(content), data, rootHash };
}

export async function prepareEvidence(report: AssessmentReport) {
  return prepareCanonicalData(report);
}

export class OgStorageEvidenceStore {
  readonly #config: OgStorageConfig;

  constructor(config: OgStorageConfig) {
    if (!config.rpcUrl.startsWith("https://")) throw new Error("HTTPS RPC URL required");
    if (!config.indexerUrl.startsWith("https://")) {
      throw new Error("HTTPS Storage indexer URL required");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(config.privateKey)) {
      throw new Error("A 32-byte storage signer private key is required");
    }
    this.#config = config;
  }

  async put(report: AssessmentReport): Promise<EvidenceReceipt> {
    return this.putJson(report);
  }

  async putJson(value: unknown): Promise<EvidenceReceipt> {
    const prepared = await prepareCanonicalData(value);
    const provider = new JsonRpcProvider(this.#config.rpcUrl);
    const signer = new Wallet(this.#config.privateKey, provider);
    const indexer = new Indexer(this.#config.indexerUrl);
    // SDK 1.2.11 publishes its Signer type through the CommonJS ethers entry,
    // while this ESM project receives the equivalent ESM Wallet type.
    const storageSigner = signer as unknown as Parameters<Indexer["upload"]>[2];
    const [upload, uploadError] = await indexer.upload(
      prepared.data,
      this.#config.rpcUrl,
      storageSigner,
    );

    if (uploadError !== null) throw uploadError;
    if (!("rootHash" in upload)) {
      throw new Error("Fragmented assessment evidence is not supported by the MVP");
    }
    if (upload.rootHash.toLowerCase() !== prepared.rootHash.toLowerCase()) {
      throw new Error("0G Storage upload root does not match the prepared evidence root");
    }

    return {
      network: "0g-mainnet",
      rootHash: upload.rootHash,
      transactionHash: upload.txHash,
      contentDigest: prepared.contentDigest,
      indexerUrl: this.#config.indexerUrl,
    };
  }
}

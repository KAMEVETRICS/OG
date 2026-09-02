import { hashCanonical } from "./canonical.ts";
import type { CertificationPolicy, ImplementationManifest } from "./types.ts";

export function implementationFingerprint(
  manifest: ImplementationManifest,
): string {
  return hashCanonical({
    schemaVersion: manifest.schemaVersion,
    source: manifest.source,
    runtime: manifest.runtime,
  });
}

export function policyFingerprint(policy: CertificationPolicy): string {
  return hashCanonical(policy);
}


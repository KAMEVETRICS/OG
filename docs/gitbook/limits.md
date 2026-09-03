# Limits

Read these before treating a seal as a runtime guarantee.

- Certification tests the **assessment package** (prompt + tool schema + model revision + config), not a live agent HTTP server.
- Manifest `source.repository` / `commit` are labels inside the implementation hash. Git history is not fetched or verified.
- Policy cases are public. A prompt written only to those 15 cases can game the bench.
- Router `tee_verified` is a vendor-reported flag, not an independent attestation verify.
- Seals last **seven days**. After expiry, Gate returns false until recertification.
- The MVP does not implement slashing, warranties, a challenge market, or a universal score.
- Do not recertify Atlas on the live site unless you are sealing a **new** implementation hash.

Write-path abuse controls (not billing): daily owner/global seal quotas, per-IP quotas on certify list/challenge/create, pending-challenge storage only after a valid owner signature.

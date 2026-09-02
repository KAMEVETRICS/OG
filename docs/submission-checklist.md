# Wave 3 submission checklist

## Complete

- [x] Agent version fingerprinting across source, prompt, model, tools, and runtime configuration
- [x] Frozen `defi-safe@1.0.0` policy with 15 adversarial cases and three runs per case
- [x] 45/45 live 0G Compute responses with Router-verified TEE provenance
- [x] Complete assessment evidence uploaded and proof-downloaded from 0G Storage
- [x] ERC-8004 Atlas identity on 0G mainnet
- [x] ERC-8004 Rogue identity on 0G mainnet, deliberately left unsealed
- [x] AgentSealRegistry deployed on 0G mainnet
- [x] Patched AgentGate deployed on 0G mainnet
- [x] Fresh Atlas version-bound seal issued on the patched Registry
- [x] TypeScript SDK with fail-closed identity, seal, and gate verification
- [x] Agent Passport with Atlas-pass/Rogue-block comparison
- [x] Automated tests for assessment, contracts, adapters, SDK, Passport, and the public API
- [x] Mainnet verification script
- [x] Architecture document and sub-three-minute demo script
- [x] Branded social-preview card
- [x] Public Passport deployment

## Requires owner action or explicit approval

- [x] Publish the repository to a public GitHub URL
- [ ] Record and upload the demo video
- [ ] Publish the X announcement and insert its URL in the submission
- [ ] Re-certify Atlas shortly before judging so the displayed seal is current

## Submission proof

| Proof | Value |
| --- | --- |
| Chain ID | `16661` |
| AgentSealRegistry | `0xEEB2c6bD3249647941aEc2D96dD9067594dbc4a2` |
| AgentGate | `0x78f63314330FbEe998dDEBB89A27cD922DAcD11d` |
| ERC-8004 Atlas agent | `3522746` |
| ERC-8004 Rogue agent | `3524303` |
| Rogue registration transaction | `0x6394d854a0bf8d9052a1ca624d6ef23c29da11c32cc85c87a2498cc0a2baa0e6` |
| Policy hash | `0x5635eef2ec2ab753999901846dc52029f59a751d04d818f19acf1dd33c077ddb` |
| Implementation hash | `0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08` |
| Assessment hash | `0x01bd80fc95efc066953bb97b2e91c5c1b725ae3d3c3b18a64e64fb48d809ac57` |
| 0G Storage root | `0xfa513857e3511447518a96f5de74358c2e8096f16ac72bff72ce21536597201d` |
| Seal ID | `1` |
| Seal expiry | `2026-09-09T01:03:00.000Z` |
| Evidence transaction | `0x4041ab30fcf94e3462a23d690f29a7b5d38e7caa89d1941e5733041c3356f67d` |
| Seal transaction | `0x8a4d34b35c3cb7a950492c513eee98b8599bcc69505a0ab34d9c8798ec5fd971` |

## Final-day checks

1. Run `pnpm test`.
2. Run `pnpm typecheck`.
3. Run `pnpm deploy:verify`.
4. Run `pnpm certify:verify`.
5. Run `pnpm sdk:verify`.
6. Confirm the public Passport opens without authentication.
7. Confirm Atlas is current and AgentGate returns `true`.
8. Confirm Rogue returns `false`.
9. Test every Explorer and demo link from an incognito browser.
10. Submit the contract address, public repository, public demo, video, and X announcement.

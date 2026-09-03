# Live proof

Mainnet fixtures used by Inspect and the public API.

| | Atlas-0G | Rogue-0G |
| --- | --- | --- |
| ERC-8004 ID | `3522746` | `3524303` |
| Implementation hash | `0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08` | `0x4c846ba2c4a8728faae5149ab4d9828a67ec82fdf3c132d9efd7950912434eca` |
| Safety score | `100/100` | `7/100` (unsealed fixture) |
| Critical failures | `0` | `10` |
| AgentSeal | Seal ID `1`, expires `2026-09-09` | Not issued |
| AgentGate | **PASS** | **REJECT** |

## Cryptographic references (Atlas)

```text
Policy hash:         0x5635eef2ec2ab753999901846dc52029f59a751d04d818f19acf1dd33c077ddb
Implementation hash: 0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08
Assessment hash:     0x01bd80fc95efc066953bb97b2e91c5c1b725ae3d3c3b18a64e64fb48d809ac57
0G Storage root:     0xfa513857e3511447518a96f5de74358c2e8096f16ac72bff72ce21536597201d
```

| Event | Transaction |
| --- | --- |
| Atlas registration | [`0xff91…9c3`](https://chainscan.0g.ai/tx/0xff91586c3b25f33189cc188e36d765290355a3472672b76ac49f8c1f2f8689c3) |
| Rogue registration | [`0x6394…a0e6`](https://chainscan.0g.ai/tx/0x6394d854a0bf8d9052a1ca624d6ef23c29da11c32cc85c87a2498cc0a2baa0e6) |
| Evidence upload | [`0x4041…67d`](https://chainscan.0g.ai/tx/0x4041ab30fcf94e3462a23d690f29a7b5d38e7caa89d1941e5733041c3356f67d) |
| Seal issuance | [`0x8a4d…971`](https://chainscan.0g.ai/tx/0x8a4d34b35c3cb7a950492c513eee98b8599bcc69505a0ab34d9c8798ec5fd971) |

Rogue is an intentionally unsafe reference agent (policy overrides, secret extraction, unauthorized transfers, inflated tool amounts, unlimited approvals). It is registered and left unsealed so Gate can demonstrate a fail-closed reject.

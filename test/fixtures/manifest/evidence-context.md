The prose contains a brace-like fragment `{this is not JSON}` and is not the structured record.

## Workflow context

```json
{
  "head": "3333333333333333333333333333333333333333",
  "scope": "Single context block delivery",
  "result": "pass",
  "evidence": [
    {
      "repository": "example/consumer",
      "comment_id": 906
    }
  ],
  "pr": "example/consumer#45",
  "base_ref": "main",
  "base_sha": "4444444444444444444444444444444444444444",
  "policy_ref": {
    "repository": "example/consumer",
    "revision": "5555555555555555555555555555555555555555",
    "path": "openspec/specs/policy.md"
  },
  "contract_package": {
    "name": "assuredloop-workflow",
    "version": "0.1.0",
    "integrity": "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    "source_ref": {
      "repository": "example/consumer",
      "revision": "6767676767676767676767676767676767676767",
      "path": "contracts/specs"
    },
    "contracts_path": "contracts"
  },
  "config_digest": "7878787878787878787878787878787878787878787878787878787878787878",
  "activation_digest": null,
  "policy_mode": "bootstrap"
}
```

No second workflow context follows this one.

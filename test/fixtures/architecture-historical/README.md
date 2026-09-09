# Immutable legacy configuration input

`legacy-config.json` is the exact byte sequence from `f5c528723e24e11162a637b3e679f4896a5c024b:test/fixtures/records/config-bootstrap-comment.json`. Its original SHA-256 is `a484162d4163f3080866cfdafe61a94943a0d7f0ebd4e6ff8f5aed9b49dffc24`; `provenance.json` records the source reference. The five category keys and discipline mapping are intentionally retained. Do not regenerate this file from current templates or migrate its fields/digest.

The helper exposes these bytes through a simulated historical consumer snapshot with synthetic PR/base/head identities. It does not claim that this framework commit contained an activated `.assuredloop/config.json` or that the synthetic evidence was a real historical acceptance. The selected fixture package matches the unchanged legacy package binding; historical reconstruction stops on unsupported configuration shape before fetching policy or acceptance sources.

The former historical positive-test construction can be inspected independently at `f5c528723e24e11162a637b3e679f4896a5c024b:test/fixtures/historical-policy/helpers.mjs`, with its assertions at the same revision's `test/historical-policy.test.js`. That builder used five-key synthetic configuration and generated commit-dependent data. Its current six-key descendant is used only as a current-runtime control. It is not proof of legacy decoding or reconstruction.

The bounded compatibility disposition is recorded in PR #16 comment 5595535907. No legacy decoder is provided: unchanged legacy bytes with a matching recorded digest produce reconstruction unavailable, while independently established malformed-evidence, identity and digest failures remain distinct. Unsupported history cannot satisfy completion requirements.

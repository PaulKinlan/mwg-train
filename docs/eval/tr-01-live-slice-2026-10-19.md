# tr-01 Booking: first native DeepSeek generation (partial Step 1b)

**Status: generated, not functionally evaluated.** This is one paid, zero-shot request for the default arm's `tr-01` / `hono` cell. It is not an ACCEPT or REJECT verdict. Do not rerun this identity: the private spend ledger has already reserved and settled it. Bead: `mwg-train-i5i2.11`.

| Evidence | Recorded value |
| --- | --- |
| Source tree / branch | `55ed0159ffe4a44f6252cffbcb0e53b6d9879c9a` / `fleet/imp-1-live-slice` |
| Build model / request model / response model | `deepseek/deepseek-flash` / `deepseek-flash` / `deepseek-flash` |
| Caller-supplied HF reference | `2cba9e42aa026125f3ed06c6d98c1db82f7ca027`; **resolved serving revision UNVERIFIED** |
| Prompt / decode / interface SHA-256 | `7bec4a01f16a06532bc08c82720a62c0e156d787f5c7ac877ca6def8851f0a00` / `59c4e99faaa64669571c499689ed1116785471034e76c5255bbb1572c0011a20` / `0faed7563e5e0b6df307f714b4e526fcd38ef719a4933d19d3f7ae5f967286e9` |
| Request identity | `e12de1c5dbd436f0dc5b4480192e5ed0390957ec9ebc3f98d962fb165eead3eb` |
| Result | `SUCCESS` (generator only), `finish_reason: stop`; gate exit 0, 198 s; request wall 190,682 ms |
| Provider usage | 4,415 prompt tokens; 59,558 completion tokens (50,338 reasoning, 9,220 content) |
| Raw response | 29,369 bytes; SHA-256 `edbf3cc2685c1faa4f2ce8170890f04a2138d82aedcb806a2bc1ccfb5c599c38` |
| Output | One inert `server.mjs` (29,323 bytes; SHA-256 `b815855d2e7cd4e07689bfafbd240c7fb93d34b45a307187246d7082f44beaf9`) |
| Spend ledger | Exactly one matching durable reserve and completed settlement, with measured token categories. Projected/estimated USD and actual billed USD **UNVERIFIED**: no cited exact native-inference rate or provider invoice. Do not interpret as $0. |
| Platform | Linux x64, Node v24.21.0; Chrome UNVERIFIED; macOS not run. |

Private raw response, generated source and `run.json` are retained outside the repository at `/home/exedev/.fleet/mwg-train-tr01-live-20261019/fb24be752a9d3c3f74e7de8e759f3ce2b2dc8a12b82a32597fad2cfa1b457f03/default/e12de1c5dbd436f0dc5b4480192e5ed0390957ec9ebc3f98d962fb165eead3eb/`. The files are read-only (`0400`), directories owner-only traversable (`0500`); this is a local read-only cordon, **not** a remote durability or cryptographic immutability guarantee. The private spend ledger is `/home/exedev/.fleet/mwg-train-spend-ledger.json` (`0600`); do not publish its contents or credentials.

**Pending functional gate:** no generated source was executed, built, served, or loaded in a browser. `mwg-train-i5i2.5` remains BLOCKED on the browser WebRTC UDP egress finding `mwg-train-esqc`; its fail-closed sandbox has not been accepted for this run. Consequently journeys, state, server persistence, desktop/390px screenshots, Chrome version, macOS parity, and the Step 1b ACCEPT/REJECT decision remain unmeasured. Arrange a cleared sandbox and a macOS host, then evaluate this exact retained output without another paid request. A generator `SUCCESS` cannot substitute for a functional capability verdict.

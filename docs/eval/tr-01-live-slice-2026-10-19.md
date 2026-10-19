# tr-01 Booking: first native DeepSeek generation (partial Step 1b)

**Status: Linux functional slice ACCEPT; full cross-platform gate pending.** This is one paid, zero-shot request for the default arm's `tr-01` / `hono` cell. The retained output was subsequently driven through a real browser in the Linux bubblewrap sandbox; macOS reproduction remains unmeasured. Do not rerun the paid generation identity: the private spend ledger has already reserved and settled it. Bead: `mwg-train-i5i2.11`.

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
| Platform | Linux x64, Node v24.21.0; Google Chrome 155.0.8059.39 for the functional run; macOS not run. |

Private raw response, generated source and `run.json` are retained outside the repository at `/home/exedev/.fleet/mwg-train-tr01-live-20261019/fb24be752a9d3c3f74e7de8e759f3ce2b2dc8a12b82a32597fad2cfa1b457f03/default/e12de1c5dbd436f0dc5b4480192e5ed0390957ec9ebc3f98d962fb165eead3eb/`. The files are read-only (`0400`), directories owner-only traversable (`0500`); this is a local read-only cordon, **not** a remote durability or cryptographic immutability guarantee. The private spend ledger is `/home/exedev/.fleet/mwg-train-spend-ledger.json` (`0600`); do not publish its contents or credentials.

## Functional slice on Linux — 2026-10-19

After `mwg-train-i5i2.5` landed at `2c6b5917`, the **same immutable generated `server.mjs`** above was mounted read-only into the bubblewrap server namespace and reached only over the harness's 127.0.0.1 bridge. `scripts/verify-tr01-live-slice.mjs` launched one default-egress-contained headless Chrome, drove the page at 1280×900 and 390×844, then stopped Chrome and the sandbox in `finally`. This is a new execution of existing output, **not** a new paid generation or a model retry. The generated project required no install/build step; the output was one Node file.

| Function | Browser-driven deciding detail | Linux verdict |
| --- | --- | --- |
| Intake/carried state | Native select chose `Full service`; submitting `/intake` navigated to `/intake/confirm` showing that selection. | PASS |
| Required-field validation | POST `/book` with phone omitted returned an inline `Phone number is required.` error, `aria-invalid=true` on the phone input, and `/api/records` still returned `[]`. | PASS |
| Booking/readback/persistence | After filling six fields, submit redirected to `/bookings/VF-…`; the page displayed Ada Lovelace, 14 Alder Road and Full service. Browser reload retained the same route and values, with exactly one server-side record. | PASS |
| Search | `/search?q=Ada` displayed Ada Lovelace and not the decoy string. | PASS |
| Update | The browser submitted a customer-name edit; the **same reference** loaded `Ada Lovelace (updated)` after reload; record count remained one. | PASS |
| 390px responsive viewport | Full-page form and updated confirmation captured at 390×844; document scroll width did not exceed viewport width on the form. | PASS for observed layout |

**Functional verdict: ACCEPT on Linux for the measured tr-01 booking functions.** This is not an assertion of full Step 1b completion: criterion 5 requires an independent macOS run and none has happened; actual/provider-billed USD and served model revision remain UNVERIFIED, rather than zero or attested. The page's data survived browser reload **while the server remained alive**; the brief does not require persistence after process restart. Browser HTTP/WebSocket egress was contained by default; the owner-accepted opaque-origin iframe WebRTC STUN UDP residual in `mwg-train-i5i2.5` still applies. This run does not establish visual match to a reference board or broader security/accessibility conformance.

Screenshots (real CDP capture, synthetic fixture data): [desktop form](evidence/tr-01-live-2026-10-19/desktop-form.png), [desktop inline validation](evidence/tr-01-live-2026-10-19/desktop-validation.png), [desktop confirmation](evidence/tr-01-live-2026-10-19/desktop-confirmation.png), [390px form](evidence/tr-01-live-2026-10-19/mobile-form.png), [390px updated confirmation](evidence/tr-01-live-2026-10-19/mobile-confirmation.png). The screenshots show the responsive booking UI and the visible error/record states; assertions and environment details are independently reproducible from the script and private `/home/exedev/.fleet/mwg-train-tr01-functional-evidence/verdict.json`. The private generated source, provider response, and ledger stay outside the public repository.

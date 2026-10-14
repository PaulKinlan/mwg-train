# Local portability run evidence

These runs **do not prove same-tree Linux/macOS parity**. The Linux run used a newer main-based tree; the macOS report describes a separate, older portability branch. Do not use either as an attestation of the other platform's exact commit. Neither is a sealed evaluation run; Linux remains the canonical sealed-run platform, and the generated-code sandbox is not available on macOS.

## Linux x86_64 — attached command output

- Commit: `7216ff3fad314e9e1e13be1ffa62e6642a2d0438` (`fleet/imp-1-portability-evidence`, based on `origin/main` at `9be08df3`).
- Environment: Linux 6.12.93 x86_64, Node v24.21.0, npm 11.19.0, Google Chrome 155.0.8059.39.
- Lockfile SHA-256: `e18d08125421fd857b15b4cadbcabcf511347d802c374cfeafe194bca84f3d6e`.
- Command: `npm_config_registry=https://registry.npmjs.org npm run check:portability` (`npm ci && npm test`), run once on this corrected tree after an earlier run failed on the missing `EXCLUDED` entry. Exit 0; `npm ci` installed 48 packages; `npm test`: 1,258 tests, 1,256 passed, 0 failed, 2 skipped.
- Full stdout/stderr: [`linux-7216ff3f.log.gz`](linux-7216ff3f.log.gz). Deterministic gzip (`gzip -n -9`), compressed SHA-256 `6b7e6175bb5609d1d3e216f70bbd721dee050d1691e8da5ef3f29e481c379646`; decompressed log SHA-256 `611ddb225a5a6a41599ec8bad7517c1a825b5f3f7f142279efb09666f566acb0`. Verify with `gzip -dc docs/portability/evidence/linux-7216ff3f.log.gz | sha256sum`.

The preceding attempt on `cd329918` exited 1: 1,255 passed, 1 failed, 2 skipped; the only failure was `test/checks-wired.test.mjs` because the newly added opt-in `check:portability` was not yet listed in `scripts/run-checks.mjs`'s offline-gate `EXCLUDED` map. Its VM log is `/tmp/imp-1-1xaq-linux-portability.log`; **do not substitute that failed tree for the green one**.

## macOS arm64 — attributed author report, not a raw-log attachment

The verbatim report is the **2026-10-13 20:17 UTC `antigravity-assistant` comment on Beads issue `mwg-train-1xaq`**, authored from Paul's Mac. It records:

- Environment: Darwin arm64, Node v25.3.0, Google Chrome 155.0.8059.40, `CHROME_PATH` unset (normal app discovery, sandbox on).
- Source: detached worktree at `origin/fleet/frame-gate-macos-portability` at `a4aa8c729d16d8bdd4979f89780f1525385507fc`; `npm ci --registry=https://registry.npmjs.org` succeeded, installing 48 packages.
- Baseline: `node --test --test-reporter=tap` exited 1, with 1,032 passed, 19 failed, 5 skipped of 1,056 tests.
- After the five-file macOS repair diff reproduced in that comment: `node --test --test-reporter=tap` exited 0 in 18.5 s, with 1,051 passed, 0 failed, 5 skipped of 1,056 tests. The repair was **later pushed** on `fleet/frame-gate-macos-portability` as `242b09ed83f6f66fc8ef943d1dda3e466429dd68` (parent `a4aa8c7`), per the same issue's 2026-10-13 22:32 UTC author comment.

That report contains the author's measurements and diff, **not the raw macOS `npm ci`/test output**. It used the TAP reporter and was recorded before the repair commit was pushed. We have not re-run it on a Mac or on `7216ff3f`; the later main-based Linux tree has 1,258 tests rather than that older tree's 1,056. A new same-tree two-platform run remains necessary for a strict parity claim.

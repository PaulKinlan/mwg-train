# mwg-train

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Experiment: does training on Modern Web Guidance-applied sites make a model default to modern web practice? Corpus, uplift pairing, adapter training and a preregistered evaluation.

## Where things live

| what | where |
| --- | --- |
| The project plan — what this is for, the pipeline stages and their real state, and the next step | [`plan.md`](plan.md) |
| The words for the two sides of a corpus pair, and what "baseline" is not | [`docs/vocabulary.md`](docs/vocabulary.md) — **default** (raw, no MWG, no uplift) and **ideal** (post-uplift), enforced by `npm run check:set-separation` |
| Visual language and rough layout directions for future synthetic sites | [`docs/design.md`](docs/design.md) — typography, spacing, component anatomy, responsive grammars and generated concept boards (not targets or training data) |
| What will be claimed, and how it will be decided | [`docs/eval/PREREGISTRATION.md`](docs/eval/PREREGISTRATION.md) — arms, primary endpoint, decision rules, splits, seal |
| The held-out briefs | [`docs/eval/briefs/manifest.jsonl`](docs/eval/briefs/manifest.jsonl) + [`SCHEMA.md`](docs/eval/briefs/SCHEMA.md) |
| Rules the briefs are validated against | [`docs/eval/rules.json`](docs/eval/rules.json), extracted from a pinned Modern Web Guidance snapshot and verified against web-uplift's published catalog - see [ATTRIBUTION.md](docs/eval/ATTRIBUTION.md) |
| What compute costs, and how it was priced | [`docs/eval/pricing.md`](docs/eval/pricing.md) and the generated [`pricing.sheets.md`](docs/eval/pricing.sheets.md) |
| Which providers could be priced at all | [`docs/eval/quotes.jsonl`](docs/eval/quotes.jsonl) (verified) and [`quotes.unverified.jsonl`](docs/eval/quotes.unverified.jsonl) (with reasons) |
| The durable functional specification of each pilot family | [`docs/eval/specs/`](docs/eval/specs/) — state, persistence, journeys and acceptance; a project rebuilds from it without the archetype table |
| The target designs and the conformance axis | [`docs/eval/conformance/`](docs/eval/conformance/) — target provenance, the axis, per-family identity |
| The training-side briefs, disjoint from the sealed set | [`docs/train/briefs/`](docs/train/briefs/) — synthetic families in their own `tr-` namespace, never validated against the sealed eval schema |
| Each training family's functional and aesthetic specs | [`docs/train/design/`](docs/train/design/) — one `plan.md` (bound to the family's canonical brief row) and one `design.md` (bound to its authored target board) per `tr-*` family, checked by `npm run check:train-design` |
| How large the training and pilot corpora are, and what they cost | [`docs/train/corpus/tokens.json`](docs/train/corpus/tokens.json) — measured characters per scope and derived token estimates for `tr-*` and pilot pairs; regenerate with `npm run train:tokens` for current figures. Each `tr-*` project's form controls are declared in its own brief (`schema_source: "brief"` on all 210) and its journey fills the inputs and chooses the selects the brief declares, but the journey is single-page: it does not span multi-page flows, and while 29 of 30 families declare every route their brief lists, declaring is not serving - of the 135 declared routes in that 30-project sample, 131 are answered and the 4 that are not are all `list-detail` routes. Derived from app sources (not tokenizer-measured); of the 210 training projects, 40 were driven in a browser through their journeys and 170 remain `scaffolded / unverified journey`. |
| Provenance, rights and retention for every asset | [`docs/provenance/`](docs/provenance/) — manifest, arms, retained refs |

## Checks

```bash
npm test                    # full unit suite on demand; not part of the merger's configured gate
npm run check:portability   # fresh npm ci followed by the full npm test suite (Linux or macOS)
npm run test:fast           # affected unit suites and mapped checks vs origin/main
npm run build               # alias for npm run check:all; does not run npm test
npm run check:all           # deterministic offline checks; the merger's full gate, not the unit suite
npm run check:briefs        # validate + seal the brief manifest
npm run quotes:verify       # every priced row must re-derive from the page it came from
npm run quotes:fetch        # re-fetch those pages and report whether they still hash the same
npm run price:sheets        # regenerate docs/eval/pricing.sheets.md
npm run check:train-evidence # reachability records complete, each row backed by its quote
npm run check:specs          # rebuild every family from its specification and compare tree hashes
npm run check:disjoint       # refuse a training corpus that shares a family or a target design with the sealed eval
npm run train:tokens         # regenerate docs/train/corpus/tokens.json (derived text-only token estimates)
npm run lint:provenance     # provenance manifest rules
npm run scan:owner-auth     # owner-auth gate: no owner-identifying material in any corpus tree
```

The fleet fast gate (`fleet-check --fast`) runs `scripts/fast-gate.mjs` (also available as
`npm run test:fast`) to select affected unit suites and mapped checks for the branch diff.
The merger runs its configured `npm run check:all` once on the merged tree; neither it nor
`npm run build` runs `npm test`. Run `npm test` explicitly when the full unit suite is needed:
a passing fast gate and `check:all` do not prove that unselected unit suites pass.
`check:portability` is an explicit, expensive local platform check, not CI or a
replacement for the merger's offline gate. Use the public npm registry for `npm ci`
if a mirror lacks the exact locked dependencies; record the commit, platform,
Node and Chrome versions with the resulting test log. [Local platform run
evidence](docs/portability/evidence/README.md) records the available Linux log
and the separately attributed macOS report; these are different source trees.
macOS verifies local development, while canonical sealed evaluation runs on
pinned Linux. macOS portability does not imply the Linux-only generated-code
sandbox is available. For local macOS browser checks, `src/corpus/cdp.mjs`
checks the standard `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
and `/Applications/Chromium.app/Contents/MacOS/Chromium` binaries.
If installed elsewhere, export `CHROME_PATH="/absolute/path/to/Chrome"` **before**
`npm test` or `npm run check:portability`; a missing browser reports `NO_CHROME`
with the paths tried and this setting. Chrome's renderer sandbox is on by default
on either platform; `MWG_ALLOW_UNSANDBOXED_CHROME=1` is an explicit host-risk
opt-in, never an automatic macOS, root or container fallback.

## The quarantine store

Teacher-generated material and the reproduction studies live in a **private companion repo** (`mwg-quarantine`, a sibling checkout), never in this public tree: tooling writes quarantined arms there by default, and the public tree receives material only via `npm run promote` (explicit, ledgered, publication-only). See [docs/quarantine.md](docs/quarantine.md).

## Runtime quality observations

A fresh pilot browser run records `runtime_quality` beside each project version's
functional journeys: a buffered hard-navigation LCP candidate, the slowest
Event Timing interaction from three trusted clicks on the declared primary
field, and post-GC retained-node/heap trends across those clicks. These are
**local diagnostic samples**, not field Core Web Vitals or proof that an app
has no memory leak. Sub-16-ms interactions may produce no Event Timing entry;
the report says `NOT_MEASURED`, never zero. A growing CDP node count while the
live DOM is stable is labelled `SUSPECTED_RETENTION`, not a confirmed detached
DOM leak. The connected-node witness includes light DOM, template fragments and
open/closed shadow roots exposed by CDP. Four comparable samples require one
browsing context and a stable document count: the shared inert template-contents
owner document is accounted for, while iframes and unexplained extra documents
remain INCONCLUSIVE. If the live tree changes during sampling, the retained-node
heuristic also returns INCONCLUSIVE instead of suspecting a leak. No runtime-quality
observation changes training-pair acceptance.

## Benchmark overview (measured pilot runs)

The owner-only viewer's `/benchmark` route shows a high-level pre/post overview,
including C1 bare base, C2 guidance and T trained-adapter arms; absent arms show
N/A, never inferred results. Choose a measured run from the page when available.

The viewer defaults to the committed, **historical** `docs/pilot/records.json`
paired with `docs/pilot/yield.json` when no local measurement is available;
these records are a different run from the current re-derived `pilot/CORPUS.json`.
For the same committed snapshot, run `node scripts/benchmark-report.mjs --run docs/pilot`.
After `npm run pilot:run` has produced a new measured run, use
`node scripts/benchmark-report.mjs --run pilot/out/<run-id>` (or append `--json`)
to compare pre/post guidance-rule adherence across archetypes, models and rules.
The command reads that run's `yield.json` decisions and per-project `original.json` /
`uplifted.json` rule verdicts; it does not rerun a browser or derive a score from
acceptance counts. Scores use only rules measured PASS or FAIL on **both** sides
of the same project. Missing/ERROR/NOT_APPLICABLE verdicts are excluded and
counted separately; no paired checks display N/A. The current deterministic
pilot is labelled `deterministic:no-model`, not credited to a trained model.
A run with measured model outputs may supply `model` and its preregistered
`arm` (`C1`, `C2` or `T`) on each decision.
`pilot/CORPUS.json` alone contains no pre/post rule verdicts and cannot be
used as a benchmark-score source. Fresh pilot runs also record five optional
browser diagnostics (modal dialog dismissal, declarative popover dismissal,
container-size styling, unique view-transition names and child-state `:has()`
styling). They return NOT_APPLICABLE when no such surface exists and ERROR when
a declared feature cannot be demonstrated; neither counts as a pass. They do
not change the preregistered training-pair acceptance gate. They are reported
separately from the historical headline, archetype, model and arm totals; adding
five optional rules never silently changes those denominators. Historical runs
show these guidance rows as N/A, not as scores inferred from newer code.

## Corpus viewer (owner-only)

`npm run viewer -- --corpus pilot` serves the corpus on TWO ports, both fronted by exe.dev auth:

- **7700, the viewer** — index of every project with archetype, framework, accept/reject state
  (rejects stay visible with their category - acceptance bias is only inspectable then), tree
  SHAs, and filters by archetype / framework / state / rule; per-pair evidence pages (original vs
  uplifted rule measurements with the deciding detail, browser journeys, security checks, console,
  screenshots).
- **7701, the live origin** — serves ONLY the sandboxed sites under `/live/<project>/<version>/`.
  Untrusted site code never shares an origin with the evidence pages: a different port is a
  different origin, so site JavaScript cannot read them. (Cookies are host-scoped, not
  port-scoped, which is exactly why the proxy namespaces every cookie a site sets and forwards
  only those back.)

The viewer's `/tuning` workbench reads the authored `tr-*` training briefs, their A1 target-design
images, deterministic scaffold records and any measured training sample. Select a family, prompt
variant and framework; compare the original authored prompts and brief contract with the target
image and recorded template facts. Prompt wording, system guidance, temperature, max tokens and
seed can be edited as a **browser-local, unapproved draft**, then copied or exported as JSON. It
runs no training, does not regenerate a site, and never writes back to the training or sealed
evaluation manifests.

The one model call in the workbench is explicit: **Generate board from draft** (`POST
/tuning/generate`) sends the draft you are editing to `gemini-nano-banana-2.1` and returns a design
board to that browser. The compute is external - no model runs on this machine, which is the owner
constraint in [`docs/eval/pricing.md`](docs/eval/pricing.md) rather than a limitation of this code -
and the endpoint injects the signed-in account's credentials, so this process holds no key and has
no header-construction path that could send one. A generation writes nothing: the board is bytes in
the response, it is offered as a download, and no file is created. Output from a hosted model is
`hosted-api` material, which the provenance rules place in arm `A3_teacher_generated` with
`excluded_from_training: true`; keeping a board is a separate promote step that records provider,
model, account reference, terms and the SHA of the bytes. The authored target image remains an
authored reference, **not** a model output, and no rendered template snapshot is retained in this
checkout.

The workbench enforces the bounds that make that safe to expose: one generation in flight at a
time with a minimum interval between them, a 64 KiB body cap, prompt/settings ranges matching the
editor, an upstream timeout, and a request that only names a brief and framework that exist in
this checkout. It also raises `max_tokens` to a floor of 4096 for the request and reports the
effective value, because below that this model spends the whole budget thinking and returns no image
(measured, not assumed).

Live instances run the real site server sandboxed with bubblewrap: its own network namespace with
no route off it (the host's loopback proxies and the outside network are unreachable), an
allowlisted environment, a read-only site tree, and no host filesystem beyond the runtime. The
viewer reaches the site over a framed stdio bridge (`src/viewer/bridge-wrapper.mjs` runs inside
the sandbox; there is no shared filesystem rendezvous a site could substitute); the proxy forwards
request headers
from an allowlist and re-scans the outbound set before every request, so owner auth material can
never reach a site. Uplifted snapshots come from the run's kept tree or a deterministic
regeneration that must reproduce the recorded SHA - a mismatch is refused, not served.

The exe.dev proxy in front of each port is the gate for the deployed viewer, and the served artefacts are
auth-free by construction. Since mwg-train-hwbs the viewer also requires a token of its own, on BOTH of its
ports - the corpus viewer and the live origin, which serves the projects' original and uplifted trees under
`/live/<projectId>/...` (mwg-train-i4j5): a shared secret from `MWG_VIEWER_TOKEN` (or one generated per process
and printed at startup), presented as `Authorization: Bearer <token>`, as a `mwg_viewer` cookie, or once as
`?token=<token>` which sets the cookie and redirects the query away. `/healthz` is the only exempt path, on
either port, because it answers a constant. The cookie is host-scoped and ignores the port, so the one the
viewer sets is accepted by the live origin and a workbench preview keeps loading in place; opening a preview
in a new tab without the cookie is refused, which is intended. `MWG_ALLOW_ANONYMOUS_VIEWER=1` turns all of it
off again for a local run. The reason is that the proxy protects the
PORT and nothing protects the process: any local process, any mistyped `--host`, or anything that reaches the
port around the proxy could read the corpus and drive `/tuning/generate`, which spends money. The other
direction is enforced: the
owner-auth scan (`scripts/scan-owner-auth.mjs`, config `docs/eval/owner-identity.json`) fails
closed - a pair that cannot be shown free of owner-identifying material (in its trees AND its
corpus records) is neither accepted nor served.

### Static concept-image trust boundary

The `/concepts` image routes use allowlisted references under the configured `repoRoot`. The
image reader rejects lexical escapes and symlink leaves, then checks the opened file against
its expected canonical in-tree path on Linux. On macOS, where the procfs fd pathname is
unavailable, the inode/path fallback is best-effort against concurrent ancestor swaps. These
are **pathname-confinement checks, not content-origin or image-provenance attestations**.

The served `repoRoot` is a trusted, host-controlled tree: hostile writes to it are **outside
this static viewer's threat model**. A writer who can place a hardlink there can give an
allowlisted in-tree path the same inode as a readable file also named outside the tree;
`O_NOFOLLOW`, `realpath`, `fstat` dev/inode equality and `/proc/self/fd` pathname equality do
not prove that the bytes originated inside the tree. Linux `fs.protected_hardlinks` restricts
which files can be linked (typically to files the writer owns or can read and write), but
cannot establish provenance for permitted same-user links. This is an accepted residual risk,
not a claimed hardlink defense. If hostile writers to `repoRoot` become in scope, isolate
write permissions or require independently verified content pins before serving such files;
additional pathname checks alone will not authenticate the bytes.

Design decisions and their reasons are recorded in the bead for each change and in the documents
above; a number in the docs is only as good as the check that recomputes it.

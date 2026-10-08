# mwg-train

Experiment: does training on Modern Web Guidance-applied sites make a model default to modern web practice? Corpus, uplift pairing, adapter training and a preregistered evaluation.

## Where things live

| what | where |
| --- | --- |
| What will be claimed, and how it will be decided | [`docs/eval/PREREGISTRATION.md`](docs/eval/PREREGISTRATION.md) — arms, primary endpoint, decision rules, splits, seal |
| The held-out briefs | [`docs/eval/briefs/manifest.jsonl`](docs/eval/briefs/manifest.jsonl) + [`SCHEMA.md`](docs/eval/briefs/SCHEMA.md) |
| Rules the briefs are validated against | [`docs/eval/rules.json`](docs/eval/rules.json), extracted from a pinned Modern Web Guidance snapshot |
| What compute costs, and how it was priced | [`docs/eval/pricing.md`](docs/eval/pricing.md) and the generated [`pricing.sheets.md`](docs/eval/pricing.sheets.md) |
| Which providers could be priced at all | [`docs/eval/quotes.jsonl`](docs/eval/quotes.jsonl) (verified) and [`quotes.unverified.jsonl`](docs/eval/quotes.unverified.jsonl) (with reasons) |
| Provenance, rights and retention for every asset | [`docs/provenance/`](docs/provenance/) — manifest, arms, retained refs |

## Checks

```bash
npm test                    # unit tests, including the corpus and pricing invariants
npm run check:briefs        # validate + seal the brief manifest
npm run quotes:verify       # every priced row must re-derive from the page it came from
npm run quotes:fetch        # re-fetch those pages and report whether they still hash the same
npm run price:sheets        # regenerate docs/eval/pricing.sheets.md
npm run check:train-evidence # reachability records complete, each row backed by its quote
npm run lint:provenance     # provenance manifest rules
npm run scan:owner-auth     # owner-auth gate: no owner-identifying material in any corpus tree
```

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

Live instances run the real site server sandboxed with bubblewrap: its own network namespace with
no route off it (the host's loopback proxies and the outside network are unreachable), an
allowlisted environment, a read-only site tree, and no host filesystem beyond the runtime. The
viewer reaches the site through a pinned unix-socket bridge; the proxy forwards request headers
from an allowlist and re-scans the outbound set before every request, so owner auth material can
never reach a site. Uplifted snapshots come from the run's kept tree or a deterministic
regeneration that must reproduce the recorded SHA - a mismatch is refused, not served.

The viewer carries NO auth of its own: the exe.dev proxy in front of each port is the gate, and
the served artefacts are auth-free by construction. The other direction is enforced: the
owner-auth scan (`scripts/scan-owner-auth.mjs`, config `docs/eval/owner-identity.json`) fails
closed - a pair that cannot be shown free of owner-identifying material (in its trees AND its
corpus records) is neither accepted nor served.

Design decisions and their reasons are recorded in the bead for each change and in the documents
above; a number in the docs is only as good as the check that recomputes it.

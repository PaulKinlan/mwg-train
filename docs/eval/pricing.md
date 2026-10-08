# The compute dry run: what it costs, and what is still unmeasured

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Design brief, section 7: *"procurement sheet, not invented prices."* This document is the sheet. It
contains no price that was not read from a provider's own page on a stated date.

Two owner constraints frame it:

- **No models on fleet VMs.** Paul, 2026-10-08: *"I don't want the models on these vm machines at
  least."* So nothing here is measured on this machine: the VMs (2 CPU / 8GB, no GPU) drive the job
  and collect the record, and all compute is external.
- **The figures must be fetched.** A search summary is a claim, not a quote.

The generated sheets — every fetched rate with its date, URL and body hash, plus the VRAM estimate
table and the illustrative both-ways cost — are in [`pricing.sheets.md`](pricing.sheets.md),
produced by `scripts/price-dry-run.mjs` from `quotes.jsonl`. They are generated so the documentation
cannot drift from the data; `test/pricing.test.mjs` re-runs the generator and fails if they differ.

## 1. The two ways to buy the same run

| | **Model A — pay per training token** | **Model B — pay per hour** |
| --- | --- | --- |
| what you buy | a managed LoRA/SFT job on a hosted service | a rented GPU, your own stack |
| what you manage | nothing: no checkpoints, no drivers, no idle VM | environment, checkpointing, restarts, disk |
| idle cost | none while dormant | none if you stop the instance, but storage is billed |
| output | adapter on their platform (portability varies) | adapter file you keep |
| dependency | the service must support the exact checkpoint | the GPU must be big enough for the measured context |
| best when | the corpus is small, or throughput on a rented card would be low, or the job is short enough that provisioning dominates | the run is long, or many runs are planned, or you need the adapter's provenance to be entirely yours |

Both routes are priced from the same measured inputs by `src/eval/cost.mjs`, so the comparison is
arithmetic rather than preference. The deciding inputs are **total training tokens**, **measured
tokens per second**, and **billed setup time per attempt** — the last one is why a short job on a
rented card can lose: provisioning and model download happen on the clock, and happen again after
every restart.

The measurement that settles it is the same one in both cases: the dry run below.

## 2. What the dry run records (10-20 examples)

Scope: 10-20 briefs taken from the *training* corpus, the same ones across arms. Record, per phase:

- peak allocated and peak **reserved** VRAM (`torch.cuda.max_memory_allocated` / `max_memory_reserved`);
- training tokens per second and examples per second at the pinned batch and sequence length;
- examples per hour for generation, and acceptance yield per 20 examples;
- GPU model, VRAM, provider, region, billing unit, and the `quote_id` from `quotes.jsonl` that was used;
- wall-clock per phase and **every restart that was billed**;
- storage GB-month and egress GB actually consumed.

Those numbers replace the estimated quantities: the VRAM point estimate, the throughput inputs, and
the acceptance yield. Until then the VRAM table in the sheets is labelled an estimate with a +/-30%
band, and the token count is derived from characters (4 characters per token, banded) rather than
from the training tokenizer.

The acceptance yield is the number that scales the whole programme: `accepted pairs = attempted
pairs × observed acceptance rate`, and the corpus does not exist yet, so **no total is quoted here**.
What can be quoted today is a rate, a method and a plan.

## 3. Scaling, and why it is not linear

```
training GPU-hours ≈ measured GPU-hours per accepted pair × target accepted pairs × epochs
generation cost    ≈ per-pair generation cost × (target accepted pairs / observed acceptance rate)
total              = compute + evaluation + storage + bandwidth + restarts + human review
```

Scaling from 200 to 2,000 accepted pairs is **not** automatically 10× the cost: longer examples,
more failures, more checks and repeated hyperparameter runs all grow faster than the pair count
(design brief §7). Re-measure the pilot before committing, and re-fetch the rates: a quote is only
valid for the date on it.

Variants are costed separately and are never counted as corpus size: three rephrasings of one brief
add generation and evaluation cost, and change the original count by nothing (owner protocol,
condition 1).

## 4. What is verified, what is estimated, what is not priced at all

- **Verified** — every row in `quotes.jsonl`. The file is **derived, not typed**: an extractor reads
each rate out of the fetched page, and a verifier re-derives it from the same bytes. A row carries
the URL, the HTTP status, the retrieval time, the sha256 and byte count of the body it came from, and
the verbatim snippet the number was read out of. The verifier is what makes that a claim rather than
a comment:

  ```bash
  node scripts/extract-quotes.mjs      # fetch-time pages -> docs/eval/quotes.jsonl
  node scripts/verify-quotes.mjs       # every row must re-derive from its body, or exit non-zero
  ```

  Verification requires the number to be a *price* **next to the snippet it was read from** (within
  240 characters) and to be the **column** the row names (`verbatim_column`), not merely a number
  somewhere on a page that lists many prices. All three qualifiers were added after an adversarial
  pass got past weaker versions: a bare-number match accepted `1.3` from "1.3 TiB SSD", and a
  proximity-only match accepted the Fireworks *prefill* rate as the training rate, because all four
  columns sit in the same snippet — the first version of this
  check searched the whole document, which would have passed a row whose price came from a different
  card. The raw bodies are gitignored because they are other people's pages; `quotes.raw/fetched.json`
  (URL, date, bytes, sha256 per page) is committed, and `scripts/fetch-quotes.sh` re-fetches every
  page and reports whether it still hashes to what the sheet priced. Run within twenty minutes of the
  first fetch on 2026-10-08, that script caught Fireworks changing its page (234997 -> 234954 bytes);
  every priced number was unchanged, which is the useful outcome of the check either way.

  A number whose label cannot be established is **not** priced, however real it is. Together AI lists
  two fine-tuning tables about 11% apart (LoRA and full-parameter) and the static page carries both
  with the label supplied client-side, so Together appears in `quotes.unverified.jsonl` with its
  observed range rather than in the sheet with a guessed label.

  The Lambda rows are the harder case and are handled the other way round, which is worth stating
  plainly because the difference is easy to miss. There, the *GPU and the rate are on the page in
  text* and only the instance-plan label is client-side; the row therefore records the price as
  fetched and the plan as **inferred** from the per-GPU vCPU count, and the inference travels with the
  number into every table (`treat the plan as unverified, the price as fetched`). The distinction is:
  a rate whose *product* is unknown is not priced at all, while a rate whose product is certain and
  whose billing tier is inferred is priced with the inference attached. Nothing in the sheet presents
  an inferred plan as a fact, and the generator refuses to print a row the verifier rejects.
- **Estimated, and labelled** — the VRAM requirements and the throughput-dependent parts of the cost.
  The estimates expose each term; two errors in an earlier draft of the estimator are worth naming
  because both would have changed a purchase: the activation heuristic was ~10× too high, and billed
  provisioning time was missing entirely.
- **Unverified, and therefore not priced** — anything we could not fetch, including services that
  publish no training price at all (some are quote-on-request only). These are listed in
  `quotes.unverified.jsonl` with the reason. They do not appear in any cost, and
  `test/pricing.test.mjs` fails if one of them acquires a price without acquiring a verifiable body.

## 5. The open decision

**Rent a GPU, or pay per training token?** The preregistered experiment does not depend on the
answer, but the budget does, and the crossover is an empirical number rather than a preference. The
dry run answers it: run the same 10-20 examples, record tokens/second and setup minutes, and price
both routes with the quotes in the sheets. Until that measurement exists, this document reports the
method and the fetched rates, and no total.

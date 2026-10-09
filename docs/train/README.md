# The training seam: one interface, two backends

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official `web-uplift` result.

Before any paid run is even considered, the proposed [readiness gates](READINESS-EPIC.md) require an independently verified, rights-cleared corpus, a protected holdout and an owner-approved costed decision. Nothing in this training seam authorises spending.

The project trains a student on accepted pairs. It may do that on Fireworks' managed training (per
training token, priced by parameter band) or on a rented GPU cluster (per GPU-second), and the two differ
in almost everything operational. Nothing downstream is allowed to care which one ran, so both sit behind
one interface and produce one artifact manifest.

## The contract

A **job** declares: the corpus (path, sha256, row count), the base checkpoint (repo, model id, **resolved
40-character commit**, licence), the hyperparameters (`lora-sft`/`lora-dpo`, rank, epochs, max sequence
length, learning rate) and a relative output reference.

An **artifact manifest** records: backend, the **base model id** it trained (the canonical identity, not the
provider's own spelling), resolved base revision, corpus hash, hyperparameters, token counts, the
adapter's location/digest/format, the training log, and the backend's own job id.

Validation is fail-closed and never throws:

| Refused | Why it is not a detail |
| --- | --- |
| A branch or tag as the base revision | It can be repointed after the run, so the manifest would not say what was trained. The evaluation gate compares resolved commits. |
| A licence we do not train on | A checkpoint whose licence is unknown is not a checkpoint. |
| An output reference that is absolute or contains `..` | The two backends would resolve it differently, and it can escape the run. |
| A manifest with no token count | No training cost can be derived from it, and a missing count is not a zero. |
| An adapter result that is not an object with a manifest | The seam must refuse, not crash: it did crash with a `TypeError` until a test for exactly that shape was written. |
| A manifest that does not name its base model, or names a different one than the job declared | A commit hash alone does not name the repository the weights came from, and an adapter that trained something else is exactly the silent substitution the seam exists to catch. |
| A corpus whose declared hash or row count does not match its own bytes | Until this gate existed the corpus hash was checked for **shape only** - a job could name any hash for any corpus and still be planned and launched. The declared counts are now re-derived from the file. |
| A corpus that shares a family or a target design with the sealed evaluation | The split is only a split if it is proven one. `assertDisjointTrainingCorpus` refuses a corpus reusing a sealed `family_id`, a pilot/evaluation target family, or a target design hash, and refuses to run when the seal itself has moved. |
| A corpus that cannot be read at all | A corpus that cannot be checked is not a corpus; the gate fails closed rather than treating an unreadable manifest as empty. |

## Costing never guesses

`costLines()` prices a line only when both the quantity and the rate are known. Anything else is emitted
as `UNVERIFIED` with the reason, and `totalCost()` reports `UNVERIFIED > ESTIMATE > PINNED`, so a total
never reads as pinned while it is hiding an estimate, and an unknown never becomes a zero. An estimated
token count is allowed to carry a number **as long as it is labelled** an estimate.

Serving is priced on **both** backends or on neither: managed LoRA serving requires an on-demand dedicated
deployment billed per GPU-second, and the cluster's GPU is billed whether or not it is generating.
Charging idle to one side only is how a comparison comes out flattering.

## Two backends, one comparison

`compareBackends()` returns a cost per accepted pair for each side and names a cheaper backend only when
both sides are priced and `assertComparable()` holds. That check is the one that makes the comparison mean
what it says: two adapters trained on different base checkpoints differ in their **model** as well as
their backend, so a cheaper one would be cheaper for two reasons at once. It compares resolved base
revision, base model id, corpus hash, tokenizer, and the training recipe (`method`, `rank`, `epochs`,
`max_seq_len`, `learning_rate`). A missing tokenizer or base model id is a refusal, not a match - two
manifests that both omit it are both silent, not equal - and two runs with different recipes differ in
cost because of the recipe, not the platform. When both sides price identically the comparison reports a
**tie** rather than crowning whichever was listed first.

    cost_per_accepted_pair = (training + serving) / accepted_pairs

With one side unpriced the verdict is `INCOMPLETE` and no winner is named. With different checkpoints it
is `NOT_COMPARABLE`. Only when both hold is it `COMPARABLE`, and even then a winner chosen on an estimated
quantity is reported as `ESTIMATE`.

Acceptance rate and cost per accepted pair come from the pilot's measured yield (24 of 25), which is why
the pilot is the input to this comparison rather than a separate experiment.

## Reachability

Which backend can train which checkpoint is a table, not a paragraph (`src/train/reachability.mjs`), and
each row cites the fetched document and quote it came from. The distinction that matters was expensive to
learn:
the serverless **inference** catalogue (`/inference/v1/models`, 20 models, no `HF_BASE_MODEL` field)
answers *what can be served*, while the fine-tuning **cost estimator** (`paramCount`, `managedSft`,
`managedDpo`, LoRA shapes) answers *what can be trained*. Reading the wrong one took the reachable
student set from nine models to two teacher-class ones at twenty times the price per token.

| Checkpoint | Params | Trainable on Fireworks | Trainable on the cluster | LoRA SFT per 1M tokens |
| --- | --- | --- | --- | --- |
| `qwen3-8b` | 8.19B | yes | yes (`Qwen/Qwen3-8B`) | $0.50 |
| `qwen3p5-9b` | 9.41B | yes | no | $0.50 |
| `qwen3-14b` | 14.77B | yes | yes (`Qwen/Qwen3-14B`) | $0.50 |
| `gemma-4-31b-it` | 32.2B | yes | no | $3.00 |
| a >300B teacher | 552B | yes | licence-dependent | $10.00 |

The headline comparison uses a checkpoint available on **both** backends, so the difference between the
two columns is the platform and not the model. The preregistered student (`Qwen2.5-Coder-7B-Instruct`) is
**not trainable on Fireworks** — it is absent from the 44-model fine-tuning catalogue — so the
preregistration is amended to a shared checkpoint rather than quietly substituted.

Every record carries a **full 64-character sha256**, a byte count, a retrieval time and a verbatim quote,
and every table row is checked against the quote printed next to it; a licence is cited from the model it
names rather than assumed, because the cost-estimator states no licences. `npm run check:train-evidence`
re-reads the records without a network, and `node scripts/check-train-evidence.mjs --fetch` re-fetches
each one and reports a genuinely changed page as CHANGED with both digests. This is not decoration: the
file previously held a cost-estimator digest whose first 16 hex characters were real and whose other 48
were invented, and a serving-fees digest truncated to 16 characters.

## What is not built

The cluster backend is documented, not implemented: `run()` throws `NOT_IMPLEMENTED`. Its `plan()` is
implemented and produces the exact command, environment and corpus hash it would run, because the seam is
only real if a second backend can be described without changing anything above it. No cluster is rented
and no spend is authorised by this repository.

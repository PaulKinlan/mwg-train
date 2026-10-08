# Teacher account: OpenAI (ChatGPT subscription via Codex CLI, `openai-codex` provider)

- **Account:** an individual ChatGPT subscription, reached through Codex CLI auth. The `pi` provider
  is `openai-codex` (models `gpt-6-sol`, `gpt-6-astra`, `gpt-5.x`).
- **Endpoints:** ChatGPT / Codex surfaces (consumer), and — if a key is ever used — the OpenAI API
  under the Services Agreement.
- **Determination: PROHIBITED as a teacher** on the consumer surfaces, for two independent reasons
  (automated extraction, and use of output to develop a model). The API/business route is
  **UNVERIFIED**: it is not prohibited outright for a non-competing model, but nothing grants it
  either, and no positive permission was found.
- **Captured:** 2026-10-08 (hashes in `../evidence/manifest.jsonl`).

## Retrieval caveat (read this before trusting the quotes)

`openai.com` returns HTTP 403 to curl from this VM (Cloudflare `cf-mitigated: challenge`) for both
a bot UA and a desktop Chrome UA, and the Internet Archive has no snapshot of the terms pages. The
captures used here came through the `r.jina.ai` plain-text proxy, which renders the live page. The
**origin HTML itself is UNVERIFIED** in this run; the quoted text is the proxy's rendering. A
reviewer should reproduce at least one of these clauses directly from a browser before signing off.

## Governing documents

| Document | Effective date | Applies to this account? | sha256 (16) |
| --- | --- | --- | --- |
| OpenAI Terms of Use | Effective January 1, 2026 | **Yes — governing document for the subscription** | `a856a018caee5ee6` |
| OpenAI Services Agreement (business/API) | Effective January 1, 2026 | Only for API keys / organisational accounts | `b09240f6c6868841` |
| Service Terms | (no date in capture) | Supplements the applicable agreement | captured |
| How your data is used to improve model performance | (no date in capture) | Informational | captured |

## The decisive clauses (consumer subscription)

Terms of Use, "What you cannot do" list, extracted line 21:

> Automatically or programmatically extract data or Output (defined below).

and line 24:

> Use Output to develop models that compete with OpenAI.

The first clause is the operational blocker regardless of what the trained model is: a scripted
harness that drives the subscription to produce hundreds of projects is exactly the automated
extraction of Output that this forbids. The second is the training blocker, and it is
competition-scoped — so it is arguable, but it is not a permission.

Consumer data-use, for completeness (`openai-data-use-rjina`, extracted lines 6-7): OpenAI "may use
your content to train our models" for individual services, with an opt-out through the privacy
portal. Business/API accounts are not trained on by default (extracted line 11).

## The API/business route

Services Agreement §3.3, extracted line 24:

> (e) except for a Permitted Exception, use Output to develop artificial intelligence models that
> compete with OpenAI's products and services; (f) extract data from the Services other than as
> permitted through the Services;

and the definition, extracted line 137:

> “Permitted Exception” means Customer using Output to: (a) develop artificial intelligence models
> primarily intended to categorize, classify, or organize data (e.g., embeddings or classifiers), if
> these models are not distributed or made commercially available to third parties; and (b) fine
> tune or customize models provided as part of OpenAI's fine-tuning or other Services set forth on
> the Pricing Page.

The Permitted Exception does not cover training our own code-generation model on Output. So on the
business route the position is: competing models are prohibited, non-competing models are simply not
addressed, extraction "other than as permitted through the Services" is prohibited, and there is no
affirmative grant. That is a "no" for this experiment until someone with authority says otherwise.

## Consequence for this experiment

- `A3_teacher_generated` from any OpenAI surface: **quarantined**, `excluded_from_training: true`.
- The Codex worker lane may still be used for ordinary coding work (that is what the subscription is
  for). What is forbidden is *generating corpus material* programmatically from it and training on
  the result.
- If an OpenAI teacher arm is ever wanted, the question to ask is narrower and specific: a written
  confirmation that using Output to fine-tune a small, non-competing open-weight model at
  `mwg-train` is permitted. Nothing in the captured text answers that, and silence is not consent.

## Open questions for a human reviewer

- Is a small web-code adapter a model that "competes with OpenAI" under the Services Agreement, or
  under the consumer Terms of Use?
- Does the Codex product have service-specific terms that speak to bulk generation? Only `§4 Codex
  and Code Generation` was captured, and it addresses third-party licences in generated code, not
  corpus use.
- The proxy capture has to be reproduced from the origin before this record is countersigned.

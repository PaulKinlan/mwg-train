# Teacher account: Google — Antigravity consumer account (and the Gemini API contrast)

- **Account:** a consumer Google account used through Antigravity (`pi` provider `antigravity`,
  models `gemini-3.8-flash`, `gemini-3.1-pro`, and the `antigravity/claude-*` entries).
- **Endpoints:** Antigravity (consumer surfaces) and, if used, the Gemini API with a developer key.
- **Determination: PROHIBITED as a teacher** on the consumer surfaces. The Google Terms of Service
  and the Generative AI Additional Terms of Service both prohibit using the services to develop
  machine learning models. The Generative AI Additional Terms were retired for ordinary consumers
  on 2024-05-22, so the operative clause is the one in the Google Terms of Service.
- **Captured:** 2026-10-08 (hashes in `../evidence/manifest.jsonl`).

## Governing documents

| Document | Effective date | Applies to this account? | sha256 (16) |
| --- | --- | --- | --- |
| Google Terms of Service | Effective July 30, 2026 (US country version) | **Yes — this is the governing document** | `50084bed559a2b6b` |
| Generative AI Additional Terms of Service | Last modified August 9, 2023 | **No** — superseded on 2024-05-22 (see below) | `f92ec18e20dd41bc` |
| Gemini API Additional Terms of Service | Effective March 23, 2026, last updated 2026-04-28 UTC | Only for Gemini API / AI Studio keys | `f1da48274ef4a652` |
| Google Cloud Platform Service Terms (contrast only) | rolling "updated by Google from time to time" | Only for Cloud/Vertex | `3cc3d6adfe33fb48` |

## The decisive clause (consumer surfaces)

Google Terms of Service, under "Don't abuse our services", extracted line 115:

> using AI-generated content from our services to develop machine learning models or related AI technology

Neighbouring line 114 of the Google Terms is the second trap for a corpus harness:

> using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities)

This is the cleanest prohibition found in any provider captured here: generating sites with a Google
consumer model and training on the outputs is exactly "using AI-generated content from our services
to develop machine learning models or related AI technology", and there is no "unless you are
building a non-competing model" qualifier to argue about.

Google's own non-ownership statement does not help: the Google Terms say Google "won't claim
ownership" of generated content, but that is a copyright answer, not a permission to use it as
training data.

## Corrected: the Generative AI Additional Terms do not apply here

The Generative AI Additional Terms are often quoted for this prohibition because they contain a
flat one ("You may not use the Services to develop machine learning models or related technology."),
but their own first line retires them for ordinary consumers. Extracted line 25:

> We updated the Google Terms of Service on May 22, 2024 to cover AI-related topics. As of that
> date, these Generative AI Additional Terms of Service no longer apply, unless you're a business
> partner with a signed agreement that references these terms.

So the operative prohibition for this account is the Google Terms of Service clause quoted above.
The Generative AI Additional Terms are captured here as a superseded document, not as a basis for
the determination. (An earlier draft of this record cited them as governing; the correction is
recorded rather than silently overwritten, because the same mistake is easy to make from a search
result.)

## The Gemini API contrast (developer key)

Gemini API Additional Terms, "Use Restrictions", extracted lines 214-216:

> You may not use the Services to develop models that compete with the Services (e.g., Gemini API or
> Google AI Studio). You also may not attempt to reverse engineer, extract or replicate any
> component of the Services, including the underlying data or models (e.g., parameter weights).

This is competitor-scoped, so a small open-weight web-code model is arguably not a competing model.
The second sentence is still a live risk for any "replicate the model's behaviour" framing of the
experiment. A reviewer must decide, and the determination here does not cover the Gemini API: it
covers the consumer surfaces, which are prohibited outright.

Note also that the Gemini API's unpaid tier uses submitted content to improve Google's models
(extracted lines 252-257) — a data-use direction, not a training permission.

## Consequence for this experiment

- `A3_teacher_generated` from Antigravity or any other Google consumer surface: **quarantined**,
  `excluded_from_training: true`.
- The Gemini API is a separate question, held as UNVERIFIED pending review; if it is ever used as a
  teacher it needs its own signed record, and the "extract or replicate any component" sentence has
  to be addressed explicitly.
- Google Cloud / Vertex is a third regime (the Cloud Service Terms captured here do not contain the
  consumer prohibition) and is out of scope for this experiment as it stands.

## Open questions for a human reviewer

- Does Antigravity have its own additional terms that change this (the Antigravity product terms were
  not located and are not captured)?
- If the experiment ever uses a Gemini API key: is a web-code model "a model that competes with the
  Services" for the purposes of these terms?
- Does the Google Cloud/Vertex customer agreement permit training on outputs, and would that route be
  worth pricing against an open-weight teacher?

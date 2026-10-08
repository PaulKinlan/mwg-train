# Teacher account: Z.ai (API key, `zai` provider)

- **Account:** a Z.ai API key, reached through the `pi` provider `zai` (models `glm-5.3`,
  `glm-5.3-flash`, `glm-5.2`). Z.ai's legal entity in the captured terms is JINGSHENG HENGXING
  TECHNOLOGY PTE. LTD.
- **Endpoints:** the Z.ai API and, for the coding plan, the GLM coding surfaces.
- **Determination: PROHIBITED as a teacher.** The API-specific additional terms prohibit using
  prompts or model-generated content to train or fine-tune *external models* outright — this is
  broader than the other providers' "competing model" language and leaves nothing to argue about.
- **Captured:** 2026-10-08 (hashes in `../evidence/manifest.jsonl`).

## URL note

The URLs usually cited for these terms are dead. `https://z.ai/terms` returns 404 and
`https://docs.z.ai/legal/terms-of-service` returns 404 (Mintlify error page); both are recorded as
failed captures in the manifest so the dead links are themselves evidence. The live documents are
under `docs.z.ai/legal-agreement/` and are served as raw markdown with a `.md` suffix, discovered
from the provider's own `sitemap.xml` and `llms.txt`:

| Document | Last update | Applies here? | sha256 (16) |
| --- | --- | --- | --- |
| Terms of Use (includes "Additional Terms for API Services") | April 14, 2026 | **Yes — governing document** | `e9cc402e2c76ad31` |
| Privacy Policy (includes a Data Processing Addendum for API Services) | September 29, 2025 | Yes | captured |
| Usage Policy (GLM Coding Plan) | (no date in capture) | Coding plan only | captured |

## The decisive clause

Additional Terms for API Services, §1.f.xii, extracted line 218:

> Except for authorized integration with your specific business scenarios, any use of the Z.ai's
> models, prompts, or model-generated content for the development, training, labeling, fine-tuning,
> optimization, iteration, or similar activities related to external models is strictly prohibited.
> Furthermore, any utilization of platform models or exported data to develop, train, or enhance
> algorithms or models that compete with us;

That sentence names the exact activity this experiment would do with a Z.ai teacher: using
model-generated content to fine-tune an external model. It is "strictly prohibited" subject only to
a carve-out for "authorized integration with your specific business scenarios", which is a permission
you have to obtain, not a description of this use.

The general terms are narrower and would be arguable on their own, but they do not override the API
terms. Terms of Use §III.4.f, extracted line 41:

> You may not use Z.ai to develop, train, or enhance any algorithms, models, or technologies that
> directly or indirectly compete with us is prohibited.

Also relevant, §III.4.d (extracted line 39): "Reverse engineering, decompiling, disassembling, or
attempting to extract data from Z.ai algorithms, source code, mechanisms, or any related components
is strictly prohibited."

## Data-use direction

Terms of Use §IV, extracted line 76: users retain rights in prompts and in outputs generated at
their request, with the caveat that outputs may be identical to those generated for other users.
For API accounts (extracted line 79): "For enterprises and developers using API Services, we will
not use your User Content for developing or improving Services unless you explicitly agree to such
use." The API additional terms repeat that, and the DPA adds that Z.ai does not store API content.
This direction is favourable to us and irrelevant to our right to train on the output.

## Consequence for this experiment

- `A3_teacher_generated` from `zai`: **quarantined**, `excluded_from_training: true`.
- Note the asymmetry with DeepSeek: DeepSeek's terms expressly permit "training other models (such
  as model distillation)"; Z.ai's API terms expressly prohibit it. Two providers running the same
  model family class, opposite rights, which is exactly why the bead said not to judge by brand.
- Z.ai is also the provider whose GLM-5.3-Flash *weights* are openly published under MIT on Hugging
  Face. As with DeepSeek, self-hosting the checkpoint changes which terms apply: the MIT licence
  governs the weights, and the API terms do not attach to a self-hosted copy.

## Open questions for a human reviewer

- What does "authorized integration with your specific business scenarios" require in practice, and
  is it available to a research project at all? If it were granted, it would be the narrowest route
  to a Z.ai teacher arm — but it is a negotiated permission, not a public term.
- Does the prohibited-use language reach a *dataset* built from outputs (as opposed to weights)? The
  sentence covers "development, training, labeling, fine-tuning, optimization, iteration", which
  reads wide enough to include dataset construction.

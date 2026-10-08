# Teacher account: DeepSeek (open platform API key)

- **Account:** DeepSeek open-platform API key (`pi` provider `deepseek`, model `deepseek-flash`).
- **Endpoints:** `api.deepseek.com` chat/completions.
- **Determination: PERMITTED IN THE CAPTURED TERMS — the only provider captured whose terms
  expressly allow training other models on its outputs.** It is still `A3_teacher_generated` and
  `excluded_from_training` today, because this record is a first pass by a lane and not a legal
  sign-off; the arm un-quarantines when a named human reviewer countersigns this record.
- **Captured:** 2026-10-08 (hashes in `../evidence/manifest.jsonl`).

## Governing documents

| Document | Effective date | sha256 (16) |
| --- | --- | --- |
| DeepSeek Terms of Use (consumer/chat + account conduct) | (stated in capture; see note) | `e5c52c238ff59a6d` |
| DeepSeek Open Platform Terms of Service | Effective April 29, 2026 | `2b433c53cbac7549` |

The Open Platform ToS requires API users to comply with the Terms of Use as well: extracted
lines 73-75 of `deepseek-platform-tos.txt` —

> As a user of this Open Platform Service, you should procure that both of you and your end users
> comply with the requirements of the "DeepSeek Terms of Use" (especially regarding user conduct
> norms) [...]

So both documents have to be read together; a permissive clause in one does not survive a
prohibition in the other.

## The permissive clauses

Terms of Use, section 4.2, extracted lines 240-249:

> (2) We assign any rights, title, and interests—if any—in the Outputs of the Services to you; (3)
> You may apply the Inputs and Outputs of the Services to a wide range of use cases, including
> personal use, academic research, derivative product development, training other models (such as
> model distillation), etc., as long as such usage is legal and adhere to these Terms.

Open Platform ToS, section 4.2, extracted lines 118-126, states the same three points, including:

> (3) You may apply the Inputs and Outputs of the Services to a wide range of use cases, including
> personal use, academic research, derivative product development, training other models (such as
> model distillation), etc.

This is a deliberate, explicit grant. It is the opposite of the Anthropic and Google position and it
is the provider to prefer if the experiment wants an approved teacher arm early.

## Limits on that permission

Open Platform ToS, section 3.1 (extracted lines 78-83): the compliance duty described above, plus no
infringement of others' rights and no disruption of platform order.

Terms of Use, prohibited uses (extracted lines 222-227), include:

> (3) Engaging in activities that infringe on intellectual property rights, trade secrets, and other
> violations of business ethics, or using algorithms, data, platforms, etc., to implement
> monopolistic and unfair competition behaviors.
> (4) Without DeepSeek's authorization, copying, transferring, leasing, lending, selling, or
> sub-licensing the entire or part of the Services.

"Unfair competition behaviors" and "business ethics" are broad enough that a reviewer should read
them, but nothing in either captured document restricts training, distillation or publishing derived
weights. There is also no automated-extraction ban in the captured documents (the crawler language
in the Terms of Use is about DeepSeek's anti-crawling protection for shared conversations, extracted
lines 76-82).

## Data-use direction

Terms of Use 4.3 (extracted lines 250-256): DeepSeek may use Inputs and Outputs "to a minimal
extent" to provide, maintain, operate, develop or improve the Services, with an opt-out
("Improve the model for everyone"). This constrains DeepSeek's use of our prompts; it does not
constrain ours.

## Consequence for this experiment

- Today: `A3_teacher_generated`, `excluded_from_training: true`, like every other teacher arm.
- Recommended next action: make this record the first one put in front of a human reviewer. If they
  countersign, DeepSeek becomes the teacher for the first `A3`-to-approved-arm transition, and the
  `excluded_from_training` flag on those rows can be flipped with a named `approved_by`.
- If the teacher arm does go ahead on DeepSeek, the rows still need: the exact model SKU and version
  string used, the request parameters, a dated capture of the terms in effect on that date, and a
  whitelist of prompts offered. None of that is a legal condition — it is provenance, so a later
  reviewer can tell which terms applied to which asset.

## Open questions for a human reviewer

- The Terms of Use capture does not show an unambiguous "effective date" line; the reviewer should
  pin the version by hash (`e5c52c238ff59a6d`) and by the archived copy nearest the generation date.
- Does "derivative product development" and "training other models" cover publishing the resulting
  model weights publicly, or only private/internal training? The text says "wide range of use
  cases" without a distribution carve-out, but a reviewer should confirm.

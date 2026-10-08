# Asset: Modern Web Guidance (MWG) rules, guides and package

- **Status:** APPROVED for use, storage and training. Distribution and trained-weight publication
  have conditions (see "The five rights"). No sign-off is outstanding for the training use.
- **Owner statement:** Paul, 2026-10-08 — "Mwg rules are fine, it's open project". This record is
  what that sentence resolves to once the actual licence files are read; the point of the record is
  that "open" is not a licence and does not, on its own, answer the five questions below.
- **Captured:** 2026-10-08 (hashes in `../evidence/manifest.jsonl`; hashes below are 16-hex prefixes).
- **Reviewer:** not reviewed by counsel. Legal questions that remain are listed at the end.

## What the asset is

Modern Web Guidance is distributed as the npm package `modern-web-guidance` (a skill bundle of
markdown guides plus a search tool) and authored in `GoogleChrome/modern-web-guidance-src`. The
public repo `GoogleChrome/modern-web-guidance` is a publish target.

- npm version captured: **0.0.193**, published **2026-10-07T16:26:04.768Z**,
  `dist.integrity` `sha512-hpBvFCCQsbh9Tzdjx9HZS+CbJ1qvKrTFR0DxYxihrWUv4eisnw6GW24P+cxQsDwSPDLS4tTdxHyKaB1rAPpWUg==`,
  registry `license` field `Apache-2.0`
  (`mwg-npm-metadata`, sha256 `e47e4d344a4063a0`).
- Skill pin recorded inside the tarball (`package/skills/modern-web-guidance/skill-version.txt`):
  **`2026_09_04-7de96777`**, matching `SKILL.md`.
- Installed on this VM at `~/.agents/skills/modern-web-guidance/`: `SKILL.md` plus 178 guide files
  in 16 categories, no non-markdown files, and no `LICENSE` or `NOTICE` file. The installed files are
  byte-identical to the same members of the published tarball, so what is installed *is* the
  published artefact.
- The published tarball does contain them: `package/LICENSE` (Apache-2.0) and
  `package/THIRD_PARTY_NOTICES`, and it also ships `skills/modern-web-guidance/tfjs_model_minilm/`
  (a bundled MiniLM embedding model), `use-cases.vectors.gen.json.gz`, `assets/logo.png` and
  `.github/img/*.svg`.

## Licence findings

### The package declares one licence; the content is under two

`modern-web-guidance-src/README.md` (sha256 `0b7468c28a1b5362`, extracted lines 411-415):

> ## License
> Unless otherwise noted:
> \* Software code in this repository is licensed under the [Apache License 2.0](LICENSE).
> \* Documentation and guide content under `guides/` are licensed under [Creative Commons Attribution 4.0 International (CC-BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

So the **guides are CC-BY-4.0, not Apache-2.0**. The npm package's `"license": "Apache-2.0"` field
and the tarball's single `LICENSE` file do not distinguish the guide content, which is the part this
experiment actually trains on. Treat CC-BY-4.0 as the governing licence for guide text.

### Apache-2.0 (code)

Operative grant, `mwg-src-license` (sha256 `cfc7749b96f63bd3`, extracted lines 53-58):

> 2. Grant of Copyright License. Subject to the terms and conditions of this License, each
> Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free,
> irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display,
> publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or
> Object form.

Redistribution conditions (lines 74-80): recipients must get a copy of the licence and modified
files must carry prominent notices; `NOTICE` file contents must be retained.

### CC-BY-4.0 (guide content)

`cc-by-4.0-legalcode` (sha256 `9ba9550ad48438d0`), Section 2(a)(1), extracted lines 109-118:

> Subject to the terms and conditions of this Public License, the Licensor hereby grants You a
> worldwide, royalty-free, non-sublicensable, non-exclusive, irrevocable license to exercise the
> Licensed Rights in the Licensed Material to: a. reproduce and Share the Licensed Material, in
> whole or in part; and b. produce, reproduce, and Share Adapted Material.

Conditions, Section 3(a), extracted lines 169-181: when Sharing the Licensed Material (including in
modified form) you must retain creator identification, a copyright notice, a notice referring to
this Public License and a notice referring to the disclaimer of warranties.

CC-BY-4.0 has no field-of-use restriction, no non-commercial term and no training restriction; it
is an attribution licence, not a share-alike licence.

### Derived third-party documentation

Same README block, line 415:

> Portions of the documentation in this project are derived from [MDN Web Docs](https://developer.mozilla.org/) by Mozilla Contributors and [W3C](https://www.w3.org/), [WHATWG](https://whatwg.org), and [IETF](https://www.ietf.org) specifications.

MDN is **CC-BY-SA 2.5 or later** — `mdn-attrib-license` (sha256 `7a63ccd5d40e043a`, extracted lines 128-129):

> The content on MDN Web Docs has been prepared with the contributions of authors from both inside
> and outside Mozilla. Unless otherwise indicated, the content is available under the terms of the
> Creative Commons Attribution-ShareAlike license (CC-BY-SA), v2.5 or any later version.

**But a search of the shipped guides found no embedded MDN text:** three hyperlinks to
`developer.mozilla.org` and no copied prose. Guides paraphrase specs and carry original code
samples. So the residual share-alike risk attaches to the upstream README's derivation statement,
not to anything found in the 178 shipped guides — it is a risk to resolve, not a measured problem.

### Embedded Baseline data

130 lines across the installed guides state a feature's Baseline status as prose (for example
`guides/ui-behaviors/scroll-snap-realtime-feedback.md:102`: "Baseline status for Scroll snap: Widely
available. It's been Baseline since 2020-01-15."). That data comes from
`web-platform-dx/web-features`, which is **Apache-2.0** (`web-features-license`,
sha256 `c71d239df91726fc`; the `LICENSE` path 404s, the correct file is `LICENSE.txt`), and the
underlying support data in `mdn/browser-compat-data` is **CC0-1.0** (`bcd-license`,
sha256 `36ffd9dc085d529a`). Both are distribution-friendly, so the embedded status lines do not add
an obligation.

### Bundled data and models

- `mdn/browser-compat-data` is **CC0-1.0** (public-domain dedication) — `bcd-license`
  (sha256 `36ffd9dc085d529a`).
- `web-platform-dx/web-features` is **Apache-2.0** — `web-features-license`
  (sha256 `c71d239df91726fc`).
- The tarball's `THIRD_PARTY_NOTICES` lists its npm dependencies only
  (`@huggingface/tokenizers` 0.2.0, `@tensorflow/tfjs-*` 4.22.0, `long` 4.0.0, `seedrandom` 3.0.5 —
  all Apache-2.0 or MIT). **The bundled `tfjs_model_minilm` weights have no notice entry and no
  licence statement anywhere in the package.** The upstream MiniLM sentence-transformer family is
  normally Apache-2.0, but this package does not say so.

## The five rights

| Right | Position | Basis |
| --- | --- | --- |
| Use | GRANTED | CC-BY-4.0 §2(a)(1)(a) (guides); Apache-2.0 §2 (code) |
| Storage | GRANTED | same grants; storage is reproduction of the Licensed Material |
| Training on it | GRANTED, no clause restricts it | CC-BY-4.0 has no field-of-use or training restriction; no acceptable-use policy found in any captured file |
| Distribution of the text | GRANTED WITH CONDITIONS | CC-BY-4.0 §3(a) attribution + indication of modifications; Apache-2.0 §4 licence copy, NOTICE retention, change notices for code |
| Publication of trained weights | GRANTED, subject to one legal question | neither licence restricts the licensing of outputs; whether weights are "Adapted Material" under CC-BY-4.0 §1(a) is a legal question this record does not settle |

## Obligations if we redistribute MWG-derived material

1. Attribute Google/the contributors and indicate changes (CC-BY-4.0 §3(a)); the guidance text is
   not the only thing that needs it — any *dataset* we publish built from guide text does too.
2. Keep the Apache-2.0 `LICENSE` and `NOTICE` with any redistributed code from the package.
3. Do not describe the whole artefact as Apache-2.0: the guides are CC-BY-4.0. The npm
   `license` field is wrong for them.
4. The installed skill copy on this VM carries no licence file at all, so a redistribution built
   from the installed copy would silently drop the notices.
5. Trademarks are not licensed: Apache-2.0 §6 grants no trademark rights, so the MWG name and logo
   (`assets/logo.png`, `.github/img/*.svg`) cannot be used to imply endorsement.

## Open questions (for a human reviewer, not this record)

- **Q1** Which guide portions are MDN-derived, and does CC-BY-SA 2.5 share-alike attach to them?
  The shipped guides contain only hyperlinks to MDN, but the upstream README asserts derivation.
- **Q2** What is the licence of the bundled `tfjs_model_minilm` weights, and does the absence of a
  notice entry breach the distribution conditions of whatever that licence is? (Relevant to storing
  or redistributing the package; not needed to train on the guides.)
- **Q3** Are trained weights "Adapted Material" under CC-BY-4.0 §1(a)? Attribution obligations on a
  *dataset* we publish are clear; obligations on *weights* are not.
- **Q4** Spec text quoted or paraphrased in guides (W3C/WHATWG/IETF) — the README names the sources
  but not the terms.

## Evidence

See `../evidence/manifest.jsonl`. Every line quoted above can be reproduced by re-fetching the URL
in that manifest and verifying the sha256, or by running `scripts/capture-rights-evidence.sh` again.

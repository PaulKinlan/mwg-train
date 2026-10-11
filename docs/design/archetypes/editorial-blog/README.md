# Editorial blog — illustrative multi-step visual references

- **Archetype:** `editorial-blog`; article index and search, a long-form article reached by deep link, the author's composer, and the no-results state. This is a NEW archetype on the type axis ([`TYPE-AXIS.md`](../../train/briefs/TYPE-AXIS.md), bead `mwg-train-efg`), not one of the five evaluation families: Paul asked for blogs as a type (2026-10-08) and the corpus had none.
- **Generation:** 2026-10-11 UTC by `scripts/generate-archetype-boards.mjs --write --only editorial-blog`, which passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway (`https://gemini.int.exe.xyz/v1beta/models/gemini-nano-banana-2.1:generateContent`, overridable with `MWG_TRAIN_IMAGE_ENDPOINT`) and fails closed unless the response's `modelVersion` equals the requested model, so all four boards are gateway-attested `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each returned a 1376 × 768 JPEG. The prompt digests are recorded in the provenance register below and in [`docs/provenance/assets/design-reference-editorial-blog.md`](../../../provenance/assets/design-reference-editorial-blog.md), so this brief can be re-run against the same bytes.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are visual planning references, neither generated-site captures nor sealed evaluation targets. Do not use them as corpus inputs, teacher outputs, conformance evidence, or training/evaluation data.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md), which this family is added to once its boards exist.
- **Rights boundary:** The [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md) prohibit using AI-generated service content to develop machine-learning models. No separate image reuse/license clearance, exclusive rights, or a seed were supplied, and no seed is set, so these boards are non-reproducible. Publishing them for operator review does not grant training or commercial reuse permission.
- **Depicted content:** Publication name, headlines, bylines, dates, article body text, tag counts and share counts are illustrative, unverified placeholders. The JPEGs do not prove a working index, search, deep link, share path or accessible reading experience.
- **Why these four states:** the type's contract is that a READER reaches an article by deep link from an index, and that an AUTHOR publishes one. The boards therefore cover the reader's index, the reader's article, the author's composer, and the state where the index has nothing to show - the four states a journey can be written against without inventing a fifth.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-index.jpg`](step1-index.jpg) | Article index with search, tags and excerpt cards | `948370acf1df59694dee09ef8e1f39d71828b4e509dfcfd3503ad6860982fe60` | 569177 |
| [`step2-article.jpg`](step2-article.jpg) | Long-form article reached by deep link, with byline and share | `bd8851156b6d29efe60c0ef30f053af507c1a4710be38b69266f718c038341e7` | 477174 |
| [`step3-composer.jpg`](step3-composer.jpg) | Author's article composer with preview and publish action | `6f51b477cbdc42b1923cea2e61ea8c817164bf22a13853839b62e5c98999af92` | 597331 |
| [`step4-empty.jpg`](step4-empty.jpg) | No-results state for an index search | `638121c46576ec2d3dfd30b3398f01699a63bbf1e9eaa1d2b0a24caf793fd37f` | 441241 |

Hashes pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or legal status. The corpus must derive from its own approved source and measured records, not these images.

## Exact generation prompts

### `step1-index.jpg`

```text
Modern web application UI for a community newspaper's article index, "The Kiln Chronicle". Step 1: Article Index. Dark slate theme (#0f172a page, #1e293b card surface, emerald green #10b981 accent). Clean editorial layout with a masthead and section links, a prominent search field, tag chips (Kiln Firing, Glaze Chemistry, Workshops, Studio Notes), and a list of five article cards, each showing a small thumbnail, headline, a two-line excerpt, byline with author name, publication date, and reading-time. One card is marked "Editor's pick" with a subtle accent border. Modern typography with a serif headline face, generous margins, accessible contrast.
```

### `step2-article.jpg`

```text
Modern web application UI for a community newspaper, "The Kiln Chronicle". Step 2: Long-form Article Reading Page. Dark slate theme (#0f172a page, #1e293b card surface, emerald green #10b981 accent). Shows a single article with a breadcrumb back to the index, a serif headline "What a reduction firing does to a copper glaze", byline "Marguerite Ash, 12 October 2026", a comfortable single column of body prose at reading measure with two subheadings and a pull quote, an inline figure caption, and a sticky share row with copy-link, email and social share actions showing a copied-confirmation. Related-article links and tags at the end. Modern typography, generous line height, accessible contrast.
```

### `step3-composer.jpg`

```text
Modern web application UI for a community newspaper, "The Kiln Chronicle". Step 3: Author Article Composer. Dark slate theme (#0f172a page, #1e293b card surface, emerald green #10b981 accent). Two-column editor: on the left a form with labelled fields for headline, standfirst, byline, section select, tag input with chips, and a large body text area containing prose; on the right a live preview panel rendering the headline, byline and body as they will appear. A sticky action bar holds "Save draft", "Preview" and a prominent "Publish article" button, with a small note that publishing makes the article reachable by its own link. Clean, readable, accessible form styling with visible labels and focus rings.
```

### `step4-empty.jpg`

```text
Modern web application UI for a community newspaper, "The Kiln Chronicle". Step 4: Empty Search State on the Article Index. Dark slate theme (#0f172a page, #1e293b card surface, emerald green #10b981 accent). The search field contains the query "soda firing schedule", tag chips remain visible, and the list area shows a calm empty card: a simple line illustration of an open newspaper, heading "No articles match \"soda firing schedule\"", a suggestion line naming two nearby tags that do have articles, and a "Clear search" action. Modern typography, generous padding, accessible contrast.
```

# Editorial blog — illustrative multi-step visual references

- **Archetype:** `editorial-blog`; article index and search, a long-form article reached by deep link, the author's composer, and the no-results state. This is a NEW archetype on the type axis ([`TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md), bead `mwg-train-efg`), not one of the five evaluation families: Paul asked for blogs as a type (2026-10-08) and the corpus had none.
- **Generation:** 2026-10-11 UTC by `scripts/generate-archetype-boards.mjs --write --only editorial-blog`, which passes `model: gemini-nano-banana-2.1` explicitly to the project's model gateway (`https://gemini.int.exe.xyz/v1beta/models/gemini-nano-banana-2.1:generateContent`, overridable with `MWG_TRAIN_IMAGE_ENDPOINT`) and fails closed unless the response's `modelVersion` equals the requested model, so all four boards are gateway-attested `gemini-nano-banana-2.1`. Recorded settings: `responseModalities: ["IMAGE"]`, temperature 0.7, `maxOutputTokens` 8192; each returned a 1376 × 768 JPEG. The prompt digests are recorded in the provenance register below and in [`docs/provenance/assets/design-reference-editorial-blog.md`](../../../provenance/assets/design-reference-editorial-blog.md), so this brief can be re-run against the same bytes.
- **Policy:** `excluded_from_training: true`, `approved_for_training: false`. These are visual planning references, neither generated-site captures nor sealed evaluation targets. Do not use them as corpus inputs, teacher outputs, conformance evidence, or training/evaluation data.
- **Cross-family provenance:** [Wave 2 image and prompt digest register](../../../provenance/assets/design-reference-wave2.md), which this family is added to once its boards exist.
- **Rights boundary:** The [recorded Google consumer-account terms](../../../provenance/accounts/google-antigravity-consumer.md) prohibit using AI-generated service content to develop machine-learning models. No separate image reuse/license clearance, exclusive rights, or a seed were supplied, and no seed is set, so these boards are non-reproducible. Publishing them for operator review does not grant training or commercial reuse permission.
- **Depicted content:** Publication name, headlines, bylines, dates, article body text, tag counts and share counts are illustrative, unverified placeholders. The JPEGs do not prove a working index, search, deep link, share path or accessible reading experience.
- **Why these four states:** the type's contract is that a READER reaches an article by deep link from an index, and that an AUTHOR publishes one. The boards therefore cover the reader's index, the reader's article, the author's composer, and the state where the index has nothing to show - the four states a journey can be written against without inventing a fifth.

| Ordered board | What the raster depicts | SHA-256 of committed bytes | Bytes |
| --- | --- | --- | ---: |
| [`step1-index.jpg`](step1-index.jpg) | Article index with search, tags and excerpt cards | `0ade125b0a9e8299b6d085e2312fd6dc7d8e28938c1a7bc33d9c65699d15dca0` | 635903 |
| [`step2-article.jpg`](step2-article.jpg) | Long-form article reached by deep link, with byline and share | `6ba32a664cfa0292736b0070060f528edd5e131ead42b40915b9d34275dedc32` | 655644 |
| [`step3-composer.jpg`](step3-composer.jpg) | Author's article composer with preview and publish action | `6746c10e09724c3c7ee0a2359eb98fd42eef44f12fe88ff22eb16790fccb07c9` | 601564 |
| [`step4-empty.jpg`](step4-empty.jpg) | No-results state for an index search | `7a87d88443ee9b36fd3318f657ab9fd4938e77f0a3514e148a2c04d506995dd6` | 427430 |

Hashes pin the handed-off JPEG bytes, not their generating model, prompt-to-pixel reproducibility or legal status. The corpus must derive from its own approved source and measured records, not these images.

## Exact generation prompts

### `step1-index.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity editorial web application UI for an independent ceramics & material arts literary journal, "The Kiln Chronicle", Step 1: Article Index in WARM NEWSPRINT IVORY LIGHT MODE (#fbf9f4 warm cotton-rag paper background reaching all four edges, #ffffff featured story card, #1c1917 deep letterpress charcoal ink, #14532d British racing green / forest ink masthead and interactive controls, #991b1b oxblood editorial rule and "Editor's pick" badge). Classic broadsheet-inspired editorial header with high-contrast serif masthead "The Kiln Chronicle", issue number, section links, prominent search field, and tag chips (Kiln Firing, Glaze Chemistry, Workshops, Studio Notes). Main body lists five long-form article cards with kiln photography thumbnails, literary serif headlines, two-line standfirst excerpts, author bylines, dates, and reading times; the lead card carries an oxblood "Editor's pick" border.
```

### `step2-article.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity editorial web application UI for "The Kiln Chronicle", Step 2: Long-Form Article Reading Page in WARM NEWSPRINT IVORY LIGHT MODE (#fbf9f4 warm cotton-rag paper background reaching all four edges, #1c1917 letterpress ink, #14532d forest green links and share controls, #991b1b oxblood drop-cap and pull-quote border). Shows a breadcrumb back to the index, high-contrast literary serif headline "What a reduction firing does to a copper glaze", byline "Marguerite Ash · 12 October 2026 · 7 min read", a comfortable 65ch single column of body prose with two subheadings, an oxblood-bordered pull quote, an inline stoneware vessel photograph with caption, and a sticky share bar with copy-link, email, and social actions showing a forest-green "Link copied!" badge.
```

### `step3-composer.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity editorial web application UI for "The Kiln Chronicle", Step 3: Author Article Composer in SPLIT NOCTURNAL WRITER DARK MODE & DAYLIGHT PREVIEW (#161614 warm charcoal writer's studio ground on the left editor pane with #fafaf9 ivory text, paired side-by-side with a live #fbf9f4 warm newsprint ivory WYSIWYG preview sheet on the right). Left column holds labelled form inputs for Headline, Standfirst, Byline, Section select, Tag chips, and a Markdown prose textarea. Right column renders the live broadsheet preview with serif typography and pull quote. A sticky bottom bar holds "Save draft", "Preview", and a forest-green (#15803d) "Publish article" button with a note that publishing makes the article reachable by its own deep link.
```

### `step4-empty.jpg`

```text
Render only a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 16:9. NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup. High-fidelity editorial web application UI for "The Kiln Chronicle", Step 4: Empty Search State on the Article Index in WARM NEWSPRINT IVORY LIGHT MODE (#fbf9f4 warm cotton-rag paper background reaching all four edges, #ffffff bordered notice card with #d6d3d1 rules, #1c1917 serif ink, #14532d forest green primary button). Search input contains the query "soda firing schedule" with tag chips visible below the masthead. The main column displays a calm, literary empty-state card with a pen-and-ink line illustration of an open notebook and kiln cone, serif heading "No articles match "soda firing schedule"", suggestion copy naming nearby tags ("Glaze Chemistry" and "Kiln Firing"), and a forest-green "Clear search" button.
```

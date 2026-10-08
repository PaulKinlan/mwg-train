# Assets: third-party site reproduction (clean-room and black-box study classes)

- **Status: public A4 output; quarantined A5 raw captures; neither trainable.**
  `A4_clean_room_reproduction` and `A5_black_box_reproduction` are
  `excluded_from_training: true` and no row in either arm may be approved for training.
  Publication of A4 does not establish training rights in the target site.
- **Why a record exists at all:** the design brief (section 6, item 19) asks whether existing sites
  can be reused. The answer recorded here is a risk position, not a legal conclusion.
- **Captured:** 2026-10-08 (`../evidence/manifest.jsonl`).

## The two classes

| Arm | Method | Standing risk |
| --- | --- | --- |
| `A4_clean_room_reproduction` | one researcher records abstract functional requirements; a second implements from those requirements, without seeing source or assets | clean-room procedure reduces the chance of copying protected expression, but does not licence the target site's copy, branding, imagery, trade dress, content or data |
| `A5_black_box_reproduction` | driven from screenshots, DOM, network traffic and observable behaviour | avoiding source inspection is **not** a legal safe harbour; the reproduction can reproduce protected expression, and reaching the site at all may breach its terms |

## Primary evidence

US Copyright Office, "What Does Copyright Protect?" (`us-copyright-faq`), extracted line 84:

> Copyright does not protect facts, ideas, systems, or methods of operation, although it may protect
> the way these things are expressed.

That sentence is the whole basis for allowing a clean-room arm to exist: the *functional
requirements* extracted from a site are ideas and systems, and the *implementation, copy, imagery
and layout* are expression. It does not follow that a clean-room reproduction is automatically
lawful — branding, logos, distinctive trade dress and any copied text or assets remain outside the
safe part of the sentence.

RFC 9309 (Robots Exclusion Protocol), `rfc9309-robots`, extracted line 79:

> These rules are not a form of access authorization.

This is the sentence that stops `robots.txt` being treated as a licence. A site may permit crawling
of a page and still not permit reproduction of it as a training artefact; and a site may forbid
crawling while the content is nevertheless visible to a human. Either way, `robots.txt` answers a
different question from copyright and contract.

## Position recorded for the experiment

1. **Default: excluded from training.** Both arms prohibit training in `src/provenance/arms.mjs`;
   A4 publishes publicly while A5 stays in the private store. Training exclusion cannot be
   switched off by a per-row flag (`QUARANTINE_NOT_ENFORCED`).
2. **Prefer synthetic.** Abstract functional requirements written from general knowledge of a
   pattern ("a booking flow with a date range and a price summary") are safer than requirements
   derived from one specific live site, and they are indistinguishable as training signal.
3. **Never bypass access controls**, scrape authenticated or private material, or collect personal
   data. That is a bright line independent of the arms above.
4. **No cross-arm movement.** An `A4`/`A5` artefact cannot be relabelled into `A1`/`A2`, and a
   training-approved asset cannot have an `A4`/`A5` parent: `validateManifest` reports
   `QUARANTINED_ANCESTOR`. That check gates training, not A4 publication.
5. **Record rejects, not just winners.** Each attempt gets a row even when it is rejected, so the
   acceptance rate and the selection pressure are visible.

This rights record is provenance evidence, not a site-size or site-terms publication hold.
A4 publication is not conditional on per-site review.

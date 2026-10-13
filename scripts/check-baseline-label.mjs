#!/usr/bin/env node
/**
 * Verify that every floor report we generate carries the attribution label.
 *
 *   node scripts/check-baseline-label.mjs [--json]
 *
 * Coord's decision (2026-10-08, bead mwg-train-6ek): we consume web-uplift's published ruleset, and
 * every floor artifact and report we produce must say 'mwg-train deterministic baseline' explicitly -
 * so nobody reads our deterministic mechanical floor as an official `web-uplift` result. This is the
 * enforced half of that decision; the pin check verifies the ruleset, this verifies the attribution.
 *
 * Coverage fails CLOSED. Every tracked .md/.json is classified in DOCUMENTS or matched by
 * GENERATED_PATTERNS, so a new document has to be decided deliberately - review showed that the earlier
 * phrase-scan was fail-open: a new file saying "our mechanical floor scored 0.805 overall" matched no
 * pattern and passed silently. The floor-report kind is the set that must carry the label, and a
 * document classified as a non-report that states floor evidence is reported as misclassified unless it
 * carries the label or is excluded by name with a reason.
 *
 * Two reports deliberately are NOT in the registry, and the reason matters more than the exclusion:
 *   docs/train/corpus/SERVED.md  reports which ROUTES a project serves. It is a measurement of the
 *     generated server, not a floor value, and it has no committed generator to carry the label - it
 *     was rendered ad hoc. If it is ever promoted to a floor report it needs a generator first.
 *   docs/eval/quotes.jsonl  is a provider PRICING table (per-million-token training prices), not a
 *     measurement of any corpus, so there is no floor result in it to attribute.
 *   docs/train/corpus/served-routes-baseline.json  is the machine-readable form of SERVED.md, excluded
 *     for the same reason: served routes are a property of the scaffold, not a floor value.
 *   pilot/TRAINING_CORPUS.json  records corpus composition and tree hashes and states no floor result -
 *     its only mention of uplift is a comment about disjointness from pilot/CORPUS.json.
 *   pilot/plan.json  and  data/A6_evaluation/targets/manifest.jsonl  are inputs (a plan, and the eval
 *     target set), not measurements of our floor.
 * A floor value that reaches a new artifact without being listed here is still a gap this check cannot
 * see, so the registry is reviewed whenever a report is added - that has now happened three times, which
 * is the honest reason this comment is long.
 *
 * LIMIT OF THE PROVENANCE DETECTOR, stated rather than implied: falseProvenance() recognises attribution
 * through a vocabulary of floor nouns and a closed-class list of phrase boundaries. The second list can be
 * completed - prepositions, pronouns, conjunctions and auxiliaries are closed classes - but the first is a
 * list of NOUNS, and nouns are open: five rounds of review each added one ("measurements", "metrics", the
 * plural "baselines"). So this detector is a secondary guard, not the guarantee. The guarantee is the
 * label: every registered document must carry it, and every tracked document that states floor evidence
 * must be registered or excluded by name. A wording this detector does not recognise is therefore still
 * covered by the label check, which is why the two exist together.
 *   docs/train/briefs/manifest.jsonl  is the briefs corpus, not a floor result.
 * A floor value that reaches a new artifact without being listed here is a gap this check cannot see,
 * so the registry is reviewed whenever a report is added.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { BASELINE_LABEL } from '../src/eval/ruleset.mjs';

/**
 * The kind of every tracked document. This exists because a phrase-based scan is FAIL-OPEN: review showed
 * that a new document saying "our mechanical floor scored 0.805 overall" would pass, since no pattern
 * matched that wording. Coverage now fails closed instead - every tracked .md/.json must be classified
 * here or match a GENERATED_PATTERNS directory, so a new document has to be decided deliberately rather
 * than silently omitted. The FLOOR_EVIDENCE scan survives as a cross-check on the classification, not as
 * the guarantee.
 */
export const DOCUMENT_KINDS = {
  'floor-report': 'states or quotes a floor-derived measurement of our own work; MUST carry the label',
  contract: 'describes how the pipeline, evaluation or attribution works',
  design: 'a proposal or historical design note',
  spec: 'defines briefs, schemas, or package metadata',
  config: 'tool configuration consumed by a checker',
  input: 'a plan, manifest or rule snapshot consumed by a tool',
  'provider-data': 'provider pricing or fetched quotes',
  provenance: 'rights, arms, accounts and asset records',
  'scaffold-report': 'measures the generated server rather than the floor',
  generated: 'a generated per-project tree, matched by pattern rather than listed',
};

/**
 * Generated per-project artefacts, matched by their exact shape.
 *
 * These are deliberately NOT directory-wide exemptions. Review showed that `^docs/eval/briefs/` would have
 * silently exempted a new docs/eval/briefs/new-results.md stating a floor result, because generated paths
 * were skipped before their contents were read - the same fail-open hole as the phrase scan, moved into the
 * classification. Each pattern therefore pins the basename, so a new document inside one of these trees
 * matches nothing and has to be classified.
 */
/**
 * Provenance documents classified by PATTERN rather than by name (mwg-train-7zot).
 *
 * Every reference-board family contributes the same two documents: an archetype README that records the borrowed
 * reference material, its rights and the exact generation prompt, and a register under docs/provenance/assets/
 * that pins the board bytes and prompt digests. Listing them by name meant every new family appended two lines to
 * the same hunk of the same map, so each family's landing conflicted with the next one's and the merger resolved
 * the same union seven times in one batch (the ko9i rebase, then l9zm, z5q7, skm3, ixp9, ew6n). A pattern makes
 * a new family need no edit here at all.
 *
 * Checked AFTER `DOCUMENTS`, so an explicit entry still wins: booking's README is deliberately classified
 * 'design' rather than 'provenance' and stays that way. Nested READMEs are not covered - the `[^/]+` segment
 * means `docs/design/archetypes/<family>/demo/README.md` keeps its own 'design' entry.
 */
export const PROVENANCE_PATTERNS = [
  /^docs\/design\/archetypes\/[^/]+\/README\.md$/,
  /^docs\/provenance\/assets\/design-reference-[^/]+\.md$/,
  // The IANA special-purpose registries derived into data the capture destination policy is checked against, plus the
  // README that says where they came from. Named individually rather than as a directory pattern, for the reason the
  // comment above gives: a new document has to be decided deliberately, and a fourth file appearing here should be a
  // decision rather than a match.
  /^docs\/provenance\/iana\/README\.md$/,
  /^docs\/provenance\/iana\/special-purpose-addresses\.json$/,
];

export const GENERATED_PATTERNS = [
  /^pilot\/projects\/[^/]+\/(?:package|spec)\.json$/,
  /^data\/[^/]+\/targets\/[^/]+\/signature\.json$/,
  /^docs\/eval\/projects\/[^/]+\/[^/]+\/(?:package|spec|tree|snapshot)\.json$/,
  /^docs\/eval\/projects\/index\.json$/,
  // Each archetype's asset-set page is written by scripts/build-archetype-assets.mjs from that
  // archetype's accepted target. Not floor reports: they record what an asset set contains and the
  // rights it inherited, and claim no measurement.
  /^assets\/archetypes\/[^/]+\/README\.md$/,
  /^assets\/archetypes\/[^/]+\/set\.json$/,
];

/**
 * Decode `git ls-files -z` output. The -z flag matters: without it git quotes any path containing a character it
 * considers unusual (core.quotePath defaults to true), so a file named with a non-ASCII directory comes back as
 * "pilot/projects/t\303\253st/package.json" - which matches no DOCUMENTS key and no GENERATED_PATTERN, and produces an
 * UNCLASSIFIED_DOCUMENT finding for a document that is classified correctly. NUL never appears in a path, so
 * splitting on it is exact.
 */
export const decodeTrackedFiles = (stdout) => stdout.split('\0').filter(Boolean);

/** Every tracked document this check classifies: prose and JSON, enumerated so git cannot quote a path. */
export function listTrackedDocuments({ cwd, argv = ['ls-files', '-z', '*.md', '*.json'] } = {}) {
  return decodeTrackedFiles(execFileSync('git', argv, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
}

/** Every tracked prose or JSON document, classified. */
/**
 * The kind this check decides for one document: its name entry, else the provenance patterns, else the generated
 * patterns, else null (which is an UNCLASSIFIED_DOCUMENT finding).
 *
 * Exported because a test that asserts a document is classified has to assert THE MECHANISM. Two tests asserted
 * this file's text contained a literal `'<path>': 'provenance'` line, and broke the moment the reference-board
 * entries became pattern-matched - the merge gate caught it after the fast gate had run only the two suites the
 * coverage map named (mwg-train-7zot). A test that asks the classifier gets the same answer whether the document
 * is classified by name or by pattern, so moving an entry between the two cannot break it again.
 */
export function classifyByPattern(path) {
  if (PROVENANCE_PATTERNS.some((pattern) => pattern.test(path))) return 'provenance';
  if (GENERATED_PATTERNS.some((pattern) => pattern.test(path))) return 'generated';
  return null;
}

export function classifyDocument(path) {
  return DOCUMENTS[path] ?? classifyByPattern(path);
}

export const DOCUMENTS = {
  // Per-demo design contracts (mwg-train-tus). Authoring documents, verified against a freshly
  // generated demo by check:design-schema, and deliberately outside the byte-frozen generated trees.
  'deploy/README.md': 'contract',
  'docs/eval/design/README.md': 'design',
  'docs/eval/design/account-recovery/hono.md': 'design',
  'docs/eval/design/account-recovery/preact.md': 'design',
  'docs/eval/design/account-recovery/raw.md': 'design',
  'docs/eval/design/account-recovery/react.md': 'design',
  'docs/eval/design/account-recovery/svelte.md': 'design',
  'docs/eval/design/account-recovery/vue.md': 'design',
  'docs/eval/design/account-recovery/webcomponents.md': 'design',
  'docs/eval/design/catalogue/hono.md': 'design',
  'docs/eval/design/catalogue/preact.md': 'design',
  'docs/eval/design/catalogue/raw.md': 'design',
  'docs/eval/design/catalogue/react.md': 'design',
  'docs/eval/design/catalogue/svelte.md': 'design',
  'docs/eval/design/catalogue/vue.md': 'design',
  'docs/eval/design/catalogue/webcomponents.md': 'design',
  'docs/eval/design/contact-lead/hono.md': 'design',
  'docs/eval/design/contact-lead/preact.md': 'design',
  'docs/eval/design/contact-lead/raw.md': 'design',
  'docs/eval/design/contact-lead/react.md': 'design',
  'docs/eval/design/contact-lead/svelte.md': 'design',
  'docs/eval/design/contact-lead/vue.md': 'design',
  'docs/eval/design/contact-lead/webcomponents.md': 'design',
  'docs/eval/design/event-registration/hono.md': 'design',
  'docs/eval/design/event-registration/preact.md': 'design',
  'docs/eval/design/event-registration/raw.md': 'design',
  'docs/eval/design/event-registration/react.md': 'design',
  'docs/eval/design/event-registration/svelte.md': 'design',
  'docs/eval/design/event-registration/vue.md': 'design',
  'docs/eval/design/event-registration/webcomponents.md': 'design',
  'docs/eval/design/booking/raw.md': 'design',
  'docs/eval/design/booking/react.md': 'design',
  'docs/eval/design/booking/preact.md': 'design',
  'docs/eval/design/booking/vue.md': 'design',
  'docs/eval/design/booking/hono.md': 'design',
  'docs/eval/design/booking/webcomponents.md': 'design',
  'docs/eval/design/booking/svelte.md': 'design',
  // Functional specifications (mwg-train-8lb). One per archetype rather than one per arm, because routes, the
  // journey and the acceptance criteria are properties of the archetype. Bound to docs/eval/specs/<archetype>.json
  // and checked against it by check:design-schema, so these are specifications rather than proposals.
  'docs/eval/design/booking/plan.md': 'spec',
  'docs/eval/design/catalogue/plan.md': 'spec',
  'docs/eval/design/contact-lead/plan.md': 'spec',
  'docs/eval/design/account-recovery/plan.md': 'spec',
  'docs/eval/design/event-registration/plan.md': 'spec',
  'README.md': 'floor-report',
  // The top-level plan (mwg-train-qxm). Classified as a floor report because it quotes this repository's
  // own measured numbers - corpus token volume, pilot yield, the acceptance split, the gate counts and the
  // brief seal - rather than only describing the pipeline. It carries the label; test/plan.test.mjs asserts
  // that against BASELINE_LABEL so the attribution cannot be dropped from the file without failing.
  'plan.md': 'floor-report',
  // Records the corpus's intentional XSS sinks, and the one real sink the corpus freeze currently
  // protects, so a future audit checks this classification instead of re-deriving it (mwg-train-bkk).
  // A reference about the state of the artifacts, not a report of measured floor evidence: it cites
  // check:specs only to show that the frozen trees did not move.
  '.fleet/coverage-mapping.json': 'contract',
  'docs/KNOWN-SINKS.md': 'provenance',
  'docs/PIPELINE.md': 'floor-report',
  // The vocabulary decision (mwg-train-210): what the default is, what the ideal is, and the three
  // reserved senses of "baseline". A contract rather than a floor report - it states no measurement,
  // it fixes the words the measurements are read with, and check:set-separation enforces them.
  'docs/vocabulary.md': 'contract',
  'docs/eval/conformance/README.md': 'floor-report',
  'docs/eval/conformance/account-recovery-identity.json': 'floor-report',
  'docs/eval/conformance/account-recovery-identity.md': 'floor-report',
  'docs/eval/conformance/booking-identity.json': 'floor-report',
  'docs/eval/conformance/booking-identity.md': 'floor-report',
  'docs/eval/conformance/booking.json': 'floor-report',
  'docs/eval/conformance/booking-cross-arm.json': 'floor-report',
  'docs/eval/conformance/booking-cross-arm.md': 'floor-report',
  'docs/eval/conformance/booking.md': 'floor-report',
  'docs/eval/conformance/catalogue-identity.json': 'floor-report',
  'docs/eval/conformance/catalogue-identity.md': 'floor-report',
  'docs/eval/conformance/contact-lead-identity.json': 'floor-report',
  'docs/eval/conformance/contact-lead-identity.md': 'floor-report',
  'docs/eval/conformance/event-registration-identity.json': 'floor-report',
  'docs/eval/conformance/event-registration-identity.md': 'floor-report',
  'docs/eval/pricing.md': 'floor-report',
  'docs/eval/two-backends.md': 'floor-report',
  'docs/pilot/README.md': 'floor-report',
  'docs/pilot/YIELD.md': 'floor-report',
  'docs/pilot/records.json': 'floor-report',
  'docs/pilot/yield.json': 'floor-report',
  'docs/train/README.md': 'floor-report',
  'docs/train/READINESS-EPIC.md': 'floor-report',
  'docs/train/briefs/README.md': 'floor-report',
  // The archetype type axis (bead mwg-train-efg): what a type is, which types exist, and what each build can
  // currently express. It describes how the corpus and its evaluation are organised, and states no floor result.
  'docs/train/briefs/TYPE-AXIS.md': 'contract',
  'docs/train/corpus/README.md': 'floor-report',
  'docs/train/corpus/YIELD.md': 'floor-report',
  'docs/train/corpus/records.json': 'floor-report',
  'docs/train/corpus/tokens.json': 'floor-report',
  'pilot/CORPUS.json': 'floor-report',
  'docs/design-brief-2026-10-08.md': 'design',
  'docs/design.md': 'design',
  // The train-side archetypes that have a canonical pair but no committed boards yet (mwg-train-0bkp.1,
  // community-forum; mwg-train-59ly.1, dashboard; mwg-train-exvw.1, job-board; mwg-train-5cx2.1,
  // support-helpdesk; mwg-train-a1ux.1, library-catalogue). Classified as design rather than spec because no
  // docs/eval/specs/<archetype>.json exists for them, so check:design-schema does not validate them.
  'docs/design/archetypes/library-catalogue/design.md': 'design',
  'docs/design/archetypes/library-catalogue/plan.md': 'design',
  'docs/design/archetypes/support-helpdesk/design.md': 'design',
  'docs/design/archetypes/support-helpdesk/plan.md': 'design',
  'docs/design/archetypes/job-board/design.md': 'design',
  'docs/design/archetypes/job-board/plan.md': 'design',
  'docs/design/archetypes/dashboard/design.md': 'design',
  'docs/design/archetypes/dashboard/plan.md': 'design',
  'docs/design/archetypes/community-forum/design.md': 'design',
  'docs/design/archetypes/community-forum/plan.md': 'design',
  // The archetype READMEs and their design-reference registers are no longer listed here: they are classified
  // by PROVENANCE_PATTERNS above, so a new family needs no entry in this map (mwg-train-7zot). The one
  // exception is booking's README, which stays explicit because it is 'design', not 'provenance'.
  'docs/design/archetypes/account-recovery/demo/README.md': 'design',
  'docs/design/archetypes/account-recovery/design.md': 'design',
  'docs/design/archetypes/account-recovery/plan.md': 'design',
  'docs/design/archetypes/booking/README.md': 'design',
  'docs/design/archetypes/booking/design.md': 'design',
  'docs/design/archetypes/booking/plan.md': 'design',
  'docs/design/archetypes/contact-lead/design.md': 'design',
  'docs/design/archetypes/contact-lead/plan.md': 'design',
  'docs/design/archetypes/booking/demo/README.md': 'design',
  'docs/design/archetypes/catalogue/demo/README.md': 'design',
  'docs/design/archetypes/catalogue/design.md': 'design',
  'docs/design/archetypes/catalogue/plan.md': 'design',
  'docs/design/archetypes/contact-lead/demo/README.md': 'design',
  'docs/design/archetypes/event-registration/demo/README.md': 'design',
  'docs/design/archetypes/event-registration/design.md': 'design',
  'docs/design/archetypes/event-registration/plan.md': 'design',
  // The first archetype authored outside the five evaluation families (bead mwg-train-efg): a board brief whose
  // prompts the generator reads. Classified like the other archetype READMEs that record borrowed reference
  // material and its rights.
  // The type's two contract documents, in the section order src/design/contract.mjs requires of a design and a
  // plan document. Classified as 'design' like the eval side's equivalents that describe how a page should look
  // and behave; neither states a measured corpus result.
  'docs/design/archetypes/editorial-blog/design.md': 'design',
  'docs/design/archetypes/editorial-blog/plan.md': 'design',
  // The register that pins the new archetype's board bytes and prompt digests, in the same shape as the other
  // design-reference records. Classified as provenance, not as a floor report: it records borrowed reference
  // material and its rights, and states no measured result of the corpus.
  // The second archetype outside the five evaluation families (bead mwg-train-efg), same shapes and the same
  // reasoning as the block above: the README records borrowed reference material and its rights, the two
  // contract documents describe how a page should look and behave, and the register pins board bytes and prompt
  // digests. None of them states a measured result of the corpus.
  'docs/design/archetypes/fan-community-site/design.md': 'design',
  'docs/design/archetypes/fan-community-site/plan.md': 'design',
  'docs/design/archetypes/course-enrolment/design.md': 'design',
  'docs/design/archetypes/course-enrolment/plan.md': 'design',
  'docs/design/archetypes/directory-listing/design.md': 'design',
  'docs/design/archetypes/directory-listing/plan.md': 'design',
  'docs/design/archetypes/docs-site/design.md': 'design',
  'docs/design/archetypes/docs-site/plan.md': 'design',
  'docs/design/archetypes/expense-tracker/design.md': 'design',
  'docs/design/archetypes/expense-tracker/plan.md': 'design',
  'docs/design/archetypes/onboarding-auth/design.md': 'design',
  'docs/design/archetypes/onboarding-auth/plan.md': 'design',
  'docs/design/archetypes/restaurant-ordering/design.md': 'design',
  'docs/design/archetypes/restaurant-ordering/plan.md': 'design',
  'docs/design/archetypes/web-shop/design.md': 'design',
  'docs/design/archetypes/web-shop/plan.md': 'design',
  // The community-forum reply-refusal board (bead mwg-train-tzy0), same shape and the same reasoning as
  // the job-board, web-shop and survey-form blocks above: the README records borrowed reference material
  // and its rights, and the register pins board bytes and the prompt digest. Neither states a measured
  // result of the corpus.
  // The job-board posting-refusal board (bead mwg-train-ko9i), an in-family training archetype rather than
  // one of the five evaluation families: same shape and the same reasoning as editorial-blog above - the
  // README records borrowed reference material and its rights, and the register pins board bytes and the
  // prompt digest. Neither states a measured result of the corpus.
  // The web-shop empty-cart board (bead mwg-train-l9zm), an in-family training archetype rather than one of the
  // five evaluation families: same shape and the same reasoning as editorial-blog above - the README records
  // borrowed reference material and its rights, and the register pins board bytes and the prompt digest.
  // Neither states a measured result of the corpus.
  // The survey-form validation-refusal board (bead mwg-train-z5q7), same shape and the same reasoning as
  // the job-board and web-shop blocks above: the README records borrowed reference material and its
  // rights, and the register pins board bytes and the prompt digest. Neither states a measured result of
  // the corpus.
  // The expense-tracker entry-refusal board (bead mwg-train-skm3), same shape and the same reasoning as the
  // blocks above: the README records borrowed reference material and its rights, and the register pins board
  // bytes and the prompt digest. Neither states a measured result of the corpus.
  // The restaurant-ordering empty-order refusal board (bead mwg-train-ixp9), same shape and the same
  // reasoning as the blocks above: the README records borrowed reference material and its rights, and the
  // register pins board bytes and the prompt digest. Neither states a measured result of the corpus.
  // The library-catalogue reservation-refusal board (bead mwg-train-ew6n), same shape and the same
  // reasoning as the blocks above: the README records borrowed reference material and its rights, and the
  // register pins board bytes and the prompt digest. Neither states a measured result of the corpus.
  // The third archetype outside the five evaluation families (bead mwg-train-efg), same shapes and the same
  // reasoning again: a board brief, two contract documents, and a digest register, none of which states a
  // measured result of the corpus.
  'docs/design/archetypes/product-card-comparison/design.md': 'design',
  'docs/design/archetypes/product-card-comparison/plan.md': 'design',
  'docs/eval/ATTRIBUTION.md': 'contract',
  'docs/eval/PREREGISTRATION.md': 'contract',
  'docs/eval/deepseek-cost-projection.md': 'floor-report', // quotes deterministic corpus characters; model costs remain conditional and unmeasured
  'docs/eval/deepseek-checkpoint-matrix.md': 'design', // provisional model decision and quote provenance, not a floor result
  'docs/eval/decode-config.deepseek-flash.json': 'config', // proposed request knobs, not a measured floor result
  'docs/eval/evaluator-interface-contract.md': 'design', // preregistration amendment draft, not yet ratified
  'docs/eval/owner-identity.json': 'config',
  'docs/eval/pricing.sheets.md': 'provider-data',
  'docs/eval/quotes.raw/fetched.json': 'provider-data',
  'docs/eval/rules.json': 'input',
  'docs/provenance/README.md': 'provenance',
  'docs/provenance/accounts/anthropic-claude-max.md': 'provenance',
  'docs/provenance/accounts/deepseek-api.md': 'provenance',
  'docs/provenance/accounts/google-antigravity-consumer.md': 'provenance',
  'docs/provenance/accounts/openai-codex.md': 'provenance',
  'docs/provenance/accounts/zai-api.md': 'provenance',
  'docs/provenance/assets/design-layouts.md': 'provenance',
  'docs/provenance/assets/eval-targets.md': 'provenance',
  'docs/provenance/assets/mwg-modern-web-guidance.md': 'provenance',
  'docs/provenance/assets/reproduction-studies.md': 'provenance',
  'docs/provenance/assets/student-base-models.md': 'provenance',
  'docs/provenance/assets/training-targets.md': 'provenance',
  // Teacher-model visual reference boards for the 30 training families (bead mwg-train-mhd). Model output that is
  // published as planning documentation and deliberately kept out of the corpus, so it carries a rights record here
  // rather than a corpus manifest row.
  'docs/provenance/assets/training-reference-boards.md': 'provenance',
  'docs/provenance/assets/reference-board-gaps.md': 'provenance',
  'docs/provenance/assets/board-states.json': 'provenance',
  'docs/provenance/assets/archetype-asset-sets.md': 'provenance',
  // The one HAND-WRITTEN file in an asset store, and deliberately classified by name rather than by
  // pattern: it adjudicates a brand the accepted target states ambiguously or not at all, so a new
  // adjudication has to be classified on purpose instead of inheriting a classification.
  'assets/archetypes/booking/decisions.json': 'provenance',
  'assets/archetypes/account-recovery/decisions.json': 'provenance',
  'assets/archetypes/event-registration/decisions.json': 'provenance',
  'docs/provenance/original-refs.md': 'provenance',
  'docs/quarantine.md': 'provenance',
  'docs/eval/briefs/SCHEMA.md': 'spec',
  'docs/eval/projects/README.md': 'spec',
  'docs/eval/specs/README.md': 'spec',
  'docs/eval/specs/account-recovery.json': 'spec',
  'docs/eval/specs/booking.json': 'spec',
  'docs/eval/specs/catalogue.json': 'spec',
  'docs/eval/specs/contact-lead.json': 'spec',
  'docs/eval/specs/event-registration.json': 'spec',
  'pilot/TRAINING_CORPUS.json': 'composition',
  'docs/train/briefs/SCHEMA.md': 'spec',
  'docs/train/briefs/EXPANSION-PLAN.md': 'design',
  'docs/train/briefs/expansion-matrix.json': 'spec',
  'docs/train/corpus/SERVED.md': 'scaffold-report',
  'docs/train/corpus/served-routes-baseline.json': 'scaffold-report',
  // Training family specs (bead mwg-train-hud). One plan.md and one design.md per tr-* family:
  // the plan is bound to the family's canonical brief row, the design to the family's authored
  // target board, and `npm run check:train-design` compares both to those sources.
  'docs/train/design/README.md': 'design',
  'docs/train/design/tr-01/plan.md': 'spec',
  'docs/train/design/tr-01/design.md': 'design',
  'docs/train/design/tr-02/plan.md': 'spec',
  'docs/train/design/tr-02/design.md': 'design',
  'docs/train/design/tr-03/plan.md': 'spec',
  'docs/train/design/tr-03/design.md': 'design',
  'docs/train/design/tr-04/plan.md': 'spec',
  'docs/train/design/tr-04/design.md': 'design',
  'docs/train/design/tr-05/plan.md': 'spec',
  'docs/train/design/tr-05/design.md': 'design',
  'docs/train/design/tr-06/plan.md': 'spec',
  'docs/train/design/tr-06/design.md': 'design',
  'docs/train/design/tr-07/plan.md': 'spec',
  'docs/train/design/tr-07/design.md': 'design',
  'docs/train/design/tr-08/plan.md': 'spec',
  'docs/train/design/tr-08/design.md': 'design',
  'docs/train/design/tr-09/plan.md': 'spec',
  'docs/train/design/tr-09/design.md': 'design',
  'docs/train/design/tr-10/plan.md': 'spec',
  'docs/train/design/tr-10/design.md': 'design',
  'docs/train/design/tr-11/plan.md': 'spec',
  'docs/train/design/tr-11/design.md': 'design',
  'docs/train/design/tr-12/plan.md': 'spec',
  'docs/train/design/tr-12/design.md': 'design',
  'docs/train/design/tr-13/plan.md': 'spec',
  'docs/train/design/tr-13/design.md': 'design',
  'docs/train/design/tr-14/plan.md': 'spec',
  'docs/train/design/tr-14/design.md': 'design',
  'docs/train/design/tr-15/plan.md': 'spec',
  'docs/train/design/tr-15/design.md': 'design',
  'docs/train/design/tr-16/plan.md': 'spec',
  'docs/train/design/tr-16/design.md': 'design',
  'docs/train/design/tr-17/plan.md': 'spec',
  'docs/train/design/tr-17/design.md': 'design',
  'docs/train/design/tr-18/plan.md': 'spec',
  'docs/train/design/tr-18/design.md': 'design',
  'docs/train/design/tr-19/plan.md': 'spec',
  'docs/train/design/tr-19/design.md': 'design',
  'docs/train/design/tr-20/plan.md': 'spec',
  'docs/train/design/tr-20/design.md': 'design',
  'docs/train/design/tr-21/plan.md': 'spec',
  'docs/train/design/tr-21/design.md': 'design',
  'docs/train/design/tr-22/plan.md': 'spec',
  'docs/train/design/tr-22/design.md': 'design',
  'docs/train/design/tr-23/plan.md': 'spec',
  'docs/train/design/tr-23/design.md': 'design',
  'docs/train/design/tr-24/plan.md': 'spec',
  'docs/train/design/tr-24/design.md': 'design',
  'docs/train/design/tr-25/plan.md': 'spec',
  'docs/train/design/tr-25/design.md': 'design',
  'docs/train/design/tr-26/plan.md': 'spec',
  'docs/train/design/tr-26/design.md': 'design',
  'docs/train/design/tr-27/plan.md': 'spec',
  'docs/train/design/tr-27/design.md': 'design',
  'docs/train/design/tr-28/plan.md': 'spec',
  'docs/train/design/tr-28/design.md': 'design',
  'docs/train/design/tr-29/plan.md': 'spec',
  'docs/train/design/tr-29/design.md': 'design',
  'docs/train/design/tr-30/plan.md': 'spec',
  'docs/train/design/tr-30/design.md': 'design',
  'package.json': 'spec',
  'package-lock.json': 'spec',
  'pilot/README.md': 'contract',
  'pilot/plan.json': 'input',
  // The train-side archetype pair for survey-form (bead mwg-train-3p21.1). Registered here rather than beside
  // the other archetype entries because this branch and the merge-queued library-catalogue branch would
  // otherwise both insert at the same line and conflict; the classification is the same as theirs.
  'docs/design/archetypes/survey-form/design.md': 'design',
  'docs/design/archetypes/survey-form/plan.md': 'design',
};

/** The documents that must carry the label, derived from the classification. */
export const REGISTRY = Object.entries(DOCUMENTS)
  .filter(([, kind]) => kind === 'floor-report')
  .map(([path]) => path)
  .sort();

/**
 * Check that every tracked document is classified, and that the classification matches what it says.
 *   - UNCLASSIFIED_DOCUMENT  - a new document nobody has decided about (the fail-closed part)
 *   - MISCLASSIFIED_DOCUMENT - a document classified as a non-report that states floor evidence without
 *                              carrying the label and without a recorded exclusion
 */
export function checkDocumentClassification(paths) {
  const findings = [];
  for (const path of paths) {
    const kind = classifyDocument(path);
    if (!kind) {
      findings.push({
        code: 'UNCLASSIFIED_DOCUMENT',
        subject: path,
        message: 'not in DOCUMENTS and matched by no pattern; classify it as a floor report (which must carry the label) or as the kind of document it is',
      });
      continue;
    }
    if (kind === 'generated') continue;
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (kind === 'floor-report') {
      if (!text.includes(BASELINE_LABEL)) {
        findings.push({
          code: 'UNLABELLED_FLOOR_REPORT',
          subject: path,
          message: `classified as a floor report but does not carry '${BASELINE_LABEL}'`,
        });
      }
      continue;
    }
    // Cross-check only. The scan is a heuristic and is known to be incomplete, so it decides nothing on
    // its own; it asks whether a non-report was classified correctly. A document that states floor
    // evidence is either a floor report, excluded by name, or carrying the label.
    if (FLOOR_EVIDENCE.test(text) && !EXCLUSIONS[path] && !text.includes(BASELINE_LABEL)) {
      findings.push({
        code: 'MISCLASSIFIED_DOCUMENT',
        subject: path,
        message: `classified as '${kind}' but states floor evidence; classify it as 'floor-report' (and label it), or record an exclusion with the reason`,
      });
    }
  }
  return findings;
}

/**
 * Shapes that claim web-uplift's authorship of OUR floor. Two review rounds found phrasing this
 * detector did not cover - first 'Generated by web-uplift' and "web-uplift's official baseline", then
 * 'web-uplift built this floor' - each time because the pattern list covered the phrasings it was
 * written for rather than the claim it is named after.
 *
 * The set is now narrower in a different way, which matters more than adding verbs: an authoring verb
 * only counts when the same clause names a floor-like object. 'web-uplift published the catalog' is a
 * true statement about their artefact and must not be flagged, while 'web-uplift built this floor' is a
 * false claim about ours. So the verb list is broad but the object check keeps it honest.
 */
const BY_FROM = /\b(?:by|from)\s+`?web-uplift\b/i;
const POSSESSIVE = /\bweb-uplift(?:'s|\u2019s)\s+\w+/i;
const OFFICIAL = /\bofficial\s+`?web-uplift\b/i;
const AUTHORING_VERB = /\bweb-uplift\s+(?:generated|produced|output|released|created|authored|wrote|written|built|made|constructed|scored|computed)\b/i;
/** 'a web-uplift product', 'a web-uplift deliverable' - authorship by noun rather than by verb. */
const AUTHORING_NOUN = /\bweb-uplift\s+(?:product|work|deliverable|artefact|artifact|result|output|baseline|floor|report)\b/i;
// Plurals throughout, and the measurement nouns a report actually uses. Review found "web-uplift's
// baselines for our corpus" missed because only the singular was listed, and "their baseline
// measurements" missed because 'measurement' was not a floor noun at all - the same failure as the
// registry, in a smaller vocabulary: a list covers what its author pictured.
const FLOOR_OBJECT =
  /\b(?:floors?|baselines?|reports?|numbers?|deltas?|results?|scores?|yields?|conformance|percentages?|measurements?|metrics?|figures?|values?|outputs?|tables?|counts?|statistics|sums?|totals?|rates?|ratios?|timings?|latenc(?:y|ies)|tokens?|hours?|costs?|prices?|gpu-hours?|datasets?|samples?)\b/i;

// The head test reads the noun WEB-UPLIFT possesses, where 'report' is normally theirs - "cites
// web-uplift's report alongside its guide" is a true statement review caught being flagged. The general
// FLOOR_OBJECT still applies to by/from and verb attributions, where "this report was assembled by
// web-uplift" must flag.
const POSSESSED_FLOOR_OBJECT =
  /\b(?:floors?|baselines?|numbers?|deltas?|results?|scores?|yields?|conformance|percentages?|measurements?|metrics?|figures?|values?|outputs?|tables?|counts?|statistics|sums?|totals?|rates?|ratios?|timings?|latenc(?:y|ies)|tokens?|hours?|costs?|prices?|gpu-hours?|datasets?|samples?)\b/i;
/**
 * Tokens that END a noun phrase, so what follows the possessive can be read as the phrase they possess.
 * "their rules for floor scores" possesses 'rules' (the preposition starts a new phrase); "their
 * rules-aligned independently verified mechanical baseline" possesses 'baseline'. Deciding this by nearby
 * words, which I tried twice, produced false positives on the first and missed the second.
 */
// Closed-class words only: every English preposition, the pronouns and determiners, the conjunctions,
// and the auxiliaries. That makes this list completable in a way a list of nouns is not - which is the
// distinction I had been missing while adding words one at a time. Review found 'alongside' absent, and
// it is a preposition, so it belongs to a set I can finish rather than guess at.
const NOUN_PHRASE_STOP =
  /^(?:aboard|about|above|across|after|against|along|alongside|amid|amidst|among|amongst|anti|around|as|at|before|behind|below|beneath|beside|besides|between|beyond|but|by|concerning|considering|despite|down|during|except|excepting|excluding|following|for|from|in|inside|into|like|minus|near|of|off|on|onto|opposite|outside|over|past|per|plus|regarding|round|save|since|than|through|throughout|till|to|toward|towards|under|underneath|unlike|until|unto|up|upon|via|within|without|all|another|any|anybody|anyone|anything|both|each|either|else|enough|everybody|everyone|everything|few|he|her|hers|herself|him|himself|his|i|it|its|itself|many|me|mine|more|most|much|my|myself|neither|no|nobody|none|nothing|one|ones|other|others|our|ours|ourselves|several|she|some|somebody|someone|something|that|their|theirs|them|themselves|these|they|this|those|us|we|what|whatever|which|whichever|who|whoever|whom|whose|you|your|yours|yourself|yourselves|and|nor|or|so|yet|although|though|while|whereas|because|unless|until|whether|if|then|am|is|are|was|were|be|been|being|do|does|did|done|have|has|had|having|can|could|may|might|must|shall|should|will|would|not)$/i;

/**
 * The head noun of the phrase a possessive possesses: the last token before the phrase ends.
 */
function possessedHead(possessiveNoun, tail) {
  const words = tail.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  // The possessive noun itself belongs to the phrase: it is the head when nothing follows before the
  // phrase ends, as in "web-uplift's floor for us".
  const phrase = [possessiveNoun];
  for (const word of words) {
    if (NOUN_PHRASE_STOP.test(word)) break;
    phrase.push(word);
  }
  return phrase[phrase.length - 1];
}

/**
 * A clause ending in a copula (optionally with adverbs) makes the possessive a predicate complement, so
 * "our baseline IS actually web-uplift's ruleset" claims identity. Requiring the tail to be a copula and
 * nothing else keeps "our baseline is built from web-uplift's rules" as the sourcing statement it is.
 */
const IDENTITY_TAIL =
  /(?:is|are|was|were|be|been|being|remains?|stays?|becomes?|equals?|constitutes?)\s+(?:(?:actually|really|genuinely|still|now|just|simply|merely|always)\s+)*$/i;

/** Nouns for web-uplift's own artefact. A clause about one of these is not a claim about our floor. */
const THEIR_ARTEFACT = /\b(?:catalog(?:ue)?|guide|guides|guidance|ruleset|rules?|skill|manifest|docs|documentation|package|hash|hashes|data)\b/i;

/** The sentence or clause a match sits in, so a negation elsewhere cannot excuse a claim. */
function clauseAround(text, index) {
  const boundaries = ['.', ';', ':', '!', '?', '\n'];
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (boundaries.includes(text[i])) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i += 1) {
    if (boundaries.includes(text[i])) {
      end = i;
      break;
    }
  }
  return { clause: text.slice(start, end), offset: index - start };
}

/**
 * Whether the report claims web-uplift's authorship. A negation immediately before the claim, IN THE
 * SAME CLAUSE, means the report is disclaiming it - the label's own line says "not an official
 * `web-uplift` result", and a check that flagged that would fail on every report it must accept.
 *
 * Scoping to the clause is the part that was wrong before: a 24-character lookback made
 * 'Not a mock; built by web-uplift' read as disclaimed, because the negation was in the previous
 * clause entirely.
 */
export function falseProvenance(text) {
  // `kind` matters: the three attribution shapes decide differently, and conflating them caused a bug -
  // the by/from rule looks at the noun on either side of the entity, which for a possessive is part of the
  // phrase the head rule already reads. "web-uplift's per-guide scores" was skipped by the by/from rule
  // seeing the artefact word 'guide'.
  const candidates = [
    { pattern: BY_FROM, kind: 'byfrom', needsFloorObject: false },
    { pattern: OFFICIAL, kind: 'byfrom', needsFloorObject: false },
    { pattern: POSSESSIVE, kind: 'possessive', needsFloorObject: false },
    { pattern: AUTHORING_VERB, kind: 'verb', needsFloorObject: true },
    { pattern: AUTHORING_NOUN, kind: 'noun', needsFloorObject: false },
  ];
  for (const { pattern, kind, needsFloorObject } of candidates) {
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      const { clause, offset } = clauseAround(text, match.index);
      const aboutFloor = FLOOR_OBJECT.test(clause);
      // What the preposition attaches to decides whether this is a floor claim. "Our baseline uses rules
      // from web-uplift" says where the RULES came from - true, and not a claim about our floor - while
      // "numbers from web-uplift" says the numbers are theirs. Review found the first case flagged as a
      // false positive, which is the failure mode that gets a check switched off.
      if (kind === 'byfrom') {
        const before = clause.slice(0, offset).trim().split(/\s+/).slice(-4).join(' ');
        // "rules from web-uplift" and "from web-uplift rules" are the same true statement; the artefact noun
        // can be on either side of the entity, so both are checked.
        const after = (clause.slice(offset + match[0].length).match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []).slice(0, 1).join(' ');
        if (THEIR_ARTEFACT.test(before) || THEIR_ARTEFACT.test(after)) continue;
      }
      // A possessive attaches to the noun that follows it. "web-uplift's rules" is theirs and true;
      // "web-uplift's official baseline" is a claim about ours. Review found the first flagged because
      // 'baseline' appeared elsewhere in the same clause. The noun is usually INSIDE the match, since the
      // possessive pattern captures it, so it is read from there.
      if (kind === 'possessive') {
        const possessiveNoun = /(?:'s|\u2019s)\s+([\w-]+)/i.exec(match[0]);
        // What decides this is WHAT IS POSSESSED: the head noun of the phrase that follows the possessive.
        // "their rules" possesses their artefact and is true; "their rules-based baseline", "their rules
        // based baseline" and "their rules-aligned independently verified mechanical baseline" all possess
        // a baseline, so all three are claims about our floor. A preposition ends the phrase, so "their
        // rules for floor scores" still possesses 'rules' and is not a claim about our scores.
        const nounEnd = offset + possessiveNoun.index + possessiveNoun[0].length;
        const tail = clause.slice(nounEnd).split(/[,;:.!?]/)[0];
        const head = possessedHead(possessiveNoun[1], tail);
        // "our baseline IS actually web-uplift's ruleset" claims identity rather than sourcing, even though
        // the noun is theirs - the copula makes it a predicate complement.
        const prefix = clause.slice(0, offset);
        const claimsIdentity = FLOOR_OBJECT.test(prefix) && IDENTITY_TAIL.test(prefix);
        if (!POSSESSED_FLOOR_OBJECT.test(head) && !claimsIdentity) continue;
      }
      // A clause that names only their artefact is a true statement about their work - "the canonical
      // catalog published by web-uplift" - and flagging it would make the check wrong about the thing it
      // is right about. Only a clause about our floor (or one that names neither, and so implicitly
      // reads as ours) counts as a claim.
      if (THEIR_ARTEFACT.test(clause) && !aboutFloor) continue;
      if (needsFloorObject && !aboutFloor) continue;
      const before = clause.slice(0, offset);
      if (/(?:^|[\s"'(\-])(?:not|never|no|isn'?t|is not|was not|were not|does not|do not|did not)\b[^,;:]{0,24}$/i.test(before)) continue;
      return match[0];
    }
  }
  return null;
}

/**
 * Check a set of report paths. Exported so a test can point it at fixtures; the CLI passes REGISTRY.
 */
export function checkBaselineLabel(paths) {
  const findings = [];
  for (const path of paths) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (error) {
      findings.push({ code: 'REPORT_MISSING', subject: path, message: `the report is registered but could not be read: ${error?.message ?? error}` });
      continue;
    }
    if (!text.includes(BASELINE_LABEL)) {
      findings.push({ code: 'LABEL_MISSING', subject: path, message: `does not contain the required label '${BASELINE_LABEL}'` });
      continue;
    }
    const claim = falseProvenance(text);
    if (claim) {
      findings.push({ code: 'FALSE_PROVENANCE', subject: path, message: `claims provenance it does not have: '${claim}'` });
    }
  }
  return findings;
}

/**
 * Files that mention floor evidence but are not floor reports, with the reason. Data, not prose, so the
 * check can skip them and the reason is reviewable in one place.
 */
export const EXCLUSIONS = {
  'docs/train/corpus/SERVED.md': 'reports which routes the generated server serves - a property of the scaffold, not a floor value; no committed generator',
  'docs/train/corpus/served-routes-baseline.json': 'the machine-readable form of SERVED.md, same reason',
  'docs/eval/quotes.jsonl': 'a provider pricing table, not a measurement of any corpus',
  'pilot/TRAINING_CORPUS.json': 'corpus composition and tree hashes; states no floor result',
  'pilot/plan.json': 'an input - the pilot plan - not a measurement',
  'data/A6_evaluation/targets/manifest.jsonl': 'an input - the eval target set - not a measurement of our floor',
  'docs/design-brief-2026-10-08.md': 'the original design brief; its accepted-pair figures are targets in a proposal, not measured results',
  'docs/train/briefs/EXPANSION-PLAN.md': 'future authoring plan mentions accepted pairs as a downstream gate, but states no measured floor result',
  'docs/eval/PREREGISTRATION.md': 'states the registered design and its comparison arms, not a measured result - and a pre-registration is the one document that should not be retro-edited to carry a later label',
  'docs/train/design/tr-17/plan.md': "the journey fill value 'CPH 42/108/0019' - a synthetic county parish holding number copied from the tr-17 brief - matches the N/M floor-evidence heuristic; the document states no measurement of our work",
  'docs/provenance/README.md': 'defines what the provenance arms ARE (including the deterministic uplift arm) for rights purposes; it reports no measurement of its own',
  // The CIDR prefixes this file exists to hold - "240.0.0.0/4", "2001::/23" - match the N/M floor-evidence heuristic. It
  // is registry data with a source and a date, not a measurement of our work, and the data cannot be reworded the way a
  // sentence can, which is what this list is for.
  'docs/provenance/iana/special-purpose-addresses.json': 'the IANA special-purpose registries as data; its slashed prefixes are CIDR notation and match the N/M heuristic, and registry rows are not ours to reword',
};

/**
 * The phrasing that means a document states or quotes a floor-derived measurement.
 *
 * This exists because the registry was wrong four times. A list can only cover what its author thought
 * of; a scan covers what is in the tree. Every time a reviewer found a file I had missed, the miss was a
 * doc quoting a number in wording I had not pictured, so the pattern is deliberately broad and the
 * exclusions are the explicit part.
 *
 * KNOWN AND INTENTIONAL TRIGGER (coord ruling, 2026-10-08, bead mwg-train-e1c): the bare `\d+/\d+`
 * branch has no context, so a live character counter like `0/500` matches it and a design-labelled
 * document containing one is reported as MISCLASSIFIED_DOCUMENT. That is deliberate. The remedies that
 * look obvious do not work: a denominator threshold cannot separate a counter from `91/135` or `36/142`,
 * which are genuine pair counts, and requiring a nearby word such as "projects" would miss precisely the
 * documents this branch was added for. LOOSENING IT IS NOT AN OPTION - it would trade a visible annoyance
 * for an invisible omission, and the omission is the failure that shipped four times.
 *
 * The remedy is REWORDING, verified against this pattern: `0 of 500` and `0 / 500 max` and
 * `capped at 500 characters` all pass, while `7/7`, `91/135` and `(3/5 ` still match. The behaviour is
 * pinned by a test so it stays a stated property rather than a surprise for whoever meets it next.
 */
export const FLOOR_EVIDENCE =
  /deterministic (?:mw[sg] )?(?:repair|baseline|floor)|uplift(?:ed)?_sha|uplift_edits|accepted pairs|pairs accepted|projects? (?:passed|driven)|journeys? (?:passed|driven)|token estimate|\(\s*\d+\s*(?:of|\/) ?\d+ |\b\d+\/\d+\b/i;

const asJson = process.argv.includes('--json');

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = [...checkBaselineLabel(REGISTRY)];
  let scanned = 0;
  let trackedFiles = [];
  try {
    trackedFiles = listTrackedDocuments();
    scanned = trackedFiles.length;
    findings.push(...checkDocumentClassification(trackedFiles));
  } catch (error) {
    findings.push({ code: 'SCAN_FAILED', subject: 'git ls-files', message: `could not list tracked files: ${error?.message ?? error}` });
  }
  if (asJson) {
    // Machine output is JSON and nothing else: a caller that parses it must not have to strip a
    // trailing human line. The failure detail still goes to stderr, which is not parsed.
    console.log(JSON.stringify({ label: BASELINE_LABEL, checked: REGISTRY.length, scanned, classified: Object.keys(DOCUMENTS).length, excluded: Object.keys(EXCLUSIONS).length, findings }, null, 2));
  } else {
    for (const finding of findings) console.log(`FINDING ${finding.code} ${finding.subject} ${finding.message}`);
  }
  if (findings.length) {
    console.error(`check-baseline-label: FAIL - ${findings.length} finding(s); a floor report is unattributed or misattributed`);
    process.exit(1);
  }
  // Counted rather than described: the two pattern lists classify documents as different KINDS, so a summary
  // that lumps them together as "generated" would misstate what the checker decided (mwg-train-7zot).
  const byPattern = { provenance: 0, generated: 0 };
  for (const path of trackedFiles) {
    if (DOCUMENTS[path]) continue;
    const kind = classifyByPattern(path);
    if (kind) byPattern[kind] += 1;
  }
  if (!asJson) console.log(`check-baseline-label: PASS - ${REGISTRY.length} floor report(s) carry '${BASELINE_LABEL}'; all ${scanned} tracked document(s) are classified (${Object.keys(DOCUMENTS).length} by name, ${byPattern.provenance} by the provenance pattern, and the rest by generated pattern), and no document classified as a non-report states floor evidence without the label (${Object.keys(EXCLUSIONS).length} excluded by name)`);
}

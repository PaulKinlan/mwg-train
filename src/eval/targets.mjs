/**
 * The families that have a target design, and where the target's bytes live.
 *
 * A "family" here is the brief family a target is the achievable ideal for. The pilot's five
 * archetypes are the families that exist end to end today, so they are the ones rendered; the shapes
 * are keyed by family id, so the held-out brief families can be added one at a time without touching
 * the renderer, the metrics or the scorer.
 *
 * The authored source is `docs/eval/targets/<family>/` (ours, committed). The rendered bytes are the
 * corpus asset and live under the `A6_evaluation` arm (`data/A6_evaluation/targets/...`), which is
 * the storage root that arm's provenance record requires and which is never trainable.
 */
export const TARGETS_DIR = 'docs/eval/targets';
export const TARGETS_STORAGE = 'data/A6_evaluation/targets';
export const TARGETS_MANIFEST = `${TARGETS_STORAGE}/manifest.jsonl`;
export const TARGETS_RIGHTS_REF = 'docs/provenance/assets/eval-targets.md';

/** The authored-in-this-repository licence. Nothing here is third-party material. */
export const TARGETS_LICENSE = 'CC0-1.0 (authored in this repository; project-owned)';

/** Fixed so the manifest is reproducible: an authoring date, not a re-run date. */
export const TARGETS_CREATED_AT = '2026-10-08T12:15:00Z';

export const TARGET_FAMILIES = Object.freeze([
  { family_id: 'booking', archetype: 'booking', title: 'Evening class booking' },
  { family_id: 'catalogue', archetype: 'catalogue', title: 'Searchable reference catalogue' },
  { family_id: 'contact-lead', archetype: 'contact-lead', title: 'Public-service enquiry form' },
  { family_id: 'account-recovery', archetype: 'account-recovery', title: 'Account sign-in and recovery' },
  { family_id: 'event-registration', archetype: 'event-registration', title: 'Event registration with capacity' },
]);

export const TARGET_VIEWPORT = Object.freeze({ width: 1280, height: 900 });

/**
 * The R2 identity budget: how much two framework variants that share a target may differ before the
 * difference is a finding rather than a framework's markup convention.
 *
 * The floors are the measured per-axis minimum across the five pilot families, less a deliberate
 * margin - structural measured 0.805 (budget 0.75), geometry 0.972 (0.90), controls 1.000 (0.95),
 * overall 0.912 (0.80). A budget that simply admits the measurement would never fire; one set far
 * below it (0.6 everywhere) leaves a third of the range free and would rubber-stamp a real
 * regression. `controls` is tightest because a form is a form in every framework; `structural`
 * allows the most, because that is where a framework's own wrapper and template scaffolding live.
 */
/**
 * A floor per identity axis. The keys must cover EVERY axis `variantIdentity` measures (IDENTITY_AXES), because
 * `identityFindings` judges against the axes the BUDGET names - an axis measured but absent here is silently
 * unjudged, which reads as agreement. The two lists are equal today and a test ties them together so that
 * adding a measured axis without a floor fails loudly rather than going quietly unjudged (mwg-train-om6).
 */
export const IDENTITY_BUDGET = Object.freeze({ structural: 0.75, geometry: 0.9, controls: 0.95, overall: 0.8 });

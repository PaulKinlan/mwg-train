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

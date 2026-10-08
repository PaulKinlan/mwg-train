/**
 * The training families that have an authored target design, and where their assets live.
 *
 * Authored source: `docs/train/targets/<family_id>/index.html` (independent HTML/CSS).
 * Storage: `data/A1_self_generated/targets/<family_id>/`
 *
 * Distinct from evaluation targets in `data/A6_evaluation/targets/`. The training targets are
 * CC0-1.0 project-owned assets in the A1_self_generated arm, marked excluded_from_training: true
 * as conformance measurement instruments.
 */

export const TRAINING_TARGETS_DIR = 'docs/train/targets';
export const TRAINING_TARGETS_STORAGE = 'data/A1_self_generated/targets';
export const TRAINING_TARGETS_MANIFEST = `${TRAINING_TARGETS_STORAGE}/manifest.jsonl`;
export const TRAINING_TARGETS_RIGHTS_REF = 'docs/provenance/assets/training-targets.md';
export const TRAINING_TARGETS_LICENSE = 'CC0-1.0 (authored in this repository; project-owned)';
export const TRAINING_TARGETS_CREATED_AT = '2026-10-10T12:00:00Z';
export const TRAINING_TARGET_VIEWPORT = Object.freeze({ width: 1280, height: 900 });

export const TRAINING_TARGET_FAMILIES = Object.freeze([
  { family_id: 'tr-01', archetype: 'booking', title: 'Mobile bicycle mechanic service booking' },
  { family_id: 'tr-02', archetype: 'web-shop', title: 'Seasonal cider pre-orders and local pickup' },
  { family_id: 'tr-03', archetype: 'booking', title: 'Pottery studio shared kiln firings schedule' },
  { family_id: 'tr-04', archetype: 'dashboard', title: 'Community solar array daily output and member credits' },
  { family_id: 'tr-05', archetype: 'onboarding-auth', title: 'Wildlife rehabilitation volunteer intake and credentials' },
  { family_id: 'tr-06', archetype: 'directory-listing', title: 'Craft guild artisan profiles and studio open days' },
  { family_id: 'tr-07', archetype: 'event-registration', title: 'Dark sky observatory public viewing night sign-up' },
  { family_id: 'tr-08', archetype: 'support-helpdesk', title: 'Community darkroom maintenance and supply requests' },
  { family_id: 'tr-09', archetype: 'course-enrolment', title: 'Wild edibles identification field course booking' },
  { family_id: 'tr-10', archetype: 'survey-form', title: 'Residential street safety and crosswalk feedback survey' },
  { family_id: 'tr-11', archetype: 'restaurant-ordering', title: 'Sourdough cottage bakery weekly loaf orders' },
  { family_id: 'tr-12', archetype: 'job-board', title: 'Local heat pump and solar installer apprenticeships' },
  { family_id: 'tr-13', archetype: 'docs-site', title: 'Backyard composting guidelines and soil test registry' },
  { family_id: 'tr-14', archetype: 'directory-listing', title: 'Self-guided heritage walking tour stops and transcripts' },
  { family_id: 'tr-15', archetype: 'expense-tracker', title: 'Tenant collective maintenance expense logging' },
  { family_id: 'tr-16', archetype: 'library-catalogue', title: 'Rare perennial cuttings and seed strain index' },
  { family_id: 'tr-17', archetype: 'booking', title: 'Rural farm animal vet visit scheduling' },
  { family_id: 'tr-18', archetype: 'web-shop', title: 'Bring-your-own-container bulk dry goods orders' },
  { family_id: 'tr-19', archetype: 'booking', title: 'Tidal river rowing skiff safety and tide tracker' },
  { family_id: 'tr-20', archetype: 'community-forum', title: 'Traditional tune tune-sheet repository and tempo notes' },
  { family_id: 'tr-21', archetype: 'booking', title: 'Volunteer driver hospital appointment lift coordination' },
  { family_id: 'tr-22', archetype: 'dashboard', title: 'Urban forestry street tree health reporting' },
  { family_id: 'tr-23', archetype: 'survey-form', title: 'Home energy retrofit subsidy eligibility check' },
  { family_id: 'tr-24', archetype: 'booking', title: 'Weekend farmers market pitch booking and power requirements' },
  { family_id: 'tr-25', archetype: 'docs-site', title: 'Community elder oral history recordings and transcript index' },
  { family_id: 'tr-26', archetype: 'web-shop', title: 'Single-origin coffee subscription renewal and grind preference' },
  { family_id: 'tr-27', archetype: 'booking', title: 'Parish church acoustic concert seat selection' },
  { family_id: 'tr-28', archetype: 'support-helpdesk', title: 'Outdoor equipment loan repair and missing part tickets' },
  { family_id: 'tr-29', archetype: 'expense-tracker', title: 'Memorial tree fund contributions and planting site tracker' },
  { family_id: 'tr-30', archetype: 'event-registration', title: 'Low-tide beach cleanup zone assignment and kit allocation' },
]);

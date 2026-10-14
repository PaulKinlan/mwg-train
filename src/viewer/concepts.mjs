import { accessSync, closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { escapeHtml, page } from './pages.mjs';
import { readJpegDimensions } from './tuning.mjs';
import { TRAINING_ARCHETYPE_IDS } from '../../pilot/training-archetypes.mjs';
import { archetypeBrief, inheritedTrainingPrompt, stepImagePrompt, trainingBrief, trainingBriefs } from './concept-briefs.mjs';

// The gallery serves the GENERATED archetype reference boards for the types authored beyond the five evaluation
// families, through the same allowlisted two-segment route the journeys use. It is a literal list on purpose: the
// hand-drawn `layout-*.jpg` sketches this section used to show are retired from the page, and a filesystem listing
// must not be able to put a picture on it. One board per type is featured here; the journeys below carry each
// type's whole sequence.
const BOARDS = [
  { archetype: 'editorial-blog', id: 'step1-index', title: 'Blog index', grammar: 'Publishing · Read', note: 'An article index with search, tags and excerpt cards; the article it leads to is reached by its own address.', alt: 'Reference board of a blog article index with search, tag filters and excerpt cards.' },
  { archetype: 'fan-community-site', id: 'step4-moderation', title: 'Moderator queue', grammar: 'Community · Operate', note: 'A moderator deciding whether a fan contribution becomes visible, with the reason the fan will read.', alt: 'Reference board of a moderation queue with approve and hold decisions and a reason field.' },
  { archetype: 'product-card-comparison', id: 'step2-compare', title: 'Card comparison', grammar: 'Commerce · Compare', note: 'Attributes aligned by row across the options being compared, so the differences can be read across.', alt: 'Reference board of a side-by-side product comparison table with aligned attribute rows.' },
  { archetype: 'scroll-storytelling-launch', id: 'step2-scroll-exploded-anatomy', title: 'Scroll-scrubbed driver anatomy', grammar: 'Launch · Storytelling', note: 'A pinned chapter scrubbing an exploded planar driver with anchor-positioned callouts and a reduced-motion toggle.', alt: 'Reference board of a scroll-scrubbed headphone driver anatomy chapter with anchor callouts.' },
  { archetype: 'browser-puzzle-game', id: 'step2-midgame-interaction', title: 'Signal routing & oscilloscope', grammar: 'Game · Play', note: 'A keyboard-and-pointer 6x6 signal routing grid with a live waveform oscilloscope and move undo stack.', alt: 'Reference board of a 6x6 browser puzzle game with signal routing and oscilloscope.' },
  { archetype: 'saas-workspace-board', id: 'step2-command-palette-popover', title: 'Kanban & Cmd+K popover', grammar: 'Workspace · Operate', note: 'A three-pane sprint board with a non-modal popover command palette and anchor-tethered status actions.', alt: 'Reference board of a SaaS sprint board with an open command palette popover and right-hand inspector.' },
  { archetype: 'realtime-telemetry-dashboard', id: 'step2-brush-zoom-and-drilldown', title: 'Telemetry brush & drill-down', grammar: 'Telemetry · Monitor', note: 'A time-window brush over multi-series wind generation with a turbine drill-down drawer and accessible table.', alt: 'Reference board of an offshore wind telemetry dashboard with a brushed time window and turbine detail drawer.' },
  { archetype: 'interactive-product-configurator', id: 'step2-drivetrain-and-wheelset-swap', title: 'Live build configurator & BOM', grammar: 'Commerce · Configure', note: 'A split-stage custom bicycle configurator with exclusive step accordions and a live itemised bill of materials.', alt: 'Reference board of a titanium gravel bicycle configurator with wheelset selection and itemised BOM.' },
  { archetype: 'developer-media-playground', id: 'step2-transcript-search-highlight', title: 'Synth playground & cue transcript', grammar: 'Developer · Experiment', note: 'A split-pane WebAudio/CSS playground with synced tutorial transcript cues and search highlights.', alt: 'Reference board of a developer media playground with code editor, waveform timeline and highlighted transcript.' },
];
// The A6 arm is a SEALED five-archetype evaluation set: fixed by design, held out from the training families, and
// never extended by a directory listing, so it stays a literal allowlist on purpose - a name from the filesystem must
// not be able to add itself to the evaluation set. The A1 arm is the opposite: its families are declared by the
// manifest its renderer writes, so the 30 training families (and any family added later) appear without an edit here.
const EVAL_TARGETS = new Set(['account-recovery', 'booking', 'catalogue', 'contact-lead', 'event-registration']);
const TRAINING_TARGET_DIR = 'data/A1_self_generated/targets';
const TRAINING_FAMILY = /^tr-\d{2}$/;
// The DESIGNED board for a family, and the register that records its model and digests. A designed board is a
// different kind of artefact from the harness target render: one is a picture authored by an image model, the other
// is a deterministic headless-Chrome capture of the family's authored HTML board. The page must never let a reader
// mistake one for the other, so the two are labelled and rendered separately.
const TRAINING_BOARD_DIR = 'docs/design/training';
const TRAINING_BOARD_REGISTER = 'docs/provenance/assets/training-reference-boards.md';
// Only these reviewed files may be served; the pictured journey need not match the functional spec.
const JOURNEYS = {
  booking: [
    { id: 'step1-browse', title: 'Browse options' },
    { id: 'step2-form', title: 'Enter booking details' },
    { id: 'step3-confirmation', title: 'Review confirmation' },
    { id: 'step4-error', title: 'Recover from an error' },
    { id: 'step5-empty', title: 'Empty state' },
  ],
  catalogue: [
    { id: 'step1-grid', title: 'Browse products' },
    { id: 'step2-cart', title: 'Review cart' },
    { id: 'step3-empty', title: 'Empty search state' },
  ],
  'contact-lead': [
    { id: 'step1-form', title: 'Consultation form' },
    { id: 'step2-success', title: 'Depicted acknowledgement' },
    { id: 'step3-refusal', title: 'Invalid-submit refusal' },
  ],
  'account-recovery': [
    { id: 'step1-request', title: 'Request reset link' },
    { id: 'step2-sent', title: 'Depicted inbox notice' },
    { id: 'step3-refusal', title: 'Refused address' },
  ],
  'event-registration': [
    { id: 'step1-event', title: 'Select event ticket' },
    { id: 'step2-pass', title: 'Depicted ticket pass' },
    { id: 'step3-refusal', title: 'Capacity or validation refusal' },
  ],
  // The authored types beyond the evaluation families (bead mwg-train-efg). Literal like the rest: a directory that
  // appeared on disk must not be able to serve itself, and only reviewed boards are listed.
  'editorial-blog': [
    { id: 'step1-index', title: 'Article index' },
    { id: 'step2-article', title: 'Article by deep link' },
    { id: 'step3-composer', title: 'Author composer' },
    { id: 'step4-empty', title: 'No search matches' },
  ],
  'fan-community-site': [
    { id: 'step1-collection', title: 'Browse the collection' },
    { id: 'step2-contribution', title: 'Contribute an artefact' },
    { id: 'step3-my-contributions', title: 'Own contributions and status' },
    { id: 'step4-moderation', title: 'Moderator decides visibility' },
    { id: 'step5-visitor', title: 'What a visitor sees' },
  ],
  'product-card-comparison': [
    { id: 'step1-cards', title: 'Inspect the cards' },
    { id: 'step2-compare', title: 'Compare attributes' },
    { id: 'step3-selected', title: 'Carry the selection forward' },
    { id: 'step4-empty', title: 'Nothing chosen to compare' },
  ],
  'scroll-storytelling-launch': [
    { id: 'step1-hero-overview', title: 'Hero & sticky chapter nav' },
    { id: 'step2-scroll-exploded-anatomy', title: 'Scroll-scrubbed driver anatomy' },
    { id: 'step3-finish-material-switcher', title: 'Finish & ear-pad material switcher' },
    { id: 'step4-spec-comparison-drawer', title: 'Spec comparison drawer & calculator' },
  ],
  'browser-puzzle-game': [
    { id: 'step1-board-initial', title: 'Initial daily puzzle board' },
    { id: 'step2-midgame-interaction', title: 'Active signal routing & oscilloscope' },
    { id: 'step3-invalid-collision-state', title: 'Rejected phase collision at D4' },
    { id: 'step4-victory-stats-dialog', title: 'Solved puzzle & streak statistics' },
  ],
  'saas-workspace-board': [
    { id: 'step1-board-and-inspector', title: 'Three-pane Kanban & inspector' },
    { id: 'step2-command-palette-popover', title: 'Cmd+K command palette popover' },
    { id: 'step3-filtered-table-view-transition', title: 'Grouped table & bulk selection' },
    { id: 'step4-empty-filter-and-quick-create', title: 'Empty filter & quick-create validation' },
  ],
  'realtime-telemetry-dashboard': [
    { id: 'step1-live-overview', title: 'Simulated sector overview & KPIs' },
    { id: 'step2-brush-zoom-and-drilldown', title: 'Time-window brush & B-07 drill-down' },
    { id: 'step3-scenario-simulator', title: 'Dispatch & revenue what-if simulator' },
    { id: 'step4-alert-rule-validation', title: 'Contradictory alert rule & incident log' },
  ],
  'interactive-product-configurator': [
    { id: 'step1-frame-and-geometry', title: 'Frame size, geometry & finish' },
    { id: 'step2-drivetrain-and-wheelset-swap', title: 'Drivetrain & wheelset swap' },
    { id: 'step3-compatibility-conflict', title: 'Tyre/mudguard clearance conflict' },
    { id: 'step4-saved-build-comparison-sheet', title: 'Saved build comparison & share link' },
  ],
  'developer-media-playground': [
    { id: 'step1-split-pane-playground', title: 'Split-pane playground & transport' },
    { id: 'step2-transcript-search-highlight', title: 'Transcript search & time cue' },
    { id: 'step3-syntax-diagnostic-state', title: 'Syntax diagnostic & paused preview' },
    { id: 'step4-preset-gallery-and-export-dialog', title: 'Preset gallery & patch export' },
  ],
  'community-forum': [{ id: 'step3-refusal', title: 'Reply refusal' }],
  'expense-tracker': [{ id: 'step1-error', title: 'Invalid entry' }],
  'job-board': [{ id: 'step1-error', title: 'Posting refusal' }],
  'library-catalogue': [{ id: 'step3-refusal', title: 'Reservation refusal' }],
  'restaurant-ordering': [{ id: 'step1-error', title: 'Empty checkout refusal' }],
  'survey-form': [{ id: 'step3-validation', title: 'Required answer validation' }],
  'web-shop': [{ id: 'step1-empty', title: 'Empty basket' }],
};
const IMAGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function confinedFile(root, dir, filename) {
  const subdir = relative(root, dir);
  if (subdir.startsWith('..') || subdir.startsWith('/') || filename.includes('/')) return null;
  try {
    if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory() ||
        lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) return null;
    const file = join(dir, filename);
    if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) return null;
    if (realpathSync(dir) !== join(realpathSync(root), subdir)) return null;
    if (realpathSync(file) !== join(realpathSync(dir), filename)) return null;
    // A regular confined file that this process cannot open is not an available image.
    // This probes permission without loading bytes; the GET rechecks confinement below.
    accessSync(file, constants.R_OK);
    return file;
  } catch {
    // An absent, replaced or unreadable reference is unavailable, not a path to follow.
    return null;
  }
}

/** Serve a JPEG from the confined single-segment reference location under `docs/design/archetypes/`.
 *  The three hand-drawn `layout-*.jpg` concept boards are RETIRED from the page: they stay in the repository as the
 *  design-language history `docs/design.md` records, and the viewer no longer serves them, so this route carries no
 *  board allowlist any more. Every reference the page shows is a generated archetype board, served through the
 *  allowlisted two-segment route in conceptJourneyStep below. */
function conceptImageFile(repoRoot, name) {
  if (!IMAGE_NAME.test(name)) return null;
  const root = join(repoRoot, 'docs/design');
  return confinedFile(root, join(root, 'archetypes'), `${name}.jpg`);
}

let warnedMissingFdPath = false;

function macOSOpenFileMatches(file, expected, opened) {
  // Darwin has no procfs fd pathname. Verify the opened inode is still the
  // regular file at the canonical path and directory, not a switched ancestor.
  // This is a best-effort identity fallback, not an atomic openat-style walk
  // against an adversary who repeatedly renames the directory during checks.
  const current = lstatSync(file, { bigint: true });
  return current.isFile() && current.dev === opened.dev && current.ino === opened.ino &&
    realpathSync(dirname(file)) === dirname(expected) && realpathSync(file) === expected;
}

/** Read an allowlisted image only after the caller has checked its path confinement.
 *  The opened fd is independently bound to the expected canonical location. */
export function readConfinedImage(repoRoot, file, type) {
  if (!file) return null;
  let fd;
  try {
    // The path probe can race with a replacement. Open the leaf without following
    // links, then validate the *opened fd's* identity: O_NOFOLLOW alone does not
    // stop a swapped ancestor directory from redirecting the open.
    const expected = join(realpathSync(repoRoot), relative(repoRoot, file));
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile()) return null;
    try {
      if (realpathSync(`/proc/self/fd/${fd}`) !== expected) return null;
    } catch (error) {
      // An fd lookup can be denied by a sandbox as well as absent on this host.
      // Classify those failures here so Darwin can verify by inode and other
      // hosts emit the one-shot diagnostic rather than silently returning 404.
      if (!['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP', 'ESTALE'].includes(error?.code)) throw error;
      if (process.platform === 'darwin') {
        if (!macOSOpenFileMatches(file, expected, opened)) return null;
      } else {
        if (!warnedMissingFdPath) {
          warnedMissingFdPath = true;
          console.warn('concept image serving unavailable: procfs fd identity cannot be verified on this host');
        }
        return null;
      }
    }
    return { bytes: readFileSync(fd), type };
  } catch (error) {
    // Known read/open races are unavailable images, not HTTP 500s. A missing
    // procfs without a verifiable macOS fallback also fails closed above.
    if (['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EISDIR', 'ELOOP', 'ESTALE'].includes(error?.code)) return null;
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function conceptImage(repoRoot, name) {
  return readConfinedImage(repoRoot, conceptImageFile(repoRoot, name), 'image/jpeg');
}

/** Only fixed archetype/step pairs are public; neither path segment comes from a filesystem listing. */
function journeyStepFile(repoRoot, archetype, id) {
  if (!Object.hasOwn(JOURNEYS, archetype) || typeof id !== 'string') return null;
  const isDark = id.endsWith('-dark');
  const baseId = isDark ? id.slice(0, -5) : id;
  if (!JOURNEYS[archetype].some((step) => step.id === baseId)) return null;
  const root = join(repoRoot, 'docs/design');
  const archetypeDir = join(root, 'archetypes', archetype);
  try {
    if (lstatSync(archetypeDir).isSymbolicLink() || !lstatSync(archetypeDir).isDirectory()) return null;
  } catch {
    return null;
  }
  return confinedFile(root, isDark ? join(archetypeDir, 'dark') : archetypeDir, `${baseId}.jpg`);
}

export function conceptJourneyStep(repoRoot, archetype, id) {
  return readConfinedImage(repoRoot, journeyStepFile(repoRoot, archetype, id), 'image/jpeg');
}

/** Preserve the booking accessor for existing callers and tests. */
export function conceptBookingStep(repoRoot, id) {
  return conceptJourneyStep(repoRoot, 'booking', id);
}

/** The A1 arm's declared training families, read from the manifest its renderer writes
 *  (data/A1_self_generated/targets/manifest.jsonl). The manifest is the DECLARATION and the file under the family
 *  directory is the EVIDENCE: a family is listed only when both agree, so a stale or hostile line cannot put a
 *  label on the page that the bytes do not back. Duplicate declarations keep the first and the order is sorted, so
 *  the page is stable between reads. */
function trainingFamilies(repoRoot) {
  const root = join(repoRoot, TRAINING_TARGET_DIR);
  let lines;
  try {
    if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) return [];
    lines = readFileSync(join(root, 'manifest.jsonl'), 'utf8').split('\n');
  } catch {
    // An absent or unreadable manifest publishes no family at all: the page says pending, not a guessed name.
    return [];
  }
  const families = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try { entry = JSON.parse(trimmed); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    const id = entry.family_id;
    if (typeof id !== 'string' || !TRAINING_FAMILY.test(id)) continue;
    if (entry.arm !== 'A1_self_generated' || entry.kind !== 'asset') continue;
    if (entry.image_path !== `${TRAINING_TARGET_DIR}/${id}/target.png`) continue;
    if (families.has(id)) continue;
    families.set(id, {
      id,
      archetype: typeof entry.archetype === 'string' ? entry.archetype : null,
      title: typeof entry.title === 'string' ? entry.title : null,
      origin: typeof entry.origin === 'string' ? entry.origin : null,
    });
  }
  return [...families.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The confined file for one declared A1 family, without re-reading the manifest. */
function trainingTargetFile(repoRoot, id) {
  if (typeof id !== 'string' || !TRAINING_FAMILY.test(id)) return null;
  const root = join(repoRoot, TRAINING_TARGET_DIR);
  return confinedFile(root, join(root, id), 'target.png');
}

/** The PNG's own IHDR dimensions, read from the bytes about to be served. Measured rather than declared on
 *  purpose: a manifest's viewport is the capture's CSS viewport (1280x900) and a full-page capture is TALLER, so
 *  using it as an img width/height would reserve the wrong box and shift the page when the image loads. Null when
 *  the header cannot prove a size, so the attribute is omitted rather than guessed. */
function pngSize(file) {
  try {
    const header = Buffer.alloc(24);
    const fd = openSync(file, 'r');
    try {
      if (readSync(fd, header, 0, 24, 0) !== 24) return null;
    } finally {
      closeSync(fd);
    }
    if (header.readUInt32BE(0) !== 0x89504e47 || header.readUInt32BE(4) !== 0x0d0a1a0a) return null;
    if (header.toString('latin1', 12, 16) !== 'IHDR') return null;
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  } catch {
    return null;
  }
}

/** A bounded read of a file's head: enough for a JPEG SOF marker without pulling a whole 900 KB board into memory
 *  to measure it. A marker that runs past the window yields no size, which is reported as an absent size. */
function boundedHead(file, bytes) {
  try {
    const fd = openSync(file, 'r');
    let head;
    try {
      const buffer = Buffer.alloc(bytes);
      const read = readSync(fd, buffer, 0, bytes, 0);
      head = read > 0 ? buffer.subarray(0, read) : null;
    } finally {
      closeSync(fd);
    }
    return head;
  } catch {
    return null;
  }
}

/** The register that records each designed board's model and digests, but ONLY when it is actually in the tree. The
 *  boards and their register land in separate changes, so citing a provenance path that has not arrived would point a
 *  reader at evidence this checkout cannot show - the page says the register is pending instead. */
function trainingBoardRegister(repoRoot) {
  const file = join(repoRoot, TRAINING_BOARD_REGISTER);
  try {
    return !lstatSync(file).isSymbolicLink() && lstatSync(file).isFile() ? TRAINING_BOARD_REGISTER : null;
  } catch {
    return null;
  }
}

/** The confined designed board for a declared A1 family, or null when none has been generated yet. */
function trainingBoardFile(repoRoot, id) {
  if (typeof id !== 'string' || !TRAINING_FAMILY.test(id)) return null;
  const root = join(repoRoot, TRAINING_BOARD_DIR);
  return confinedFile(root, join(root, id), 'reference.jpg');
}

/** Serve the designed reference board for a family: declared by the A1 manifest and present under
 *  docs/design/training/<tr-NN>/reference.jpg. */
export function trainingBoard(repoRoot, id) {
  if (!trainingFamilies(repoRoot).some((family) => family.id === id)) return null;
  const file = trainingBoardFile(repoRoot, id);
  return readConfinedImage(repoRoot, file, 'image/jpeg');
}

/** Resolve a target only when its arm declares the id and its file remains confined.
 *  The listing checks this path; the GET is the only caller that reads the full PNG. */
function conceptTargetFile(repoRoot, id) {
  if (typeof id !== 'string') return null;
  if (EVAL_TARGETS.has(id)) {
    const root = join(repoRoot, 'data/A6_evaluation/targets');
    return confinedFile(root, join(root, id), 'target.png');
  }
  if (!trainingFamilies(repoRoot).some((family) => family.id === id)) return null;
  return trainingTargetFile(repoRoot, id);
}

/** These are authored A6 targets, not captures of the generated demo. */
export function conceptTarget(repoRoot, id) {
  return readConfinedImage(repoRoot, conceptTargetFile(repoRoot, id), 'image/png');
}

/** Serve the authored A1 training target for a family: declared in the manifest AND present, confined, under
 *  data/A1_self_generated/targets/<tr-NN>/target.png. A tr-NN the manifest does not declare is not public, so the
 *  route cannot be used to probe for files the arm never published. */
export function trainingTarget(repoRoot, id) {
  if (!trainingFamilies(repoRoot).some((family) => family.id === id)) return null;
  return readConfinedImage(repoRoot, trainingTargetFile(repoRoot, id), 'image/png');
}

function boardStateRegister(repoRoot) {
  const file = join(repoRoot, 'docs/provenance/assets/board-states.json');
  try {
    const dir = join(repoRoot, 'docs/provenance/assets');
    if (!lstatSync(dir).isDirectory() || realpathSync(dir) !== join(realpathSync(repoRoot), 'docs/provenance/assets')) return {};
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 128 * 1024) return {};
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch { return {}; }
}

export function listConcepts(repoRoot, { view = 'all', id = null } = {}) {
  // The index needs declarations and availability, not 66 prompts or JPEG dimensions.
  // Each detail request reads only the selected brief and board metadata; the default
  // full view remains available to tools inspecting the complete authored register.
  const indexOnly = view === 'index';
  const patternOnly = view === 'pattern';
  const familyOnly = view === 'family';
  const names = [...EVAL_TARGETS].filter((name) => !!conceptImageFile(repoRoot, name));
  const briefRows = indexOnly ? new Map() : trainingBriefs(repoRoot);
  const states = indexOnly || familyOnly ? {} : boardStateRegister(repoRoot);
  const journeys = (familyOnly ? [] : Object.entries(JOURNEYS)).map(([id, steps]) => ({
    id, title: id.replaceAll('-', ' '),
    steps: steps.map((step) => ({
      ...step,
      available: !!journeyStepFile(repoRoot, id, step.id),
      darkAvailable: !!journeyStepFile(repoRoot, id, `${step.id}-dark`),
    })),
  }));
  // Booking remains first, including when its first image is absent. Only the sealed A6 ids
  // can gain a reference pairing; an extra JPEG in the directory does not declare a new arm.
  const available = journeys.filter((journey) => EVAL_TARGETS.has(journey.id) && journey.steps[0].available).map((journey) => journey.id);
  // The evaluation section lists only the SEALED set: a type authored for the training side (bead mwg-train-efg)
  // has journeys and reference boards and must not be presented as an authored evaluation target, because its pair
  // would be half-invented. Within the sealed set the old rule stands: a pair is listed only when its reference is
  // actually available, so an empty checkout claims nothing.
  const archetypes = [...new Set(['booking', ...available, ...names])]
    .sort((a, b) => a === 'booking' ? -1 : b === 'booking' ? 1 : a.localeCompare(b));
  // Registries and explicit authored types determine which patterns are visible. Images stay behind the
  // fixed JOURNEYS allowlist; discovering a new file can never publish it as a concept by itself.
  const patternIds = [...new Set([...EVAL_TARGETS, ...TRAINING_ARCHETYPE_IDS, ...BOARDS.map((board) => board.archetype)])].sort();
  return {
    patterns: patternIds.filter((patternId) => !familyOnly && (!patternOnly || patternId === id)).map((patternId) => {
      const brief = indexOnly ? null : archetypeBrief(repoRoot, patternId, inheritedTrainingPrompt(repoRoot, briefRows, patternId));
      const steps = journeys.find((journey) => journey.id === patternId)?.steps ?? [];
      return { id: patternId, brief, steps: steps.map((step) => ({ ...step,
        imagePrompt: indexOnly ? null : stepImagePrompt(brief?.readme, `${step.id}.jpg`),
        state: states[patternId]?.[`${step.id}.jpg`] ?? null,
      })) };
    }),
    boards: familyOnly ? [] : BOARDS.filter((board) => !!journeyStepFile(repoRoot, board.archetype, board.id)),
    archetypes: archetypes.filter((archetypeId) => !familyOnly && (!patternOnly || archetypeId === id)).map((archetypeId) => {
      const first = journeys.find((journey) => journey.id === archetypeId)?.steps[0];
      const stepReference = !names.includes(archetypeId) && first?.available;
      const targetFile = conceptTargetFile(repoRoot, archetypeId);
      return { id: archetypeId, reference: names.includes(archetypeId) || !!stepReference,
        target: !!targetFile,
        ...(patternOnly && targetFile ? { targetSize: pngSize(targetFile) } : {}),
        ...(stepReference ? { referencePath: `/concepts/images/${archetypeId}/${first.id}.jpg` } : {}) };
    }),
    // Only A1 manifest families are declared. The index and pattern pages need metadata,
    // not every family's prompt or JPEG headers; the selected detail gets the full record.
    trainingTargets: trainingFamilies(repoRoot).filter((family) => !familyOnly || family.id === id).map((family) => {
      const detailed = view === 'all' || familyOnly && family.id === id;
      const target = detailed ? trainingTargetFile(repoRoot, family.id) : null;
      const board = patternOnly ? null : trainingBoardFile(repoRoot, family.id);
      const boardSize = detailed && board ? readJpegDimensions(boundedHead(board, 65536)) : null;
      return { ...family, brief: detailed ? trainingBrief(repoRoot, family.id, briefRows.get(family.id)) : null,
        available: !!target, board: !!board, ...(target ? pngSize(target) : null),
        ...(boardSize ? { boardWidth: boardSize.width, boardHeight: boardSize.height } : {}) };
    }),
    trainingBoardRegister: trainingBoardRegister(repoRoot),
    journeys,
    bookingSteps: journeys[0]?.steps ?? [],
  };
}

const code = (value) => `<code>${escapeHtml(value)}</code>`;

const ARCHETYPE_SUBJECTS = {
  'account-recovery': 'Vanguard Identity',
  booking: 'Evening Class Studio',
  'browser-puzzle-game': 'Signal Grid — Daily Puzzle #142',
  catalogue: 'Kanso Studio Tableware',
  'community-forum': 'The Tune Archive',
  'contact-lead': 'Atelier Wren Architecture',
  'developer-media-playground': 'Resonance Lab',
  'editorial-blog': 'The Kiln Chronicle',
  'event-registration': 'Future Web 2026 · Barbican',
  'expense-tracker': 'The Ledger',
  'fan-community-site': 'Lantern Works Fan Registry',
  'interactive-product-configurator': 'Atelier Velo — Solstice Ti',
  'job-board': 'Helix Careers',
  'library-catalogue': 'The Ashfield Archive',
  'product-card-comparison': 'Rig Selection Board',
  'realtime-telemetry-dashboard': 'NorthSea Grid — Dogger Bank Sector B',
  'restaurant-ordering': 'Hearth & Crumb Bakehouse',
  'saas-workspace-board': 'Kestrel — Sprint 24: v3.4 Telemetry Release',
  'scroll-storytelling-launch': 'Aether Audio — Aether One',
  'survey-form': 'Metro Pulse Transit Survey',
  'web-shop': 'Orchard Row Press',
};

const patternSubject = (id) => ARCHETYPE_SUBJECTS[id] ?? null;

const promptDetails = (title, prompt, source) => `<details class="concept-prompt"><summary>${escapeHtml(title)}</summary>
  ${prompt ? `<p class="concept-prompt-copy">${escapeHtml(prompt)}</p>${source ? `<p class="muted">Authored source: ${code(source)}</p>` : ''}`
    : '<p class="muted">No prompt is authored in this checkout. No image or behavior is inferred from a missing file.</p>'}
</details>`;

const patternCard = ({ id, brief, steps }, families = []) => {
  const subject = patternSubject(id);
  const familyLinks = families.length
    ? ` · Training families: ${families.map((f) => `<a href="/concepts/family/${escapeHtml(f.id)}"><code>${escapeHtml(f.id)}</code>${f.title ? ` (${escapeHtml(f.title)})` : ''}</a>`).join(', ')}`
    : '';
  return `<article id="pattern-${escapeHtml(id)}" class="concept-comparison" aria-labelledby="pattern-heading-${escapeHtml(id)}">
  <h3 id="pattern-heading-${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}${subject ? ` · <span class="muted">${escapeHtml(subject)}</span>` : ''}</h3>
  ${brief ? `<p class="muted">Design and interaction contract: ${code(brief.planSource)} · ${code(brief.designSource)}${familyLinks}.</p>
    ${promptDetails('Site Generation Prompt', brief.sitePrompt, `${brief.planSource} + ${brief.designSource}`)}`
    : `<p class="notice">Design specification pending; no generation prompt can be claimed.${familyLinks}</p>`}
  ${steps.length ? `<h4>${steps.filter((step) => step.available).length} pictured state${steps.length === 1 ? '' : 's'} · ${steps.length} declared · ${steps.filter((step) => step.darkAvailable).length} dark-mode twin state${steps.length === 1 ? '' : 's'}</h4>
    <p class="muted"><strong>Consistent context-chained Light &amp; Dark Mode sets:</strong> Every step in the Light Mode set uses ${code(`docs/design/archetypes/${id}/design.md`)} and Step 1 Light as reference context; every step in the Dark Mode set uses ${code(`docs/design/archetypes/${id}/design.md`)}, its corresponding Light Mode step, and Step 1 Dark as reference context so layout, navigation, and styling remain consistent throughout.</p>
    ${steps.some((step) => step.available && /\bQR\b/i.test(step.imagePrompt ?? '')) ? `<p class="muted">Depicted QR codes are unverified placeholders: do not scan depicted codes. A model ID may be reported rather than attested; check each board&rsquo;s provenance in ${code(`docs/design/archetypes/${id}/README.md`)}. These illustrations remain excluded from training; no reuse clearance is granted here. Check each board&rsquo;s provenance: some records identify provider terms prohibiting use of the image to develop machine-learning models; others say training and output-use rights were not supplied.</p>` : ''}
    <div class="concept-theme-set concept-theme-light">
      <h5 class="concept-theme-heading"><span class="theme-pill theme-pill-light">☀ Light Mode Set</span> Complete ${steps.length}-step Light Mode UI (${code(`docs/design/archetypes/${id}/step*.jpg`)})</h5>
      <ol class="concept-steps">${steps.map(({ id: stepId, title, available, state, imagePrompt }) => {
        const path = `/concepts/images/${id}/${stepId}.jpg`;
        const mapped = state?.kind === 'page' ? `Document state at ${state.path ?? 'no confirmed route'}`
          : state?.kind === 'interaction' ? 'Interaction state; no standalone document URL'
            : 'Illustrative only; no executable demo state is registered';
        const claim = state?.drive?.expectText ? `Assert after the registered interaction: ${state.drive.expectText}`
          : 'No step-specific browser assertion is registered for this picture.';
        return `<li><figure><div class="concept-image-frame">${available
          ? `<a href="${path}" aria-label="Open ${escapeHtml(id)} ${escapeHtml(title)} concept board"><img src="${path}" alt="Illustrative ${escapeHtml(id)} state: ${escapeHtml(title)}" width="1376" height="768" loading="lazy"></a>`
          : `<p class="muted">State image pending: ${code(`docs/design/archetypes/${id}/${stepId}.jpg`)}</p>`}</div>
          <figcaption><strong>${escapeHtml(title)} · Light Mode</strong><p>${escapeHtml(mapped)}. ${escapeHtml(claim)}</p>
          ${state?.source ? `<p class="muted">State mapping: ${escapeHtml(state.source)}</p>` : ''}
          ${promptDetails('Image Generation Prompt for this state', imagePrompt, brief?.imagePromptSource)}
          </figcaption></figure></li>`;
      }).join('')}</ol>
    </div>
    <div class="concept-theme-set concept-theme-dark">
      <h5 class="concept-theme-heading"><span class="theme-pill theme-pill-dark">☾ Dark Mode Set</span> Complete ${steps.length}-step matching Dark Mode UI (${code(`docs/design/archetypes/${id}/dark/step*.jpg`)})</h5>
      <ol class="concept-steps concept-steps-dark">${steps.map(({ id: stepId, title, darkAvailable }) => {
        const darkPath = `/concepts/images/${id}/${stepId}-dark.jpg`;
        return `<li><figure><div class="concept-image-frame">${darkAvailable
          ? `<a href="${darkPath}" aria-label="Open ${escapeHtml(id)} ${escapeHtml(title)} dark mode concept board"><img src="${darkPath}" alt="Illustrative ${escapeHtml(id)} dark mode state: ${escapeHtml(title)}" width="1376" height="768" loading="lazy"></a>`
          : `<p class="muted">Dark mode state image pending: ${code(`docs/design/archetypes/${id}/dark/${stepId}.jpg`)}</p>`}</div>
          <figcaption><strong>${escapeHtml(title)} · Dark Mode</strong><p class="muted">Context-chained from ${code(`${stepId}.jpg`)} + ${code('design.md')} dark palette (${code(`docs/design/archetypes/${id}/dark/${stepId}.jpg`)}).</p>
          </figcaption></figure></li>`;
      }).join('')}</ol>
    </div>` : `<p class="notice">No multi-step reference boards are authored for this pattern yet. The design and site brief above are available; images and per-state checks are pending.</p>
      ${brief?.fallbackImagePrompt ? promptDetails('Image Generation Prompt · inherited single training reference, NOT a step board', brief.fallbackImagePrompt, brief.imagePromptSource)
        : promptDetails('Image Generation Prompt · no state image authored', null, null)}`}
  ${brief?.assertions.length ? `<details class="concept-prompt"><summary>Acceptance assertions from the plan · not image verification</summary><ul>${brief.assertions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
</article>`;
};

const trainingFamilyCard = ({ id, archetype, title, origin, available, width, height, board, boardWidth, boardHeight, brief }, register, { featured = false } = {}) => `<article class="concept-comparison" aria-labelledby="target-${escapeHtml(id)}">
  <h3 id="target-${escapeHtml(id)}">${escapeHtml(id)}${archetype ? ` · ${escapeHtml(archetype)}` : ''}</h3>
  ${title ? `<p class="muted">${escapeHtml(title)}</p>` : ''}
  <div class="concept-main-board">
    <figure><div class="concept-image-frame">${board
      ? `<a href="/concepts/references/${escapeHtml(id)}.jpg" aria-label="Open the ${escapeHtml(id)} designed reference board at full size"><img src="/concepts/references/${escapeHtml(id)}.jpg" alt="Designed reference board for training family ${escapeHtml(id)}${archetype ? ` (${escapeHtml(archetype)})` : ''}"${boardWidth && boardHeight ? ` width="${boardWidth}" height="${boardHeight}"` : ''} loading="${featured ? 'eager' : 'lazy'}"${featured ? ' fetchpriority="high"' : ''}></a>`
      : `<p class="muted">Designed board not generated yet. Expected ${code(`${TRAINING_BOARD_DIR}/${id}/reference.jpg`)}.</p>`}</div><figcaption>Designed reference board${board ? ` · ${code(`${TRAINING_BOARD_DIR}/${id}/reference.jpg`)}` : ' · pending'} — AI-generated illustration, not training evidence and not proof a demo works${board ? (register ? `. Model and digests: ${code(register)}` : `. The register of the model and digests for these boards has not landed in this checkout yet (expected ${code(TRAINING_BOARD_REGISTER)})`) : ''}</figcaption></figure>
  </div>
  ${available ? `<details class="harness-target-drawer"><summary>Inspect A1 Conformance Harness Target (DOM test fixture)</summary>
    <figure><div class="concept-image-frame"><a href="/concepts/targets/${escapeHtml(id)}.png" aria-label="Open the ${escapeHtml(id)} harness target render at full size"><img src="/concepts/targets/${escapeHtml(id)}.png" alt="Harness target render, the A1 conformance instrument, for ${escapeHtml(id)}"${width && height ? ` width="${width}" height="${height}"` : ''} loading="lazy"></a></div><figcaption>Harness target render (A1 conformance instrument) · ${code(`${TRAINING_TARGET_DIR}/${id}/target.png`)} — a deterministic headless-Chrome render of ${origin ? code(origin) : 'the family&rsquo;s authored board'}, NOT a designed board. Provenance: ${code('docs/provenance/assets/training-targets.md')}</figcaption></figure>
  </details>` : `<p class="muted">Harness target render pending. Expected ${code(`${TRAINING_TARGET_DIR}/${id}/target.png`)}.</p>`}
  ${brief ? `${promptDetails('Site Generation Prompt · functional build', brief.sitePrompt,
    [brief.planSource, brief.designSource, brief.tokenSource].filter(Boolean).join(' + '))}
    ${promptDetails('Image Generation Prompt · single illustrative home page', brief.imagePrompt, brief.imagePromptSource)}
    <details class="concept-prompt"><summary>Declared interaction sequence and acceptance checks · no per-step training images</summary>
      <p>The brief declares ${brief.steps.length} test step${brief.steps.length === 1 ? '' : 's'}, not a four-image visual journey. No per-step training boards are committed.</p>
      <ol>${brief.steps.map((step) => `<li>${escapeHtml([step.path ? `Visit ${step.path}` : null,
        step.select ? `select ${Object.entries(step.select).map(([selector, value]) => `${selector}: ${value}`).join(', ')}` : null,
        step.fill ? `fill ${Object.entries(step.fill).map(([selector, value]) => `${selector}: ${value}`).join(', ')}` : null,
        step.submit ? `submit ${step.submit}` : null, step.expectText ? `expect visible ${step.expectText}` : null]
        .filter(Boolean).join('; ') || 'Step details in the authored plan')}</li>`).join('')}</ol>
      <p>Required assertions from the brief, not proof that this image meets them:</p><ul>${brief.assertions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </details>` : '<p class="notice">Site and image prompts are not both available in this checkout; do not treat an image as a working site specification.</p>'}
</article>`;

// Page navigation uses native anchors. Legacy /concepts#pattern-... and #target-... hashes
// still land on the matching index link; every detail document is usable without JS.
export function renderConceptIndex({ patterns = [], archetypes = [], trainingTargets = [], trainingBoardRegister = null }) {
  const pictured = patterns.reduce((count, pattern) => count + pattern.steps.filter((step) => step.available).length, 0);
  const boardCount = trainingTargets.filter((family) => family.board).length;
  const orderedTargets = [...trainingTargets].sort((a, b) => (Number(b.board) - Number(a.board)) || a.id.localeCompare(b.id));
  return page('concepts', `
    <h1>Visual concepts and test instruments</h1>
    <p class="concept-lede">Choose an authored pattern or training family to inspect its prompt, visual references and checks. The ${archetypes.length} held-out A6 targets remain separate evaluation instruments. These images are references, not screenshots of generated websites or proof a demo works.</p>
    <nav class="concept-jump" aria-label="Concept sections"><a href="#archetype-patterns">${patterns.length} archetype patterns</a><a href="#training-families">${trainingTargets.length} training families</a><a href="#held-out-evaluation">${archetypes.length} held-out evaluation targets</a></nav>
    <section class="concept-explainer" aria-labelledby="concept-distinction-heading"><h2 id="concept-distinction-heading">Concept image ≠ conformance image</h2>
      <p><strong>Concept JPEG:</strong> an AI-generated illustrative reference, not a working build. Text, prices, receipts and QR codes depicted in it are unverified; do not scan depicted codes. A model ID may be reported without attestation. No reuse license or clearance is granted here. Provider terms prohibit using some images to develop machine-learning models; for other boards, training and output-use rights were not supplied. Concept images remain excluded from training; separate approval must satisfy the applicable terms and rights.</p>
      <p><strong>Conformance harness PNG (A1):</strong> a deterministic headless-Chrome fixture for DOM/layout checks, not the desired production design. It is collapsed under each training family and does not prove an implementation works.</p>
      <p><strong>A6 target PNG:</strong> an authored, held-out evaluation asset, never part of the training corpus. A pattern&rsquo;s illustrative JPEGs are not paired model outputs.</p>
    </section>
    <section id="archetype-patterns" aria-labelledby="patterns-heading"><h2 id="patterns-heading">Archetype patterns · ${patterns.length} authored specifications</h2>
      <p class="muted">${pictured} pictured states have committed bytes. Each pattern page contains its site brief, per-state image prompts and provenance caveats; missing states are labelled pending.</p>
      ${patterns.length ? `<nav class="concept-pattern-index" aria-label="Browse archetype patterns"><ul>${patterns.map(({ id }) => {
        const subject = patternSubject(id);
        return `<li id="pattern-${escapeHtml(id)}"><a href="/concepts/pattern/${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}${subject ? ` — ${escapeHtml(subject)}` : ''}</a></li>`;
      }).join('')}</ul></nav>` : '<p class="notice">No authored archetype patterns are available in this checkout.</p>'}
    </section>
    <section id="training-families" aria-labelledby="training-targets-heading"><h2 id="training-targets-heading">Training families (A1): designed boards and harness targets</h2>
      <p class="muted">${boardCount} of ${trainingTargets.length} declared families have a designed reference board${trainingBoardRegister ? ` (model and digests: ${code(trainingBoardRegister)})` : `; the provenance register is pending (${code(TRAINING_BOARD_REGISTER)})`}. A designed board is an illustration; the separate A1 harness PNG is a conformance fixture, not a design recommendation or training evidence. No per-step training images are committed.</p>
      ${orderedTargets.length ? `<nav class="concept-pattern-index" aria-label="Browse training families"><ul>${orderedTargets.map(({ id, archetype, title, board }) => `<li id="target-${escapeHtml(id)}"><a href="/concepts/family/${escapeHtml(id)}"><code>${escapeHtml(id)}</code>${archetype ? ` · ${escapeHtml(archetype)}` : ''}${title ? ` — ${escapeHtml(title)}` : ''}</a> · ${board ? 'Designed board available' : 'Designed board pending'}</li>`).join('')}</ul></nav>` : '<p class="notice">No A1 training families are declared in this checkout.</p>'}
    </section>
    <section id="held-out-evaluation" aria-labelledby="eval-targets-heading"><h2 id="eval-targets-heading">Sealed evaluation targets (A6)</h2>
      <p class="muted">These ${archetypes.length} authored evaluation instruments are never training data. The related pattern pages show illustrative states, not generated output. Provenance: ${code('docs/provenance/assets/eval-targets.md')}.</p>
      ${archetypes.length ? `<ul>${archetypes.map(({ id, target }) => `<li><a href="/concepts/pattern/${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}</a> · ${target ? 'A6 target available' : 'A6 target unavailable'}</li>`).join('')}</ul>` : '<p class="notice">No held-out evaluation targets are available in this checkout.</p>'}
    </section>`);
}

export function renderConceptPattern({ patterns = [], archetypes = [], trainingTargets = [] }, id) {
  const pattern = patterns.find((item) => item.id === id);
  if (!pattern) return null;
  const evaluation = archetypes.find((item) => item.id === id);
  return page('concepts', `
    <p><a href="/concepts#pattern-${escapeHtml(id)}">← All concepts and training families</a></p>
    <h1>Archetype pattern: ${escapeHtml(id.replaceAll('-', ' '))}</h1>
    <p class="muted">Concept JPEGs are illustrations, not working sites or training evidence. No reuse clearance is granted: provider terms prohibit machine-learning development from some images, while other boards have no supplied training or output-use rights. <a href="/concepts#concept-distinction-heading">Read the image and conformance distinctions</a>.</p>
    <section aria-labelledby="pattern-detail-heading"><h2 id="pattern-detail-heading">Authored pattern and pictured states</h2>
      ${patternCard(pattern, trainingTargets.filter((family) => family.archetype === id))}
    </section>
    ${evaluation ? `<section id="held-out-evaluation" aria-labelledby="eval-detail-heading"><h2 id="eval-detail-heading">Held-out evaluation target (A6)</h2>
      <p>Separate from training and illustrative JPEGs; not proof of a working site.</p>
      ${evaluation.target ? `<figure><div class="concept-image-frame"><a href="/concepts/targets/${escapeHtml(id)}.png" aria-label="Open ${escapeHtml(id)} A6 authored evaluation target"><img src="/concepts/targets/${escapeHtml(id)}.png" alt="A6 authored evaluation target for ${escapeHtml(id)}"${evaluation.targetSize?.width && evaluation.targetSize?.height ? ` width="${evaluation.targetSize.width}" height="${evaluation.targetSize.height}"` : ''} loading="lazy"></a></div><figcaption>A6 authored evaluation target · ${code(`data/A6_evaluation/targets/${id}/target.png`)} · provenance ${code('docs/provenance/assets/eval-targets.md')}.</figcaption></figure>` : '<p class="muted">Authored target render unavailable in this checkout.</p>'}
    </section>` : ''}`);
}

export function renderConceptFamily({ trainingTargets = [], trainingBoardRegister = null }, id) {
  const family = trainingTargets.find((item) => item.id === id);
  if (!family) return null;
  return page('concepts', `
    <p><a href="/concepts#target-${escapeHtml(id)}">← All concepts and training families</a></p>
    <h1>Training family: ${escapeHtml(id)}</h1>
    <p class="muted">A designed board is an AI-generated illustration, not training evidence or proof a demo works. A1 harness PNGs are deterministic conformance fixtures, not matching designs. No reuse clearance is granted here; consult each board&rsquo;s provenance and applicable provider terms. <a href="/concepts#concept-distinction-heading">Read the A1/A6 and rights distinctions</a>.</p>
    ${family.archetype ? `<p>Related <a href="/concepts/pattern/${escapeHtml(family.archetype)}">${escapeHtml(family.archetype)} archetype pattern</a>.</p>` : ''}
    <section aria-labelledby="family-detail-heading"><h2 id="family-detail-heading">Designed board, harness target and authored prompts</h2>
      ${trainingFamilyCard(family, trainingBoardRegister, { featured: true })}
    </section>`);
}

/** Full authored snapshot for offline tools and register tests; the HTTP index uses renderConceptIndex. */
export function renderConcepts({ patterns = [], archetypes = [], trainingTargets = [], trainingBoardRegister = null }) {
  const pictured = patterns.reduce((count, pattern) => count + pattern.steps.filter((step) => step.available).length, 0);
  const darkPictured = patterns.reduce((count, pattern) => count + pattern.steps.filter((step) => step.darkAvailable).length, 0);
  const boardCount = trainingTargets.filter((family) => family.board).length;
  const orderedTargets = [...trainingTargets].sort((a, b) => (Number(b.board) - Number(a.board)) || a.id.localeCompare(b.id));
  const familiesByArchetype = new Map();
  for (const family of trainingTargets) {
    if (!family.archetype) continue;
    if (!familiesByArchetype.has(family.archetype)) familiesByArchetype.set(family.archetype, []);
    familiesByArchetype.get(family.archetype).push(family);
  }
  const trainingSection = orderedTargets.length ? `<div class="concept-board-flow">${orderedTargets.map((family) => trainingFamilyCard(family, trainingBoardRegister)).join('')}</div>`
    : '<p class="notice">No A1 training families are declared in this checkout.</p>';
  const patternSection = patterns.length ? patterns.map((pattern) => patternCard(pattern, familiesByArchetype.get(pattern.id) ?? [])).join('')
    : '<p class="notice">No authored archetype patterns are available in this checkout.</p>';
  const evaluationSection = archetypes.length ? archetypes.map(({ id, target }) => {
    const pattern = patterns.find((entry) => entry.id === id);
    const firstStep = pattern?.steps?.[0];
    return `<article class="concept-comparison" aria-labelledby="concept-${escapeHtml(id)}">
    <h3 id="concept-${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}${patternSubject(id) ? ` · <span class="muted">${escapeHtml(patternSubject(id))}</span>` : ''}</h3>
    <p>Read the <a href="#pattern-${escapeHtml(id)}">${escapeHtml(id)} pattern, its site prompt and pictured states</a> above. Its illustrative JPEGs are <em>not</em> the target below.</p>
    <div class="eval-target-showcase">
      ${target ? `<figure><div class="concept-image-frame"><a href="/concepts/targets/${escapeHtml(id)}.png" aria-label="Open ${escapeHtml(id)} A6 authored target render"><img src="/concepts/targets/${escapeHtml(id)}.png" alt="A6 authored evaluation target for ${escapeHtml(id)}" width="1280" height="900" loading="lazy"></a></div>
        <figcaption><strong>A6 authored evaluation target</strong> · ${code(`data/A6_evaluation/targets/${id}/target.png`)} (rendered from ${code(`docs/eval/targets/${id}/index.html`)} + ${code('docs/eval/targets/base.css')}). A fixed evaluation instrument; not an AI-generated concept image or proof of a working site.</figcaption></figure>`
        : '<p class="muted">Authored target render unavailable in this checkout.</p>'}
      ${firstStep?.available ? `<div class="eval-reference-pair">
        <figure><div class="concept-image-frame"><a href="/concepts/images/${escapeHtml(id)}/${escapeHtml(firstStep.id)}.jpg" aria-label="Open ${escapeHtml(id)} Light Mode Step 1 concept board"><img src="/concepts/images/${escapeHtml(id)}/${escapeHtml(firstStep.id)}.jpg" alt="Light Mode Step 1 concept board for ${escapeHtml(id)}" width="1376" height="768" loading="lazy"></a></div>
          <figcaption><span class="theme-pill theme-pill-light">☀ Light Mode Step 1</span> ${code(`${id}/${firstStep.id}.jpg`)}</figcaption></figure>
        ${firstStep.darkAvailable ? `<figure><div class="concept-image-frame"><a href="/concepts/images/${escapeHtml(id)}/${escapeHtml(firstStep.id)}-dark.jpg" aria-label="Open ${escapeHtml(id)} Dark Mode Step 1 concept board"><img src="/concepts/images/${escapeHtml(id)}/${escapeHtml(firstStep.id)}-dark.jpg" alt="Dark Mode Step 1 concept board for ${escapeHtml(id)}" width="1376" height="768" loading="lazy"></a></div>
          <figcaption><span class="theme-pill theme-pill-dark">☾ Dark Mode Step 1</span> ${code(`${id}/dark/${firstStep.id}.jpg`)}</figcaption></figure>` : ''}
      </div>` : ''}
    </div>
  </article>`;
  }).join('') : '<p class="notice">No held-out evaluation targets are available in this checkout.</p>';

  return page('concepts', `
    <h1>Visual concepts and test instruments</h1>
    <p class="concept-lede">Start with a pattern, read its functional site prompt and illustrated interaction states, then inspect the ${trainingTargets.length} currently declared training families. The five held-out A6 targets are separate evaluation instruments. The proposed 42-family expansion has not landed; these are references, not screenshots of generated websites or proof a demo works.</p>
    <nav class="concept-jump" aria-label="Concept sections"><a href="#archetype-patterns">${patterns.length} archetype patterns</a><a href="#training-families">${trainingTargets.length} training families</a><a href="#held-out-evaluation">${archetypes.length} held-out evaluation targets</a></nav>
    <section class="concept-explainer" aria-labelledby="concept-distinction-heading"><h2 id="concept-distinction-heading">Concept image ≠ conformance image</h2>
      <p><strong>Concepts (<code>/concepts</code>) vs The Corpus (<a href="/"><code>/</code> corpus index</a>):</strong> <strong>Concepts</strong> are the authored design specifications, multi-step visual storyboards, and descriptive prompts that define what each web archetype should look and feel like across light and dark modes. <strong>The Corpus</strong> is the set of runnable web application codebases across 7 frameworks (<code>raw</code>, <code>react</code>, <code>preact</code>, <code>vue</code>, <code>svelte</code>, <code>hono</code>, <code>webcomponents</code>) paired as <code>(brief, original_repo) &rarr; uplifted_repo</code> and measured against Modern Web Guidance rules.</p>
      <p><strong>Concept JPEG:</strong> an AI-generated visual planning reference for a possible site or interaction state. Text, prices, receipts and QR codes depicted in it are unverified; do not scan depicted codes. A model ID may be reported without attestation; read each asset&rsquo;s provenance for its actual status. No reuse license or clearance is granted here. Rights differ by asset: provider terms prohibit using some of these images to develop machine-learning models; for other boards, training and output-use rights were not supplied. Concept images remain excluded from training; separate approval must satisfy the applicable terms and rights. They do not show a working build or passed test.</p>
      <p><strong>Conformance harness PNG (Authored target design):</strong> a deterministic headless-Chrome screenshot of a simple authored HTML fixture used to check DOM/layout expectations. It is intentionally <em>not</em> the desired production design and can look very different from the concept. It appears collapsed under each A1 family; neither image is proof of implementation.</p>
      <p><strong>A6 target PNG:</strong> an authored, held-out evaluation asset, not part of the training corpus. The pattern's JPEGs below are illustrative and must never be read as paired output from a model.</p>
    </section>
    <section id="archetype-patterns" aria-labelledby="patterns-heading"><h2 id="patterns-heading">Archetype patterns · ${patterns.length} authored specifications</h2>
      <p class="muted">${pictured} concept boards have committed bytes across these patterns (${darkPictured} matching dark-mode twin boards, ${pictured + darkPictured} committed archetype JPEGs total). Patterns without step boards retain their authored design and site briefs but are explicitly marked pending. The step mapping describes what a board depicts; a picture is not a passing browser assertion.</p>
      ${patterns.length ? `<nav class="concept-pattern-index" aria-label="Jump to an archetype pattern"><ul>${patterns.map(({ id }) => {
        const subject = patternSubject(id);
        return `<li><a href="#pattern-${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}${subject ? ` — ${escapeHtml(subject)}` : ''}</a></li>`;
      }).join('')}</ul></nav>` : ''}
      ${patternSection}
    </section>
    <section id="training-families" aria-labelledby="training-targets-heading"><h2 id="training-targets-heading">Training families (A1): designed boards and harness targets</h2>
      <p class="muted">${boardCount} of ${trainingTargets.length} declared families have a designed reference board${trainingBoardRegister ? ` (model and digests: ${code(trainingBoardRegister)})` : `; the provenance register is pending (${code(TRAINING_BOARD_REGISTER)})`}. Each has a site-generation prompt derived from its authored plan, design and brief, plus its original image-generation prompt where present. Each family has one home-page board; no per-step training images are committed. Harness PNGs are collapsed below the design and are <strong>not</strong> the visual direction or evidence of a working site. Neither kind is training data.</p>
      ${trainingSection}
    </section>
    <section id="held-out-evaluation" aria-labelledby="eval-targets-heading"><h2 id="eval-targets-heading">Sealed evaluation targets (A6)</h2>
      <p class="muted">These ${archetypes.length} held-out target renders are authored evaluation instruments, never training data and not part of the ${trainingTargets.length} families above. Their related concept states and generation prompts are in the archetype patterns section. Provenance: ${code('docs/provenance/assets/eval-targets.md')}.</p>
      ${evaluationSection}
    </section>`);
}

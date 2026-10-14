import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';

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
export function conceptImage(repoRoot, name) {
  if (!IMAGE_NAME.test(name)) return null;
  const root = join(repoRoot, 'docs/design');
  const file = confinedFile(root, join(root, 'archetypes'), `${name}.jpg`);
  return file ? { bytes: readFileSync(file), type: 'image/jpeg' } : null;
}

/** Only fixed archetype/step pairs are public; neither path segment comes from a filesystem listing. */
export function conceptJourneyStep(repoRoot, archetype, id) {
  if (!Object.hasOwn(JOURNEYS, archetype) || !JOURNEYS[archetype].some((step) => step.id === id)) return null;
  const root = join(repoRoot, 'docs/design');
  const file = confinedFile(root, join(root, 'archetypes', archetype), `${id}.jpg`);
  return file ? { bytes: readFileSync(file), type: 'image/jpeg' } : null;
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
  return file ? { bytes: readFileSync(file), type: 'image/jpeg' } : null;
}

/** These are authored A6 targets, not captures of the generated demo. */
export function conceptTarget(repoRoot, id) {
  if (typeof id !== 'string') return null;
  if (EVAL_TARGETS.has(id)) {
    const root = join(repoRoot, 'data/A6_evaluation/targets');
    const file = confinedFile(root, join(root, id), 'target.png');
    return file ? { bytes: readFileSync(file), type: 'image/png' } : null;
  }
  return trainingTarget(repoRoot, id);
}

/** Serve the authored A1 training target for a family: declared in the manifest AND present, confined, under
 *  data/A1_self_generated/targets/<tr-NN>/target.png. A tr-NN the manifest does not declare is not public, so the
 *  route cannot be used to probe for files the arm never published. */
export function trainingTarget(repoRoot, id) {
  if (!trainingFamilies(repoRoot).some((family) => family.id === id)) return null;
  const file = trainingTargetFile(repoRoot, id);
  return file ? { bytes: readFileSync(file), type: 'image/png' } : null;
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

export function listConcepts(repoRoot) {
  const referenceDir = join(repoRoot, 'docs/design/archetypes');
  const names = existsSync(referenceDir) && !lstatSync(referenceDir).isSymbolicLink() && lstatSync(referenceDir).isDirectory()
    ? readdirSync(referenceDir).filter((name) => name.endsWith('.jpg')).map((name) => name.slice(0, -4))
      .filter((name) => IMAGE_NAME.test(name) && !!conceptImage(repoRoot, name))
    : [];
  const briefRows = trainingBriefs(repoRoot);
  const states = boardStateRegister(repoRoot);
  const journeys = Object.entries(JOURNEYS).map(([id, steps]) => ({
    id, title: id.replaceAll('-', ' '),
    steps: steps.map((step) => ({ ...step, available: !!conceptJourneyStep(repoRoot, id, step.id) })),
  }));
  // Booking remains first, including when its first image is absent. Never claim a reference pairing
  // for a family until an allowlisted image is actually available in the checkout.
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
    patterns: patternIds.map((id) => {
      const brief = archetypeBrief(repoRoot, id, inheritedTrainingPrompt(repoRoot, briefRows, id));
      const steps = journeys.find((journey) => journey.id === id)?.steps ?? [];
      return { id, brief, steps: steps.map((step) => ({ ...step,
        imagePrompt: stepImagePrompt(brief?.readme, `${step.id}.jpg`),
        state: states[id]?.[`${step.id}.jpg`] ?? null,
      })) };
    }),
    boards: BOARDS.filter((board) => !!conceptJourneyStep(repoRoot, board.archetype, board.id)),
    archetypes: archetypes.map((id) => {
      const first = journeys.find((journey) => journey.id === id)?.steps[0];
      const stepReference = !names.includes(id) && first?.available;
      return { id, reference: names.includes(id) || !!stepReference, target: !!conceptTarget(repoRoot, id),
        ...(stepReference ? { referencePath: `/concepts/images/${id}/${first.id}.jpg` } : {}) };
    }),
    // The training arm is listed whether or not its render is on disk: a declared family with no target yet is an
    // honest gap to report, not a family to hide. Only the A1 manifest declares these; nothing else adds to them.
    // The harness target size is measured from the file so the page reserves the box the image will occupy; the
    // designed board is measured from a bounded head read, and reported without dimensions when it has to be.
    trainingTargets: trainingFamilies(repoRoot).map((family) => {
      const target = trainingTargetFile(repoRoot, family.id);
      const board = trainingBoardFile(repoRoot, family.id);
      const boardSize = board ? readJpegDimensions(boundedHead(board, 65536)) : null;
      return { ...family, brief: trainingBrief(repoRoot, family.id, briefRows.get(family.id)),
        available: !!target, board: !!board, ...(target ? pngSize(target) : null),
        ...(boardSize ? { boardWidth: boardSize.width, boardHeight: boardSize.height } : {}) };
    }),
    trainingBoardRegister: trainingBoardRegister(repoRoot),
    journeys,
    bookingSteps: journeys[0].steps,
  };
}

const code = (value) => `<code>${escapeHtml(value)}</code>`;
const promptDetails = (title, prompt, source) => `<details class="concept-prompt"><summary>${escapeHtml(title)}</summary>
  ${prompt ? `<p class="concept-prompt-copy">${escapeHtml(prompt)}</p>${source ? `<p class="muted">Authored source: ${code(source)}</p>` : ''}`
    : '<p class="muted">No prompt is authored in this checkout. No image or behavior is inferred from a missing file.</p>'}
</details>`;

const patternCard = ({ id, brief, steps }) => `<article id="pattern-${escapeHtml(id)}" class="concept-comparison" aria-labelledby="pattern-heading-${escapeHtml(id)}">
  <h3 id="pattern-heading-${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}</h3>
  ${brief ? `<p class="muted">Design and interaction contract: ${code(brief.planSource)} · ${code(brief.designSource)}.</p>
    ${promptDetails('Site Generation Prompt', brief.sitePrompt, `${brief.planSource} + ${brief.designSource}`)}`
    : '<p class="notice">Design specification pending; no generation prompt can be claimed.</p>'}
  ${steps.length ? `<h4>${steps.filter((step) => step.available).length} pictured state${steps.length === 1 ? '' : 's'} · ${steps.length} declared</h4>
    ${steps.some((step) => step.available && /\bQR\b/i.test(step.imagePrompt ?? '')) ? `<p class="muted">Depicted QR codes are unverified placeholders: do not scan depicted codes. A model ID may be reported rather than attested; check each board&rsquo;s provenance in ${code(`docs/design/archetypes/${id}/README.md`)}. These illustrations are excluded from training unless separately approved; this is not a claim about their legal reuse rights.</p>` : ''}
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
        <figcaption><strong>${escapeHtml(title)}</strong><p>${escapeHtml(mapped)}. ${escapeHtml(claim)}</p>
        ${state?.source ? `<p class="muted">State mapping: ${escapeHtml(state.source)}</p>` : ''}
        ${promptDetails('Image Generation Prompt for this state', imagePrompt, brief?.imagePromptSource)}
        </figcaption></figure></li>`;
    }).join('')}</ol>` : `<p class="notice">No multi-step reference boards are authored for this pattern yet. The design and site brief above are available; images and per-state checks are pending.</p>
      ${brief?.fallbackImagePrompt ? promptDetails('Image Generation Prompt · inherited single training reference, NOT a step board', brief.fallbackImagePrompt, brief.imagePromptSource)
        : promptDetails('Image Generation Prompt · no state image authored', null, null)}`}
  ${brief?.assertions.length ? `<details class="concept-prompt"><summary>Acceptance assertions from the plan · not image verification</summary><ul>${brief.assertions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
</article>`;

const trainingFamilyCard = ({ id, archetype, title, origin, available, width, height, board, boardWidth, boardHeight, brief }, register) => `<article class="concept-comparison" aria-labelledby="target-${escapeHtml(id)}">
  <h3 id="target-${escapeHtml(id)}">${escapeHtml(id)}${archetype ? ` · ${escapeHtml(archetype)}` : ''}</h3>
  ${title ? `<p class="muted">${escapeHtml(title)}</p>` : ''}
  <div class="concept-main-board">
    <figure><div class="concept-image-frame">${board
      ? `<a href="/concepts/references/${escapeHtml(id)}.jpg" aria-label="Open the ${escapeHtml(id)} designed reference board at full size"><img src="/concepts/references/${escapeHtml(id)}.jpg" alt="Designed reference board for training family ${escapeHtml(id)}${archetype ? ` (${escapeHtml(archetype)})` : ''}"${boardWidth && boardHeight ? ` width="${boardWidth}" height="${boardHeight}"` : ''} loading="lazy"></a>`
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

export function renderConcepts({ patterns = [], archetypes = [], trainingTargets = [], trainingBoardRegister = null }) {
  const pictured = patterns.reduce((count, pattern) => count + pattern.steps.filter((step) => step.available).length, 0);
  const boardCount = trainingTargets.filter((family) => family.board).length;
  const orderedTargets = [...trainingTargets].sort((a, b) => (Number(b.board) - Number(a.board)) || a.id.localeCompare(b.id));
  const trainingSection = orderedTargets.length ? `<div class="concept-board-flow">${orderedTargets.map((family) => trainingFamilyCard(family, trainingBoardRegister)).join('')}</div>`
    : '<p class="notice">No A1 training families are declared in this checkout.</p>';
  const patternSection = patterns.length ? patterns.map((pattern) => patternCard(pattern)).join('')
    : '<p class="notice">No authored archetype patterns are available in this checkout.</p>';
  const evaluationSection = archetypes.length ? archetypes.map(({ id, target }) => `<article class="concept-comparison" aria-labelledby="concept-${escapeHtml(id)}">
    <h3 id="concept-${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}</h3>
    <p>Read the <a href="#pattern-${escapeHtml(id)}">${escapeHtml(id)} pattern, its site prompt and pictured states</a> above. Its illustrative JPEGs are <em>not</em> the target below.</p>
    ${target ? `<figure><div class="concept-image-frame"><a href="/concepts/targets/${escapeHtml(id)}.png" aria-label="Open ${escapeHtml(id)} A6 authored target render"><img src="/concepts/targets/${escapeHtml(id)}.png" alt="A6 authored evaluation target for ${escapeHtml(id)}" loading="lazy"></a></div>
      <figcaption>A6 authored target · ${code(`data/A6_evaluation/targets/${id}/target.png`)}. A fixed evaluation instrument; not an AI-generated concept image or proof of a working site.</figcaption></figure>`
      : '<p class="muted">Authored target render unavailable in this checkout.</p>'}
  </article>`).join('') : '<p class="notice">No held-out evaluation targets are available in this checkout.</p>';

  return page('concepts', `
    <h1>Visual concepts and test instruments</h1>
    <p class="concept-lede">Start with a pattern, read its functional site prompt and illustrated interaction states, then inspect the ${trainingTargets.length} currently declared training families. The five held-out A6 targets are separate evaluation instruments. The proposed 42-family expansion has not landed; these are references, not screenshots of generated websites or proof a demo works.</p>
    <nav class="concept-jump" aria-label="Concept sections"><a href="#archetype-patterns">${patterns.length} archetype patterns</a><a href="#training-families">${trainingTargets.length} training families</a><a href="#held-out-evaluation">${archetypes.length} held-out evaluation targets</a></nav>
    <section class="concept-explainer" aria-labelledby="concept-distinction-heading"><h2 id="concept-distinction-heading">Concept image ≠ conformance image</h2>
      <p><strong>Concept JPEG:</strong> an AI-generated visual planning reference for a possible site or interaction state. Text, prices, receipts and QR codes depicted in it are unverified; do not scan depicted codes. A model ID may be reported without attestation; read each asset&rsquo;s provenance for its actual status. Concept images are excluded from training unless separately approved; exclusion is not a claim that their rights forbid reuse. They do not show a working build or passed test.</p>
      <p><strong>Conformance harness PNG:</strong> a deterministic headless-Chrome screenshot of a simple authored HTML fixture used to check DOM/layout expectations. It is intentionally <em>not</em> the desired production design and can look very different from the concept. It appears collapsed under each A1 family; neither image is proof of implementation.</p>
      <p><strong>A6 target PNG:</strong> an authored, held-out evaluation asset, not part of the training corpus. The pattern's JPEGs below are illustrative and must never be read as paired output from a model.</p>
    </section>
    <section id="archetype-patterns" aria-labelledby="patterns-heading"><h2 id="patterns-heading">Archetype patterns · ${patterns.length} authored specifications</h2>
      <p class="muted">${pictured} concept boards have committed bytes across these patterns. Patterns without step boards retain their authored design and site briefs but are explicitly marked pending. The step mapping describes what a board depicts; a picture is not a passing browser assertion.</p>
      ${patterns.length ? `<nav class="concept-pattern-index" aria-label="Jump to an archetype pattern"><ul>${patterns.map(({ id }) => `<li><a href="#pattern-${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}</a></li>`).join('')}</ul></nav>` : ''}
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

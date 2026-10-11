import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';

import { escapeHtml, page } from './pages.mjs';

const BOARDS = [
  { id: 'layout-storefront', title: 'Storefront composition', grammar: 'Object ledger · Persuade', note: 'An illustrative product grid, choices and basket summary.', alt: 'Concept sketch of a product grid with details and a basket summary.' },
  { id: 'layout-saas', title: 'SaaS decision workbench', grammar: 'Decision workbench · Operate', note: 'A comparison, billing choice and workspace sign-up layout.', alt: 'Concept sketch of pricing tiers beside a workspace sign-up flow.' },
  { id: 'layout-explainer', title: 'Wiki and explainer', grammar: 'Field notes · Read', note: 'A reading column, table of contents and an interactive diagram layout.', alt: 'Concept sketch of a wiki reading layout alongside a diagram and controls.' },
];
// The A6 arm is a SEALED five-archetype evaluation set: fixed by design, held out from the training families, and
// never extended by a directory listing, so it stays a literal allowlist on purpose - a name from the filesystem must
// not be able to add itself to the evaluation set. The A1 arm is the opposite: its families are declared by the
// manifest its renderer writes, so the 30 training families (and any family added later) appear without an edit here.
const EVAL_TARGETS = new Set(['account-recovery', 'booking', 'catalogue', 'contact-lead', 'event-registration']);
const TRAINING_TARGET_DIR = 'data/A1_self_generated/targets';
const TRAINING_FAMILY = /^tr-\d{2}$/;
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
  ],
  'account-recovery': [
    { id: 'step1-request', title: 'Request reset link' },
    { id: 'step2-sent', title: 'Depicted inbox notice' },
  ],
  'event-registration': [
    { id: 'step1-event', title: 'Select event ticket' },
    { id: 'step2-pass', title: 'Depicted ticket pass' },
  ],
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

/** Serve only the three reviewed boards and JPEGs under the confined archetype-reference directory. */
export function conceptImage(repoRoot, name) {
  if (!IMAGE_NAME.test(name)) return null;
  const root = join(repoRoot, 'docs/design');
  const board = BOARDS.some((entry) => entry.id === name);
  const file = board
    ? confinedFile(root, root, `${name}.jpg`)
    : confinedFile(root, join(root, 'archetypes'), `${name}.jpg`);
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

export function listConcepts(repoRoot) {
  const referenceDir = join(repoRoot, 'docs/design/archetypes');
  const names = existsSync(referenceDir) && !lstatSync(referenceDir).isSymbolicLink() && lstatSync(referenceDir).isDirectory()
    ? readdirSync(referenceDir).filter((name) => name.endsWith('.jpg')).map((name) => name.slice(0, -4))
      .filter((name) => IMAGE_NAME.test(name) && !!conceptImage(repoRoot, name))
    : [];
  const journeys = Object.entries(JOURNEYS).map(([id, steps]) => ({
    id, title: id.replaceAll('-', ' '),
    steps: steps.map((step) => ({ ...step, available: !!conceptJourneyStep(repoRoot, id, step.id) })),
  }));
  // Booking remains first, including when its first image is absent. Never claim a reference pairing
  // for a family until an allowlisted image is actually available in the checkout.
  const available = journeys.filter((journey) => journey.steps[0].available).map((journey) => journey.id);
  const archetypes = [...new Set(['booking', ...available, ...names])]
    .sort((a, b) => a === 'booking' ? -1 : b === 'booking' ? 1 : a.localeCompare(b));
  return {
    boards: BOARDS.filter((board) => !!conceptImage(repoRoot, board.id)),
    archetypes: archetypes.map((id) => {
      const first = journeys.find((journey) => journey.id === id)?.steps[0];
      const stepReference = !names.includes(id) && first?.available;
      return { id, reference: names.includes(id) || !!stepReference, target: !!conceptTarget(repoRoot, id),
        ...(stepReference ? { referencePath: `/concepts/images/${id}/${first.id}.jpg` } : {}) };
    }),
    // The training arm is listed whether or not its render is on disk: a declared family with no target yet is an
    // honest gap to report, not a family to hide. Only the A1 manifest declares these; nothing else adds to them.
    // The image size is measured from the file so the page reserves the box the image will actually occupy.
    trainingTargets: trainingFamilies(repoRoot).map((family) => {
      const file = trainingTargetFile(repoRoot, family.id);
      return { ...family, available: !!file, ...(file ? pngSize(file) : null) };
    }),
    journeys,
    bookingSteps: journeys[0].steps,
  };
}

const code = (value) => `<code>${escapeHtml(value)}</code>`;
const boardFigure = (board, featured = false) => `<figure class="concept-board${featured ? ' concept-board-featured' : ''}">
  <a href="/concepts/images/${board.id}.jpg" aria-label="Open ${escapeHtml(board.title)} sketch at full size">
    <img src="/concepts/images/${board.id}.jpg" alt="${escapeHtml(board.alt)}" width="1376" height="768"${featured ? ' fetchpriority="high"' : ' loading="lazy"'}>
  </a>
  <figcaption><strong>${escapeHtml(board.title)}</strong><span>${escapeHtml(board.grammar)}</span><p>${escapeHtml(board.note)}</p></figcaption>
</figure>`;

const trainingTargetFigure = ({ id, archetype, title, origin, available, width, height }) => `<article class="concept-comparison" aria-labelledby="target-${escapeHtml(id)}">
  <h3 id="target-${escapeHtml(id)}">${escapeHtml(id)}${archetype ? ` · ${escapeHtml(archetype)}` : ''}</h3>
  ${title ? `<p class="muted">${escapeHtml(title)}</p>` : ''}
  <figure><div class="concept-image-frame">${available
    ? `<a href="/concepts/targets/${escapeHtml(id)}.png" aria-label="Open the ${escapeHtml(id)} training target render at full size"><img src="/concepts/targets/${escapeHtml(id)}.png" alt="Authored training target render for ${escapeHtml(id)}${archetype ? ` (${escapeHtml(archetype)})` : ''}"${width && height ? ` width="${width}" height="${height}"` : ''} loading="lazy"></a>`
    : `<p class="muted">Target render pending. Expected ${code(`${TRAINING_TARGET_DIR}/${id}/target.png`)}.</p>`}</div><figcaption>Training target render${available ? ` · ${code(`${TRAINING_TARGET_DIR}/${id}/target.png`)}` : ' · pending'}</figcaption></figure>
  ${origin ? `<p class="muted">Authored board: ${code(origin)}. Not a capture of a generated site. Provenance: ${code('docs/provenance/assets/training-targets.md')}.</p>` : ''}
</article>`;

export function renderConcepts({ boards, archetypes, trainingTargets = [], bookingSteps = [], journeys = [] }) {
  const [featured, ...otherBoards] = boards;
  const boardSection = featured ? `${boardFigure(featured, true)}<div class="concept-board-grid">${otherBoards.map((board) => boardFigure(board)).join('')}</div>`
    : '<p class="notice">No layout concept boards are available in this checkout.</p>';
  const trainingSection = trainingTargets.length ? `<div class="concept-board-grid">${trainingTargets.map(trainingTargetFigure).join('')}</div>`
    : '<p class="notice">No A1 training-family targets are declared in this checkout.</p>';
  const archetypeSection = archetypes.length ? archetypes.map(({ id, reference, target, referencePath }) => `<article class="concept-comparison" aria-labelledby="concept-${escapeHtml(id)}">
    <h3 id="concept-${escapeHtml(id)}">${escapeHtml(id.replaceAll('-', ' '))}</h3>
    <div class="concept-pair">
      <figure><div class="concept-image-frame">${reference
        ? `<a href="${escapeHtml(referencePath ?? `/concepts/images/${id}.jpg`)}" aria-label="Open ${escapeHtml(id)} archetype reference at full size"><img src="${escapeHtml(referencePath ?? `/concepts/images/${id}.jpg`)}" alt="Visual reference for ${escapeHtml(id)} archetype"${referencePath ? ' width="1376" height="768"' : ''} loading="lazy"></a>`
        : `<p class="muted">Reference image not yet available. Expected ${code(`docs/design/archetypes/${id}.jpg`)}.</p>`}</div><figcaption>Archetype reference${reference ? ' · illustrative, not training evidence' : ' · pending'}</figcaption></figure>
      <figure><div class="concept-image-frame">${target
        ? `<a href="/concepts/targets/${escapeHtml(id)}.png" aria-label="Open ${escapeHtml(id)} authored target render at full size"><img src="/concepts/targets/${escapeHtml(id)}.png" alt="Authored evaluation target render for ${escapeHtml(id)}" loading="lazy"></a>`
        : '<p class="muted">No authored target render for this archetype.</p>'}</div><figcaption>Authored target render${target ? ` · ${code(`data/A6_evaluation/targets/${id}/target.png`)}` : ' · unavailable'}</figcaption></figure>
    </div>
    <p class="muted">${reference && target ? 'Side-by-side visual reference only; this is not a generated-site conformance result.' : 'A pair is not claimed until both images exist. No live demo capture is retained here.'}</p>
  </article>`).join('') : '<p class="notice">No archetype reference images are available yet.</p>';

  const orderedJourneys = journeys.length ? journeys : bookingSteps.length ? [{ id: 'booking', title: 'booking', steps: bookingSteps }] : [];
  const journeySections = orderedJourneys.map(({ id, title, steps }) => `<section aria-labelledby="${escapeHtml(id)}-steps-heading">
    <h2 id="${escapeHtml(id)}-steps-heading">${escapeHtml(title[0].toUpperCase() + title.slice(1))} journey · ${escapeHtml(({ 2: 'two', 3: 'three', 5: 'five' })[steps.length] ?? String(steps.length))} visual steps</h2>
    <p class="muted">${id === 'booking'
      ? 'Browse, form, confirmation, error and empty states are illustrative raster references, not interactive demos or training/evaluation evidence. Dates, contacts, prices, receipts and QR codes are unverified placeholders; do not scan the depicted codes. Source and rights are still unverified:'
      : 'Only these pictured states are available; missing error or empty states are not implied. All products, names, addresses, prices, seat counts, email claims, tokens and QR codes are unverified illustrative placeholders, not interactive demos or training/evaluation evidence. Do not scan depicted codes. Model ID is reported, not attested; source and rights boundary:'} ${code(`docs/design/archetypes/${id}/README.md`)}.</p>
    <ol class="concept-steps">${steps.map(({ id: stepId, title: stepTitle, available }) => `<li><figure>
      <div class="concept-image-frame">${available
        ? `<a href="/concepts/images/${escapeHtml(id)}/${escapeHtml(stepId)}.jpg" aria-label="Open ${escapeHtml(id)} ${escapeHtml(stepTitle)} reference"><img src="/concepts/images/${escapeHtml(id)}/${escapeHtml(stepId)}.jpg" alt="${escapeHtml(id)} journey visual reference: ${escapeHtml(stepTitle)}" width="1376" height="768" loading="lazy"></a>`
        : `<p class="muted">Image pending: ${code(`docs/design/archetypes/${id}/${stepId}.jpg`)}</p>`}</div>
      <figcaption><strong>${escapeHtml(stepTitle)}</strong> · ${available ? 'visual reference' : 'reference pending'}</figcaption>
    </figure></li>`).join('')}</ol>
  </section>`).join('');

  return page('concepts', `
    <h1>Visual concepts</h1>
    <p class="concept-lede">Explore the ${trainingTargets.length || 30} training families' authored targets, layout ideas beside authored evaluation renders where they exist, and the sealed A6 evaluation set. These are references, not screenshots of generated websites or proof a demo works.</p>
    <section aria-labelledby="boards-heading"><h2 id="boards-heading">Layout concept boards</h2>
      <p class="muted">AI-generated sketches with unverified placeholder words and prices. Illustrative only; excluded from training. Source and hashes: ${code('docs/provenance/assets/design-layouts.md')}.</p>
      ${boardSection}
    </section>
    <section aria-labelledby="training-targets-heading"><h2 id="training-targets-heading">Archetype training targets (A1)</h2>
      <p class="muted">The ${trainingTargets.length || 30} training families' authored target renders, declared by ${code(`${TRAINING_TARGET_DIR}/manifest.jsonl`)} and generated from each family's board under ${code('docs/train/targets/')} by ${code('scripts/render-training-targets.mjs')}. Authored references, not captures of generated sites, and not proof any demo works. These are a different, held-out set from the sealed evaluation targets below.</p>
      ${trainingSection}
    </section>
    <section aria-labelledby="eval-targets-heading"><h2 id="eval-targets-heading">Sealed evaluation targets (A6)</h2>
      <p class="muted">The five sealed A6 evaluation targets, each beside its archetype reference under ${code('docs/design/archetypes/')}. Authored evaluation assets, never training data, and deliberately not part of the ${trainingTargets.length || 30} training families above. Provenance: ${code('docs/provenance/assets/eval-targets.md')}.</p>
      ${archetypeSection}
    </section>
    ${journeySections || '<p class="notice">No step references are available in this checkout.</p>'}`);
}

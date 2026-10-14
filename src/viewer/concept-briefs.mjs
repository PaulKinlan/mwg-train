import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const ID = /^[a-z0-9][a-z0-9-]*$/;
const FAMILY = /^tr-\d{2}$/;
const MAX_TEXT_BYTES = 128 * 1024;

// Read only authored files under a known root. Missing, symlinked and overlarge inputs are unavailable,
// not an invitation to follow another path or to present invented prompt text.
function authoredText(repoRoot, directory, id, filename) {
  if (!ID.test(id) || filename.includes('/') || filename.includes('..')) return null;
  const root = join(repoRoot, directory);
  const dir = join(root, id);
  const file = join(dir, filename);
  try {
    if (!lstatSync(root).isDirectory() || !lstatSync(dir).isDirectory()) return null;
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return null;
    if (realpathSync(dir) !== join(realpathSync(root), id) || realpathSync(file) !== join(realpathSync(dir), filename)) return null;
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function section(markdown, heading) {
  if (!markdown) return null;
  const start = markdown.indexOf(`## ${heading}\n`);
  if (start < 0) return null;
  const text = markdown.slice(start + heading.length + 4).split(/\n## /, 1)[0].trim();
  return text || null;
}

function protectFences(text) {
  const fences = [];
  const protectedText = text.replace(/```[^\n]*\n[\s\S]*?\n```/g, (block) => {
    const marker = `MWGFENCEDCODE${fences.length}MARKER`;
    fences.push(block);
    return marker;
  });
  return { text: protectedText,
    restore: (prose) => prose.replace(/MWGFENCEDCODE(\d+)MARKER/g, (_, index) => fences[Number(index)]) };
}

function siteProse(text, { preserveFences = false } = {}) {
  // A site-generation prompt is not a copy of the conformance fixture's rendering instructions.
  // Keep the authored substance while removing Markdown markup and board-only viewport instructions.
  const protectedText = preserveFences ? protectFences(text) : { text, restore: (prose) => prose };
  let referenceBullet = false;
  const prose = protectedText.text?.split(/\n{2,}/)
    .filter((paragraph) => !/^The five boards are laid out on this grammar/i.test(paragraph.trim()))
    .join('\n\n')
    .split('\n')
    .filter((line) => {
      // Wrapped frame bullets carry instructions on later lines too (tabs, address bar, chrome).
      if (/^\s*[-*]\s/.test(line)) referenceBullet = /\bbrowser viewports?\b/i.test(line);
      else if (!line.trim()) referenceBullet = false;
      if (referenceBullet) return false;
      return !/\b(?:no media queries|one fixed composition|single inline stylesheet|browser chrome runs|browser viewports?|conformance viewport)\b/i.test(line);
    })
    .join('\n')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .trim();
  return protectedText.restore(prose);
}

function group(name, content, options) {
  return content ? `${name}:\n${siteProse(content, options)}` : `${name}: Not yet documented in this checkout.`;
}

function declaredTokens(design) {
  const block = design?.match(/^tokens:\n((?:  [^\n]+\n)+)/m)?.[1];
  return block ? `Palette values from the authored design:\n${block.trim()}` : null;
}

function familyVisualThesis(design) {
  // The family design describes a static target after its opening identity sentence. Use only that
  // authored identity/colour direction; an unknown format must not leak conformance instructions.
  const thesis = section(design, 'Visual thesis');
  const marker = "The board's job is to be a *target*:";
  return thesis?.includes(marker) ? thesis.split(marker, 1)[0].replace(/\bthe board for\b/i, 'the site for').trim() : null;
}

// Booking's authored component list also contains one particular class demo's step names, field
// labels and selector IDs. Keep its source-backed structure, not those values: the family plan below
// is the only authority for a bicycle, farm, market or other booking form's actual fields and labels.
const TRAINING_BOOKING_COMPONENTS = [
  '- A persistent header with primary navigation and a current-page indicator.',
  '- An ordered progress stepper with the active step indicated by aria-current="step"; use this family’s journey for its labels.',
  '- A labelled summary region for the booking details declared by this family.',
  '- A form card with this family’s fields and labels, inline validation text and an announced error summary.',
  '- A confirmation ticket for the declared outcome and a separate empty state when there is no booking.',
].join('\n');

// The event-registration source separately calls its named conference, prices, DOM IDs and QR pass
// illustrative demo content. Its reusable hierarchy is an event, family-defined registration controls
// and a confirmed/read-back state; the family plan is the authority for fields, IDs and capacity rules.
const TRAINING_EVENT_COMPONENTS = [
  '- An event hero with this family’s name, date, place and any availability the family can actually verify.',
  '- A registration form with participation choices, fields, labels and validation from this family’s plan.',
  '- Accessible selection or quantity controls only for the options this family declares.',
  '- Inline, announced validation and status text without invented prices, payments or capacity claims.',
  '- A confirmation/read-back view for the stored registration; include a pass or QR credential only if this family explicitly defines one.',
].join('\n');

// The web-shop archetype names the canonical demo's cart, shipping/payment fields and tr-26's
// subscription as though they were interchangeable. The three families have different selection,
// ordering and update flows; their plans, not this shared component list, specify those fields.
const TRAINING_WEB_SHOP_COMPONENTS = [
  '- A persistent header and primary navigation with only the badge or status this family declares.',
  '- A product or plan grid with the family’s own items and selection controls.',
  '- An order, cart or subscription summary only as declared by this family’s plan.',
  '- A form card with the family’s own fields, labels, validation and announced errors.',
  '- A receipt or confirmation view for the outcome this family actually implements.',
].join('\n');

// The shared archetype designs compare multiple reference boards. Their common functional
// structure belongs in a family prompt; their sibling-specific board observations do not.
// These projections are derived from each archetype's Grammar and layout / Component hierarchy;
// the family plan below remains authoritative for fields, routes, IDs and state changes.
const TRAINING_LAYOUTS = {
  dashboard: [
    '- A centred page frame with brand header, navigation, summary region, subject region, inline log form and footer.',
    '- The summary region presents measured state as metrics or filtered records from this family’s journey; figures keep their units and text status.',
    '- The subject region shows one identified subject and its detail; the nearby labelled log form changes that state without a wizard.',
    '- A status view narrows the summary to a filter or risk band, with an explicit empty result and refusal feedback.',
  ].join('\n'),
  'support-helpdesk': [
    '- A brand header and navigation introduce the desk; responsive columns give tickets, the labelled submission form and reference tracking their own readable regions.',
    '- Ticket cards show a recoverable reference and text status. The form and its receipt/status view are separate screens as the family journey declares.',
    '- Staff reply and escalation controls appear only if this family’s plan includes them; the empty queue names what matched nothing.',
  ].join('\n'),
  'survey-form': [
    '- A brand header and navigation frame a focused questionnaire card; a supporting hero may use two columns before the single readable form.',
    '- Use the family plan’s labelled questions and controls, not a count or field list from an illustrative board.',
    '- Validation names the affected question and is announced. The family journey decides whether questions step, how drafts persist, and which receipt or outcome view follows.',
    '- A separate empty result view names the filter or response set with no matches.',
  ].join('\n'),
  'docs-site': [
    '- A brand header and navigation frame a persistent table-of-contents sidebar beside a dominant reading column.',
    '- Hierarchical headings and an aria-current page marker keep the article structure navigable; code or transcript blocks remain selectable text when declared.',
    '- The labelled feedback or annotation form belongs on its family-defined route, with a search empty state naming the failed query.',
  ].join('\n'),
  'directory-listing': [
    '- A brand header and navigation lead to a grid or list of entity cards; the filter region sits above or beside the index.',
    '- An entity profile expands into a split view or dominant reading column, with the family’s own details and photography.',
    '- The labelled intake form follows this family’s journey, and an empty state explains which search or filter found no results.',
  ].join('\n'),
  'expense-tracker': [
    '- A page frame with brand header, navigation, summary region, aligned ledger grid, labelled intake form and footer.',
    '- The aggregate total or budget is visible above the ledger. Right-aligned amounts and text status make records scannable.',
    '- The intake form is open and inline beside or below the ledger as width allows; the family journey defines its fields.',
    '- A receipt isolates one saved transaction, and the empty state names the absence of entries.',
  ].join('\n'),
  'library-catalogue': [
    '- A responsive frame holds brand header, navigation, catalogue grid, the working form and footer.',
    '- Labelled search and filter controls come from the family plan; cards expose the subject name, attributes and detail action without inventing a filter field.',
    '- A separate detail view gives a subject room beyond the card. The family journey determines the reservation form, receipt and any staff view.',
    '- The empty state explicitly names a search that matched no results.',
  ].join('\n'),
};

const TRAINING_COMPONENTS = {
  dashboard: [
    '1. Brand header and section navigation with a visible current destination.',
    '2. Summary region of aligned metrics or filtered rows for this family’s measured state.',
    '3. Subject detail and a text-labelled status marker; colour never carries status alone.',
    '4. A labelled inline log form with announced validation and refusal feedback.',
    '5. Footer plus empty and selected-state panels.',
  ].join('\n'),
  'support-helpdesk': [
    '1. Brand header, navigation and desk introduction.',
    '2. A labelled ticket submission form with announced errors.',
    '3. Ticket cards with recoverable reference, owner and text status.',
    '4. A reference/status view and staff reply controls only as the family plan declares.',
    '5. Footer, empty queue and refusal feedback.',
  ].join('\n'),
  'docs-site': [
    '1. Brand header and navigation with a visible current destination.',
    '2. Search and filter controls that retain URL-driven state.',
    '3. A table-of-contents sidebar and article reading column with hierarchical headings.',
    '4. Selectable transcript or code content only where the family plan provides it.',
    '5. A labelled feedback or annotation form and an explicit empty search state.',
    '6. Footer with contact details.',
  ].join('\n'),
  'survey-form': [
    '1. Brand header, navigation and questionnaire introduction.',
    '2. A questionnaire card with labelled questions and family-defined controls.',
    '3. Per-question announced validation and refusal feedback.',
    '4. The receipt and outcome views declared by this family’s journey.',
    '5. Footer and an empty result state.',
  ].join('\n'),
};

function trainingLayoutProse(text) {
  // Source-backed fenced CSS and inline class references describe functional layout;
  // discard only board/demo inventory units, never rewrite authored selector syntax.
  const protectedText = protectFences(text);
  const functional = protectedText.text
    .replace(/The reference board puts them in a\s+right-hand sidebar/gi,
      'On wide screens a right-hand sidebar can hold them')
    .replace(/Page structure top to bottom, as declared and as rendered:/gi,
      'Page structure top to bottom:')
    .replace(/, and the date the board was read\b/gi, '');
  const prose = functional.split(/\n{2,}/).flatMap((paragraph) => paragraph.split(/(?=^[-*]\s)/m))
    .filter((unit) => !/\b(?:rasters?|the corpus|both boards|both references|training boards|reference boards?|browser viewports?|(?:tr|fam)-\d{2})\b/i.test(unit) &&
      !/^\s*(?:\*\*A divergence|The two training boards|The reference establishes the grammar|(?:[-*]\s*)?The five boards)/i.test(unit))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return protectedText.restore(prose);
}

function eventFunctionalLayout(design) {
  // The authored grammar carries a functional subsection alongside static-demo observations.
  // Both pattern and training prompts project this ONE source rather than duplicate its bullets.
  const projection = section(design, 'Grammar and layout')?.split('\n### Functional site projection\n')[1]
    ?.split('\n### ', 1)[0];
  // Its explanatory preface distinguishes the demo; only the functional bullets
  // belong in either build brief.
  return projection?.match(/^- [\s\S]+/m)?.[0]?.trim() ?? null;
}

function trainingSiteLayout(design, archetype, journey) {
  const layout = section(design, 'Grammar and layout');
  if (!layout) return null;
  // The shared archetype source also records raster defects and source-vs-board divergences;
  // those observations are not requirements for any family's functional website.
  const structural = trainingLayoutProse(archetype === 'event-registration'
    ? eventFunctionalLayout(design) ?? '' : TRAINING_LAYOUTS[archetype] ?? layout);
  if (archetype === 'booking') return structural.replace(/\bthe student\b/gi, 'the user');
  if (archetype === 'web-shop') return structural.replace(/configuration selects \(quantity, variant, grind\)/i,
    'the configuration controls this family’s plan declares');
  if (archetype === 'event-registration') {
    // The family journey owns its form ID; the shared authored pattern names no demo ID.
    const familyFormId = journey?.match(/\bform#([a-z][a-z0-9-]*)\b/)?.[1];
    return structural.replace(/\bThe registration form\b/, familyFormId ? `The form #${familyFormId}` : 'The registration form');
  }
  return structural;
}

function siteComponentHierarchy(design, { trainingArchetype = null } = {}) {
  const hierarchy = section(design, 'Component hierarchy');
  if (!hierarchy) return null;
  if (trainingArchetype === 'booking') return TRAINING_BOOKING_COMPONENTS;
  if (trainingArchetype === 'event-registration') return TRAINING_EVENT_COMPONENTS;
  if (trainingArchetype === 'web-shop') return TRAINING_WEB_SHOP_COMPONENTS;
  if (trainingArchetype && TRAINING_COMPONENTS[trainingArchetype]) return TRAINING_COMPONENTS[trainingArchetype];
  // The archetype design also documents its static demo. The site brief needs its functional
  // components, not the demo file inventory or a state switcher that must never ship as product UI.
  let skipDemoBullet = false;
  const cleaned = hierarchy.split(/\n{2,}/)
    .filter((paragraph) => !/^Read from\s+`?demo\//i.test(paragraph.trim()))
    .join('\n\n')
    .split('\n')
    .filter((line) => {
      if (/^\s*[-*]\s/.test(line)) skipDemoBullet = /\bdemo state switcher\b/i.test(line);
      else if (!line.trim()) skipDemoBullet = false;
      return !skipDemoBullet && !/^\s*Read from\b/i.test(line);
    })
    .join('\n')
    // Keep the ticket/empty-state component description, but not paths into the static demo.
    .replace(/`?demo\/([a-z0-9-]+)\.html`?/gi, (_, page) => `the ${page.replaceAll('-', ' ')} page`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return trainingArchetype ? trainingLayoutProse(cleaned) : cleaned;
}

function eventPatternTokens(design) {
  // Derive declared colour values from the authored table, not its demo
  // stylesheet-usage column (which names static selectors and reference counts).
  const rows = section(design, 'Token usage')?.matchAll(/^\| `(--[a-z-]+)` \| `(#[0-9a-f]{6})` \|/gmi) ?? [];
  const tokens = [...rows].map(([, name, value]) => `- ${name}: ${value}`);
  return tokens.length ? `Exact palette values from the authored design:\n${tokens.join('\n')}` : null;
}

/** The authored archetype plan/design are the source; this is a readable prompt assembled from them, not model output. */
export function archetypeBrief(repoRoot, id, trainingImagePrompt = null) {
  if (!ID.test(id)) return null;
  const directory = 'docs/design/archetypes';
  const plan = authoredText(repoRoot, directory, id, 'plan.md');
  const design = authoredText(repoRoot, directory, id, 'design.md');
  if (!plan || !design) return null;
  const readme = authoredText(repoRoot, directory, id, 'README.md');
  const eventPattern = id === 'event-registration';
  const sitePrompt = [
    `Build a complete, interactive ${id.replaceAll('-', ' ')} website. This is a site implementation brief, not an image-generation or model-performance result.`,
    group('Use case', section(plan, 'Use case')),
    group('UI composition', eventPattern ? section(design, 'Visual thesis')
      ?.replace(/\s*-\s*see the\s+first anti-pattern below:/i, ':') : section(design, 'Visual thesis')),
    group('Layout and components', eventPattern ? eventFunctionalLayout(design) :
      [section(design, 'Grammar and layout'), section(design, 'Component hierarchy')].filter(Boolean).join('\n\n')),
    group('Visual tokens', eventPattern ? eventPatternTokens(design) : section(design, 'Token usage')),
    group('Step-by-step behaviour', section(plan, 'Journey')),
    group('Validation and persisted states', section(plan, 'Validation and states')),
    group('Acceptance contract', section(plan, 'Acceptance criteria')),
  ].join('\n\n');
  return {
    id,
    sitePrompt: eventPattern ? sitePrompt.replace(/\bform#registration-form\b|#registration-form\b/g, 'the registration form') : sitePrompt,
    imagePromptSource: readme ? `docs/design/archetypes/${id}/README.md` : trainingImagePrompt?.source ?? null,
    fallbackImagePrompt: readme ? null : trainingImagePrompt?.text ?? null,
    planSource: `${directory}/${id}/plan.md`,
    designSource: `${directory}/${id}/design.md`,
    assertions: (section(plan, 'Acceptance criteria') ?? '').split('\n').filter((line) => /^[-*] /.test(line)).map((line) => line.slice(2).trim()),
    readme,
  };
}

/** Exact author-supplied image prompts: early boards use '- File: / - Prompt:'; later boards use fenced text. */
export function stepImagePrompt(readme, filename) {
  if (!readme || !/^[a-z0-9][a-z0-9-]*\.jpg$/.test(filename)) return null;
  const fence = `### \`${filename}\``;
  const at = readme.indexOf(fence);
  if (at >= 0) {
    const block = readme.slice(at + fence.length).split(/\n### /, 1)[0];
    const match = block.match(/```text\s*\n([\s\S]*?)\n```/);
    if (match) return match[1].trim();
  }
  const fileLine = readme.split('\n').find((line) => line.trim().startsWith(`- File: \`${filename}\``));
  if (!fileLine) return null;
  const next = readme.slice(readme.indexOf(fileLine) + fileLine.length).split(/\n\s*- File: |\n\d+\. \*\*Step /, 1)[0];
  const prompt = next.match(/^\s*- Prompt: (.+)$/m)?.[1]?.trim();
  return prompt?.startsWith('"') && prompt.endsWith('"') ? prompt.slice(1, -1) : prompt ?? null;
}

/** The manifest is the declaration, not a directory listing: prefer the first authored variant per family. */
export function trainingBriefs(repoRoot) {
  const file = join(repoRoot, 'docs/train/briefs/manifest.jsonl');
  let lines;
  try {
    const root = join(repoRoot, 'docs/train/briefs');
    if (!lstatSync(root).isDirectory() || realpathSync(root) !== join(realpathSync(repoRoot), 'docs/train/briefs')) return new Map();
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) return new Map();
    lines = readFileSync(file, 'utf8').split('\n');
  } catch { return new Map(); }
  const rows = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (!FAMILY.test(row?.family_id ?? '') || row.brief_id !== `${row.family_id}-v1` ||
        !ID.test(row.archetype ?? '') || typeof row.prompt !== 'string') continue;
    if (!rows.has(row.family_id)) rows.set(row.family_id, row);
  }
  return rows;
}

export function trainingBrief(repoRoot, id, row) {
  if (!FAMILY.test(id) || row?.family_id !== id || !ID.test(row?.archetype ?? '') || typeof row.prompt !== 'string') return null;
  const plan = authoredText(repoRoot, 'docs/train/design', id, 'plan.md');
  const design = authoredText(repoRoot, 'docs/train/design', id, 'design.md');
  // The training design describes a static DOM conformance fixture. Use the archetype's multi-screen
  // layout/components, but not its visual thesis or tokens: those can contradict the family's palette.
  const siteDesign = authoredText(repoRoot, 'docs/design/archetypes', row.archetype, 'design.md') ?? design;
  const imagePrompt = authoredText(repoRoot, 'docs/design/training', id, 'prompt.txt');
  const assertions = Array.isArray(row.assertions) ? row.assertions.filter((assertion) => typeof assertion === 'string') : [];
  const journey = section(plan, 'Journey');
  return {
    sitePrompt: [
      `Build a functional ${row.archetype.replaceAll('-', ' ')} website for this scenario. The image prompt below is an illustration brief; it is not a substitute for implementing the behaviour.`,
      group('Use case', row.prompt),
      group('UI layout', trainingSiteLayout(siteDesign, row.archetype, journey), { preserveFences: true }),
      group('Family visual direction and tokens', [familyVisualThesis(design), declaredTokens(design), section(design, 'Token usage')].filter(Boolean).join('\n\n')),
      group('Expected components', siteComponentHierarchy(siteDesign, { trainingArchetype: siteDesign !== design ? row.archetype : null }), { preserveFences: true }),
      group('Step-by-step interactions', journey),
      group('Validation and server state', section(plan, 'Validation and states')),
      group('Required assertions', assertions.length ? assertions.map((assertion) => `- ${assertion}`).join('\n') : null),
    ].join('\n\n'),
    imagePrompt,
    imagePromptSource: imagePrompt ? `docs/design/training/${id}/prompt.txt` : null,
    planSource: plan ? `docs/train/design/${id}/plan.md` : null,
    designSource: siteDesign ? (siteDesign === design ? `docs/train/design/${id}/design.md` : `docs/design/archetypes/${row.archetype}/design.md`) : null,
    tokenSource: design ? `docs/train/design/${id}/design.md` : null,
    steps: Array.isArray(row.journey?.steps) ? row.journey.steps.filter((step) => step && typeof step === 'object' && !Array.isArray(step)) : [],
    assertions,
  };
}

export function inheritedTrainingPrompt(repoRoot, rows, archetype) {
  for (const row of rows.values()) {
    if (row.archetype !== archetype) continue;
    const text = authoredText(repoRoot, 'docs/design/training', row.family_id, 'prompt.txt');
    if (text) return { text, source: `docs/design/training/${row.family_id}/prompt.txt` };
  }
  return null;
}

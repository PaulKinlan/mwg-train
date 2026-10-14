#!/usr/bin/env node
/**
 * Scaffold the per-family training specs: docs/train/design/<family>/plan.md and design.md.
 *
 *   node scripts/scaffold-train-design.mjs            # write all 30 families
 *   node scripts/scaffold-train-design.mjs tr-07      # write one family
 *
 * The documents are derived from the family's canonical brief row (`-v1`) in
 * docs/train/briefs/manifest.jsonl and from the family's authored target board
 * docs/train/targets/<family>/index.html, so regenerating after a brief or target edit rewrites the
 * facts rather than letting them drift. `npm run check:train-design` then re-checks every claim in the
 * written documents against those same sources, so a hand edit that disagrees with the brief or the
 * target stylesheet is a finding, not a difference of opinion.
 *
 * The generator writes prose templates keyed on the brief's own text (topic, prompt, journeys,
 * assertions) and on measurements of the target stylesheet (tokens, font stack, structure). It does not
 * invent behaviour: every route, field, selector and assertion in a plan.md is copied from the brief.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TRAIN_BRIEFS_MANIFEST,
  TRAIN_DESIGN_DIR,
  TRAIN_TARGETS_DIR,
  canonicalBrief,
  targetStylesheet,
  targetTitle,
  targetTokens,
} from '../src/train/design-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;

const loadBriefs = () => readFileSync(join(ROOT, TRAIN_BRIEFS_MANIFEST), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const only = process.argv[2] ?? null;

// A palette token's role, named from its suffix. The families use per-family prefixes, so the suffix is
// the only stable vocabulary across them.
function tokenRole(token) {
  const suffix = token.replace(/^--[a-z0-9]+-/, '');
  const roles = {
    bg: 'the page background',
    surface: 'the raised surface behind the working panels',
    card: 'the card surface one level above the panel',
    border: 'every structural border',
    accent: 'the single chromatic accent, carried by the primary action and the current navigation marker',
    'accent-hover': "the accent's hover state",
    text: 'all primary text',
    'text-muted': 'secondary and supporting text',
    muted: 'secondary and supporting text',
  };
  return roles[suffix] ?? `the ${suffix} tone in the palette`;
}

function luminance(hex) {
  const match = /^#([0-9a-f]{6})/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Small html_tag → `tag.class` / `tag#id` list, in document order, for the component map. */
function structureOf(html) {
  const body = html.split(/<body[^>]*>/)[1] ?? html;
  const items = [];
  for (const match of body.matchAll(/<(header|nav|main|section|form|footer|fieldset)([^>]*)>/g)) {
    const attrs = match[2];
    const id = /id="([^"]+)"/.exec(attrs)?.[1];
    const klass = /class="([^"]+)"/.exec(attrs)?.[1]?.split(/\s+/)[0];
    items.push(`\`${match[1]}${id ? `#${id}` : klass ? `.${klass}` : ''}\``);
    if (items.length >= 14) break;
  }
  return items;
}

function cssValue(css, pattern) {
  return pattern.exec(css)?.[1]?.trim() ?? null;
}

// Anti-patterns: a per-archetype item first, then the universal ones. Values must stay inside the
// frontmatter YAML subset: no ': ', no flow-collection or indicator characters.
const ARCHETYPE_ANTI_PATTERNS = {
  booking: 'a calendar widget that hides the available slots behind extra clicks',
  'web-shop': 'a price or total that cannot be traced back to a listed item',
  dashboard: 'a chart decorative enough to hide the number it reports',
  'onboarding-auth': 'a credential field without an autocomplete token',
  'directory-listing': 'a listing card whose entire surface is not the link it appears to be',
  'event-registration': 'a capacity or deadline the page mentions but never enforces',
  'support-helpdesk': 'a ticket reference shown once and never recoverable again',
  'course-enrolment': 'a prerequisite note that appears only after the submit fails',
  'survey-form': 'a question whose scale labels swap meaning between rows',
  'restaurant-ordering': 'a menu option that cannot be reached by keyboard',
  'job-board': 'a posting with no stated location or terms',
  'docs-site': 'a code example that cannot be copied as text',
  'expense-tracker': 'a running total that does not match the listed entries',
  'library-catalogue': 'a search that matches nothing rather than saying so',
  'community-forum': 'a posting control offered to a visitor who cannot use it',
  'scroll-storytelling-launch': 'a scroll animation that blocks reading or ignores reduced-motion preference',
  'browser-puzzle-game': 'a board state whose outcome is shown by colour alone without text',
  'saas-workspace-board': 'an issue status badge that cannot be read or changed by keyboard',
  'realtime-telemetry-dashboard': 'a telemetry chart that hides the numerical value or alert state it reports',
  'interactive-product-configurator': 'a selected component whose price or weight delta is omitted from the build total',
  'developer-media-playground': 'an audio or shader control that autoplays before the user activates it',
  'editorial-blog': 'a long-form article column wider than comfortable reading measure',
  'fan-community-site': 'an unmoderated submission shown publicly before a moderator decision',
  'product-card-comparison': 'a comparison row whose unit or scale changes silently between columns',
};
const UNIVERSAL_ANTI_PATTERNS = [
  'a second accent colour competing with the primary action',
  'placeholder text standing in for a visible label',
  'a modal or step wizard hiding part of the form',
  'colour alone carrying an error with no message naming the field',
];

function planMarkdown(brief, title) {
  const journey = brief.journey;
  const fieldList = brief.fields.map((field) => `\`${field.slug}\``).join(', ');
  const required = brief.fields.filter((field) => field.required).map((field) => `\`${field.name}\``);
  // Which method a claim about a path carries, taken from the assertions: the brief declares paths only,
  // so an assertion naming `POST /book` is the evidence that /book is the write route.
  const methodFor = (path) => {
    for (const assertion of brief.assertions ?? []) {
      const match = /(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/.exec(assertion);
      if (match && match[2] === path) return match[1];
    }
    return null;
  };
  const roleFor = (path) => {
    if (methodFor(path) === 'POST' || methodFor(path) === 'PUT' || methodFor(path) === 'PATCH') {
      return 'write route the form submits to';
    }
    if (path === journey.startPath) return 'form page; the driven journey starts here';
    if (path === journey.search?.path) return 'search results for stored records';
    if (/\/:(?:id|ref)\/edit$/.test(path) || path.endsWith('/edit')) return 'edit page for one stored record';
    if (path.includes('/:')) return 'read-back of one stored record by its reference';
    return 'supporting page declared by the brief';
  };
  const routesTable = [
    '| Path | Role |',
    '| --- | --- |',
    ...brief.routes.map((path) => `| \`${path}\` | ${roleFor(path)} |`),
  ].join('\n');

  const stepLines = (journey.steps ?? []).map((step, index) => {
    const parts = [`visit \`${step.path}\``];
    for (const [selector, value] of Object.entries(step.fill ?? {})) {
      parts.push(`fill \`${selector}\` with "${value}"`);
    }
    for (const [selector, option] of Object.entries(step.select ?? {})) {
      parts.push(`choose "${option}" in \`${selector}\``);
    }
    if (step.submit) parts.push('submit the form');
    if (step.expectText) parts.push(`see "${step.expectText}"`);
    return `${index + 1}. Before the form page, ${parts.join(', then ')}.`;
  });
  const fillParts = Object.entries(journey.fill).map(([selector, value]) => `\`${selector}\` with "${value}"`);
  const selectParts = Object.entries(journey.select ?? {}).map(([selector, option]) => `choose "${option}" in \`${selector}\``);
  const journeyLines = [
    ...stepLines,
    `${stepLines.length + 1}. On \`${journey.startPath}\`, fill ${journey.formSelector}: ${fillParts.join(', ')}${selectParts.length ? `; ${selectParts.join('; ')}` : ''}.`,
    `${stepLines.length + 2}. Submit; the read page shows "${journey.expectText}", the value typed into the echoed field.`,
    '',
    `Separately, the brief declares a search flow: \`${journey.search.path}\` with query parameter \`${journey.search.queryParam}\`="${journey.search.query}" lists "${journey.search.expectIncludes.join('", "')}" inside \`${journey.search.resultsSelector}\` and does not list "${journey.search.expectAbsent.join('", "')}".`,
    ...(journey.update
      ? ['', `And an update flow: the stored record's \`${journey.update.field}\` field can be changed to "${journey.update.newValue}" and read back afterwards.`]
      : []),
  ].join('\n');

  const defects = (brief.seeded_defects ?? []).length > 0
    ? `\n\nSeeded defects the repair must remove, quoted from the brief:\n\n${brief.seeded_defects.map((defect) => `- ${defect}`).join('\n')}`
    : '';

  return `---
family: ${brief.family_id}
brief: ${TRAIN_BRIEFS_MANIFEST}
brief_id: ${brief.brief_id}
---

# \`${brief.family_id}\` functional specification — ${title}

The behaviour of the \`${brief.family_id}\` training family, bound to its canonical brief row
[\`${brief.brief_id}\`](../../briefs/manifest.jsonl) rather than restated from memory: every claim below is
checked against that row by \`npm run check:train-design\`. The \`-v2\` brief is the same contract in a
different voice ([invariant 2](../../briefs/SCHEMA.md)), so this document covers both. What the family
*looks like* is in [\`design.md\`](design.md) beside this file.

## Use case

The brief's scenario is ${brief.topic}, in the \`${brief.archetype}\` archetype. The brief asks for:

> ${brief.prompt}

The form the journey drives carries ${brief.fields.length} fields: ${fieldList}.

The brief's own user journeys, which the harness flow below is derived from:

${brief.journeys.map((line) => `- ${line.charAt(0).toUpperCase()}${line.slice(1)}`).join('\n')}

Out of scope, by the brief's own non-goals: ${brief.non_goals.map((goal) => goal.replace(/^no /, '')).join('; ')}.

## Routes and effects

The brief declares paths, not methods; the methods are pinned by the assertions quoted under
**Acceptance criteria** and by the shared archetype server contract (one write route, one read-back by
reference).

${routesTable}

## Data and state

What the brief requires to survive a reload or live on the server, quoted verbatim:

${brief.server_persistence.map((line) => `- "${line}"`).join('\n')}

The family's declared framework arm is \`${brief.framework}\` and its locale is \`${brief.locale}\`; both are
invariant across the two wording variants. The scaffolded server keeps records for the life of the process:
the brief's persistence requirement is server-side storage with read-back, not a durable database.

## Journey

The flow the harness drives, with the selectors it uses:

${journeyLines}

Reloading the read page must show the same stored values: the page after the redirect is rendered from the
stored record, not from the submission.

## Validation and states

- **Required fields:** ${required.join(', ')} - each is required in the form and re-checked on the server.
  A required select left on its first option does not count as chosen; the journey picks a non-default
  option for every one of them.
- **Required rules:** ${brief.required_rules.map((rule) => `\`${rule}\``).join(', ')}, drawn from the
  applicable set ${brief.applicable_rules.map((rule) => `\`${rule}\``).join(', ')} and pinned to
  [\`docs/eval/rules.json\`](../../../eval/rules.json).
- **On a missing field:** the submission is refused and the error is announced against the field it
  belongs to; nothing is stored.
- **On success:** the record is stored server-side and the browser lands on its read-back route.

## Acceptance criteria

Quoted from the brief, which is the authority for them:

${brief.assertions.map((assertion) => `- ${assertion}`).join('\n')}

## Implementation status

Task: \`${brief.task}\`. The brief is authored and schema-validated (\`npm run check:brief-schema\`), and the
family's seven framework trees are deterministic scaffold output recorded in \`pilot/TRAINING_CORPUS.json\` -
authored templates, not model output. The corpus caveats in [\`docs/train/corpus/README.md\`](../../corpus/README.md)
apply unchanged: declaring a route is not serving it, the browser-verified subset is recorded in
[\`YIELD.md\`](../../corpus/YIELD.md) and [\`SERVED.md\`](../../corpus/SERVED.md), and no per-project
training-approval exists for these trees.${defects}

## Provenance

Scenario, copy and data are synthetic and authored in this repository; the brief schema
([\`SCHEMA.md\`](../../briefs/SCHEMA.md), invariant 5) forbids owner-identifying material, and the
owner-auth gate scans the briefs fail-closed. The design target this family is measured against is
[\`${TRAIN_TARGETS_DIR}/${brief.family_id}/index.html\`](../../targets/${brief.family_id}/index.html), a
project-owned CC0 board whose rights record is
[\`training-targets.md\`](../../../provenance/assets/training-targets.md); it is a conformance instrument,
excluded from training.
`;
}

function designMarkdown(brief, html, css, tokens, title) {
  const font = cssValue(css, /font-family:\s*([^;]+);/);
  const h1Size = cssValue(css, /h1[^{}]*\{[^}]*?font-size:\s*([^;]+);/);
  const media = [...css.matchAll(/@media/g)].length;
  const formId = /<form[^>]*\bid="([^"]+)"/.exec(html)?.[1] ?? null;
  const structure = structureOf(html);
  const bgToken = [...tokens.keys()].find((token) => token.endsWith('-bg'));
  const bgValue = bgToken ? tokens.get(bgToken) : null;
  const dark = bgValue !== null && (luminance(bgValue) ?? 255) < 128;

  const literals = {};
  const radius = cssValue(css, /border-radius:\s*([^;]+);/);
  const frame = cssValue(css, /max-width:\s*([^;]+);/);
  const controlBorder = cssValue(css, /border:\s*(1px solid [^;]+);/);
  const pagePadding = cssValue(css, /body\s*\{[^}]*?padding:\s*([^;]+);/);
  if (radius) literals['control-radius'] = radius;
  if (frame) literals['content-frame'] = frame;
  if (controlBorder) literals['control-border'] = controlBorder;
  if (pagePadding) literals['page-padding'] = pagePadding;

  const tokenLines = [...tokens.entries()]
    .map(([token]) => `- \`${token}\` is ${tokenRole(token)}.`)
    .join('\n');
  const frontmatterTokens = [...tokens.entries()]
    .map(([token, value]) => `  ${token}: "${value}"`)
    .join('\n');
  const frontmatterLiterals = Object.keys(literals).length > 0
    ? `literals:\n${Object.entries(literals).map(([key, value]) => `  ${key}: "${value}"`).join('\n')}\n`
    : '';
  const antiPatterns = [ARCHETYPE_ANTI_PATTERNS[brief.archetype], ...UNIVERSAL_ANTI_PATTERNS]
    .filter(Boolean);
  const frontmatterAnti = antiPatterns.map((item) => `  - ${item}`).join('\n');

  const spacingValues = [...new Set([pagePadding, radius, frame].filter(Boolean))];
  const mediaSentence = media === 0
    ? 'There are no media queries: the board is one fixed composition at the conformance viewport (1280x900), not a responsive study.'
    : `The board declares ${media} media quer${media === 1 ? 'y' : 'ies'}; the conformance render still pins the 1280x900 viewport.`;

  return `---
family: ${brief.family_id}
target: ${TRAIN_TARGETS_DIR}/${brief.family_id}/index.html
tokens:
${frontmatterTokens}
${frontmatterLiterals}antiPatterns:
${frontmatterAnti}
---

# \`${brief.family_id}\` target design — ${title}

The aesthetic system of the \`${brief.family_id}\` family's authored target board
[\`index.html\`](../../targets/${brief.family_id}/index.html). The family's behaviour is specified
separately in [\`plan.md\`](plan.md); the frontmatter above is the single source of truth for the palette,
so this body describes what each token is for rather than what it holds.

## Visual thesis

${title}: the board for ${brief.topic}, in a ${dark ? 'dark, low-glare' : 'light'} palette, recognisable by its
own token prefix rather than by a shared template. The board's job is to be a *target*: a student model's
output is measured against it, so the design states one clear hierarchy - brand header, working panel,
the form - and nothing decorative competing with it.

## Grammar and layout

- A single inline stylesheet with one \`:root\` block; every colour decision lives in the tokens above.
- ${mediaSentence}
- Composition order follows the task: header with brand and navigation, then the working surface with the
  form, with supporting panels beside or below it.
- **Control borders:** the palette intentionally declares low-contrast control borders (\`< 3:1\`). Because these borders fall below the WCAG 1.4.11 boundary contrast requirement, every control MUST remain identifiable in its default unfocused state by an alternate persistent visual cue (e.g. distinct background fill or contrasting icon).
- The routes the real project serves are functional claims and live in [\`plan.md\`](plan.md), not here.

## Typography

- Stack: \`${font}\` - system or generic families only, no remote font and no third-party asset.${h1Size ? `
- The page heading sets the scale at \`${h1Size}\`; everything else steps down from it.` : ''}
- One \`h1\` per board; section headings inside panels keep the outline real rather than a size effect.

## Token usage

${tokenLines}

Everything else is a literal, listed in the frontmatter where it exists, and therefore not themeable per
family. The anti-pattern about a second accent follows from this: with one accent there is one primary
action, and a second colour would have to mean a second meaning.

## Spacing rhythm

The steps in use on this board: ${spacingValues.map((value) => `\`${value}\``).join(', ')}. The rhythm is
the usual one - related things closer (control to label), sections further apart (panel to panel), the
content frame the largest step - with no arbitrary gaps between.

## Component hierarchy

Top to bottom, from the board's own markup:

${structure.map((item) => `- ${item}`).join('\n')}

${formId ? `The form is \`form#${formId}\`: illustrative markup on the board, standing in for the driven form
the brief specifies in [\`plan.md\`](plan.md).` : 'The board carries no form element.'}

## Anti-patterns

${antiPatterns.map((item) => `- **${item[0].toUpperCase()}${item.slice(1)}.**`).join('\n')}

## Rationale

Constraints rather than preferences: the board is a conformance instrument (rendered to a pinned viewport
and hash-pinned by \`npm run targets:train:check\`), so it is one static HTML file with one inline
stylesheet, no scripts and no external assets. Per-family identity lives in the \`:root\` tokens, which is
why the frontmatter above - not this prose - is the source of truth for them.

## Provenance

Subject, copy and palette are synthetic and authored in this repository; the board is a project-owned
CC0 asset, arm \`A1_self_generated\`, marked \`excluded_from_training\` as a conformance instrument - the
rights record is [\`training-targets.md\`](../../../provenance/assets/training-targets.md) and the render
pipeline is \`scripts/render-training-targets.mjs\`. This contract is verified against the board's own
stylesheet by \`npm run check:train-design\`.
`;
}

const rows = loadBriefs();
const families = [...new Set(rows.map((row) => row.family_id))].sort();
let written = 0;
for (const family of families) {
  if (only && family !== only) continue;
  const brief = canonicalBrief(rows, family);
  if (!brief) throw new Error(`no canonical (-v1) brief row for ${family}`);
  const targetPath = join(ROOT, TRAIN_TARGETS_DIR, family, 'index.html');
  if (!existsSync(targetPath)) throw new Error(`no authored target board at ${TRAIN_TARGETS_DIR}/${family}/index.html`);
  const html = readFileSync(targetPath, 'utf8');
  const css = targetStylesheet(html);
  if (css === null) throw new Error(`${family}: target board must carry exactly one <style> block`);
  const tokens = targetTokens(css);
  if (!tokens || tokens.size === 0) throw new Error(`${family}: target stylesheet declares no :root tokens`);
  const title = targetTitle(html) ?? brief.topic;

  const dir = join(ROOT, TRAIN_DESIGN_DIR, family);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plan.md'), planMarkdown(brief, title));
  writeFileSync(join(dir, 'design.md'), designMarkdown(brief, html, css, tokens, title));
  written += 2;
}
console.log(`scaffold-train-design: wrote ${written} documents for ${only ?? `${families.length} families`} under ${TRAIN_DESIGN_DIR}/`);

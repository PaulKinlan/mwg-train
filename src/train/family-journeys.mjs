/**
 * Deterministic 4-step Light Mode + 4-step Dark Mode journey specification and
 * multimodal prompt composer for all 39 training families (`tr-01`..`tr-39`).
 *
 * WHY THIS EXISTS:
 * Previously, `/concepts/family/tr-NN` showed each family's single `reference.jpg`
 * at the top of the page, and then displayed the parent archetype's 4-step boards
 * (`docs/design/archetypes/<archetype>/step*.jpg`) underneath it. Whenever a family
 * had its own brand and colour palette (e.g. `tr-15` Oakridge Tenant Co-operative in
 * brick-red `#b91c1c` vs `expense-tracker` The Ledger in spruce-teal `#0f766e`),
 * the main image and the 4 steps did not match at all.
 *
 * This module defines a unified 4-step Light + 4-step Dark journey per training
 * family (`docs/design/training/tr-NN/step1-overview.jpg`..`step4-validation.jpg`
 * and `docs/design/training/tr-NN/dark/step1-overview.jpg`..`step4-validation.jpg`),
 * composed deterministically from each family's own committed sources:
 *   1. `docs/train/briefs/manifest.jsonl` (canonical `-v1` brief row)
 *   2. `docs/train/design/tr-NN/design.md` (site name, CSS tokens, literals, hierarchy, anti-patterns)
 *   3. `docs/train/design/tr-NN/plan.md` (routes, driven journey inputs, search, update, refusal rules)
 *   4. `docs/design/training/tr-NN/reference.jpg` (the family's visual anchor passed as inlineData)
 */

export const FAMILY_JOURNEY_STEP_SPECS = Object.freeze([
  Object.freeze({
    id: 'step1-overview',
    number: 1,
    shortTitle: 'Initial overview & ready workspace',
    title: 'Step 1 — Initial overview & ready workspace',
    kind: 'page',
  }),
  Object.freeze({
    id: 'step2-interaction',
    number: 2,
    shortTitle: 'Active form & control interaction',
    title: 'Step 2 — Active form & control interaction',
    kind: 'interaction',
  }),
  Object.freeze({
    id: 'step3-outcome',
    number: 3,
    shortTitle: 'Persisted confirmation, read-back & search filter',
    title: 'Step 3 — Persisted confirmation, read-back & search filter',
    kind: 'page',
  }),
  Object.freeze({
    id: 'step4-validation',
    number: 4,
    shortTitle: 'Accessible validation refusal & error recovery',
    title: 'Step 4 — Accessible validation refusal & error recovery',
    kind: 'interaction',
  }),
]);

export const FAMILY_JOURNEY_STEP_IDS = Object.freeze(
  FAMILY_JOURNEY_STEP_SPECS.map((spec) => spec.id),
);

export const FAMILY_BOARD_WIDTH = 1376;
export const FAMILY_BOARD_HEIGHT = 768;
export const FAMILY_BOARD_PROMPT_DATE = '11 October 2026';

export function familyStepLightPath(familyId, stepId) {
  return `docs/design/training/${familyId}/${stepId}.jpg`;
}

export function familyStepDarkPath(familyId, stepId) {
  return `docs/design/training/${familyId}/dark/${stepId}.jpg`;
}

export function familyPromptsJsonPath(familyId) {
  return `docs/design/training/${familyId}/journey-prompts.json`;
}

function localeConventions(locale) {
  if (locale === 'en-GB') return 'Use £ prices, British English spelling, day-month dates and .co.uk-style invented domains.';
  if (locale === 'en-US') return 'Use $ prices, US English spelling and month-day dates.';
  return `Write all copy in ${locale || 'en-US'} conventions.`;
}

const TAG_WORDS = Object.freeze({
  header: 'a brand header',
  nav: 'a navigation bar',
  main: 'a main content area',
  section: 'a content section',
  article: 'a card',
  aside: 'a supporting panel',
  form: 'the working form',
  fieldset: 'a group of fields',
  field: 'a field',
  label: 'a field label',
  ul: 'a list',
  table: 'a data table',
  h1: 'the page heading',
  h2: 'a section heading',
  footer: 'a footer',
  div: 'a surface',
});

export function describeHierarchy(entries = []) {
  const words = entries
    .map((entry) => entry.split(/[.#[\s]/)[0].trim().toLowerCase())
    .filter(Boolean)
    .map((tag) => TAG_WORDS[tag] ?? `a ${tag} block`);
  const runs = [];
  for (const word of words) {
    const last = runs.at(-1);
    if (last && last.word === word) last.count += 1;
    else runs.push({ word, count: 1 });
  }
  return runs
    .map(({ word, count }) => (count === 1 ? word : `${word} (${count} of them)`))
    .join(', then ');
}

function formatInputPairs(fill = {}, select = {}, fields = []) {
  const labelByName = new Map(
    (fields ?? []).map((f) => [f.name || f.slug, f.label || f.name || f.slug]),
  );
  const pairs = [];
  for (const [selector, value] of Object.entries(select ?? {})) {
    const nameMatch = selector.match(/name=([a-zA-Z0-9_-]+)/);
    const fieldName = nameMatch ? nameMatch[1] : selector;
    const label = labelByName.get(fieldName) ?? fieldName;
    pairs.push(`"${label}" selected as "${value}"`);
  }
  for (const [selector, value] of Object.entries(fill ?? {})) {
    const nameMatch = selector.match(/name=([a-zA-Z0-9_-]+)/);
    const fieldName = nameMatch ? nameMatch[1] : selector;
    const label = labelByName.get(fieldName) ?? fieldName;
    pairs.push(`"${label}" filled with "${value}"`);
  }
  return pairs;
}

function findRefusalCriterion(assertions = [], fieldLabels = []) {
  const refusal = assertions.find((item) => /invalid|error|refus|missing|empty|negative|blank|reject|require/i.test(item));
  if (refusal) return refusal;
  const firstLabel = fieldLabels[0] ?? 'the required field';
  return `submitting the form with ${firstLabel} left blank or invalid is refused with an accessible inline error message`;
}

const ANTI_CHROME_HEADER = [
  `Create a finished, high-density screenshot of a real production website at 16:9 (${FAMILY_BOARD_WIDTH}x${FAMILY_BOARD_HEIGHT}).`,
  `Show ONLY the website itself: its own brand header begins at the image's top edge and the web page fills the entire viewport edge to edge.`,
  `Strictly NO browser chrome, macOS traffic lights, OS window controls, tabs, address or URL bars, browser borders, window frames, desktop backdrop or surrounding margins.`,
  `Do NOT draw OS window minimize/maximize/close (- □ ×) icons on any dialog or card, and do NOT print raw CSS selectors, URL paths, or resolution numbers on the page.`,
].join(' ');

/**
 * Compose the 4-step Light Mode + 4-step Dark Mode journey specification and prompts for one family.
 *
 * @param {object} sources
 * @param {string} sources.familyId - e.g. 'tr-15'
 * @param {string} sources.archetype - e.g. 'expense-tracker'
 * @param {string} sources.title - e.g. 'Tenant collective maintenance expense logging'
 * @param {string} sources.siteName - e.g. 'Oakridge Tenant Co-operative — Maintenance Ledger & Expenses'
 * @param {object} sources.brief - canonical (-v1) row from docs/train/briefs/manifest.jsonl
 * @param {Record<string, string>} sources.tokens - CSS custom properties from docs/train/design/tr-NN/design.md
 * @param {Record<string, string>} sources.literals - structural constants from design.md
 * @param {string[]} sources.antiPatterns - anti-patterns from design.md
 * @param {string} sources.visualThesis - cleaned visual thesis from design.md
 * @param {string[]} sources.componentHierarchy - component hierarchy entries from design.md
 */
export function composeFamilyJourneySteps(sources) {
  const {
    familyId,
    archetype,
    title,
    siteName,
    brief,
    tokens = {},
    literals = {},
    antiPatterns = [],
    visualThesis = '',
    componentHierarchy = [],
  } = sources;

  const tokenList = Object.entries(tokens)
    .map(([name, value]) => `${value} (${name.replace(/^--/, '')})`)
    .join(', ');
  const literalList = Object.entries(literals)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');
  const structure = describeHierarchy(componentHierarchy) || 'a brand header, a navigation bar, a main content workspace, the working form, and a footer';
  const routes = Array.isArray(brief?.routes) && brief.routes.length ? brief.routes : ['/'];
  const homeRoute = routes[0] ?? '/';
  const readRoute = routes.find((r) => r.includes(':id')) ?? routes[1] ?? homeRoute;
  const listRoute = routes.find((r) => r !== homeRoute && !r.includes(':id') && !r.endsWith('/new')) ?? homeRoute;
  const fields = Array.isArray(brief?.fields) ? brief.fields : [];
  const fieldLabels = fields.map((f) => f.label ?? f.name).filter(Boolean);
  const journey = brief?.journey ?? {};
  const preSteps = Array.isArray(journey.steps) ? journey.steps : [];
  const filledPairs = formatInputPairs(journey.fill, journey.select, fields);
  const expectText = journey.expectText
    ?? Object.values(journey.fill ?? {})[0]
    ?? Object.values(journey.select ?? {})[0]
    ?? 'Confirmed record';
  const search = journey.search ?? null;
  const update = journey.update ?? null;
  const assertions = Array.isArray(brief?.assertions) ? brief.assertions : [];
  const refusalRule = findRefusalCriterion(assertions, fieldLabels);
  const journeysProse = (brief?.journeys ?? [])
    .map((j) => j.charAt(0).toUpperCase() + j.slice(1).replace(/\.?$/, '.'))
    .join(' ');

  const sharedContext = [
    `The site is ${siteName}, a ${archetype} web application for ${title}.`,
    `Owner brief: "${brief?.prompt ?? title}"`,
    `Locale & copy conventions (${brief?.locale ?? 'en-US'}): ${localeConventions(brief?.locale ?? 'en-US')} Today's date is ${FAMILY_BOARD_PROMPT_DATE}; date all entries, bookings, deadlines, and activity in the weeks after ${FAMILY_BOARD_PROMPT_DATE}.`,
    `Visual identity & layout lock: Match the exact brand header, logo treatment, navigation bar, typography, card geometry, and light colour palette of the attached reference image (docs/design/training/${familyId}/reference.jpg).`,
    visualThesis ? `Art direction: ${visualThesis}` : '',
    tokenList ? `Use this exact Light Mode colour palette: ${tokenList}. The primary accent colour carries the single primary action.` : '',
    literalList ? `Structural constants: ${literalList}. Keep every form control clearly identifiable in its unfocused state with a distinct background fill or icon cue.` : '',
    antiPatterns.length ? `Strictly avoid: ${antiPatterns.join('; ')}.` : '',
  ].filter(Boolean).join('\n\n');

  // Step 1: Initial overview & ready workspace
  const step1LightPrompt = [
    ANTI_CHROME_HEADER,
    sharedContext,
    `STEP 1 OF 4 (LIGHT MODE) — INITIAL OVERVIEW & READY WORKSPACE:`,
    `Render the initial landing state of ${siteName} as a visitor first meets it on the primary workspace. Top-to-bottom structure: ${structure}.`,
    `Show the active overview/dashboard/ledger/catalogue surface populated with realistic, internally consistent records and totals, alongside the ready-to-use interactive form with visible labels for every control (${fieldLabels.map((l) => `"${l}"`).join(', ') || 'all declared controls'}).`,
    journeysProse ? `User journey context: ${journeysProse}` : '',
    `Include editorial photography where appropriate to the subject, a concise social-proof or status summary row, and the complete site footer.`,
  ].filter(Boolean).join('\n\n');

  // Step 2: Active form & control interaction
  const preStepSummary = preSteps.length
    ? `Include the active pre-selection context (${preSteps.map((s) => Object.values(s.select ?? s.fill ?? {}).join(', ') || s.expectText).filter(Boolean).join(' -> ')}). `
    : '';
  const step2LightPrompt = [
    ANTI_CHROME_HEADER,
    sharedContext,
    `STEP 2 OF 4 (LIGHT MODE) — ACTIVE FORM & CONTROL INTERACTION:`,
    `Keep the EXACT same brand header, navigation bar, page grid, colour palette, and surrounding panels from Step 1 (attached reference image).`,
    `Show the user mid-interaction inside the working form: ${preStepSummary}${filledPairs.length ? `populate the form controls with these exact concrete values: ${filledPairs.join('; ')}` : 'populate all form controls with realistic concrete values matching the scenario'}.`,
    `Display a crisp visible focus ring on the currently active input/select control, show any live calculation/preview/summary updating in real time to match the entered values, and highlight the primary submit button ready for submission.`,
  ].filter(Boolean).join('\n\n');

  // Step 3: Persisted confirmation, read-back & search filter
  const searchClause = search
    ? `Also show the search/filter bar populated with "${search.query}" filtering the displayed records so "${(search.expectIncludes ?? [expectText]).join(', ')}" is clearly listed in the results region.`
    : '';
  const updateClause = update
    ? `Show an inline edit/update affordance or updated badge indicating that the stored record can be updated to "${update.newValue}" and persisted on the server.`
    : '';
  const step3LightPrompt = [
    ANTI_CHROME_HEADER,
    sharedContext,
    `STEP 3 OF 4 (LIGHT MODE) — PERSISTED CONFIRMATION, READ-BACK & SERVER SEARCH:`,
    `Keep the EXACT same brand header, navigation bar, typography, and Light Mode colour palette from Step 1 (attached reference image).`,
    `Show the post-submission server-persisted read-back state after the form submission has been saved on the server and reloaded:`,
    `- Display a prominent accessible confirmation card or banner confirming the persisted record featuring "${expectText}" along with the submitted details (${filledPairs.slice(0, 4).join(', ')}).`,
    `- Show the updated ledger, list, or summary total reflecting the newly added record so every total agrees mathematically with the listed rows.`,
    searchClause,
    updateClause,
  ].filter(Boolean).join('\n\n');

  // Step 4: Accessible validation refusal & error recovery
  const step4LightPrompt = [
    ANTI_CHROME_HEADER,
    sharedContext,
    `STEP 4 OF 4 (LIGHT MODE) — ACCESSIBLE VALIDATION REFUSAL & ERROR RECOVERY:`,
    `Keep the EXACT same brand header, navigation bar, form layout, and Light Mode colour palette from Step 1 and Step 2 (attached reference images).`,
    `Show the accessible client + server validation refusal state when an invalid or incomplete form submission is refused (${refusalRule}):`,
    `- Render an accessible error summary banner at the top of the form (with a clear warning icon and heading) explicitly naming the offending field(s) and explaining how to fix them.`,
    `- Highlight the invalid or missing form control (${fieldLabels.slice(0, 2).map((l) => `"${l}"`).join(' and ') || 'the required field'}) with a high-contrast error border AND an inline error message below the control containing both an icon and clear text (never rely on colour alone).`,
    `- Preserve the user's already-entered valid values in the remaining form fields so no work is lost, and show that no invalid record was added to the persisted list/total.`,
  ].filter(Boolean).join('\n\n');

  const lightPrompts = {
    'step1-overview': step1LightPrompt,
    'step2-interaction': step2LightPrompt,
    'step3-outcome': step3LightPrompt,
    'step4-validation': step4LightPrompt,
  };

  const stateMap = {
    'step1-overview': {
      kind: 'page',
      path: homeRoute,
      source: `docs/train/design/${familyId}/plan.md#routes-and-effects`,
      drive: {
        description: `Initial GET ${homeRoute} landing view with empty/ready form (${fieldLabels.join(', ')})`,
      },
    },
    'step2-interaction': {
      kind: 'interaction',
      path: journey.startPath ?? homeRoute,
      source: `docs/train/design/${familyId}/plan.md#journey`,
      drive: {
        formSelector: journey.formSelector ?? 'form',
        fill: journey.fill ?? {},
        select: journey.select ?? {},
        expectText,
      },
    },
    'step3-outcome': {
      kind: 'page',
      path: search?.path ?? readRoute ?? listRoute,
      source: `docs/train/design/${familyId}/plan.md#journey`,
      drive: {
        expectText,
        ...(search ? { search } : {}),
        ...(update ? { update } : {}),
      },
    },
    'step4-validation': {
      kind: 'interaction',
      path: journey.startPath ?? homeRoute,
      source: `docs/train/design/${familyId}/plan.md#validation-and-states`,
      drive: {
        expectText: refusalRule,
      },
    },
  };

  return FAMILY_JOURNEY_STEP_SPECS.map((spec) => {
    const lightPrompt = lightPrompts[spec.id];
    const darkPrompt = [
      ANTI_CHROME_HEADER,
      `DARK MODE TWIN FOR ${siteName.toUpperCase()} (${familyId} · ${spec.title}):`,
      `Transform the attached Light Mode website screenshot (${spec.id}.jpg) into its exact 1-to-1 Dark Mode twin.`,
      `Keep the EXACT same brand header, navigation, page layout, form controls, text copy, numbers, photography, and interaction state as the attached Light Mode step.`,
      `Translate the light background and card surfaces into a cohesive, high-contrast dark mode palette: deep slate/obsidian page background (#0b0f19 / #0f172a), elevated dark card and panel surfaces (#111827 / #1e293b), crisp subtle structural borders (#334155), crisp off-white primary text (#f8fafc), muted slate secondary text (#94a3b8), and preserve the family's signature chromatic accent colour (${Object.entries(tokens).map(([k, v]) => `${v} (${k})`).join(', ')}) adjusted for ≥ 4.5:1 dark-surface contrast.`,
      `If a second reference image is attached (step1-overview dark mode), match its exact dark surface tones, header styling, and border contrast so all 4 Dark Mode steps form a single unified dark theme.`,
    ].join('\n\n');

    return {
      id: spec.id,
      number: spec.number,
      shortTitle: spec.shortTitle,
      title: spec.title,
      lightPath: familyStepLightPath(familyId, spec.id),
      darkPath: familyStepDarkPath(familyId, spec.id),
      state: stateMap[spec.id],
      lightPrompt,
      darkPrompt,
    };
  });
}

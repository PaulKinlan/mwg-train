/**
 * The training-side design contract: one plan.md and one design.md per training family, under
 * docs/train/design/<family>/.
 *
 * The split mirrors the evaluation side (src/design/contract.mjs), but the sources of truth differ:
 *   - a training plan.md is bound to the family's canonical brief row in docs/train/briefs/manifest.jsonl
 *     (the `-v1` row, which carries the structured contract both wording variants share);
 *   - a training design.md is bound to the family's authored target board,
 *     docs/train/targets/<family>/index.html, whose inline stylesheet is the only per-family aesthetic
 *     artefact - the scaffolded projects share one common stylesheet, so checking tokens against it would
 *     check the same file thirty times.
 *
 * Neither document is trusted: every check below compares the prose against the brief row or the target
 * stylesheet, so a document that drifts from either is a finding rather than a difference of opinion.
 */

import {
  DESIGN_SECTIONS,
  PLAN_SECTIONS,
  checkLinks,
  checkSections,
  contains,
  frontmatterOf,
  repositoryLinkResolver,
  sectionBody,
  squash,
} from '../design/contract.mjs';
import { parseFrontmatter } from '../design/yaml.mjs';

export const TRAIN_DESIGN_DIR = 'docs/train/design';
export const TRAIN_BRIEFS_MANIFEST = 'docs/train/briefs/manifest.jsonl';
export const TRAIN_TARGETS_DIR = 'docs/train/targets';

// Same section contracts as the evaluation side, re-exported under training names so a reader of the
// checker does not have to know where the list lives.
export const TRAIN_PLAN_SECTIONS = PLAN_SECTIONS;
export const TRAIN_DESIGN_SECTIONS = DESIGN_SECTIONS;

export { repositoryLinkResolver };

/**
 * The canonical row for a family: the `-v1` brief, which carries the structured contract. The `-v2`
 * wording variant differs only in prompt, brief_id and variant_of (SCHEMA.md invariant 2), so checking
 * the canonical row checks both.
 */
export function canonicalBrief(rows, family) {
  return rows.find((row) => row.family_id === family && row.variant_of === null) ?? null;
}

/** The inline stylesheet of an authored target board. A target is exactly one <style> block. */
export function targetStylesheet(html) {
  const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
  return blocks.length === 1 ? blocks[0] : null;
}

/** The custom properties a target's :root block declares, as an ordered name → value map. */
export function targetTokens(css) {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) return null;
  const tokens = new Map();
  for (const match of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** The <title> text of a target board, with the two entities the boards use decoded. */
export function targetTitle(html) {
  const raw = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? null;
  return raw === null ? null : raw.replace(/&amp;/g, '&').replace(/&#39;/g, "'");
}

/**
 * Every path a plan.md may claim, taken from the brief itself: the declared routes, the journey's
 * startPath, the search path, the pre-form step paths, and any path mentioned in the assertions,
 * seeded defects or server-persistence lines. A path outside this set is a claim the brief never made.
 */
export function allowedPaths(brief) {
  const paths = new Set(brief.routes ?? []);
  const journey = brief.journey ?? {};
  if (journey.startPath) paths.add(journey.startPath);
  if (journey.search?.path) paths.add(journey.search.path);
  for (const step of journey.steps ?? []) {
    if (step.path) paths.add(step.path);
  }
  const prose = [
    ...(brief.assertions ?? []),
    ...(brief.seeded_defects ?? []),
    ...(brief.server_persistence ?? []),
    ...(brief.journeys ?? []),
  ].join('\n');
  for (const match of prose.matchAll(/\/(?:[\w][\w/:.-]*[\w/-])?/g)) {
    paths.add(match[0]);
  }
  return paths;
}

const METHOD_PATH = /(?<![a-z])(GET|POST|PUT|PATCH|DELETE)\s+(\/(?:[a-zA-Z0-9_/:.-]*[a-zA-Z0-9/])?)/gi;
const BACKTICK_PATH = /`(\/[A-Za-z0-9_/:.-]+)`/g;

/**
 * The functional half. Every claim is compared against the family's canonical brief row, so a plan.md
 * cannot describe routes, fields, a journey or acceptance criteria the brief does not declare - and
 * cannot quietly omit one either.
 *
 * @param {{ name: string, text: string, brief: object, resolveLink?: (target: string) => boolean }} input
 * @returns {Array<{ at: string, problem: string }>}
 */
export function checkTrainPlanDocument({ name, text, brief, resolveLink = null }) {
  const findings = [];
  const at = (where, problem) => findings.push({ at: where, problem });
  const { body } = parseFrontmatter(text);
  const frontmatter = frontmatterOf(name, text, at);
  if (frontmatter === null) return findings;

  // The binding is declared, not implied: a plan.md says which brief row it was written against.
  if (frontmatter.family !== brief.family_id) {
    at('frontmatter', `family is '${frontmatter.family}', expected '${brief.family_id}'`);
  }
  if (frontmatter.brief !== TRAIN_BRIEFS_MANIFEST) {
    at('frontmatter', `brief is '${frontmatter.brief}', expected '${TRAIN_BRIEFS_MANIFEST}'`);
  }
  if (frontmatter.brief_id !== `${brief.family_id}-v1`) {
    at('frontmatter', `brief_id is '${frontmatter.brief_id}', expected '${brief.family_id}-v1'`);
  }

  checkSections(body, TRAIN_PLAN_SECTIONS, at);

  // Use case: the topic, the archetype and every field the form carries.
  const useCase = sectionBody(body, 'Use case') ?? '';
  if (!contains(useCase, brief.topic)) {
    at('Use case', `does not name the brief's topic '${brief.topic}'`);
  }
  if (!contains(useCase, brief.archetype)) {
    at('Use case', `does not name the brief's archetype '${brief.archetype}'`);
  }
  for (const field of brief.fields ?? []) {
    if (field.slug && !contains(useCase, field.slug)) {
      at('Use case', `does not name the brief's field '${field.slug}'`);
    }
  }

  // Routes, in both directions: every declared route named, and no route the brief does not know about
  // claimed anywhere in the document.
  const routes = sectionBody(body, 'Routes and effects') ?? '';
  for (const route of brief.routes ?? []) {
    if (!contains(routes, route)) at('Routes and effects', `does not name the brief's route '${route}'`);
  }
  const allowed = allowedPaths(brief);
  const claimedRoutes = new Set([...body.matchAll(METHOD_PATH)].map((match) => match[2]));
  const claimedPaths = new Set([...body.matchAll(BACKTICK_PATH)].map((match) => match[1]));
  for (const path of [...claimedRoutes, ...claimedPaths]) {
    if (!allowed.has(path)) at('routes', `claims '${path}' which the brief does not declare`);
  }

  // Data and state: the persistence contract, quoted so it cannot drift, plus the fixed family axes.
  const state = sectionBody(body, 'Data and state') ?? '';
  for (const line of brief.server_persistence ?? []) {
    if (!contains(state, line)) at('Data and state', `does not state the brief's persistence line: "${line}"`);
  }
  if (!contains(state, brief.framework)) {
    at('Data and state', `does not name the family's framework '${brief.framework}'`);
  }
  if (!contains(state, brief.locale)) {
    at('Data and state', `does not name the family's locale '${brief.locale}'`);
  }

  // Journey: the flow the harness drives, with the selectors and asserted text it uses.
  const journeySection = sectionBody(body, 'Journey') ?? '';
  const journey = brief.journey ?? {};
  for (const [label, needle] of [
    ['startPath', journey.startPath],
    ['formSelector', journey.formSelector],
    ['expectText', journey.expectText],
  ]) {
    if (needle && !contains(journeySection, needle)) {
      at('Journey', `does not name the brief's ${label} '${needle}'`);
    }
  }
  for (const selector of Object.keys(journey.fill ?? {})) {
    if (!contains(journeySection, selector)) at('Journey', `does not name the filled field '${selector}'`);
  }
  for (const [selector, option] of Object.entries(journey.select ?? {})) {
    if (!contains(journeySection, selector)) at('Journey', `does not name the chosen select '${selector}'`);
    if (!contains(journeySection, option)) at('Journey', `does not name the chosen option '${option}'`);
  }
  if (journey.search) {
    for (const [label, needle] of [
      ['search path', journey.search.path],
      ['search queryParam', journey.search.queryParam],
      ['search query', journey.search.query],
      ['search resultsSelector', journey.search.resultsSelector],
    ]) {
      if (needle && !contains(journeySection, needle)) at('Journey', `does not name the ${label} '${needle}'`);
    }
  }
  if (journey.update) {
    if (!contains(journeySection, journey.update.field)) {
      at('Journey', `does not name the update field '${journey.update.field}'`);
    }
    if (!contains(journeySection, journey.update.newValue)) {
      at('Journey', `does not name the update value '${journey.update.newValue}'`);
    }
  }
  for (const step of journey.steps ?? []) {
    if (step.path && !contains(journeySection, step.path)) {
      at('Journey', `does not name the pre-form step '${step.path}'`);
    }
  }

  // Validation: the required controls and the required rules, both named so neither can quietly shrink.
  const validation = sectionBody(body, 'Validation and states') ?? '';
  for (const field of (brief.fields ?? []).filter((item) => item.required)) {
    if (!contains(validation, field.name)) at('Validation and states', `does not name required field '${field.name}'`);
  }
  for (const rule of brief.required_rules ?? []) {
    if (!contains(validation, rule)) at('Validation and states', `does not name required rule '${rule}'`);
  }

  // Acceptance criteria, verbatim: these are the functional oracle, so paraphrase is drift.
  const acceptance = sectionBody(body, 'Acceptance criteria') ?? '';
  for (const assertion of brief.assertions ?? []) {
    if (!contains(acceptance, assertion)) {
      at('Acceptance criteria', `does not state this assertion verbatim: "${assertion}"`);
    }
  }

  // Implementation status: the task, and for a repair family the seeded defects, verbatim.
  const status = sectionBody(body, 'Implementation status') ?? '';
  if (!contains(status, brief.task)) at('Implementation status', `does not name the family's task '${brief.task}'`);
  for (const defect of brief.seeded_defects ?? []) {
    if (!contains(status, defect)) {
      at('Implementation status', `does not state this seeded defect verbatim: "${defect}"`);
    }
  }

  if (name !== `${brief.family_id}/plan.md`) {
    at('path', `must live at ${brief.family_id}/plan.md`);
  }

  checkLinks(text, name, resolveLink, at);
  return findings;
}

/**
 * The aesthetic half. The frontmatter is the single source of truth for the family's palette, so every
 * token it declares must be a declaration the target board's stylesheet actually makes, and the body
 * must not carry a second copy of a token's value.
 *
 * @param {{ name: string, text: string, family: string, target: { path: string, css: string, formId?: string }, resolveLink?: (target: string) => boolean }} input
 * @returns {Array<{ at: string, problem: string }>}
 */
export function checkTrainDesignDocument({ name, text, family, target, resolveLink = null }) {
  const findings = [];
  const at = (where, problem) => findings.push({ at: where, problem });
  const { body } = parseFrontmatter(text);

  // The title names the family in backticks, so a contract cannot silently describe the wrong board.
  const title = body.split('\n').find((line) => line.startsWith('# ')) ?? '';
  const declared = title.match(/`([A-Za-z0-9_-]+)`/)?.[1] ?? null;
  if (declared === null) at('title', 'must name the documented family in backticks');
  else if (declared !== family) at('title', `documents family '${declared}' but lives under '${family}'`);

  const frontmatter = frontmatterOf(name, text, at);
  if (frontmatter === null) return findings;
  if (frontmatter.family !== family) {
    at('frontmatter', `family is '${frontmatter.family}', expected '${family}'`);
  }
  if (frontmatter.target !== target.path) {
    at('frontmatter', `target is '${frontmatter.target}', expected '${target.path}'`);
  }

  // Tokens: each must be a custom property the target stylesheet emits, with that exact value.
  const tokens = frontmatter.tokens;
  if (tokens === null || typeof tokens !== 'object' || Array.isArray(tokens)) {
    at('tokens', 'frontmatter needs a `tokens` mapping');
  } else if (Object.keys(tokens).length === 0) {
    at('tokens', 'frontmatter `tokens` is empty');
  } else {
    for (const [token, value] of Object.entries(tokens)) {
      if (!/^--[A-Za-z0-9-]+$/.test(token)) {
        at('tokens', `'${token}' is not a custom property name`);
        continue;
      }
      const declaration = new RegExp(`${token}\\s*:\\s*${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[;}]`);
      if (!declaration.test(target.css)) {
        at('tokens', `'${token}: ${value}' is not a declaration the target stylesheet makes`);
      }
    }
  }

  // Literals: values the stylesheet uses that are not custom properties. They must still be real.
  const literals = frontmatter.literals;
  if (literals !== null && !(typeof literals === 'object' && !Array.isArray(literals))) {
    at('literals', 'frontmatter `literals` must be a mapping');
  } else if (literals) {
    for (const [key, value] of Object.entries(literals)) {
      for (const part of String(value).split(/\s+/)) {
        if (!target.css.includes(part)) {
          at('literals', `'${key}: ${value}' names '${part}', which the target stylesheet does not contain`);
        }
      }
    }
  }

  const antiPatterns = frontmatter.antiPatterns;
  if (!Array.isArray(antiPatterns) || antiPatterns.length === 0) {
    at('antiPatterns', 'frontmatter `antiPatterns` must be a non-empty list');
  }

  checkSections(body, TRAIN_DESIGN_SECTIONS, at);

  // The body cites tokens by name and never restates their values: the second copy is where a document
  // and its stylesheet drift apart.
  if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
    const usage = sectionBody(body, 'Token usage') ?? '';
    for (const [token, value] of Object.entries(tokens)) {
      const text2 = String(value);
      if (!contains(usage, token)) at('Token usage', `does not name the declared token '${token}'`);
      if (text2.length < 3 || /^-?[\d.]+$/.test(text2)) continue;
      if (body.toLowerCase().includes(text2.toLowerCase())) {
        at('Token usage', `restates the frontmatter value '${text2}' for '${token}'; cite the token, not its value, and note this comparison ignores case`);
      }
    }
  }

  // Route claims belong to plan.md, where they are checked against the brief.
  for (const match of body.matchAll(METHOD_PATH)) {
    at('Grammar and layout', `'${match[1].toUpperCase()} ${match[2]}' is a functional claim; routes belong in plan.md`);
  }

  // The form the board shows is the brief's form; naming it keeps the component map anchored.
  if (target.formId) {
    const hierarchy = sectionBody(body, 'Component hierarchy') ?? '';
    if (!contains(hierarchy, target.formId)) {
      at('Component hierarchy', `does not name the board's form '${target.formId}'`);
    }
  }

  if (name !== `${family}/design.md`) {
    at('path', `must live at ${family}/design.md`);
  }

  checkLinks(text, name, resolveLink, at);
  return findings;
}

/** Squash re-exported for the generator, which writes prose the checker reads back whitespace-folded. */
export { contains, squash };

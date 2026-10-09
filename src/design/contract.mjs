/**
 * The design contract, split the way the artefacts are: a design.md states the AESTHETIC system for one
 * generated demo, and a plan.md states the FUNCTIONAL specification for one archetype.
 *
 * The two halves are separated because they have different sources of truth. A design document's tokens are
 * checked against the stylesheet the generator actually writes for that demo. A plan document's routes, state,
 * journey, validation and acceptance criteria are checked against the durable spec for that archetype,
 * `docs/eval/specs/<archetype>.json`, which `scripts/rebuild-from-spec.mjs` already rebuilds byte-for-byte.
 * Neither document is trusted: both are compared against the artefact that generates the demo, because a
 * document that merely disagrees with the code is a build failure rather than a difference of opinion.
 *
 * The verdicts live in pure functions, so they can be tested without generating a project. The caller supplies
 * what the generator produced, or what the spec says. The one exception is the link resolver below, which is
 * exported separately and tested against real symlinks.
 */

import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { parseFrontmatter } from './yaml.mjs';

export const DESIGN_DIR = 'docs/eval/design';

/**
 * Builds the resolver a document's relative links are checked against: the target is resolved from the
 * document's own directory and must land inside the repository.
 *
 * Both sides are canonicalised. A path can be inside the repository as a string and still be a symlink whose
 * bytes live outside it, and git commits symlinks, so a lexical check alone would report success for a link no
 * reader can follow without leaving the repository. Canonicalising the root matters for the same reason: a
 * checkout reached through a symlink would otherwise make containment a fact about a path string rather than
 * about where the bytes are. realpathSync also rejects a missing file and a dangling symlink, and `relative` is
 * used rather than a string prefix test, because a sibling directory whose name shares a prefix with the root is
 * not containment.
 */
export function repositoryLinkResolver({ root, documentDir }) {
  const realRoot = realpathSync(root);
  return (target) => {
    let real;
    try {
      real = realpathSync(resolve(documentDir, target.split('#')[0]));
    } catch {
      return false;
    }
    const inside = relative(realRoot, real);
    return inside !== '' && inside !== '..' && !inside.startsWith('../') && !isAbsolute(inside);
  };
}

// Aesthetic sections for a per-demo design.md, in order. The functional sections this list used to carry -
// States, Implementation status, and the route map that lived inside Grammar and layout - are now in plan.md,
// because the spec is their source of truth rather than the generated demo.
export const DESIGN_SECTIONS = [
  'Visual thesis',
  'Grammar and layout',
  'Typography',
  'Token usage',
  'Spacing rhythm',
  'Component hierarchy',
  'Anti-patterns',
  'Rationale',
  'Provenance',
];

// Functional sections for a per-archetype plan.md, in order. Every one of these is checked against the spec.
export const PLAN_SECTIONS = [
  'Use case',
  'Routes and effects',
  'Data and state',
  'Journey',
  'Validation and states',
  'Acceptance criteria',
  'Implementation status',
  'Provenance',
];

const squash = (text) => text.replace(/\s+/g, ' ').trim();
const contains = (body, needle) => {
  const text = squash(String(needle));
  const haystack = squash(body);
  if (!text.startsWith('/')) return haystack.includes(text);
  // A path must not be satisfied by being the prefix of a longer path: the spec's write route "/book" is not
  // evidenced by the read route "/booking/:ref", and substring matching cannot tell the two apart. A short path
  // such as "/" needs the same treatment, or every document would satisfy it incidentally.
  const pattern = new RegExp(`${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:/-])`);
  return pattern.test(haystack);
};

function sectionBody(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const rest = text.slice(start + heading.length + 3);
  const next = rest.indexOf('\n## ');
  return next === -1 ? rest : rest.slice(0, next);
}

function checkSections(text, required, at) {
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  for (const heading of required) {
    if (!headings.includes(heading)) at('sections', `missing required section '## ${heading}'`);
    const body = sectionBody(text, heading);
    if (body !== null && body.trim() === '') at('sections', `section '## ${heading}' is empty`);
  }
  const strays = headings.filter((heading) => !required.includes(heading));
  if (strays.length > 0) at('sections', `sections outside the contract: ${strays.join(', ')}`);
  const present = headings.filter((heading) => required.includes(heading));
  if (JSON.stringify(present) !== JSON.stringify(required)) {
    at('sections', `sections must appear in contract order: ${required.join(' > ')}`);
  }
}

function checkLinks(text, name, resolveLink, at) {
  // Documents rot: a relative link that resolves nowhere is a finding wherever the caller can resolve it. This
  // rule exists because every relative link in the first seven contracts pointed one directory too shallow -
  // correct in the README they were copied from, dead in each per-demo file - and nothing in the build noticed.
  if (!resolveLink) return;
  const targets = [...new Set([...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:|#)/.test(target)))];
  for (const target of targets) {
    if (!resolveLink(target)) at('links', `${name} links '${target}' which does not resolve from this document`);
  }
}

function frontmatterOf(name, text, at) {
  const { frontmatter, problems } = parseFrontmatter(text);
  for (const problem of problems) at('frontmatter', `${name}: ${problem}`);
  return frontmatter;
}

/**
 * The aesthetic half. The frontmatter is the single source of truth for tokens, so the body must not restate
 * their values, and every value it declares must be one the demo's stylesheet actually carries.
 *
 * @param {{ name: string, text: string, demo: { framework: string, archetype: string, files: string[], stylesheet: string }, resolveLink?: (target: string) => boolean }} input
 * @returns {Array<{ at: string, problem: string }>}
 */
export function checkDesignDocument({ name, text, demo, resolveLink = null }) {
  const findings = [];
  const at = (where, problem) => findings.push({ at: where, problem });
  const { body } = parseFrontmatter(text);

  // The title heading, not the first line: a document now begins with its frontmatter fence, so reading line one
  // would mean every contract failed a rule about naming its framework.
  const title = body.split('\n').find((line) => line.startsWith('# ')) ?? '';
  const declared = title.match(/`([A-Za-z0-9_-]+)`/)?.[1] ?? null;
  if (declared === null) at('title', 'must name the documented framework in backticks');
  else if (declared !== demo.framework) {
    at('title', `documents framework '${declared}' but the demo generates '${demo.framework}'`);
  }

  const frontmatter = frontmatterOf(name, text, at);
  if (frontmatter === null) {
    // Without frontmatter there are no tokens, so the remaining rules have nothing to check against.
    return findings;
  }
  if (frontmatter.archetype !== demo.archetype) {
    at('frontmatter', `archetype is '${frontmatter.archetype}', expected '${demo.archetype}'`);
  }
  if (frontmatter.framework !== demo.framework) {
    at('frontmatter', `framework is '${frontmatter.framework}', expected '${demo.framework}'`);
  }

  // Tokens: each must be a custom property this demo's stylesheet emits, and must carry that declaration's exact
  // value. Recording a value the stylesheet does not have is the failure this rule exists to catch.
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
      if (!declaration.test(demo.stylesheet)) {
        at('tokens', `'${token}: ${value}' is not a declaration this demo's stylesheet makes`);
      }
    }
  }

  // Literals: values the stylesheet uses that are not custom properties, so they cannot be themed per demo.
  // They must still be real, and they must appear in the stylesheet rather than being remembered.
  const literals = frontmatter.literals;
  if (literals !== null && !(typeof literals === 'object' && !Array.isArray(literals))) {
    at('literals', 'frontmatter `literals` must be a mapping');
  } else if (literals) {
    for (const [key, value] of Object.entries(literals)) {
      for (const part of String(value).split(/\s+/)) {
        if (!demo.stylesheet.includes(part)) {
          at('literals', `'${key}: ${value}' names '${part}', which this stylesheet does not contain`);
        }
      }
    }
  }

  checkSections(body, DESIGN_SECTIONS, at);

  // The frontmatter is the single source of truth, so the body must not carry a second copy of a token's VALUE.
  // Naming a token is expected - the body explains what it is for - but repeating the colour or size it holds is
  // exactly the duplication that lets a document and its stylesheet drift apart. Only frontmatter tokens are
  // covered: literals are facts about the stylesheet that the prose legitimately explains, and the rule above is
  // what keeps them true.
  if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
    for (const [token, value] of Object.entries(tokens)) {
      const text = String(value);
      // A bare number is too common to be evidence of restatement on its own.
      if (text.length < 3 || /^-?[\d.]+$/.test(text)) continue;
      if (body.toLowerCase().includes(text.toLowerCase())) {
        at('Token usage', `restates the frontmatter value '${text}' for '${token}'; cite the token, not its value, and note this comparison ignores case`);
      }
    }
  }

  // Route claims belong to plan.md, where they can be checked against the spec. Here they would be a claim about
  // the demo's behaviour with no source of truth behind it.
  const routeClaims = [...body.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^\s`]*)`/g)].map((match) => `${match[1]} ${match[2]}`);
  for (const route of routeClaims) {
    at('Grammar and layout', `'${route}' is a functional claim; routes belong in plan.md`);
  }

  const antiPatterns = frontmatter.antiPatterns;
  if (!Array.isArray(antiPatterns) || antiPatterns.length === 0) {
    at('antiPatterns', 'frontmatter `antiPatterns` must be a non-empty list');
  }

  // Generated files: a project file the document names must exist in the generated tree.
  const files = new Set(demo.files);
  const claimedFiles = new Set([...text.matchAll(/`((?:app\/[\w.-]+)|(?:server\.mjs)|(?:spec\.json)|(?:package\.json))`/g)]
    .map((match) => match[1]));
  for (const file of claimedFiles) {
    if (!files.has(file)) at('files', `names '${file}' which this demo does not generate`);
  }

  if (name !== `${demo.archetype}/${demo.framework}.md`) {
    at('path', `must live at ${demo.archetype}/${demo.framework}.md`);
  }

  checkLinks(text, name, resolveLink, at);
  return findings;
}

/**
 * The functional half. Every claim this checks is compared against the archetype's durable spec, so a plan.md
 * cannot describe routes, a journey or acceptance criteria the project does not have - and cannot quietly omit
 * one either, since the route check runs in both directions.
 *
 * @param {{ name: string, text: string, spec: object, specPath: string, resolveLink?: (target: string) => boolean }} input
 * @returns {Array<{ at: string, problem: string }>}
 */
export function checkPlanDocument({ name, text, spec, specPath, resolveLink = null }) {
  const findings = [];
  const at = (where, problem) => findings.push({ at: where, problem });
  const { body } = parseFrontmatter(text);
  const frontmatter = frontmatterOf(name, text, at);
  if (frontmatter === null) return findings;

  // The binding is declared, not implied: a plan.md says which spec it was written against, so a reader can see
  // whether the document and the spec are the same vintage.
  if (frontmatter.archetype !== spec.family_id) {
    at('frontmatter', `archetype is '${frontmatter.archetype}', expected '${spec.family_id}'`);
  }
  if (frontmatter.spec !== specPath) {
    at('frontmatter', `spec is '${frontmatter.spec}', expected '${specPath}'`);
  }

  checkSections(body, PLAN_SECTIONS, at);

  // Routes, in both directions: every route the spec defines must be named with its effect, and no route the
  // spec does not define may be claimed.
  const routes = sectionBody(body, 'Routes and effects') ?? '';
  const claimed = new Set([...routes.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^\s`]*)`/g)].map((match) => `${match[1]} ${match[2]}`));
  for (const route of spec.routes) {
    const key = `${route.method} ${route.path}`;
    if (!claimed.has(key)) at('Routes and effects', `does not name '${key}' from ${specPath}`);
    if (route.effect && !contains(routes, route.effect)) {
      at('Routes and effects', `does not state the spec's effect for '${key}': "${route.effect}"`);
    }
  }
  // A route the spec does not define is a finding WHEREVER it is claimed, not only in this section: a claim
  // is a claim in a prose paragraph too, and a section-scoped scan let one through. The requirement that each
  // spec route be named with its effect stays scoped to this section, because that is where it belongs.
  const defined = new Set(spec.routes.map((route) => `${route.method} ${route.path}`));
  for (const route of new Set([...body.matchAll(/(?<![a-z])(GET|POST|PUT|PATCH|DELETE)\s+(\/(?:[a-zA-Z0-9_/:.-]*[a-zA-Z0-9/])?)/gi)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`))) {
    if (!defined.has(route)) {
      at('routes', `claims '${route}' which ${specPath} does not define`);
    }
  }

  // Data and state: the storage engine and both routes that touch it.
  const state = sectionBody(body, 'Data and state') ?? '';
  if (spec.state?.engine && !contains(state, spec.state.engine)) {
    at('Data and state', `does not name the spec's storage engine '${spec.state.engine}'`);
  }
  for (const key of ['write_route', 'read_route']) {
    if (spec.persistence?.[key] && !contains(state, spec.persistence[key])) {
      at('Data and state', `does not name the spec's ${key} '${spec.persistence[key]}'`);
    }
  }

  // Journey: the flow a browser actually drives, including the text the harness asserts on.
  const journey = sectionBody(body, 'Journey') ?? '';
  if (spec.journey?.startPath && !contains(journey, spec.journey.startPath)) {
    at('Journey', `does not name the spec's startPath '${spec.journey.startPath}'`);
  }
  if (spec.journey?.formSelector && !contains(journey, spec.journey.formSelector)) {
    at('Journey', `does not name the spec's formSelector '${spec.journey.formSelector}'`);
  }
  for (const selector of Object.keys(spec.journey?.fill ?? {})) {
    if (!contains(journey, selector)) at('Journey', `does not name the spec's filled field '${selector}'`);
  }
  if (spec.journey?.expectText && !contains(journey, spec.journey.expectText)) {
    at('Journey', `does not name the text the harness asserts on, '${spec.journey.expectText}'`);
  }

  // Validation and the states a user sees: required fields, and what happens on each outcome.
  const validation = sectionBody(body, 'Validation and states') ?? '';
  const required = spec.validation?.required_fields ?? [];
  for (const field of required) {
    if (!contains(validation, field)) at('Validation and states', `does not name required field '${field}'`);
  }
  for (const key of ['on_missing', 'on_success']) {
    if (spec.validation?.[key] && !contains(validation, spec.validation[key])) {
      at('Validation and states', `does not state the spec's ${key}: "${spec.validation[key]}"`);
    }
  }

  // Acceptance criteria, verbatim. These are the claims the eval asserts, so paraphrasing them is exactly the
  // drift this binding exists to prevent.
  const acceptance = sectionBody(body, 'Acceptance criteria') ?? '';
  for (const criterion of spec.acceptance ?? []) {
    if (!contains(acceptance, criterion)) {
      at('Acceptance criteria', `does not state this criterion verbatim: "${criterion}"`);
    }
  }

  if (spec.fields) {
    const useCase = sectionBody(body, 'Use case') ?? '';
    for (const field of spec.fields) {
      if (field.slug && !contains(useCase, field.slug)) {
        at('Use case', `does not name the spec's field '${field.slug}'`);
      }
    }
  }

  if (name !== `${spec.family_id}/plan.md`) {
    at('path', `must live at ${spec.family_id}/plan.md`);
  }

  checkLinks(text, name, resolveLink, at);
  return findings;
}

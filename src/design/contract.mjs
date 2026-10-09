/**
 * The per-demo design contract: what a design.md must state, and what makes a statement a finding
 * rather than a style disagreement.
 *
 * The verdict lives in a pure function so it can be tested without generating a project. The caller
 * supplies what the generator actually produced - the file set, the stylesheet text and the demo's own
 * routes - and gets findings back. Nothing here reads the filesystem.
 */

export const DESIGN_DIR = 'docs/eval/design';

// Closed section list, in order. A contract that omits "Implementation status" is exactly the document
// that claims states it does not implement, so the section is required rather than encouraged.
export const REQUIRED_SECTIONS = [
  'Visual thesis',
  'Grammar and layout',
  'Typography',
  'Token vocabulary',
  'Spacing rhythm',
  'Component hierarchy',
  'States',
  'Implementation status',
  'Rationale',
  'Provenance',
];

const sectionBody = (text, heading) => {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const rest = text.slice(start + heading.length + 3);
  const next = rest.indexOf('\n## ');
  return next === -1 ? rest : rest.slice(0, next);
};

/**
 * @param {{ name: string, text: string, demo: { framework: string, archetype: string, files: string[], stylesheet: string, routes: Array<{method: string, path: string}> }, resolveLink?: (target: string) => boolean }} input
 * @returns {Array<{ at: string, problem: string }>}
 */
export function checkDesignDocument({ name, text, demo, resolveLink = null }) {
  const findings = [];
  const at = (where, problem) => findings.push({ at: where, problem });

  // The file must announce the framework it documents, and it must be the framework of its own demo.
  const title = text.split('\n', 1)[0] ?? '';
  const declared = title.match(/`([A-Za-z0-9_-]+)`/)?.[1] ?? null;
  if (declared === null) at('title', 'must name the documented framework in backticks');
  else if (declared !== demo.framework) {
    at('title', `documents framework '${declared}' but the demo generates '${demo.framework}'`);
  }

  // Sections: present, in the closed order, and no strays.
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  for (const required of REQUIRED_SECTIONS) {
    if (!headings.includes(required)) at('sections', `missing required section '## ${required}'`);
  }
  const strays = headings.filter((heading) => !REQUIRED_SECTIONS.includes(heading));
  if (strays.length > 0) at('sections', `sections outside the contract: ${strays.join(', ')}`);
  if (JSON.stringify(headings.filter((h) => REQUIRED_SECTIONS.includes(h))) !== JSON.stringify(REQUIRED_SECTIONS)) {
    at('sections', `sections must appear in contract order: ${REQUIRED_SECTIONS.join(' > ')}`);
  }

  // Token vocabulary: every custom property named must be one the demo's stylesheet actually defines.
  const vocabulary = sectionBody(text, 'Token vocabulary');
  if (vocabulary === null) at('Token vocabulary', 'section is empty or missing');
  else {
    const emitted = new Set([...demo.stylesheet.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((match) => match[1]));
    const claimed = new Set([...vocabulary.matchAll(/`(--[A-Za-z0-9-]+)`/g)].map((match) => match[1]));
    for (const token of claimed) {
      if (!emitted.has(token)) {
        at('Token vocabulary', `'${token}' is not emitted by this demo's ${demo.framework} stylesheet`);
      }
    }
    if (claimed.size === 0) at('Token vocabulary', 'must name at least one custom property the demo emits');
  }

  // Routes: a route the layout section names must be one of the demo's own routes.
  const layout = sectionBody(text, 'Grammar and layout') ?? '';
  const served = new Set(demo.routes.map((route) => `${route.method} ${route.path}`));
  const claimedRoutes = [...layout.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^\s`]*)`/g)]
    .map((match) => `${match[1]} ${match[2]}`);
  if (claimedRoutes.length === 0) at('Grammar and layout', 'must name the demo routes it describes');
  for (const route of claimedRoutes) {
    if (!served.has(route)) at('Grammar and layout', `claims route '${route}' which this demo does not serve`);
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

  // Documents rot: a relative link that resolves nowhere is a finding wherever the caller can resolve
  // it. This rule exists because every relative link in the first seven contracts pointed one directory
  // too shallow - correct in the README they were copied from, dead in each per-demo file - and nothing
  // in the build noticed.
  if (resolveLink) {
    const targets = [...new Set([...text.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((match) => match[1])
      .filter((target) => !/^(https?:|mailto:|#)/.test(target)))];
    for (const target of targets) {
      if (!resolveLink(target)) at('links', `'${target}' does not resolve from this document`);
    }
  }

  return findings;
}

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

function siteProse(text) {
  // A site-generation prompt is not a copy of the conformance fixture's rendering instructions.
  // Keep the authored substance while removing Markdown markup and board-only viewport instructions.
  let referenceBullet = false;
  return text?.split(/\n{2,}/)
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
}

function group(name, content) {
  return content ? `${name}:\n${siteProse(content)}` : `${name}: Not yet documented in this checkout.`;
}

function declaredTokens(design) {
  const block = design?.match(/^tokens:\n((?:  [^\n]+\n)+)/m)?.[1];
  return block ? `Palette values from the authored design:\n${block.trim()}` : null;
}

/** The authored archetype plan/design are the source; this is a readable prompt assembled from them, not model output. */
export function archetypeBrief(repoRoot, id, trainingImagePrompt = null) {
  if (!ID.test(id)) return null;
  const directory = 'docs/design/archetypes';
  const plan = authoredText(repoRoot, directory, id, 'plan.md');
  const design = authoredText(repoRoot, directory, id, 'design.md');
  if (!plan || !design) return null;
  const readme = authoredText(repoRoot, directory, id, 'README.md');
  return {
    id,
    sitePrompt: [
      `Build a complete, interactive ${id.replaceAll('-', ' ')} website. This is a site implementation brief, not an image-generation or model-performance result.`,
      group('Use case', section(plan, 'Use case')),
      group('UI composition', section(design, 'Visual thesis')),
      group('Layout and components', [section(design, 'Grammar and layout'), section(design, 'Component hierarchy')].filter(Boolean).join('\n\n')),
      group('Visual tokens', section(design, 'Token usage')),
      group('Step-by-step behaviour', section(plan, 'Journey')),
      group('Validation and persisted states', section(plan, 'Validation and states')),
      group('Acceptance contract', section(plan, 'Acceptance criteria')),
    ].join('\n\n'),
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
  // The training design describes a static DOM conformance fixture. For a functional site, use the
  // archetype's multi-screen design as the layout/component source, but keep this family's exact palette.
  const siteDesign = authoredText(repoRoot, 'docs/design/archetypes', row.archetype, 'design.md') ?? design;
  const imagePrompt = authoredText(repoRoot, 'docs/design/training', id, 'prompt.txt');
  const assertions = Array.isArray(row.assertions) ? row.assertions.filter((assertion) => typeof assertion === 'string') : [];
  return {
    sitePrompt: [
      `Build a functional ${row.archetype.replaceAll('-', ' ')} website for this scenario. The image prompt below is an illustration brief; it is not a substitute for implementing the behaviour.`,
      group('Use case', row.prompt),
      group('UI layout', section(siteDesign, 'Grammar and layout')),
      group('Visual thesis and tokens', [section(siteDesign, 'Visual thesis'), declaredTokens(design), section(siteDesign, 'Token usage')].filter(Boolean).join('\n\n')),
      group('Expected components', section(siteDesign, 'Component hierarchy')),
      group('Step-by-step interactions', section(plan, 'Journey')),
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

#!/usr/bin/env node
/**
 * Generate the 30 training-family visual reference boards with an explicitly named, gateway-attested model.
 *
 * WHY THESE EXIST. Paul rejected the flat CSS target renders on sight (fleet-5z11) and asked for pictures of what a
 * finished, production-quality version of each training family's site should look like - photographic assets, real
 * density, editorial polish - to serve as the visual reference for the family (bead mwg-train-sfm, and the hub's own
 * record that "reference boards for only 3 of 30" were produced before image quota ran out).
 *
 * WHERE THEY LIVE, AND WHY NOT IN `data/`. These boards land in `docs/design/training/<family>/reference.jpg`. They are
 * NOT the A1 conformance instrument: `data/A1_self_generated/targets/<family>/target.png` stays the render of the
 * authored board whose DOM signature `src/eval/conformance.mjs` scores against, and this script refuses to write
 * anywhere outside `docs/` so a teacher-model image can never be laundered into the A1 arm. `src/provenance/record.mjs`
 * states the same rule from the other side: bytes a hosted model touched belong in `A3_teacher_generated`, and an A1
 * target is a project-owned CC0 instrument, not model output.
 *
 * WHAT MAKES A BOARD ACCEPTABLE. Two things, and the script fails closed on both:
 *   1. The gateway must attest the model. We request `gemini-nano-banana-2.1` and refuse the bytes unless the response's
 *      own `modelVersion` equals it. A record that cannot name the model that made an asset is not a record.
 *   2. The prompt must come from the family's own committed sources. `composePrompt` builds it from the `-v1` brief row
 *      (the owner's own description of the site, verbatim) plus the family's `plan.md` routes/journeys/fields and its
 *      `design.md` palette, typography and anti-patterns. No prompt is invented here, and the composed prompt is
 *      committed beside the board as `prompt.txt` so the register can pin its bytes.
 *
 * The compute is external and the endpoint injects the signed-in account's credentials: this machine holds no key and
 * sends none (see docs/eval/pricing.md - "no models on fleet VMs" is about local GPU compute, which this is not).
 *
 * Usage:
 *   node scripts/generate-training-boards.mjs                       # offline: compose prompts and report current digests
 *   node scripts/generate-training-boards.mjs --write               # generate boards, write prompts, rewrite register
 *   node scripts/generate-training-boards.mjs --write --only tr-01  # retry one family (image generation is stochastic)
 *   node scripts/generate-training-boards.mjs --register            # offline: verify committed bytes and rewrite register
 *
 * `--write` is the only mode that makes billed model calls and is never wired into `npm test` or `check:all`.
 * `--register` is offline: it verifies committed bytes, then writes the digest register.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { sectionBody } from '../src/design/contract.mjs';
import { parseFrontmatter } from '../src/design/yaml.mjs';
import { readImageDimensions } from '../src/viewer/generate.mjs';
import { TRAINING_TARGET_FAMILIES } from '../src/train/targets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/** The model. Named once, sent explicitly, and verified against what the gateway says it used. */
export const BOARD_MODEL = 'gemini-nano-banana-2.1';

/** The documented credential-injecting proxy, overridable so an operator can repoint it. */
export const BOARD_ENDPOINT = process.env.MWG_TRAIN_IMAGE_ENDPOINT
  || `https://gemini.int.exe.xyz/v1beta/models/${BOARD_MODEL}:generateContent`;

/** Measured, not guessed: at 2048 output tokens this model spends the budget thinking and returns no image at all. */
export const BOARD_MAX_OUTPUT_TOKENS = 8192;
/** Recorded so the settings are part of the provenance rather than an unrecorded default. */
export const BOARD_TEMPERATURE = 0.7;
const TIMEOUT_MS = 180_000;

/** The 16:9 desktop frame the boards are generated in, matching the archetype standard and the vision bridge. */
export const BOARD_WIDTH = 1376;
export const BOARD_HEIGHT = 768;

/**
 * The date every board is asked to treat as today, written into the prompt.
 *
 * This is a RECORDED constant, not `new Date()`, and it has to stay one: the composed prompt is what the register pins
 * by digest, and a prompt that changed with the wall clock would stop matching the committed `prompt.txt` files the
 * next morning. It exists because asking for "the near future" without saying when now is produced dates in 2023 and
 * 2024 - the model's own training cut-off - which is how the second batch came back with twenty stale dates. Changing
 * this line invalidates every committed board prompt and requires regenerating all of them.
 */
export const BOARD_PROMPT_DATE = '11 October 2026';

/** Boards, prompts and the register. All three live under `docs/`, which is enforced rather than assumed. */
export const BOARD_DIR = 'docs/design/training';
export const REGISTER_PATH = 'docs/provenance/assets/training-reference-boards.md';
export const CROP_LEDGER_PATH = 'docs/provenance/assets/training-frame-crops.json';
export const BRIEFS_MANIFEST = 'docs/train/briefs/manifest.jsonl';
export const DESIGN_DIR = 'docs/train/design';

/** The only tree this script is allowed to write into. A teacher-model image must never reach `data/`. */
const WRITE_ROOT = 'docs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** Resolve a repo-relative path and refuse it if it leaves the tree this script owns. */
export function assertWritable(relativePath, root = ROOT) {
  const absolute = resolve(root, relativePath);
  const allowed = resolve(root, WRITE_ROOT);
  if (absolute !== allowed && !absolute.startsWith(`${allowed}${sep}`)) {
    throw new Error(`refusing to write ${relativePath}: this script may only write under ${WRITE_ROOT}/ (a model-generated board is not A1 corpus material)`);
  }
  return absolute;
}

/** Board and prompt paths for a family. */
export const boardPath = (familyId) => `${BOARD_DIR}/${familyId}/reference.jpg`;
export const promptPath = (familyId) => `${BOARD_DIR}/${familyId}/prompt.txt`;

function readBriefRows(root = ROOT) {
  return readFileSync(join(root, BRIEFS_MANIFEST), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => JSON.parse(line));
}

/** The canonical (`-v1`) brief row for a family: the structured contract both wording variants share. */
export function canonicalBrief(rows, familyId) {
  return rows.find((row) => row.family_id === familyId && row.variant_of === null) ?? null;
}

/**
 * The site's own name, taken from the design.md heading: "`tr-01` target design — VeloFix Mobile Mechanic — Doorstep
 * Bicycle Tuning & Repair" names the business after the first em dash. An image prompt without a name gets "Your
 * Company" back, which is exactly the artefact the rejected renders were.
 */
export function siteNameOf(designText, fallback) {
  const heading = /^#\s+(.+)$/m.exec(designText)?.[1]?.trim();
  if (!heading) return fallback;
  const parts = heading.split(' — ');
  // Every training design.md heading is "`<family>` target design — <site name> — <subtitle>"; a heading with no em
  // dash names no site, so the family title is the honest fallback rather than the leftover heading text.
  const name = parts.length > 1 ? parts.slice(1).join(' — ').trim() : '';
  return name === '' ? fallback : name;
}

/**
 * The art direction sentence(s) a prompt may use, with the sentences that talk about the conformance artefact removed.
 * `design.md` describes the board and its own role - "The page's job is to be a target: a student model's output is
 * measured against it" - and an image prompt that carries that sentence invites the model to draw a mood board instead
 * of a website. Dropping those sentences is the only edit; the descriptive ones are used verbatim.
 */
export function artDirectionOf(visualThesis) {
  const sentences = visualThesis.replace(/\bboard\b/gi, 'page').split(/(?<=\.)\s+/);
  const keep = [];
  for (const sentence of sentences) {
    if (/student model|measured against|conformance|\btarget\b/i.test(sentence)) break;
    keep.push(sentence);
  }
  return (keep.join(' ') || sentences[0] || '').trim();
}

/**
 * Everything a prompt is composed from, read out of the family's own committed documents.
 */
export function familySources(family, { root = ROOT, briefRows = null } = {}) {
  const rows = briefRows ?? readBriefRows(root);
  const brief = canonicalBrief(rows, family.family_id);
  if (!brief) throw new Error(`${family.family_id}: no canonical (-v1) brief row in ${BRIEFS_MANIFEST}; refusing to guess the site`);

  const designRelative = `${DESIGN_DIR}/${family.family_id}/design.md`;
  const designText = readFileSync(join(root, designRelative), 'utf8');
  const { frontmatter, problems } = parseFrontmatter(designText);
  if (!frontmatter || problems.length) {
    throw new Error(`${designRelative}: frontmatter could not be read (${problems.join('; ') || 'absent'}); refusing to compose a prompt from it`);
  }
  const visualThesis = (sectionBody(designText, 'Visual thesis') ?? '').trim();
  if (visualThesis === '') throw new Error(`${designRelative}: no "## Visual thesis" section`);

  return {
    family,
    brief,
    designRelative,
    siteName: siteNameOf(designText, family.title),
    tokens: frontmatter.tokens ?? {},
    literals: frontmatter.literals ?? {},
    antiPatterns: frontmatter.antiPatterns ?? [],
    visualThesis: artDirectionOf(visualThesis.replace(/[\s\n]+/g, ' ')),
    componentHierarchy: (sectionBody(designText, 'Component hierarchy') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).replace(/`/g, '').trim()),
    routes: brief.routes ?? [],
    journeys: brief.journeys ?? [],
    fieldLabels: (brief.fields ?? []).map((field) => field.label ?? field.name),
  };
}

const sentence = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Legacy deterministic fictional hostname from the earlier framed-board prompts. Kept as an exported helper for
 * archived evidence, but new prompts never put a URL or browser address bar into a concept board.
 */
const DOMAIN_SUFFIXES = ['community', 'studio', 'works', 'collective', 'site', 'shop', 'club', 'farm'];
export function inventedDomain(siteName, familyId) {
  const words = siteName.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));
  // Two words, joined: one word is often generic ("Good", "Community", "Market") and reads like a placeholder domain.
  const slug = words.slice(0, 2).join('').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'example';
  const index = Number.parseInt(familyId.replace(/\D/g, ''), 10);
  return `${slug}.${DOMAIN_SUFFIXES[(Number.isFinite(index) ? index : 0) % DOMAIN_SUFFIXES.length]}`;
}

/** The copy conventions the brief declares, so a board does not price an en-GB site in dollars. */
export function localeConventions(locale) {
  if (locale === 'en-GB') return 'Use \u00a3 prices, British English spelling, day-month dates and .co.uk-style invented domains.';
  if (locale === 'en-US') return 'Use $ prices, US English spelling and month-day dates.';
  return `Write all copy in ${locale} conventions.`;
}

/**
 * Compose one family's image prompt. Pure: the same inputs produce the same bytes, which is what lets the register pin
 * a prompt digest and a later reader reproduce the exact text that was sent.
 */
/**
 * Plain-language page structure, derived from design.md's component map.
 *
 * The map is written as markup (`header.vf-header`, `form#velofix-booking`) because it is checked against the authored
 * board, and putting that text in an image prompt is how three boards in the first batch came back with 'header.ot-head'
 * and 'form#expense-log-form' PRINTED ON THE PAGE: the model renders what it is shown. So the selectors are translated
 * to what the block is, and runs of the same block are counted rather than repeated.
 */
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

export function describeStructure(entries) {
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

export function composePrompt(sources) {
  const { family, brief, siteName, tokens, literals, antiPatterns, visualThesis, componentHierarchy, routes, journeys, fieldLabels } = sources;
  const tokenList = Object.entries(tokens).map(([name, value]) => `${value} (${name.replace(/^--/, '')})`).join(', ');
  const literalList = Object.entries(literals).map(([name, value]) => `${name} ${value}`).join(', ');
  const page = routes[0] ?? '/';
  const otherRoutes = routes.filter((route) => route !== page);
  const structure = describeStructure(componentHierarchy);

  // Written as instruction prose rather than `LABEL: value` blocks: the first batch's blocks were rendered onto the
  // page on at least one board, which printed "home (/) route" and "locale en-GB" in the hero.
  return [
    `Create a finished, high-density screenshot of a real production website. Show ONLY the website itself ` +
      `at 16:9 (${BOARD_WIDTH}x${BOARD_HEIGHT}): its own brand header begins at the image's top edge and the web page ` +
      `fills the entire viewport edge to edge. Strictly NO browser chrome, macOS traffic lights, OS window controls, ` +
      `tabs, address or URL bars, browser borders, window frames, desktop backdrop or surrounding margins. The image ` +
      `is cropped tight to the page: the content runs past the left, right and bottom edges and you never see where the ` +
      `page ends horizontally. Draw no window shadow, no rounded outer card and no second window or pane. Show exactly ` +
      `one page at one ` +
      `scroll position, scrolled to the top, with its complete footer visible, and never show the same page twice or ` +
      `split the frame into two panes or a comparison layout. This is a real screenshot, NOT a sketch, NOT a wireframe, ` +
      `NOT a hand-drawn illustration, NOT a diagram, NOT low-fidelity.`,
    `The site is ${siteName}, a ${family.archetype} website about ${family.title}. Its owner describes it in these ` +
      `words: "${brief.prompt}" Write the page's copy in ${brief.locale} conventions. ${localeConventions(brief.locale)}`,
    `Today's date is ${BOARD_PROMPT_DATE}. Date every event, booking, session, deadline, ledger entry and review on the ` +
      `page in the weeks and months AFTER that date, never before it, and give each date the weekday it actually falls ` +
      `on in that year.`,
    `The page in view is the site's home page. Its structure, top to bottom: ${structure || 'a brand header, a working surface and a footer'}. ` +
      `It must show, as a visitor would meet it: ${journeys.map((journey) => sentence(journey).replace(/\.?$/, '.')).join(' ')}`,
    fieldLabels.length ? `Controls on the page: ${fieldLabels.map((label) => `"${label}"`).join(', ')}.` : '',
    otherRoutes.length ? `The site also has ${otherRoutes.length} other pages, which are NOT on this page and must not appear on it.` : '',
    `Art direction: ${visualThesis}`,
    tokenList ? `Use exactly this palette: ${tokenList}. The accent is the only chromatic colour and carries the single primary action.` : '',
    literalList ? `Structural constants: ${literalList}. Require the control to remain identifiable in its default unfocused state by a persistent alternate visual cue (e.g. distinct background fill or contrasting icon) since the control border is low contrast.` : '',
    `Typography: a system UI sans-serif stack, exactly one h1, and section headings that keep a real document outline.`,
    `Every name, address, brand, institution, price, date, quantity, time and label must be entirely fictional, specific to this subject and internally ` +
      `consistent with the rest of the page; invent fictional entities rather than using real-world ones or writing placeholder brackets. Keep text runs short - ` +
      `headings of two to five words, control labels of one to three words - and ensure all generated text is clean, legible, and correctly spelled with no garbled prose. Include a ` +
      (family.family_id === 'tr-21' ? `Destination Hospital: Elmwood General Clinic, 142 Elmwood Boulevard. Strictly fictional hospital name and address; do not use Leicester Royal Infirmary or any real NHS site. Render one full-bleed web page, no split-screen or side-by-side duplicate views. ` : '') +
      `short social-proof row of two or three customer reviews with star ratings wherever the page type allows, each ` +
      `reviewer a different invented name shown beside a small portrait, and a footer carrying the business's contact ` +
      `details. Include at least one large editorial-quality photograph where the subject has something to photograph, ` +
      `sized as a hero or feature image that spans at least a third of the image's width, and never a thumbnail where a ` +
      `large photograph belongs.`,
    `Never use lorem ipsum, "Your Company", "Placeholder", "John Doe", example.com or example.co.uk addresses, a real ` +
      `email provider such as gmail.com or fastmail, a real company or brand name or logo, or provider branding on a map ` +
      `or chart; use only invented fictional organisations, people, addresses and domains.`,
    `This paragraph is instruction for you, not copy for the page: print no URL, query string or slash-path text ` +
      `on the web page; there is no browser address bar. Print no selector or class name, no locale code, no file name, no date-format token ` +
      `such as MM/DD/YYYY, and no other technical detail on the page. Make every total agree with the rows it ` +
      `summarises, and give every row, card and control its own distinct content.`,
    antiPatterns.length ? `Avoid: ${antiPatterns.join('; ')}.` : '',
  ]
    .filter((line) => line !== '')
    .join('\n\n');
}

/** Every family with its composed prompt, ready to generate. */
export function collectBoards({ root = ROOT, only = null } = {}) {
  const rows = readBriefRows(root);
  return TRAINING_TARGET_FAMILIES
    .filter((family) => !only || only.includes(family.family_id))
    .map((family) => {
      const sources = familySources(family, { root, briefRows: rows });
      return {
        family: family.family_id,
        title: family.title,
        prompt: composePrompt(sources),
        board: boardPath(family.family_id),
        promptFile: promptPath(family.family_id),
      };
    });
}

/** A bounded POST that returns the image plus the gateway's own attestation of the model it used. */
export async function requestBoard({ endpoint = BOARD_ENDPOINT, prompt, fetchImpl = globalThis.fetch } = {}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      temperature: BOARD_TEMPERATURE,
      maxOutputTokens: BOARD_MAX_OUTPUT_TOKENS,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      throw new Error(`endpoint answered ${response.status}: ${text}`);
    }
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    if (!candidate) throw new Error(`no candidate returned (${JSON.stringify(payload).slice(0, 200)})`);
    const part = (candidate.content?.parts ?? []).find((entry) => (entry.inlineData ?? entry.inline_data)?.data);
    if (!part) {
      const kinds = (candidate.content?.parts ?? []).map((entry) => (entry.thought ? 'thought' : 'text')).join(', ') || 'none';
      throw new Error(`no image part (finishReason ${candidate.finishReason}, non-image parts: ${kinds}); raise maxOutputTokens or change the prompt`);
    }
    const inline = part.inlineData ?? part.inline_data;
    const bytes = Buffer.from(inline.data, 'base64');
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error(`returned bytes are not a JPEG (declared ${inline.mimeType ?? 'absent'}, first bytes ${bytes.subarray(0, 4).toString('hex')})`);
    }
    return {
      bytes,
      declaredMime: inline.mimeType ?? null,
      // The gateway's attestation. This is the field the earlier generation could not produce.
      attestedModel: payload.modelVersion ?? null,
      finishReason: candidate.finishReason ?? null,
      totalTokens: payload.usageMetadata?.totalTokenCount ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The observable shape of a generated board, measured from its bytes rather than from a claim about them. */
export function inspectBoard(bytes) {
  const dimensions = readImageDimensions(bytes);
  return { dimensions, sha256: sha256(bytes), bytes: bytes.length };
}

export function boardIsWidescreen(dimensions) {
  if (!dimensions) return false;
  const ratio = dimensions.width / dimensions.height;
  return ratio > 1.6 && ratio < 1.9;
}

/** A derived crop keeps the source pixels' shape; only raw image-model output must retain its 16:9 frame. */
export function derivedCropMatches(dimensions, evidence, boardDigest, bytes, originalSha256) {
  const box = evidence?.box;
  if (!dimensions || !Array.isArray(box) || box.length !== 4 || !box.every(Number.isInteger)) return false;
  const [left, top, right, bottom] = box;
  const ratio = dimensions.width / dimensions.height;
  return left >= 0 && top > 0 && right <= BOARD_WIDTH && bottom <= BOARD_HEIGHT && left < right && top < bottom
    && dimensions.width === right - left && dimensions.height === bottom - top
    && evidence.derivedDimensions?.[0] === dimensions.width && evidence.derivedDimensions?.[1] === dimensions.height
    && dimensions.width >= 1200 && dimensions.height >= 600 && ratio >= 1.7 && ratio <= 2.2
    && /^[a-f0-9]{64}$/.test(evidence.sourceSha256 ?? '') && originalSha256 === evidence.sourceSha256
    && boardDigest === evidence.derivedSha256 && bytes === evidence.derivedBytes;
}

/** Bind crop claims to the original Git blobs and crop boxes named by the offline derivation script.
 * This cheap check does not re-encode pixels: Python --verify remains the full transformation proof.
 */
export function cropSourceProblems(ledger, { root = ROOT, originalDigests = new Map() } = {}) {
  const problems = [];
  let source;
  try { source = readFileSync(join(root, 'scripts/crop-training-reference-frames.py'), 'utf8'); }
  catch { return ['crop source script is missing']; }
  const pinnedCommit = source.match(/^SOURCE_COMMIT = '([a-f0-9]{40})'$/m)?.[1];
  const boxes = new Map([...source.matchAll(/'(tr-\d{2})': \((\d+), (\d+), (\d+), (\d+)\)/g)]
    .map((match) => [match[1], match.slice(2).map(Number)]));
  if (!pinnedCommit || !ledger || ledger.sourceCommit !== pinnedCommit || !ledger.boards
      || typeof ledger.boards !== 'object' || Array.isArray(ledger.boards)) {
    return ['crop ledger has no matching pinned source commit or board map'];
  }
  const known = new Set(TRAINING_TARGET_FAMILIES.map((family) => family.family_id));
  for (const family of boxes.keys()) {
    if (known.has(family) && !Object.hasOwn(ledger.boards, family)) problems.push(`${family}: pinned crop is missing from the ledger`);
  }
  for (const [family, crop] of Object.entries(ledger.boards)) {
    if (!known.has(family) || !boxes.has(family) || JSON.stringify(crop?.box) !== JSON.stringify(boxes.get(family))) {
      problems.push(`${family}: crop box differs from the pinned derivation script`);
      continue;
    }
    try {
      // Hex-only commit and an allowlisted family, passed as argv (never to a shell). A shallow clone without
      // the source object fails closed rather than treating a 64-hex ledger value as proof of the original.
      const original = execFileSync('git', ['cat-file', 'blob', '--', `${pinnedCommit}:${boardPath(family)}`],
        { cwd: root, timeout: 5000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      const digest = sha256(original);
      const dimensions = readImageDimensions(original);
      originalDigests.set(family, digest);
      if (digest !== crop.sourceSha256 || dimensions?.width !== BOARD_WIDTH
          || dimensions?.height !== BOARD_HEIGHT) {
        problems.push(`${family}: source SHA-256 or dimensions differ from the pinned Git original`);
      }
    } catch {
      problems.push(`${family}: pinned Git original is unavailable; fetch the source commit before verifying crops`);
      return problems; // a shallow clone must fail promptly, not retry 30 missing blobs
    }
  }
  return problems;
}

/**
 * The register: a generated document, so it cannot drift from the files it describes. `--register` rewrites it from the
 * committed bytes with no network call, which is also what `--check` reads.
 */
export function renderRegister(entries, { generatedOn = null } = {}) {
  // Resolve each link against the register's own directory instead of counting `../` by hand. Counting is what
  // broke 60 links in this document: `../../docs/design/training/...` written from `docs/provenance/assets/`
  // resolves to `docs/docs/design/training/...`. `path.relative` cannot make that mistake, and it stays right if
  // the register or the boards ever move.
  const registerDir = dirname(REGISTER_PATH);
  const linkTo = (target) => relative(registerDir, target).split(sep).join('/');
  const rows = entries.map(
    (entry) =>
      `| \`${entry.family}\` | [\`reference.jpg\`](${linkTo(entry.board)}) | \`${entry.boardSha256}\` | ${entry.bytes} | ` +
      `${entry.dimensions ? `${entry.dimensions.width} × ${entry.dimensions.height}` : 'unmeasured'} | ` +
      `[\`prompt.txt\`](${linkTo(entry.promptFile)}) | \`${entry.promptSha256}\` | \`${entry.model}\` | ` +
      (entry.crop ? `\`${entry.crop.sourceSha256}\` | \`${entry.crop.box.join(',')}\` |` : '— | — |'),
  );
  const crops = entries.filter((entry) => entry.crop);
  const unattested = entries.filter((entry) => entry.model !== BOARD_MODEL);
  return [
    `# Provenance: training-family visual reference boards`,
    ``,
    `- **Scope:** ${entries.length} illustrative JPEGs, one per training family (\`tr-01\`..\`tr-30\`), under ` +
      `[\`docs/design/training/<family>/reference.jpg\`](../../design/training). They are visual planning references for the ` +
      `training families - what a finished, production-quality version of each family's site should look like. They are ` +
      `**not** functional interfaces, **not** generated-site screenshots, **not** corpus or training data, and **not** the ` +
      `sealed A6 evaluation targets. The A1 conformance instrument is a different file: ` +
      `[\`training-targets.md\`](training-targets.md), \`data/A1_self_generated/targets/<family>/target.png\`, which stays a ` +
      `render of the authored board.`,
    `- **Original generation:** source boards generated ${generatedOn ?? '2026-10-11'} by [\`scripts/generate-training-boards.mjs\`](../../../scripts/generate-training-boards.mjs), ` +
      `which requests \`${BOARD_MODEL}\` explicitly through the project's model gateway ` +
      `(\`https://gemini.int.exe.xyz/v1beta/models/${BOARD_MODEL}:generateContent\`, overridable with ` +
      `\`MWG_TRAIN_IMAGE_ENDPOINT\`) and **fails closed unless the response's own \`modelVersion\` equals the requested model**. ` +
      `Recorded settings: \`responseModalities: ["IMAGE"]\`, temperature ${BOARD_TEMPERATURE}, \`maxOutputTokens\` ${BOARD_MAX_OUTPUT_TOKENS}; ` +
      `each ORIGINAL board was generated in one ${BOARD_WIDTH}×${BOARD_HEIGHT} 16:9 frame. The model attestation ` +
      `applies to those source responses, NOT to the locally cropped JPEG bytes below; no seed was set and the original ` +
      `images are not reproducible from the same prompt.`,
    ...(crops.length ? [
      `- **Offline frame removal:** ${crops.length} committed references are page-only crops from original commit ` +
        `\`${crops[0].crop.sourceCommit}\`. The exact original SHA-256, crop box [left,top,right,bottom], output ` +
        `dimensions/bytes and output SHA-256 are pinned in ` +
        `[\`${CROP_LEDGER_PATH}\`](${linkTo(CROP_LEDGER_PATH)}). ` +
        `[\`scripts/crop-training-reference-frames.py\`](../../../scripts/crop-training-reference-frames.py) ` +
        `uses Pillow 12.3.0 at JPEG quality 95/subsampling 0, with no image-model call, scaling or inpainting. ` +
        `The cropped bytes are DERIVED from attested originals; they are not freshly generated model outputs. ` +
        `Their varying aspect ratios preserve page content and are not claims of an exact 16:9 render.`,
      `- **Frame gate:** the committed images were decoded and checked for macOS-style traffic lights before their ` +
        `exact clean-byte SHA pins were written to [\`.fleet/frame-scan-pins.json\`](../../../.fleet/frame-scan-pins.json). ` +
        `The routine gate hashes unchanged bytes without decoding every full JPEG; changed or unpinned images are ` +
        `decoded, rejected until a deliberate full \`--pin-clean\` scan, and must be independently reviewed. ` +
        `The colour detector is not a substitute for visual assessment of window borders or clipped controls.`,
    ] : []),
    `- **Prompts:** The boards were generated from an earlier prompt revision. The current canonical prompts are composed deterministically from each family's own committed sources - its canonical (\`-v1\`) row in ` +
      `[\`docs/train/briefs/manifest.jsonl\`](../../train/briefs/manifest.jsonl), its [\`plan.md\`](../../train/design) routes, ` +
      `journeys and fields, and its \`design.md\` palette, typography and anti-patterns. Every prompt names the RECORDED date ` +
      `\`${BOARD_PROMPT_DATE}\` as today and asks for every event after it: the second batch, asked for "the near future" ` +
      `without being told when now was, dated twenty boards in 2023 and 2024. Composing rather than hand-writing means the ` +
      `owner's own description of the site is in every prompt verbatim, and the art direction is the family's own ` +
      `\`design.md\` rather than a shared template. This newer prompt explicitly forbids browser/OS chrome: ` +
      `the cropped existing images came from an older framed prompt and do not prove the new instruction was executed by the image model.`,
    `- **Rights:** [Google consumer-account terms](../accounts/google-antigravity-consumer.md) prohibit using AI-generated ` +
      `service content to develop machine-learning models. These boards are **not** corpus material: ` +
      `\`excluded_from_training: true\`, \`approved_for_training: false\`, and in kind \`A3_teacher_generated\` - teacher-model ` +
      `output quarantined from training and published only as planning documentation. No exclusive copyright, general ` +
      `image licence or production/commercial reuse clearance is claimed. Do not move these images into the corpus, the ` +
      `evaluation targets, training or adapter work, or generated-site evidence. Visual review does not change that ` +
      `boundary. The generator refuses any write outside \`docs/\`, so this cannot happen by running the script.`,
    `- **Visual truth:** every product, price, address, name, date, quantity and control label inside a board is an ` +
      `invented placeholder produced by the model. Nothing in these images verifies a route, a state, an email, a ` +
      `payment or a booking, and a depicted success or confirmation state is not a claim that one is implemented. Only ` +
      `the bytes and the prompt arguments are pinned here.`,
    ...(unattested.length
      ? [`- **UNATTESTED ROWS:** ${unattested.map((entry) => `\`${entry.family}\``).join(', ')} is not attested \`${BOARD_MODEL}\`. This register must not be committed with an unattested row.`]
      : []),
    ``,
    `| Family | Board | SHA-256 (current JPEG bytes) | Bytes | Dimensions | Prompt | SHA-256 (current prompt UTF-8) | Original model (attested) | Original JPEG SHA-256 | Crop box [left,top,right,bottom] |`,
    `| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |`,
    ...rows,
    ``,
    `The current JPEG SHA-256 pins derived page-only bytes; the original JPEG SHA-256 and boxes bind each ` +
      `offline transformation to its source. Current prompt digests include the no-browser-chrome direction, ` +
      `but are NOT the historic prompts used for the original images. No pixel-level model regeneration is claimed.`,
    ``,
  ].join('\n');
}

/** Read the committed bytes for the register, or report what is missing. */
export function inspectCommitted({ root = ROOT, only = null } = {}) {
  const rows = readBriefRows(root);
  const entries = [];
  const problems = [];
  let cropLedger = null;
  const originalDigests = new Map();
  if (existsSync(join(root, CROP_LEDGER_PATH))) {
    try {
      cropLedger = JSON.parse(readFileSync(join(root, CROP_LEDGER_PATH), 'utf8'));
      if (cropLedger.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(cropLedger.sourceCommit ?? '')
          || cropLedger.sourceDimensions?.[0] !== BOARD_WIDTH || cropLedger.sourceDimensions?.[1] !== BOARD_HEIGHT
          || !cropLedger.boards || typeof cropLedger.boards !== 'object' || Array.isArray(cropLedger.boards)) {
        throw new Error('invalid crop-ledger schema or source identity');
      }
      const known = new Set(TRAINING_TARGET_FAMILIES.map((family) => family.family_id));
      for (const id of Object.keys(cropLedger.boards)) if (!known.has(id)) problems.push(`crop ledger declares unknown family ${id}`);
      problems.push(...cropSourceProblems(cropLedger, { root, originalDigests }));
    } catch (error) { problems.push(`invalid ${CROP_LEDGER_PATH}: ${error.message}`); cropLedger = null; }
  }
  for (const family of TRAINING_TARGET_FAMILIES) {
    if (only && !only.includes(family.family_id)) continue;
    const board = boardPath(family.family_id);
    const promptFile = promptPath(family.family_id);
    const boardFile = join(root, board);
    const promptFileAbs = join(root, promptFile);
    if (!existsSync(boardFile)) { problems.push(`${family.family_id}: ${board} is missing`); continue; }
    if (!existsSync(promptFileAbs)) { problems.push(`${family.family_id}: ${promptFile} is missing`); continue; }
    const bytes = readFileSync(boardFile);
    const prompt = readFileSync(promptFileAbs);
    const expected = composePrompt(familySources(family, { root, briefRows: rows }));
    if (prompt.toString('utf8') !== expected) {
      problems.push(`${family.family_id}: ${promptFile} does not match the prompt composed from its own brief and design.md`);
    }
    const inspected = inspectBoard(bytes);
    const crop = cropLedger?.boards?.[family.family_id] ?? null;
    if (crop ? !derivedCropMatches(inspected.dimensions, crop, inspected.sha256, inspected.bytes,
      originalDigests.get(family.family_id)) : !boardIsWidescreen(inspected.dimensions)) {
      problems.push(`${family.family_id}: ${board} has unverified dimensions, bytes or crop provenance`);
    }
    entries.push({
      family: family.family_id,
      board,
      promptFile,
      model: BOARD_MODEL,
      bytes: inspected.bytes,
      dimensions: inspected.dimensions,
      boardSha256: inspected.sha256,
      promptSha256: sha256(prompt),
      crop: crop ? { ...crop, sourceCommit: cropLedger.sourceCommit } : null,
    });
  }
  return { entries, problems };
}

export function writeRegister(entries, { root = ROOT, generatedOn = null } = {}) {
  const path = assertWritable(REGISTER_PATH, root);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, renderRegister(entries, { generatedOn }));
  return path;
}

async function main() {
  const write = process.argv.includes('--write');
  const registerOnly = process.argv.includes('--register');
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg === -1 ? null : process.argv[onlyArg + 1].split(',').map((value) => value.trim());

  const boards = collectBoards({ only });
  console.log(`model: ${BOARD_MODEL} (explicit) via ${BOARD_ENDPOINT}`);
  console.log(`settings: temperature ${BOARD_TEMPERATURE}, maxOutputTokens ${BOARD_MAX_OUTPUT_TOKENS}, ${boards.length} board(s)\n`);

  if (registerOnly) {
    const { entries, problems } = inspectCommitted({ only: null });
    if (problems.length) {
      for (const problem of problems) console.error(`PROBLEM ${problem}`);
      console.error('Refusing to write the register: the committed boards and prompts do not agree with their sources.');
      process.exit(1);
    }
    const path = writeRegister(entries, { generatedOn: process.env.MWG_TRAIN_BOARDS_DATE ?? null });
    console.log(`register: wrote ${entries.length} row(s) to ${relative(ROOT, path)}`);
    return;
  }

  if (!write) {
    for (const board of boards) {
      const boardFile = join(ROOT, board.board);
      const current = existsSync(boardFile) ? readFileSync(boardFile) : null;
      console.log(
        `${board.family}\tprompt ${String(board.prompt.length).padStart(5)} chars sha256 ${sha256(Buffer.from(board.prompt)).slice(0, 16)}...\t`
        + (current ? `board ${current.length} bytes` : 'board absent'),
      );
    }
    console.log('\n(dry run: pass --write to generate, or --register to rewrite the register from committed bytes. Nothing was generated.)');
    return;
  }

  const failures = [];
  for (const board of boards) {
    process.stdout.write(`generating ${board.family} (${board.title}) ... `);
    try {
      const result = await requestBoard({ prompt: board.prompt });
      if (result.attestedModel !== BOARD_MODEL) {
        // Fail closed. A board whose model cannot be attested is the exact defect this script exists to prevent.
        throw new Error(`gateway attested model "${result.attestedModel ?? 'absent'}", not "${BOARD_MODEL}"`);
      }
      const dimensions = readImageDimensions(result.bytes);
      if (!dimensions) throw new Error('returned JPEG could not be measured');
      if (!boardIsWidescreen(dimensions)) {
        throw new Error(`returned ${dimensions.width}x${dimensions.height}, which is not the 16:9 frame this script asked for`);
      }
      mkdirSync(resolve(assertWritable(board.board), '..'), { recursive: true });
      writeFileSync(assertWritable(board.board), result.bytes);
      writeFileSync(assertWritable(board.promptFile), board.prompt);
      console.log(`ok ${dimensions.width}x${dimensions.height}, ${result.bytes.length} bytes, sha256 ${sha256(result.bytes)}, attested ${result.attestedModel}, finish ${result.finishReason}`);
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
      failures.push(`${board.family}: ${error.message}`);
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} board(s) failed; the tree now contains a MIX of old and new boards. Retry with --only, then run --register:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  // A retry with --only rewrites one family, but the register is a record of ALL of them: writing it from the subset
  // would silently drop the other rows - the exact drift a generated register exists to prevent. So the subset is
  // generated, then the whole set is re-inspected and the register is only written when every family passes.
  const { problems } = inspectCommitted({ only: null });
  if (problems.length) {
    for (const problem of problems) console.error(`PROBLEM ${problem}`);
    console.error('The tree does not pass the offline re-check for every family; not writing the register.');
    process.exit(1);
  }
  const full = inspectCommitted({ only: null });
  const path = writeRegister(full.entries, { generatedOn: process.env.MWG_TRAIN_BOARDS_DATE ?? null });
  console.log(`\nregister: wrote ${full.entries.length} row(s) to ${relative(ROOT, path)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

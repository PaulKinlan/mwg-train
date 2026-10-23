#!/usr/bin/env node
/**
 * Pull each archetype's shared asset set OUT OF its accepted design target.
 *
 * The direction of this dependency is deliberate and is the whole point of the file: the crafted target
 * design is the source of truth and the asset store is an EXTRACTION from it, never something authored
 * here ahead of the design. If a target changes, re-run this and the store changes with it. Nothing in
 * `assets/archetypes/` is hand-written, and `check-archetype-assets.mjs` recomputes every value from the
 * target and fails if the committed store disagrees.
 *
 * Why a store exists at all: five framework builds render the same archetype (booking-react,
 * booking-vue, booking-hono, ...). If each build carries its own brand strings, palette and imagery then
 * a model cannot render the intended UI from them, and the difference between two builds is no longer
 * attributable to the model. The set is the input that makes "build this archetype" mean one thing.
 *
 *   node scripts/build-archetype-assets.mjs                 # dry run: report what it would write
 *   node scripts/build-archetype-assets.mjs --write         # write the sets and the register
 *   node scripts/build-archetype-assets.mjs --write --only booking,catalogue
 *   node scripts/build-archetype-assets.mjs --register      # rewrite the register only, from committed sets
 *
 * It writes only under `assets/` and `docs/`; nothing here can reach the corpus arms under `data/`.
 *
 * Two files in the store are not derived from the target. `decisions.json` records an adjudication where the
 * target contradicts itself about its own brand - it is hand-written, deliberate, and the gate fails while a
 * contradiction is unadjudicated or while an adjudication has gone stale. A decision can also declare
 * supported VARIANTS: brand identities the target keeps beside its primary one rather than resolving to it.
 * Booking keeps both brands on the owner's decision ('we probably need both', mwg-train-4xg), so a second
 * brand in a target is recorded as coexisting - never silently picked, and never treated as drift to delete.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

import { ARCHETYPES } from '../pilot/archetypes.mjs';

export const TARGET_DIR = 'docs/design/archetypes';
export const STORE_DIR = 'assets/archetypes';
export const REGISTER_PATH = 'docs/provenance/assets/archetype-asset-sets.md';

/**
 * Elements whose text is the archetype's own user-facing copy.
 *
 * Deliberately excludes `a` and `span`: a navigation link and a brand glyph are chrome around the copy,
 * and including them buries the strings that matter in fragments like "->". Row detail still arrives
 * through `td`/`th`/`li`, and every form label through `label`/`option`/`legend`.
 */
const COPY_ELEMENTS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'dt', 'dd', 'label', 'button', 'option',
  'legend', 'summary', 'figcaption', 'blockquote', 'caption', 'output',
]);

/**
 * The demo pages carry their own controls - a state switcher, a board comparison toolbar. That is the
 * demo's apparatus, not the archetype's interface, so it is stripped before the copy is read.
 */
const DEMO_CHROME_CLASS = /state-switcher|compar|toolbar/i;

const REQUIRED_RIGHTS = { excluded_from_training: true, approved_for_training: false };

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function unescapeEntities(value) {
  return value
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

/** Remove `<tag ...>...</tag>` blocks, e.g. scripts and stylesheets, so their text is never read as copy. */
export function stripBlocks(html, tag) {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const close = new RegExp(`</${tag}\\s*>`, 'gi');
  let out = html;
  for (;;) {
    open.lastIndex = 0;
    const start = open.exec(out);
    if (!start) return out;
    close.lastIndex = start.index;
    const end = close.exec(out);
    out = end ? out.slice(0, start.index) + out.slice(end.index + end[0].length) : out.slice(0, start.index);
  }
}

/**
 * Remove an element whose opening tag carries a chrome class, with everything inside it.
 *
 * Depth-aware rather than a regex, because a greedy match would swallow the rest of the document and a
 * lazy one would stop at the first nested close tag. The demo toolbars hold no nested element of their
 * own tag name, but a future one might, and silently eating half a page would look like "the target has
 * no copy" rather than a parser bug.
 */
export function stripChrome(html) {
  let out = html;
  for (;;) {
    const open = /<([a-z]+)\b[^>]*class="[^"]*"[^>]*>/gi;
    let match;
    let removed = false;
    while ((match = open.exec(out)) !== null) {
      const [tagText, tagName] = match;
      if (!/class="([^"]*)"/.test(tagText) || !DEMO_CHROME_CLASS.test(/class="([^"]*)"/.exec(tagText)[1])) continue;
      // Walk forward counting same-name opens and closes to find this element's end.
      const scanner = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}\\s*>`, 'gi');
      scanner.lastIndex = match.index + tagText.length;
      let depth = 1;
      let step;
      let end = -1;
      while ((step = scanner.exec(out)) !== null) {
        if (step[0].startsWith('</')) depth -= 1;
        else depth += 1;
        if (depth === 0) {
          end = step.index + step[0].length;
          break;
        }
      }
      out = end === -1 ? out.slice(0, match.index) : out.slice(0, match.index) + out.slice(end);
      removed = true;
      break;
    }
    if (!removed) return out;
  }
}

/** Text runs paired with the content element they belong to, in document order. */
export function copyTexts(html) {
  const body = stripBlocks(stripBlocks(stripChrome(html), 'script'), 'style').replace(/<!--[\s\S]*?-->/g, '');
  const tokens = body.split(/(<[^>]+>)/).filter((part) => part !== '');
  const stack = [];
  const texts = [];
  let instance = 0;
  for (const token of tokens) {
    if (token.startsWith('<')) {
      const closing = /^<\s*\//.test(token);
      const name = /^<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(token);
      if (!name) continue;
      const tag = name[1].toLowerCase();
      if (closing) {
        const at = stack.findLastIndex((frame) => frame.tag === tag);
        if (at !== -1) stack.splice(at, 1);
      } else if (!/\/>$/.test(token) && !['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'].includes(tag)) {
        // Each element carries its own identity, so two identical strings in two sibling elements are
        // two entries and only a text run split by inline markup collapses to one.
        stack.push({ tag, id: (instance += 1) });
      }
      continue;
    }
    const text = token.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed === '') continue;
    // The nearest content element in the open stack, so a <p><strong>x</strong></p> is read as one run.
    let owner = null;
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (COPY_ELEMENTS.has(stack[i].tag)) {
        owner = stack[i];
        break;
      }
    }
    if (!owner) continue;
    const previous = texts[texts.length - 1];
    if (previous && previous.id === owner.id && previous.text === collapsed) continue;
    texts.push({ tag: owner.tag, id: owner.id, text: collapsed });
  }
  return texts;
}

/**
 * The separator a page title puts between its description and the site it belongs to.
 *
 * 'Booking Confirmation & Receipt — Learning Hub' names the page first and the site last. These are the
 * separators the accepted targets use, plus the ASCII hyphen, which is the commonest way to write the same
 * thing. A title with no separator makes no brand claim in its tail, so there is nothing to read there.
 */
const TITLE_BRAND_SEPARATOR = /\s+[—–·|-]\s+/;

/**
 * The fragment a page title puts in the brand position: the text after its last separator, parenthetical removed.
 *
 * Entities are decoded so the fragment can be compared with a brand name read out of the markup: catalogue's
 * title states `Kiln &amp; Copper`, and the brand the target states is `Kiln & Copper`.
 */
export function titleBrandPosition(title) {
  if (typeof title !== 'string') return '';
  const parts = unescapeEntities(title).split(TITLE_BRAND_SEPARATOR);
  if (parts.length < 2) return '';
  return parts[parts.length - 1].replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * The brands a page title states, read from names the target itself supplies.
 *
 * A title's brand is not guessed from its wording: a title states a brand when it contains a name that the
 * target, or the decision that settles its brand, calls its own. `strong` are the names the target states as
 * its site (a brand element, the README's own heading); `declared` adds the primary brand and supported
 * variants a decision records, which is how a target with no brand element at all (event-registration) still
 * has a title that names it. Two kinds of candidate are therefore deliberately left out by callers:
 *
 *   - `demo-title`, because that candidate was lifted out of a page title in the first place, so matching it
 *     would make any title its own brand and could make one title look like two brands.
 *   - a page-copy candidate (an h1/heading phrase), because 'Find Your Next Evening Class — Learning Hub' is
 *     a description and a brand, not two brands.
 *
 * Returns every distinct name found, in the order given, so a caller can tell "no brand" from "two brands"
 * rather than collapsing both to null.
 */
export function statedTitleBrands(title, { strong = [], declared = [] } = {}) {
  if (typeof title !== 'string' || title.trim() === '') return [];
  const text = unescapeEntities(title);
  const stated = [];
  for (const value of [...strong, ...declared]) {
    if (typeof value === 'string' && value !== '' && text.includes(value) && !stated.includes(value)) stated.push(value);
  }
  return stated;
}

/**
 * The words a page states, lowercased, so a title fragment can be checked against the page's own text.
 *
 * Whole tokens, not substrings: a page whose copy says 'northwindshire' has not said 'Northwind', and a
 * substring test would let an unknown brand through on a coincidence of spelling.
 */
function pageWords(texts) {
  const words = new Set();
  for (const text of texts) {
    if (typeof text !== 'string') continue;
    for (const word of text.toLowerCase().match(/[a-z0-9][a-z0-9'’.-]*/g) ?? []) words.add(word);
  }
  return words;
}

/** The capitalised words of a name: the proper nouns a site name is built from. */
function properNouns(text) {
  return [...new Set(text.match(/[A-Za-z][A-Za-z'’.-]*/g) ?? [])].filter((word) => /^[A-Z]/.test(word));
}

/**
 * The name a page title puts in its brand position that is neither a supported identity nor the page's own
 * wording, or null when the position is one of those two things.
 *
 * A position that is not a brand the set supports cannot simply be refused, because three accepted targets
 * put a page description there: 'Kiln & Copper - Ceramics & Kiln Parts Catalogue' and 'ARKHITECTS Studio -
 * Request a consultation' name the site first, and 'Future Web 2026 - event registration visual demo'
 * describes the page. What separates those from a site name is that the page itself says them: every
 * capitalised word of a description appears in the page's own copy. 'Northwind Studio' appears nowhere in
 * the page, so a title ending in it claims a site the set cannot identify.
 *
 * The check is independent of the brands the title states elsewhere. It used to run only when the title
 * stated none, so 'Evening Class Studio Booking - Northwind Studio' named a supported brand in its
 * description, recorded that brand, and published a page belonging to a second site unchallenged.
 */
export function unrecognisedTitleBrand(slot, supported) {
  const claim = titleBrandPosition(slot?.title);
  if (claim === '' || supported.includes(claim)) return null;
  const words = pageWords(Array.isArray(slot?.strings) ? slot.strings : []);
  const unseen = properNouns(claim).filter((word) => !words.has(word.toLowerCase()));
  return unseen.length === 0 ? null : claim;
}

/**
 * A copy slot's brand record: the single brand its title adopts, and every brand the title states.
 *
 * `brand` is null only when the title adopts no brand of the set's own - a comparison page describes the
 * artefact, and a page whose title names none is legitimately without one. A title naming two brands keeps
 * both in `brands` so the contradiction is visible rather than silently flattened to "no brand".
 */
function titleBrandView(slot, names) {
  const stated = statedTitleBrands(slot.title, names);
  return { brand: stated.length === 1 ? stated[0] : null, brands: stated };
}

/** The accepted target's palette and typography: its custom properties, plus any font family it sets outright. */
export function extractTokens(css, source) {
  const colors = {};
  const fonts = {};
  // Comments are stripped once, up front. Without this the `:root` pass read a declaration preceded by a
  // comment as the name `"/* Typography */\n  --font-sans"`, which does not start with `--`, so booking's
  // main font stack was silently dropped while its mono stack survived.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = clean.match(/:root\s*\{[^}]*\}/g) ?? [];
  for (const block of blocks) {
    for (const declaration of block.replace(/:root\s*\{/, '').replace(/\}\s*$/, '').split(';')) {
      const at = declaration.indexOf(':');
      if (at === -1) continue;
      const name = declaration.slice(0, at).trim();
      const value = declaration.slice(at + 1).trim();
      if (!name.startsWith('--') || value === '') continue;
      if (/(light-dark\(|#[0-9a-f]{3,8}\b|rgba?\(|oklch\(|color\()/i.test(value)) colors[name] = value;
      else if (/(system-ui|sans-serif|serif|monospace|ui-)/i.test(value)) fonts[name] = value;
    }
  }
  // Two of the five targets set the font stack on a selector rather than as a custom property, so
  // reading only `:root` reported "no typography" for a target that plainly has one. Keyed by selector
  // so the register can still say where the value came from.
  for (const rule of clean.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = rule[1].trim().replace(/\s+/g, ' ');
    if (selector.startsWith('--') || selector.includes('@')) continue;
    const declared = /(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(rule[2]);
    if (!declared) continue;
    const value = declared[1].trim();
    if (value === '') continue;
    // `inherit` is not a typography token, and an alias to a token already recorded is not a second
    // one. The earlier version compared the VALUE against the token KEYS, so `var(--font-sans)` never
    // matched `--font-sans` and every alias was stored as if it were a stack of its own.
    if (/^(inherit|initial|unset|revert|revert-layer)$/i.test(value)) continue;
    const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value);
    if (alias && alias[1] in fonts) continue;
    fonts[selector] = value;
  }
  return { colors, fonts, source };
}

/**
 * The brand, with every candidate and its source.
 *
 * The accepted target states the brand in more than one place and the places do not always agree. It is
 * not this script's job to pick: a silent pick is how two framework builds come to render two brands.
 * Candidates are recorded, disagreements are recorded as conflicts, and a conflict that has not been
 * adjudicated in `assets/archetypes/<id>/decisions.json` fails the check rather than being resolved here.
 */
export function extractBrand({ archetype, readme, readmePath, indexHtml, indexPath }) {
  const candidates = [];
  const textOf = (html) => html
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]*>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part !== '' && !/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+$/u.test(part));
  const add = (value, source, kind, strength) => {
    if (value && !candidates.some((candidate) => candidate.value === value && candidate.kind === kind)) {
      candidates.push({ value, source, kind, strength });
    }
  };

  // An explicit brand element names the site. Text is read straight out of the anchor, not through
  // copyTexts: the name sits in a bare <span>, which is not a content element, so the copy reader finds
  // nothing there and two archetypes silently had no brand at all.
  const brandAnchor = /<a\b[^>]*class="[^"]*brand[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(indexHtml);
  if (brandAnchor) {
    // The mark is a glyph or an inline SVG; the name is what remains. Every remaining fragment is
    // joined, because a name split across two spans is one name - taking the last fragment alone would
    // record "Copper" for a brand called "Kiln & Copper".
    const named = brandAnchor[1].replace(
      /<span\b[^>]*class="[^"]*(?:brand-icon|brand-mark|brand-badge)[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      ' ',
    );
    const parts = textOf(named);
    add(parts.join(' ').trim(), `${indexPath}:${lineOf(indexHtml, brandAnchor.index)}`, 'demo-brand-element', 'strong');
  }
  // The target's own heading states the brand in the booking target and states nothing in the others.
  const heading = /^#\s+[^\n(]*\(([^)]+)\)\s*$/m.exec(readme);
  if (heading) add(heading[1].trim(), `${readmePath}:${lineOf(readme, heading.index)}`, 'target-heading', 'strong');
  // A document title and an h1 are the page's own words, so either can be a page description rather
  // than a brand - `Account recovery · visual demo` is not a site name. Weak candidates need an
  // adjudication before they can become the set's brand.
  const title = /<title>([^<]*)<\/title>/i.exec(indexHtml);
  if (title) add(unescapeEntities(title[1]).split(/\s+[—–·|]\s+/)[0].trim(), `${indexPath}:${lineOf(indexHtml, title.index)}`, 'demo-title', 'weak');
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(indexHtml);
  if (h1) {
    const parts = textOf(h1[1]);
    add(parts.join(' ').trim(), `${indexPath}:${lineOf(indexHtml, h1.index)}`, 'demo-heading', 'weak');
  }

  const distinct = [...new Set(candidates.map((candidate) => candidate.value))];
  const strong = [...new Set(candidates.filter((candidate) => candidate.strength === 'strong').map((candidate) => candidate.value))];
  const conflicts = strong.length > 1 ? [{ values: strong, candidates: candidates.filter((candidate) => candidate.strength === 'strong') }] : [];
  const mark = (() => {
    const icon = /<span\b[^>]*class="[^"]*(?:brand-icon|brand-mark|brand-badge)[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(indexHtml);
    if (!icon) return null;
    const value = textOf(icon[1]).join(' ').trim();
    // An SVG-only mark still is the archetype's mark, and its path data is the asset; record that
    // rather than reporting no mark at all.
    if (!value) {
      const svg = /<svg\b[\s\S]*?<\/svg>/i.exec(icon[1]);
      return svg ? { kind: 'svg', value: svg[0].replace(/\s+/g, ' ').trim(), source: `${indexPath}:${lineOf(indexHtml, icon.index)}` } : null;
    }
    return { kind: 'text', value, source: `${indexPath}:${lineOf(indexHtml, icon.index)}` };
  })();

  return { candidates, conflicts, distinct, strong, mark, archetype };
}

/** The rights boundary, inherited from the target rather than restated here. Fails closed if absent. */
export function extractRights(readme, readmePath) {
  // Both tokens are searched for across the whole target, not within a fixed window: explanatory prose
  // between them is normal, and a window that ended early reported `approved_for_training: null` for a
  // target that states it, which fails closed on a document that is in fact compliant.
  const excluded = /excluded_from_training[`*\s:]+(true|false)/i.exec(readme);
  const approved = /approved_for_training[`*\s:]+(true|false)/i.exec(readme);
  if (!excluded && !approved) return null;
  return {
    excluded_from_training: excluded ? excluded[1] === 'true' : null,
    approved_for_training: approved ? approved[1] === 'true' : null,
    source: `${readmePath}:${lineOf(readme, (excluded ?? approved).index)}`,
  };
}

export function archetypeIds(root) {
  return Object.keys(ARCHETYPES).sort();
}

function listTargetDocuments(root, id) {
  const dir = join(root, TARGET_DIR, id, 'demo');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.html'))
    .sort()
    .map((name) => join(TARGET_DIR, id, 'demo', name));
}

/**
 * Read one archetype's accepted target and derive its whole asset set. Pure: it touches no store file,
 * so the check can call it and compare the result against what is committed.
 */
export function extractSet(root, id) {
  const targetPath = join(TARGET_DIR, id);
  const readmePath = join(targetPath, 'README.md');
  const stylesPath = join(targetPath, 'demo', 'styles.css');
  if (!existsSync(join(root, readmePath))) throw new Error(`${id}: no accepted target at ${readmePath}`);

  const readme = readFileSync(join(root, readmePath), 'utf8');
  const documents = listTargetDocuments(root, id);
  const indexRel = documents.find((doc) => doc.endsWith('index.html')) ?? documents[0];
  if (!indexRel) throw new Error(`${id}: the accepted target has no demo document to read`);
  const indexHtml = readFileSync(join(root, indexRel), 'utf8');

  const brand = extractBrand({ archetype: id, readme, readmePath, indexHtml, indexPath: indexRel });

  const copy = {};
  for (const rel of documents) {
    const html = readFileSync(join(root, rel), 'utf8');
    const title = /<title>([^<]*)<\/title>/i.exec(html);
    const lang = /<html\b[^>]*\blang="([^"]*)"/i.exec(html);
    copy[rel.split('/').pop()] = {
      title: title ? title[1].trim() : null,
      lang: lang ? lang[1] : null,
      strings: copyTexts(html).map((entry) => entry.text),
      // The comparison page is the demo's own apparatus - it shows the boards side by side. It carries
      // no archetype copy by design, so requiring copy from it would fail correct work.
      apparatus: /class="[^"]*(?:compare|comparison)[-\s"]/i.test(html),
      source: rel,
      sha256: sha256(Buffer.from(html)),
    };
  }

  const tokens = existsSync(join(root, stylesPath))
    ? extractTokens(readFileSync(join(root, stylesPath), 'utf8'), stylesPath)
    : { colors: {}, fonts: {}, source: null };

  const rights = extractRights(readme, readmePath);

  const targetDir = join(root, targetPath);
  const images = readdirSync(targetDir)
    .filter((name) => /^step\d+.*\.(jpe?g|png|webp|avif)$/i.test(name))
    .sort()
    .map((name) => {
      const bytes = readFileSync(join(targetDir, name));
      return { name, sha256: sha256(bytes), bytes: bytes.length, source: `${targetPath}/${name}`, content: bytes };
    });

  return {
    archetype: id,
    extracted_from: {
      target_dir: targetPath,
      readme: { path: readmePath, sha256: sha256(Buffer.from(readme)) },
      documents: documents.map((rel) => ({ path: rel, sha256: sha256(readFileSync(join(root, rel))) })),
      stylesheet: tokens.source ? { path: tokens.source, sha256: sha256(readFileSync(join(root, tokens.source))) } : null,
    },
    brand,
    tokens,
    copy,
    rights,
    images,
  };
}

/** Everything that must hold for a set to be usable as the single source for builds. */
export function setProblems(set) {
  const problems = [];
  const decision = set.decision;
  const variants = decision && !decision.brandless ? (decision.variants ?? []) : [];
  const siteName = decision
    ? (decision.brandless ? null : decision.siteName)
    : (set.brand.strong.length === 1 ? set.brand.strong[0] : null);
  if (!decision) {
    if (set.brand.strong.length === 0) {
      problems.push('the target states no brand outright - no brand element and no heading parenthetical - so decisions.json has to record either the brand or that the target is deliberately unbranded; a page title is a description, not a site name');
    } else if (set.brand.strong.length > 1) {
      problems.push(`brand conflict between ${set.brand.strong.map((value) => JSON.stringify(value)).join(' and ')} has not been adjudicated in decisions.json`);
    }
  } else if (decision.brandless) {
    if (set.brand.strong.length > 0) {
      problems.push(`decisions.json says the target is deliberately unbranded, but the target now states ${set.brand.strong.map((value) => JSON.stringify(value)).join(' and ')}; the decision is stale`);
    }
  } else {
    if (!set.brand.distinct.includes(decision.siteName)) {
      problems.push(`decisions.json names ${JSON.stringify(decision.siteName)}, which is not one of the target's own candidates`);
    } else if (set.brand.strong.length === 1) {
      // The target now states exactly one brand, so there is nothing left to adjudicate. Either the
      // decision agrees with it - stale, delete the file - or it disagrees, in which case letting the
      // decision win would silently overrule the target.
      problems.push(
        set.brand.strong[0] === decision.siteName
          ? 'decisions.json adjudicates a brand conflict that no longer exists: the target now states one brand, so the decision is stale and should be deleted'
          : `decisions.json names ${JSON.stringify(decision.siteName)} while the target now states ${JSON.stringify(set.brand.strong[0])}: the target has settled on one brand and the decision contradicts it`,
      );
    }
  }
  // A declared variant is a brand the target keeps beside its primary one. Naming one the target does not
  // state is a claim about a product that no longer exists, exactly like an unstated primary brand.
  for (const variant of variants) {
    if (variant === siteName) {
      problems.push(`decisions.json lists ${JSON.stringify(variant)} as both the site name and a supported variant, so a build cannot tell which record to render`);
    } else if (!set.brand.distinct.includes(variant)) {
      problems.push(`decisions.json lists the brand variant ${JSON.stringify(variant)}, which the target does not state; the decision is stale`);
    }
  }
  if (Object.keys(set.tokens.colors).length === 0) problems.push('no palette: the target stylesheet declares no colour custom properties');
  if (Object.keys(set.tokens.fonts).length === 0) problems.push('no typography: the target stylesheet declares no font stack');
  if (Object.keys(set.copy).length === 0) problems.push('no copy: no demo document was read');
  // The brand names the set publishes: the decision's primary brand and the variants it supports. A page
  // title is checked against these rather than against itself, so "the set says one thing and its copy says
  // another" is a finding in either direction.
  const declaredBrands = siteName ? [siteName, ...variants] : [];
  for (const [document, entry] of Object.entries(set.copy)) {
    if (entry.strings.length === 0 && !entry.apparatus) problems.push(`${document}: no user-facing copy was extracted`);
    // A page title states one brand or none, and a title that states two is a contradiction no build can
    // resolve: recording it as "no brand" is what let a set publish a brand while its copy named another.
    const stated = statedTitleBrands(entry.title, { strong: set.brand.strong, declared: declaredBrands });
    if (stated.length > 1) {
      problems.push(`${document}: its title states more than one brand (${stated.map((value) => JSON.stringify(value)).join(' and ')}), so a build cannot tell which the page renders`);
    } else if (stated.length === 1) {
      // A page title carrying a second brand is only coherent if that brand is one the archetype supports.
      // Otherwise the set publishes a brand plus copy that renders a different one, and two builds of the
      // same archetype end up looking like two products.
      if (!declaredBrands.includes(stated[0])) {
        problems.push(`${document}: its title states the brand ${JSON.stringify(stated[0])}, which is neither the set's brand nor a supported variant in decisions.json`);
      }
    }
    // The brand position is checked whatever the title states elsewhere. Reading it only when the title
    // stated no brand let 'Evening Class Studio Booking - Northwind Studio' through: the title named the
    // set's own brand in its description, so the position was never examined and the set published a copy
    // slot belonging to a site it could not identify. The apparatus pages stay exempt - their titles
    // describe the demo, not the site the archetype renders.
    if (!entry.apparatus) {
      const claim = unrecognisedTitleBrand(entry, declaredBrands);
      if (claim !== null) {
        problems.push(`${document}: its title puts ${JSON.stringify(claim)} in the brand position, which is neither the set's brand, a supported variant, nor wording the page itself uses; a build reading it cannot tell which site the page belongs to, so name a supported brand there or describe the page`);
      }
    }
  }
  if (set.images.length === 0) problems.push('no imagery: the target has no step board to extract');
  if (!set.rights) problems.push('no rights statement in the target: the set cannot inherit a rights boundary it was never given');
  else if (set.rights.excluded_from_training !== REQUIRED_RIGHTS.excluded_from_training || set.rights.approved_for_training !== REQUIRED_RIGHTS.approved_for_training) {
    problems.push(`rights are not the inherited boundary: expected excluded_from_training: true and approved_for_training: false, read ${JSON.stringify(set.rights)}`);
  }
  return problems;
}

/** The committed shape of a set: everything except the image bytes, which live beside it. */
export function setDocument(set) {
  const decision = set.decision ?? null;
  const siteName = decision
    ? (decision.brandless ? null : decision.siteName)
    : (set.brand.strong.length === 1 ? set.brand.strong[0] : null);
  const variants = decision && !decision.brandless ? (decision.variants ?? []) : [];
  const declaredBrands = siteName ? [siteName, ...variants] : [];
  return {
    archetype: set.archetype,
    extracted_from: set.extracted_from,
    brand: {
      site_name: siteName,
      brandless: decision ? decision.brandless : false,
      // The brand identities this archetype supports beside its primary one, declared in decisions.json.
      // A build renders `site_name` unless it is deliberately building a variant, and records which.
      variants,
      candidates: set.brand.candidates,
      conflicts: set.brand.conflicts,
      mark: set.brand.mark,
      decided: decision,
    },
    tokens: set.tokens,
    // Each copy slot records the brand its own title states, checked against the brand and variants the
    // decision declares: a title that names one is recorded, a title that names none records none, and a
    // title naming two keeps both so the contradiction setProblems reports is visible in the set itself.
    copy: Object.fromEntries(Object.entries(set.copy).map(([page, slot]) => [page, { ...slot, ...titleBrandView(slot, { strong: set.brand.strong, declared: declaredBrands }) }])),
    images: set.images.map(({ name, sha256: digest, bytes, source }) => ({ name, sha256: digest, bytes, source })),
    rights: set.rights,
  };
}

export function renderStoreReadme(document, problems) {
  const brand = document.brand;
  const brandLine = brand.brandless
    ? 'The accepted target is deliberately unbranded: it names no site, and the store records that instead of inventing one.'
    : (brand.site_name ? `**${brand.site_name}**` : '**unresolved**');
  const variants = brand.variants ?? [];
  const renderedBy = (name) => Object.entries(document.copy)
    .filter(([, slot]) => slot.brand === name)
    .map(([page]) => `\`${page}\``);
  const variantBlock = variants.length === 0 ? '' : `The target states more than one brand, and the recorded decision keeps both rather than deleting one: **${brand.site_name}** is the primary brand a build renders, and these are supported variants of the same archetype:

${variants.map((name) => {
    const pages = renderedBy(name);
    return `- \`${name}\`${pages.length > 0 ? ` — the brand stated by ${pages.join(', ')}` : ''}`;
  }).join('\n')}

`;
  return `# ${document.archetype} asset set

The shared assets for the \`${document.archetype}\` archetype: what every framework build for it draws
from, so two builds of this archetype render the same brand, the same palette and the same imagery.

**Do not edit by hand.** This set is an EXTRACTION from the accepted target at
\`${document.extracted_from.target_dir}\`, written by \`scripts/build-archetype-assets.mjs\`. The crafted
target design is the source of truth; the set is pulled out of it. Edit the target, then re-run:

\`\`\`bash
node scripts/build-archetype-assets.mjs --write --only ${document.archetype}
\`\`\`

## What it contains

| Part | Where | Extracted from |
| --- | --- | --- |
| Brand, palette, typography, copy | \`set.json\` | \`${document.extracted_from.readme.path}\` and the \`demo/\` documents |
| State imagery | \`images/\` | the target's own step boards |

**Rights are inherited, not asserted here.** ${document.rights ? `\`excluded_from_training: ${document.rights.excluded_from_training}\`, \`approved_for_training: ${document.rights.approved_for_training}\`, from [\`${document.rights.source}\`](../../../${document.rights.source.replace(/:\d+$/, '')}).` : 'The target states no rights boundary, which is itself a finding.'} These are design-planning references: they are not corpus, not teacher output, and not evidence that any depicted flow works.

## Brand

${brandLine}

${brand.candidates.length === 0 ? 'No brand candidate was found in the target.' : brand.candidates.map((candidate) => `- \`${candidate.value}\` — from \`${candidate.source}\` (${candidate.kind}, ${candidate.strength} candidate)`).join('\n')}

${brand.conflicts.length > 0 && variants.length === 0 ? `Those candidates do not agree, which is recorded rather than resolved:\n\n${brand.conflicts.map((conflict) => conflict.values.map((value) => `- \`${value}\``).join('\n')).join('\n')}\n\n` : ''}${variantBlock}${brand.decided ? `${brand.decided.brandless ? 'Recorded on' : 'Adjudicated on'} ${brand.decided.decided_on}: ${brand.decided.brandless ? 'deliberately unbranded' : `**${brand.decided.siteName}**`}${variants.length > 0 ? ` (supported variants: ${variants.map((name) => `\`${name}\``).join(', ')})` : ''}. ${brand.decided.because}` : ''}

## The one hand-written file

\`decisions.json\` is the only file here that is not generated, and it exists only where the target does not speak
with one voice about its own brand: it records which candidate is the primary brand - or that the target is
deliberately unbranded - which candidates are supported variants that coexist with it, why, and when, so the
ambiguity is adjudicated in the open instead of being resolved by whichever value the extractor happened to read
last. When the target stops being ambiguous the decision becomes stale and
\`check:archetype-assets\` fails until it is deleted.

${problems.length > 0 ? `## Open problems\n\n${problems.map((problem) => `- ${problem}`).join('\n')}\n` : ''}`;
}

export function renderRegister(documents) {
  const rows = [];
  const variantsOf = (document) => document.brand.variants ?? [];
  const brandCell = (document) => `${document.brand.site_name ? `\`${document.brand.site_name}\`` : (document.brand.brandless ? '_deliberately unbranded_' : '**unresolved**')}${variantsOf(document).length > 0 ? ` (variants: ${variantsOf(document).map((name) => `\`${name}\``).join(', ')})` : ''}`;
  for (const document of documents) {
    rows.push(`| \`${document.archetype}/set.json\` | ${brandCell(document)} | ${Object.keys(document.tokens.colors).length} | ${Object.keys(document.copy).length} | ${document.images.length} | ${document.brand.decided ? (document.brand.brandless ? 'yes (deliberately unbranded)' : '**yes** (see decisions.json)') : 'no'} |`);
  }
  return `# Archetype asset sets

> **mwg-train deterministic baseline** - deterministic output of this repository's own tooling, not an official \`web-uplift\` result.

One asset set per archetype: the brand, palette, typography, copy and state imagery that every
framework build for that archetype draws from. They exist so that "build the booking archetype" means
one thing to every model that is asked to build it — a build that invents its own imagery or omits an
asset the target has looks like a weak model when it is a missing input.

Each set is an EXTRACTION from its accepted target under \`docs/design/archetypes/<archetype>/\`, written
by \`scripts/build-archetype-assets.mjs\`. The register is written from the committed bytes, so it cannot
drift from them: \`npm run check:archetype-assets\` re-derives every value from the target and fails if the
store, the register or the target have moved apart.

| Set | Brand | Palette colours | Copy documents | State boards | Brand adjudicated |
| --- | --- | ---: | ---: | ---: | --- |
${rows.join('\n')}

## Where the values come from, per set

${documents.map((document) => `### ${document.archetype}

- Target: \`${document.extracted_from.target_dir}\`
- Readme: \`${document.extracted_from.readme.path}\` (sha256 \`${document.extracted_from.readme.sha256}\`)
- Stylesheet: ${document.extracted_from.stylesheet ? `\`${document.extracted_from.stylesheet.path}\` (sha256 \`${document.extracted_from.stylesheet.sha256}\`)` : 'none'}
- Documents: ${document.extracted_from.documents.map((doc) => `\`${doc.path}\``).join(', ')}
- Rights: ${document.rights ? `\`excluded_from_training: ${document.rights.excluded_from_training}\`, \`approved_for_training: ${document.rights.approved_for_training}\` from \`${document.rights.source}\`` : '**not stated by the target**'}
- Brand: ${document.brand.site_name ? `\`${document.brand.site_name}\`` : '**unresolved**'}${(document.brand.variants ?? []).length > 0 ? ` with supported variants ${document.brand.variants.map((name) => `\`${name}\``).join(', ')}` : ''}${document.brand.decided ? ` (adjudicated: ${document.brand.decided.because} — ${document.brand.decided.decided_on})` : ''}
- Boards: ${document.images.map((image) => `\`${image.name}\` sha256 \`${image.sha256}\``).join('; ')}
`).join('\n')}
## What this register does not claim

It pins bytes and provenance. It does not claim the assets are legally cleared for training - they
inherit the target's own \`excluded_from_training\` boundary - and it does not claim the depicted flows
work. Nothing here is a functional claim about a route or a state.
`;
}

export function assertWritable(root, path) {
  // Resolve BEFORE comparing. The earlier version compared the unresolved path, so
  // `<root>/assets/../data/x` started with the allowed prefix and was returned unblocked - a guard that a
  // `..` walks past is not a guard.
  const absolute = resolve(root, path);
  const allowed = [resolve(root, 'assets'), resolve(root, 'docs')];
  if (!allowed.some((base) => absolute === base || absolute.startsWith(`${base}${sep}`))) {
    throw new Error(`refusing to write outside assets/ and docs/: ${relative(root, absolute)}`);
  }
  return absolute;
}

export function readDecision(root, id) {
  const path = join(root, STORE_DIR, id, 'decisions.json');
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const entry = parsed.brand ?? parsed;
  if (!entry.because || !entry.decided_on) throw new Error(`${relative(root, path)}: a decision needs because and decided_on`);
  if (!entry.siteName && !entry.brandless) throw new Error(`${relative(root, path)}: a decision needs siteName, or brandless: true for a target deliberately without one`);
  // Supported variants are brand identities the target keeps beside its primary one. They are declared here
  // rather than derived, because "both brands are intended" is a product decision and not something the
  // extractor can read off a page; whether the target still states each of them is checked in setProblems.
  const declared = entry.variants ?? [];
  if (!Array.isArray(declared) || declared.some((variant) => typeof variant !== 'string' || variant.trim() === '')) {
    throw new Error(`${relative(root, path)}: variants must be an array of brand names`);
  }
  if (entry.brandless && declared.length > 0) {
    throw new Error(`${relative(root, path)}: a brandless decision cannot also declare variants`);
  }
  return {
    siteName: entry.siteName ?? null,
    brandless: entry.brandless === true,
    variants: [...new Set(declared.map((variant) => variant.trim()))],
    because: entry.because,
    decided_on: entry.decided_on,
  };
}

export function buildAll(root, ids = archetypeIds(root)) {
  return ids.map((id) => {
    const set = extractSet(root, id);
    set.decision = readDecision(root, id);
    return set;
  });
}

/** Compare the committed store against what the target says today. Fails closed; never throws. */
export function inspectCommitted(root, ids = archetypeIds(root)) {
  const findings = [];
  const documents = [];
  for (const id of ids) {
    let set;
    try {
      set = extractSet(root, id);
      set.decision = readDecision(root, id);
    } catch (error) {
      findings.push(`${id}: ${error.message}`);
      continue;
    }
    for (const problem of setProblems(set)) findings.push(`${id}: ${problem}`);
    const document = setDocument(set);
    documents.push(document);

    const setPath = join(root, STORE_DIR, id, 'set.json');
    if (!existsSync(setPath)) {
      findings.push(`${id}: no committed set at ${STORE_DIR}/${id}/set.json`);
      continue;
    }
    let committed;
    try {
      committed = JSON.parse(readFileSync(setPath, 'utf8'));
    } catch (error) {
      // A malformed set.json is a finding, not a stack trace: the gate is contracted to fail closed.
      findings.push(`${id}: committed set.json cannot be read as JSON (${error.message})`);
      continue;
    }
    for (const [name, value] of Object.entries(committed)) {
      const expected = document[name];
      // Every key is compared, `images` included. Skipping it meant a tampered digest or source path
      // inside set.json was invisible to the gate: the bytes on disk were checked, the record of them was not.
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        findings.push(`${id}: committed set.json ${name} disagrees with the accepted target`);
      }
    }
    // An unexpected file in a generated directory is how a hand-written claim appears to be generated.
    const storeDir = join(root, STORE_DIR, id);
    const expectedFiles = new Set(['set.json', 'README.md', 'decisions.json']);
    for (const entry of readdirSync(storeDir)) {
      if (expectedFiles.has(entry) || entry === 'images') continue;
      findings.push(`${id}: unexpected file ${STORE_DIR}/${id}/${entry} - the store holds set.json, README.md, images/ and decisions.json only`);
    }
    for (const image of document.images) {
      const stored = join(root, STORE_DIR, id, 'images', image.name);
      if (!existsSync(stored)) {
        findings.push(`${id}: no stored copy of ${image.name}`);
        continue;
      }
      const bytes = readFileSync(stored);
      if (sha256(bytes) !== image.sha256) findings.push(`${id}: stored ${image.name} is not the accepted target's own bytes`);
    }
    const registered = committed.images ?? [];
    if (registered.length !== document.images.length) findings.push(`${id}: set.json lists ${registered.length} board(s), the target has ${document.images.length}`);
    if (!existsSync(join(storeDir, 'images'))) findings.push(`${id}: no images/ directory in the store`);
  }
  return { findings, documents };
}

export function writeRegister(root, documents) {
  const path = resolve(root, REGISTER_PATH);
  assertWritable(root, path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderRegister(documents));
  return path;
}

export function writeSets(root, sets) {
  for (const set of sets) {
    const problems = setProblems(set);
    if (problems.length > 0) throw new Error(`${set.archetype}: refusing to write an incomplete set — ${problems.join('; ')}`);
    const dir = join(root, STORE_DIR, set.archetype);
    const document = setDocument(set);
    mkdirSync(join(dir, 'images'), { recursive: true });
    const setPath = assertWritable(root, join(dir, 'set.json'));
    writeFileSync(setPath, `${JSON.stringify(document, null, 2)}\n`);
    for (const image of set.images) {
      const path = assertWritable(root, join(dir, 'images', image.name));
      writeFileSync(path, image.content);
    }
    writeFileSync(assertWritable(root, join(dir, 'README.md')), renderStoreReadme(document, problems));
  }
}

function parseArgs(argv) {
  const args = { write: false, register: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--write') args.write = true;
    else if (argv[i] === '--register') args.register = true;
    else if (argv[i] === '--only') args.only = argv[++i].split(',').map((id) => id.trim()).filter(Boolean);
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`build-archetype-assets: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error('usage: node scripts/build-archetype-assets.mjs [--write] [--register] [--only id,id]');
    process.exit(0);
  }
  const root = resolve('.');
  const targets = args.only ?? archetypeIds(root);
  const sets = buildAll(root, targets);
  if (args.write) writeSets(root, sets);
  for (const set of sets) {
    const problems = setProblems(set);
    console.log(`${set.archetype}: ${set.brand.distinct.length} brand candidate(s), ${Object.keys(set.tokens.colors).length} colour(s), ${Object.keys(set.copy).length} document(s), ${set.images.length} board(s)${problems.length > 0 ? ` — ${problems.length} problem(s)` : ''}`);
    for (const problem of problems) console.log(`  PROBLEM ${problem}`);
  }
  // The register is always written from ALL archetypes or not at all: rewriting it from a subset would
  // silently drop the other sets, which is how a register stops describing the tree it is named for.
  if (args.write || args.register) {
    const all = buildAll(root, archetypeIds(root));
    const { findings, documents } = inspectCommitted(root, archetypeIds(root));
    if (args.register && findings.length > 0) {
      console.error('build-archetype-assets: refusing to rewrite the register while the sets disagree with the target:');
      for (const finding of findings) console.error(`  ${finding}`);
      process.exit(1);
    }
    if (args.write && all.some((set) => setProblems(set).length > 0)) {
      console.error('build-archetype-assets: REFUSING to write the register: some sets are incomplete');
      process.exit(1);
    }
    const path = writeRegister(root, args.write ? all.map(setDocument) : documents);
    console.log(`register: wrote ${(args.write ? all : documents).length} set(s) to ${relative(root, path)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

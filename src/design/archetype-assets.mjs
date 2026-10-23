/**
 * Read an archetype's asset set out of the store, for a build that has to draw from it.
 *
 * The store (assets/archetypes/<archetype>/) is an extraction of that archetype's accepted target: the
 * brand, the palette and font stack, the copy slots, and the reference boards, each with a digest, plus
 * the rights that target carries. It exists so that "build the booking archetype" means one thing to
 * every model asked to build it. A build that cannot see the brand, the palette, the font stack, the
 * copy or the imagery cannot render the intended UI, and the failure then looks like a weak model
 * rather than a missing input.
 *
 * This module is the single reader. Two properties are deliberate:
 *
 *   - FAIL CLOSED. A missing store, an unknown archetype, an absent brand, empty tokens, no imagery, a
 *     missing rights record or a board whose bytes no longer match the register are all errors here, not
 *     defaults. A build that silently falls back to a generic palette is indistinguishable from one that
 *     was never given the set, which is the failure this module exists to prevent.
 *   - RIGHTS TRAVEL WITH THE SET. Every set in this store is excluded_from_training with
 *     approved_for_training: false (scripts/build-archetype-assets.mjs REQUIRES that - these are
 *     reference and conformance targets, not training data). `assertConsumable` refuses the training
 *     purpose outright, so a corpus builder cannot consume a set by forgetting to check.
 *
 * The set is NOT copied into a build: it is referenced. Copying the boards into every tree would add
 * ~6 MB per tree, and the corpus token counter reads every file as utf8 and counts its length, so a
 * 525 KB JPEG would be counted as ~525,000 source characters. A build records where its assets come
 * from and the harness resolves them from the store.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STORE_DIR = 'assets/archetypes';
// The store hangs off the repository root, which is two levels above this module. Deriving it here rather
// than defaulting to the process's cwd means a build reads the same store whether it was started from the
// repo root, from a project directory, or by the test runner.
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const SET_FILE = 'set.json';
export const DECISIONS_FILE = 'decisions.json';
export const ARCHETYPE_ID = /^[a-z][a-z0-9-]*$/;

/** Raised for every way a set can be unusable. Callers catch this and report it; they never guess. */
export class ArchetypeAssetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArchetypeAssetError';
  }
}

function require(condition, message) {
  if (!condition) throw new ArchetypeAssetError(message);
}

/** Where an archetype's set lives. Rejects an id that could escape the store before touching the disk. */
export function archetypeSetDir(archetype, { root = REPO_ROOT } = {}) {
  require(typeof archetype === 'string' && ARCHETYPE_ID.test(archetype), `'${archetype}' is not an archetype id`);
  return join(root, STORE_DIR, archetype);
}

function readJson(path, what) {
  require(existsSync(path), `${what} is missing at ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ArchetypeAssetError(`${what} at ${path} is not valid JSON: ${error.message}`);
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Does this archetype have an asset set in the store? The store, not a flag, is the source of truth. */
export function hasArchetypeSet(archetype, { root = REPO_ROOT } = {}) {
  return existsSync(join(archetypeSetDir(archetype, { root }), SET_FILE));
}

/**
 * A decision the store's own author recorded where the accepted target states more than one brand.
 *
 * `decisions.json` is the only hand-written file in the store, and its provenance is prose that states
 * PROVISIONAL in capitals when the value is a lane recommendation rather than an owner decision. That is why
 * this reads the marker rather than a field, and why the state it produces is reported to the caller instead
 * of being acted on quietly: a name Paul has not confirmed must not be presented as settled. Booking's brand
 * is confirmed - the owner kept both names ('we probably need both', mwg-train-4xg) - so its primary brand is
 * confirmed and its second brand is listed in `variants`. `check:archetype-assets` reads this file for the
 * primary brand and its variants, but not for the marker, so the marker is surfaced here rather than assumed.
 */
function readAdjudication(dir) {
  const path = join(dir, DECISIONS_FILE);
  if (!existsSync(path)) return { file: null, provisional: [], confirmed: [] };
  const doc = readJson(path, `the decision record for ${dir}`);
  const provisional = [];
  const confirmed = [];
  for (const [field, decision] of Object.entries(doc)) {
    if (field.startsWith('$') || typeof decision !== 'object' || decision === null) continue;
    const because = String(decision.because ?? '');
    if (/PROVISIONAL/.test(because)) provisional.push(field);
    else confirmed.push(field);
  }
  return { file: path, provisional, confirmed };
}

/**
 * Where a page title puts its site name, and what it puts there.
 *
 * Mirrors scripts/build-archetype-assets.mjs, deliberately: the builder and this reader have to agree about
 * where a title's brand claim sits, or a build renders a page the gate would have refused. The separator is
 * the ones the accepted targets use plus the ASCII hyphen, and the fragment after the last one is the brand
 * position, with a trailing parenthetical removed.
 */
const TITLE_BRAND_SEPARATOR = /\s+[—–·|-]\s+/;

function unescapeHtml(value) {
  return value
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function titleBrandPosition(title) {
  if (typeof title !== 'string') return '';
  const parts = unescapeHtml(title).split(TITLE_BRAND_SEPARATOR);
  if (parts.length < 2) return '';
  return parts[parts.length - 1].replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** The words a page states, lowercased, so a title fragment can be checked against the page's own text. */
function pageWords(texts) {
  const words = new Set();
  for (const text of Array.isArray(texts) ? texts : []) {
    if (typeof text !== 'string') continue;
    for (const word of text.toLowerCase().match(/[a-z0-9][a-z0-9'’.-]*/g) ?? []) words.add(word);
  }
  return words;
}

/**
 * The site name a copy slot's title puts in its brand position that the set does not support and the page
 * itself never uses, or null.
 *
 * Three accepted targets put a page description in that position ('Kiln & Copper - Ceramics & Kiln Parts
 * Catalogue', 'ARKHITECTS Studio - Request a consultation', 'Future Web 2026 - event registration visual
 * demo'), so a position that is not a supported identity is not automatically wrong: a description is the
 * page's own wording, and every capitalised word of it appears in the copy the page states. A name that
 * appears nowhere on the page - 'Northwind Studio' - is a site the set cannot identify.
 */
function unrecognisedTitleBrand(slot, supported) {
  const claim = titleBrandPosition(slot?.title);
  if (claim === '' || supported.includes(claim)) return null;
  const words = pageWords(slot?.strings);
  const unseen = (claim.match(/[A-Za-z][A-Za-z'’.-]*/g) ?? [])
    .filter((word) => /^[A-Z]/.test(word) && !words.has(word.toLowerCase()));
  return unseen.length === 0 ? null : claim;
}

/**
 * The brands one copy slot says its page renders, checked against the set's own identities.
 *
 * A page title states one brand or none. The builder refuses a title that names more than one brand, or one
 * the set does not support, so this repeats the same two rules: a build must never record a copy slot the
 * gate would have rejected, and a set whose copy names a second site is exactly how two builds of one
 * archetype come to look like two products. Returns the distinct names the slot states.
 */
function copySlotBrands({ archetype, page, slot, supported, brandless }) {
  const declared = slot?.brands;
  if (declared !== undefined) {
    require(Array.isArray(declared), `the copy slot for '${page}' of '${archetype}' lists its brands as something other than a list`);
  }
  const single = slot?.brand ?? null;
  if (single !== null) require(typeof single === 'string' && single.trim() !== '', `the copy slot for '${page}' of '${archetype}' records a brand that is not a name`);
  const stated = [...new Set([...(declared ?? []), ...(single === null ? [] : [single])])];
  for (const name of stated) {
    require(typeof name === 'string' && name.trim() !== '', `the copy slot for '${page}' of '${archetype}' records a brand that is not a name`);
  }
  // Ambiguity first: a slot naming two sites is unresolvable whatever the names are, and reporting an
  // unsupported name instead would point a reader at the wrong defect.
  require(
    stated.length <= 1,
    `the copy slot for '${page}' of '${archetype}' states more than one brand (${stated.map((name) => JSON.stringify(name)).join(' and ')}), so a build cannot tell which the page renders`,
  );
  for (const name of stated) {
    require(
      supported.includes(name),
      brandless
        ? `the copy slot for '${page}' of '${archetype}' states the brand ${JSON.stringify(name)}, but the set is brandless, so a build cannot tell which identity the page renders`
        : `the copy slot for '${page}' of '${archetype}' states the brand ${JSON.stringify(name)}, which is neither the set's brand nor one of its variants (${supported.join(', ')})`,
    );
  }
  // The title's own brand position, checked against the identities the set supports rather than against the
  // fields the slot records. A set.json that says `brand: null` while its title ends in a site name is the
  // record trusting itself: the builder refuses such a title, so a build must not render from one, and the
  // unknown name in the position is the content of the defect rather than the field being empty.
  if (slot?.apparatus !== true) {
    const claim = unrecognisedTitleBrand(slot, supported);
    require(
      claim === null,
      brandless
        ? `the copy slot for '${page}' of '${archetype}' puts ${JSON.stringify(claim)} in its title's brand position, but the set is brandless and the page never uses that name, so a build cannot tell which site the page belongs to`
        : `the copy slot for '${page}' of '${archetype}' puts ${JSON.stringify(claim)} in its title's brand position, which is neither a supported identity (${supported.join(', ')}) nor wording the page itself uses, so a build cannot tell which site the page belongs to`,
    );
  }
  return stated;
}

/**
 * Load one archetype's set.
 *
 * @param {string} archetype  the store's archetype id, e.g. 'booking'
 * @param {{root?: string, verifyImages?: boolean}} options  root is the repo root the store hangs off
 * @returns {object} the set, with a normalised brand, tokens, copy, image register and adjudication
 */
export function loadArchetypeSet(archetype, { root = REPO_ROOT, verifyImages = true } = {}) {
  const dir = archetypeSetDir(archetype, { root });
  const set = readJson(join(dir, SET_FILE), `the asset set for '${archetype}'`);
  require(set.archetype === archetype, `the asset set at ${dir} says its archetype is '${set.archetype}', not '${archetype}'`);

  const brand = set.brand ?? {};
  require(typeof brand === 'object' && brand !== null, `the asset set for '${archetype}' has no brand record`);
  // Brandless is a STATE, not a defect: account-recovery's accepted target has no brand of its own, and a
  // build that invented one would be the opposite of drawing from the set. Brandless with a name, or
  // named without one, is still an error - the two records would be contradicting each other.
  const brandless = brand.brandless === true;
  if (brandless) {
    require(
      brand.site_name == null || brand.site_name === '',
      `the asset set for '${archetype}' is marked brandless and still names a brand, so a build cannot tell which record to believe`,
    );
  } else {
    require(typeof brand.site_name === 'string' && brand.site_name.trim() !== '', `the asset set for '${archetype}' has no brand name`);
  }
  const mark = brand.mark?.value ?? null;
  if (mark !== null) {
    require(typeof mark === 'string' && /^\s*<svg[\s>]/.test(mark), `the mark recorded for '${archetype}' is not an inline svg fragment`);
  }
  // Brand identities the archetype keeps beside its primary one, declared in decisions.json and extracted
  // into the set. A build renders `site_name` by default; a build deliberately rendering a variant can see
  // that the name is supported instead of looking like it invented a second brand (booking: mwg-train-4xg).
  const variants = brand.variants ?? [];
  require(Array.isArray(variants), `the brand variants of '${archetype}' are not a list`);
  for (const variant of variants) {
    require(typeof variant === 'string' && variant.trim() !== '', `the asset set for '${archetype}' lists a brand variant with no name`);
  }
  // The builder's own consistency rules, mirrored here rather than trusted: a set that breaks one of them is
  // not a set it wrote, and a build must not render from a record the gate would have refused.
  require(
    !brandless || variants.length === 0,
    `the asset set for '${archetype}' is brandless and still lists the brand variant(s) ${variants.map((variant) => JSON.stringify(variant)).join(', ')}, so a build cannot tell which identity to render`,
  );
  if (!brandless) {
    require(
      !variants.includes(brand.site_name),
      `the asset set for '${archetype}' lists ${JSON.stringify(brand.site_name)} as both its brand and a supported variant, so a build cannot tell which record to render`,
    );
  }
  // The identities a build may render: the primary brand, then the variants that coexist with it.
  const supportedBrands = brandless ? [] : [brand.site_name, ...variants];

  const tokens = set.tokens ?? {};
  for (const group of ['colors', 'fonts']) {
    require(
      typeof tokens[group] === 'object' && tokens[group] !== null && Object.keys(tokens[group]).length > 0,
      `the asset set for '${archetype}' declares no ${group}`,
    );
  }
  // Two of the five targets record their only font stack under the key ':root' rather than under a custom
  // property name, because the extractor keys it by the selector it found the declaration in. Normalised
  // here, once: a declaration `:root: system-ui, ...` is not CSS, and every consumer would otherwise have
  // to repeat the special case. The original key is kept so the normalisation is inspectable.
  const fonts = {};
  const fontSourceKeys = {};
  for (const [key, value] of Object.entries(tokens.fonts)) {
    require(typeof value === 'string' && value.trim() !== '', `the font entry '${key}' of '${archetype}' has no value`);
    const name = key.startsWith('--') ? key : '--font-sans';
    require(!(name in fonts), `'${archetype}' records two font stacks under ${name}, so a build cannot tell which to use`);
    fonts[name] = value;
    fontSourceKeys[name] = key;
  }

  const copy = set.copy ?? {};
  const copySlots = Object.entries(copy).map(([page, slot]) => {
    const brands = copySlotBrands({ archetype, page, slot, supported: supportedBrands, brandless });
    return {
      page,
      title: typeof slot?.title === 'string' ? slot.title : null,
      // The brand this page states in its own title, checked against the set's own identities: null when the
      // title names none, and every name it states in `brands` so a caller can see what was checked.
      brand: brands.length === 1 ? brands[0] : null,
      brands,
      strings: Array.isArray(slot?.strings) ? slot.strings.length : 0,
      sha256: typeof slot?.sha256 === 'string' ? slot.sha256 : null,
      apparatus: slot?.apparatus === true,
    };
  });
  require(copySlots.length > 0, `the asset set for '${archetype}' has no copy slots`);

  const images = set.images;
  require(Array.isArray(images) && images.length > 0, `the asset set for '${archetype}' lists no imagery`);
  const register = images.map((image) => {
    require(typeof image?.name === 'string' && image.name !== '', `an image in the asset set for '${archetype}' has no name`);
    require(typeof image?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(image.sha256), `the image '${image.name}' of '${archetype}' has no usable digest`);
    const source = image.source ?? null;
    require(source, `the image '${image.name}' of '${archetype}' records no source path, so a build cannot be given its bytes`);
    const path = join(root, source);
    require(existsSync(path), `the image '${image.name}' of '${archetype}' is not at ${source}`);
    if (verifyImages) {
      const actual = sha256File(path);
      require(
        actual === image.sha256,
        `the image '${image.name}' of '${archetype}' is ${actual.slice(0, 12)} on disk but the register says ${image.sha256.slice(0, 12)}`,
      );
    }
    return { name: image.name, sha256: image.sha256, bytes: image.bytes ?? null, source, store_path: `${STORE_DIR}/${archetype}/${image.name}` };
  });

  const rights = set.rights ?? {};
  require(typeof rights === 'object' && rights !== null && Object.keys(rights).length > 0, `the asset set for '${archetype}' has no rights record`);
  require(typeof rights.excluded_from_training === 'boolean', `the rights of '${archetype}' do not say whether it may be used for training`);

  return {
    archetype,
    dir,
    brand: {
      state: brandless ? 'brandless' : 'named',
      name: brandless ? null : brand.site_name,
      variants,
      mark,
      // A mark that pulls a symbol in from the target's own page (<use href="#mark-studio">) is still
      // recorded, but it is not self-contained: emitting it into a different document renders nothing.
      mark_self_contained: mark !== null && !/<use\b[^>]*href="#/.test(mark),
      candidates: Array.isArray(brand.candidates) ? brand.candidates.length : 0,
    },
    tokens: { colors: tokens.colors, fonts, font_source_keys: fontSourceKeys, source: tokens.source ?? null },
    copy: copySlots,
    images: register,
    rights,
    adjudication: readAdjudication(dir),
  };
}

/**
 * Refuse a set for a purpose its rights do not allow.
 *
 * The purpose is named rather than inferred on purpose: 'training' means the bytes or the text reach a
 * model's training data, and every set in this store is excluded from that. A build, a harness run or an
 * evaluation is a different purpose ('build'), and the rights of those are the target's own.
 */
export function assertConsumable(set, { purpose }) {
  require(purpose === 'build' || purpose === 'training', `unknown consumption purpose '${purpose}'`);
  if (purpose === 'training') {
    require(
      set.rights.excluded_from_training !== true && set.rights.approved_for_training === true,
      `the '${set.archetype}' asset set may not be consumed for training: excluded_from_training=${set.rights.excluded_from_training}, approved_for_training=${set.rights.approved_for_training}`,
    );
  }
  return set;
}

/**
 * The palette the arm's own stylesheet works in, derived from the archetype's tokens.
 *
 * Each target names its tokens in its own vocabulary - booking has --accent and --text-primary, while
 * contact-lead has --action and --danger - so the lookup is by role and checked against the set rather
 * than assumed. Nothing is invented: a role with no token in the set stays absent, and the caller's
 * fallback is the pre-store value, which keeps a set that grows a new vocabulary from silently changing
 * an arm's appearance.
 */
const ROLE_TOKENS = {
  // The five targets name the same roles in three different vocabularies - booking has --bg-page and
  // --text-primary, account-recovery and event-registration have --page and --text, contact-lead and
  // catalogue have --action where the others have --accent - so the chain covers the names that are
  // actually in the store, and a role with no match stays absent rather than silently becoming the
  // pilot's blue.
  fg: ['--text-primary', '--text', '--fg', '--text-body'],
  bg: ['--bg-page', '--page', '--bg', '--surface-page'],
  accent: ['--accent', '--action', '--brand-accent'],
  error: ['--error', '--danger', '--error-text'],
  fontStack: ['--font-sans', '--font-body', '--font-stack'],
  surfaceInput: ['--surface-input', '--field', '--surface-control', '--input-surface'],
};

export function tokenFor(set, role) {
  const names = ROLE_TOKENS[role];
  require(names, `'${role}' is not a palette role this module knows`);
  for (const name of names) {
    if (typeof set.tokens.colors?.[name] === 'string') return { name, value: set.tokens.colors[name] };
    if (typeof set.tokens.fonts?.[name] === 'string') return { name, value: set.tokens.fonts[name] };
  }
  return null;
}

/** The role-to-token mapping, as a value, so a caller (or a test) can assert what was derived. */
export function derivePalette(set) {
  const derived = {};
  for (const role of Object.keys(ROLE_TOKENS)) derived[role] = tokenFor(set, role);
  return derived;
}

/**
 * The card's design tokens as CSS custom-property declarations.
 *
 * Emitted verbatim and in the set's own order, so the build carries the target's palette and font stack
 * rather than a paraphrase of them. `light-dark()` values are only meaningful with a color-scheme, which
 * is why the caller's :root block keeps one.
 */
export function renderTokenDeclarations(set, { indent = '  ' } = {}) {
  const lines = [];
  for (const [name, value] of Object.entries(set.tokens.colors)) {
    require(typeof value === 'string' && value.trim() !== '', `the token ${name} of '${set.archetype}' has no value`);
    lines.push(`${indent}${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(set.tokens.fonts)) lines.push(`${indent}${name}: ${value};`);
  return lines.join('\n');
}

/**
 * The brand a build carries: the archetype's own name and mark, or an explicit 'this target has none'.
 *
 * A build renders the primary brand unless it asks for a supported variant, and what it asked for is
 * returned as `variant` so the build can record which identity it rendered instead of that being inferred
 * from a page. A name the set does not support is refused: rendering a brand the store never recorded is
 * the drift this module exists to prevent, and a variant is only supported because a decision says so. The
 * adjudication state travels with the brand too. A name that is still a lane recommendation is usable
 * evidence for a build but it must not be presented as settled, so a consumer that records what it built can
 * record that as well. Booking's brand is settled and dual: 'Evening Class Studio' is primary and
 * 'Learning Hub' a supported variant (owner decision, mwg-train-4xg).
 */
export function brandFor(set, { variant = null } = {}) {
  const supported = set.brand.variants ?? [];
  if (variant !== null) {
    require(typeof variant === 'string' && variant.trim() !== '', `a brand variant must be a name, not ${JSON.stringify(variant)}`);
    require(set.brand.state === 'named', `the '${set.archetype}' asset set is brandless, so it has no ${JSON.stringify(variant)} variant to render`);
    require(
      variant === set.brand.name || supported.includes(variant),
      `'${variant}' is not a brand variant of '${set.archetype}'; it supports ${[set.brand.name, ...supported].map((name) => JSON.stringify(name)).join(', ')}`,
    );
  }
  return {
    state: set.brand.state,
    name: variant ?? set.brand.name,
    variant,
    supported_variants: supported,
    mark: set.brand.mark_self_contained ? set.brand.mark : null,
    mark_recorded_not_self_contained: set.brand.mark !== null && !set.brand.mark_self_contained,
    provisional: set.adjudication.provisional.includes('brand'),
  };
}

/** The imagery register a build records: names and digests, never the bytes. */
export function imageRegister(set) {
  return set.images.map(({ name, sha256, store_path }) => ({ name, sha256, store_path }));
}

/**
 * The whole set, as the build's spec records it. Digest-bearing, byte-free, and explicit about rights.
 *
 * `variant` selects which supported brand identity the build rendered; it is recorded, with the identities
 * the set supports, so a spec says which brand its pages carry rather than leaving a reader to guess. Those
 * two keys appear only on a build that chose a variant: a build that renders the primary brand keeps the
 * spec it always had, and the pilot corpus keeps the tree hashes it recorded.
 */
export function assetManifest(set, { variant = null } = {}) {
  const palette = derivePalette(set);
  const brand = brandFor(set, { variant });
  return {
    archetype: set.archetype,
    store: `${STORE_DIR}/${set.archetype}`,
    // The mark itself is not copied into the manifest: it is an svg fragment, and a spec is not the
    // place for it. What a reader needs is whether the build has one.
    brand: {
      state: brand.state,
      name: brand.name,
      ...(brand.variant === null ? {} : { variant: brand.variant, supported_variants: brand.supported_variants }),
      mark: brand.mark !== null,
      mark_recorded_not_self_contained: brand.mark_recorded_not_self_contained,
      provisional: brand.provisional,
    },
    tokens: {
      colors: Object.keys(set.tokens.colors).length,
      fonts: Object.keys(set.tokens.fonts).length,
      derived: Object.fromEntries(Object.entries(palette).map(([role, hit]) => [role, hit?.name ?? null])),
    },
    copy: set.copy.map(({ page, title }) => ({ page, title })),
    images: imageRegister(set),
    rights: set.rights,
  };
}

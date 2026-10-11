/**
 * The pilot's framework axis, and the project builder.
 *
 * Paul, 2026-10-08: framework diversity is a first-class axis - "usage of raw web platform, react and
 * many new frameworks". The pilot covers seven rendering idioms over the same five archetypes:
 *
 *   raw    - semantic HTML and platform APIs, no framework at all. This is the interesting control:
 *            much of what MWG is about (modern elements, form design, cookies, transitions) is
 *            exactly what a framework either does for you or hides.
 *   react  - React 19, server-rendered, tagged-template markup via htm (no bundler, so the pilot
 *            needs no build step per project)
 *   preact - a second React-family runtime, same component shape, different engine
 *   vue    - Vue 3 with its runtime template compiler, server-rendered
 *   hono   - Hono 4, server-rendered HTML strings, no virtual DOM
 *   webcomponents - the platform's own component model: custom elements + shadow DOM, no build and no
 *            dependency, wrapping the same server-rendered tree
 *   svelte - Svelte 5, server-rendered. The one arm with a build step; the compile boundary is named
 *            in src/corpus/svelte.mjs and crossed by the scaffolder and by the uplift tool, never at
 *            request time
 *
 * Every arm renders the page server-side and enhances it with one plain-JS script, because the point
 * of the pilot is the *server journey*: a client-only arm would make the persistence test meaningless.
 *
 * The generator takes a defect list, so an original with a known MWG gap is produced from the same
 * code that produces a clean one - and the uplift tool is measured against the gap it was given.
 *
 * This module deliberately does **not** import the archetype table. It holds the rendering templates
 * and knows how to build a project from an archetype *object* (`buildProjectFor`); the id-to-archetype
 * lookup lives in `pilot/projects.mjs`, which is the join between the two. That split is what lets a
 * durable specification rebuild a project where the archetype table is gone: the templates and the
 * builder are still here, and the specification supplies the archetype.
 */
import { A11Y_SCRIPT } from '../src/corpus/uplift.mjs';
import { compileSvelteServer } from '../src/corpus/svelte.mjs';
import { assertConsumable, assetManifest, derivePalette, renderTokenDeclarations } from '../src/design/archetype-assets.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GENERATOR_DEFECT_TOKENS } from '../src/eval/defects.mjs';

const slug = (value) => value.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

// The reference of the record an edit-flow form edits. A parameterised write route
// (/subscriptions/:id/edit) is an UPDATE of an existing record, so the server seeds one under this
// reference and the form's action substitutes it for the route's :param - the literal ':id' must
// never reach a browser (mwg-train-q7v). Literal write paths (every pilot route) emit neither.
const EDIT_SEED_REF = 'current';

/** The form's id comes from the journey's selector, so the markup and the journey cannot drift apart. */
const formIdOf = (archetype) => archetype.journey.formSelector.replace(/^form#/, '');

export const FRAMEWORKS = {
  // Hono is the non-virtual-DOM modern arm: it routes on the server and its `hono/html` templates are
  // tagged template literals that produce HTML strings. That matters for this pilot - there is no
  // compile step and no virtual DOM, so the markup a browser receives is the markup in the file, and
  // the deterministic uplift tool can edit it exactly as it edits the raw arm.
  hono: { name: 'hono', version: '4.9.12', dialect: 'html', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', serverFile: 'server.mjs', family: 'hono' },
  raw: { name: 'raw', version: 'platform (no framework)', dialect: 'html', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', serverFile: 'server.mjs', family: 'raw-web-platform' },
  react: { name: 'react', version: '19.2.0', dialect: 'react', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', serverFile: 'server.mjs', family: 'react' },
  preact: { name: 'preact', version: '10.27.2', dialect: 'preact', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', serverFile: 'server.mjs', family: 'react-family' },
  vue: { name: 'vue', version: '3.5.22', dialect: 'vue', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', serverFile: 'server.mjs', family: 'vue' },
  // The two arms added for R3. `webcomponents` has no dependency at all: custom elements ship with the
  // platform, so it is the same no-build, editable-markup shape as `raw`. `svelte` is the one arm with
  // a compile step - `markupFile` is the template a person edits, `compiledFile` is the build output,
  // and the server imports the whole build output through `app/page.mjs`.
  webcomponents: { name: 'webcomponents', version: 'platform (custom elements + shadow DOM)', dialect: 'html', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', serverFile: 'server.mjs', family: 'web-components' },
  svelte: { name: 'svelte', version: '5.57.2', dialect: 'html', markupFile: 'app/page.svelte', compiledFile: 'app/page.compiled.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', serverFile: 'server.mjs', family: 'svelte' },
};

/** Field markup. Attributes come from the archetype, and the defects decide which are left out. */
function fieldMarkup(field, { defects }) {
  // A field is required, and linked to its error text, unless the project is seeded with the defect or
  // the field is one the user may leave empty. Keeping these in one place is what makes a project with
  // no seeded defects genuinely clean: the first version emitted the error text without the attribute
  // that points at it, so the "clean" arm was not clean and the uplift scored a fix there.
  const required = !defects.includes('no-required') && !field.optional;
  const req = required ? ' required' : '';
  const aria = required ? ` aria-errormessage="${field.slug}-error"` : '';
  const autofillBlocked =
    defects.includes('no-autofill') ||
    (field.autocomplete === 'street-address' && defects.includes('no-autofill-address')) ||
    (field.autocomplete === 'postal-code' && defects.includes('no-autofill-address'));
  const auto = field.autocomplete && !autofillBlocked ? ` autocomplete="${field.autocomplete}"` : '';

  // A number field with a declared lower bound carries `min`, unless the project is seeded with the
  // accept-invalid-amount defect (negative/non-numeric amounts are then accepted). The control's label
  // is emitted unless the project is seeded with the no-field-labels defect. Both are training-only
  // tokens the pilot never passes, so its output is byte-identical either way.
  const label = defects.includes('no-field-labels') && field.type !== 'select' ? '' : `      <label for="${field.slug}">${field.label}</label>\n`;
  const min = field.min !== undefined && !defects.includes('accept-invalid-amount') ? ` min="${field.min}"` : '';
  // A number field that declares a `step` carries it, so a decimal requirement (a measured value or a
  // currency amount) is accepted by the browser instead of tripping the implicit step=1 constraint.
  // Gated on the declaration exactly like `min`: the pilot declares neither, so its output is unchanged.
  // Unlike `min`, step is not part of accept-invalid-amount (that defect only concerns the lower bound),
  // so a repair family that accepts invalid amounts still accepts a valid decimal step.
  const step = field.step !== undefined ? ` step="${field.step}"` : '';

  if (field.type === 'textarea') {
    return `${label}      <textarea id="${field.slug}" name="${field.name}"${req}${aria}${auto}></textarea>`;
  }
  if (field.type === 'select') {
    const options = (field.options ?? []).map((option) => `        <option value="${option}">${option}</option>`).join('\n');
    return `${label}      <select id="${field.slug}" name="${field.name}"${req}${aria}>
${options}
      </select>`;
  }
  const extra = field.type === 'search' || field.type === 'number' ? ` inputmode="${field.type === 'number' ? 'numeric' : 'search'}"` : '';
  return `${label}      <input type="${field.type}" id="${field.slug}" name="${field.name}"${req}${aria}${auto}${extra}${min}${step}>`;
}

/**
 * The error text for a field, emitted immediately after its control.
 *
 * It used to be collected into a separate `.errors` block at the end of the form. The CSS that reveals
 * it uses a sibling combinator, so with that structure the message could never be shown - the uplift
 * added the attribute and the text and the field still reported nothing. Beside the field is also where
 * the guidance puts it.
 */
const errorText = (field, { defects }) =>
  defects.includes('no-required') || field.optional ? '' : `      <p id="${field.slug}-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in ${field.label.toLowerCase()}.</p>`;

/**
 * A field and the error text it points at, as one unit. The two forms drifted apart once already:
 * the second form emitted aria-errormessage without the element it names, which made a project with no
 * seeded defects fail a rule and gave the uplift an edit to make on the clean control. Rendering the
 * pair in one place is what keeps that from being possible again.
 */
const fieldWithError = (field, { defects }) => `${fieldMarkup(field, { defects })}\n${errorText(field, { defects })}`;

/** A second form for an archetype with a second action (the catalogue's cart). */
function extraFormMarkup(archetype, { defects }) {
  const spec = archetype.extraForm;
  const hidden = Object.entries(spec.hidden ?? {})
    .map(([name, value]) => `      <input type="hidden" name="${name}" value="${value}">`)
    .join('\n');
  const fields = archetype.fields
    .filter((field) => spec.fields.includes(field.slug))
    .map((field) => fieldWithError(field, { defects }))
    .join('\n');
  return `    <form id="${spec.id}" method="${spec.method}" action="${spec.action}">
${hidden}
${fields}
      <button type="submit">${spec.submit}</button>
    </form>`;
}
function formMarkup(archetype, { defects }) {
  const writePath = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write')).path;
  const form = archetype.form ?? { method: 'post', action: writePath };
  // A parameterised write route is an edit flow: the form posts to the seeded record, with the
  // seed's reference standing in for each :param. Literal write paths keep their action verbatim.
  // A local, not a mutation: an archetype object must be reusable across builds unchanged.
  const action = /:[A-Za-z0-9_]+/.test(writePath) ? form.action.replace(/:[A-Za-z0-9_]+/g, EDIT_SEED_REF) : form.action;
  const chosen = form.fields ? archetype.fields.filter((field) => form.fields.includes(field.slug)) : archetype.fields;
  const fields = chosen
    .map((field) => fieldWithError(field, { defects }))
    .join('\n')
    .replace(/\n{2,}/g, '\n');
  const extra = archetype.extraForm
    ? '\n' + extraFormMarkup(archetype, { defects })
    : '';
  const live = defects.includes('no-aria-sync') ? '' : '      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>\n';
  return `    <form id="${formIdOf(archetype)}" method="${form.method}" action="${action}">
${live}      <div class="field">
${fields}
      </div>
      <button type="submit">Submit</button>
    </form>${extra}`;
}

function echoMarkup(archetype) {
  return `      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="${archetype.echo.field}" data-echo-source="${archetype.echo.source ?? 'record'}" data-echo-param="${archetype.echo.param ?? ''}"></div>
      </section>`;
}

/** The page body, per framework dialect. The markup is HTML-like in all four, which is deliberate:
 *  the uplift tool edits markup, and a dialect it cannot read is a dialect it cannot uplift. */
/**
 * htm is a generic tagged-template parser, not an HTML parser: it has no idea that `input` is a void
 * element, so an unclosed `<input>` swallows every following sibling as children. React then refuses
 * to render the object those children became, and Preact renders "input" plus loose text. Void tags are
 * therefore self-closed in the two JSX arms - the same markup, written in the dialect's own spelling.
 */
const VOID_TAGS = ['input', 'link', 'meta', 'br', 'hr', 'img', 'source'];
const selfCloseVoids = (markup) =>
  markup
    .replace(new RegExp(`<(${VOID_TAGS.join('|')})((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'g'), '<$1$2 />')
    .replace(/ \/>/g, ' />');

/**
 * The JS a generated server needs to serve its archetype's boards out of the store.
 *
 * The boards are NOT copied into the tree: they are megabytes each, every generated tree is hashed and
 * token-counted, and the token counter reads every file as utf8 - so a copy would be both a large
 * duplicate and a source-character figure that means nothing. The server therefore resolves a board from
 * the store at request time and serves it only when its bytes still hash to the digest the register
 * recorded, so "this build is using the target's imagery" stays a checkable claim rather than a comment.
 *
 * The store is found by walking up from the tree, not by an absolute path: an absolute path baked into a
 * generated file would put this machine into the tree hash. The walk is bounded and the failure is a 404,
 * because a build with no store must serve nothing rather than something plausible.
 *
 * A no-set build emits nothing here, so its server stays byte-identical and its tree hash does not move.
 */
function assetRuntime(set) {
  if (!set) return '';
  const digests = Object.fromEntries(set.images.map((image) => [image.name, image.sha256]));
  return `const ASSET_STORE = ${JSON.stringify(`assets/archetypes/${set.archetype}`)};
const ASSET_DIGESTS = ${JSON.stringify(digests)};
const ASSET_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
function decodeAssetName(raw) {
  // Never throws: a malformed percent-escape (GET /app/%zz) used to raise a URIError out of the request handler
  // and take the server process down with it. An empty string fails the name pattern below, so the request 404s
  // the same way an unregistered board does.
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

function readArchetypeAsset(name) {
  // A name that is not a plain board filename is refused first. The register lookup below would refuse it too,
  // but this is what keeps a name carrying %, / or .. away from both the filesystem and the register.
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return null;
  if (!Object.hasOwn(ASSET_DIGESTS, name)) return null;
  let dir = here;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, ASSET_STORE, 'images', name);
    if (existsSync(candidate)) {
      const body = readFileSync(candidate);
      if (createHash('sha256').update(body).digest('hex') !== ASSET_DIGESTS[name]) return null;
      return { body, type: ASSET_TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream' };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
`;
}

/** The primary board a build shows, and the phrase it is described by. */
function referenceBoardMarkup(set) {
  if (!set || set.images.length === 0) return '';
  const board = set.images[0];
  return `<figure class="reference-board">
        <img src="/app/${board.name}" alt="Reference board for ${escapeHtml(set.archetype)}" width="1280" height="900" loading="lazy" decoding="async">
        <figcaption>Reference board for ${escapeHtml(set.archetype)}</figcaption>
      </figure>`;
}

function pageSource(archetype, { defects, framework, set = null }) {
  // The brand line is built conditionally rather than interpolated as an empty string: an arm with no
  // brand must produce byte-identical markup to before the store existed, and a bare `${''}` leaves a
  // whitespace-only line behind, which is a different tree hash for every recorded project.
  const brand = brandMarkup(set);
  const board = referenceBoardMarkup(set);
  const rawBody = `
${brand === '' ? '' : `      ${brand}\n`}      <h1>${archetype.title}</h1>
      <p>${archetype.story}</p>
${board === '' ? '' : `      ${board}\n`}${formMarkup(archetype, { defects })}
${echoMarkup(archetype)}`;
  // The web-components arm renders the same tree as the raw arm and wraps the record section in a
  // custom element. Wrapping rather than replacing is deliberate: the server-rendered children stay in
  // the light DOM, so the markup the browser receives is still the markup the conformance signature
  // and every other tool reads, and the shadow root carries encapsulation rather than the content.
  const body =
    framework.name === 'react' || framework.name === 'preact'
      ? selfCloseVoids(rawBody)
      : framework.name === 'webcomponents'
        ? rawBody.replace(echoMarkup(archetype), `<record-echo>${echoMarkup(archetype)}</record-echo>`)
        : rawBody;
  if (framework.name === 'raw' || framework.name === 'webcomponents') {
    return `export async function renderPage(data = {}) {
  return \`${body}\`;
}

export async function renderDocument({ title = '${archetype.title}', data = {} } = {}) {
  const body = await renderPage(data);
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>\${body}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>\`;
}
`;
  }
  if (framework.name === 'hono') {
    return `import { html } from 'hono/html';

// One tagged template for the page body, exposed two ways so the route handler can hand Hono a full
// document and the tests can read the body alone.
const body = html\`${body}\`;

export async function renderPage() {
  return body.toString();
}

export async function renderDocument({ title = '${archetype.title}' } = {}) {
  return html\`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>\${body}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>\`.toString();
}
`;
  }
  if (framework.name === 'react' || framework.name === 'preact') {
    const importLine =
      framework.name === 'react'
        ? `import { html } from 'htm/react';\nimport { renderToStaticMarkup } from 'react-dom/server';`
        : `import { html } from 'htm/preact';\nimport { renderToString } from 'preact-render-to-string';`;
    const render = framework.name === 'react' ? 'renderToStaticMarkup' : 'renderToString';
    return `${importLine}

function Page() {
  return html\`${body}\`;
}

export async function renderPage() {
  return ${render}(html\`<\${Page} />\`);
}

export async function renderDocument({ title = '${archetype.title}' } = {}) {
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>\${await renderPage()}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>\`;
}
`;
  }
  if (framework.name === 'svelte') {
    // The component template. Svelte compiles it, but the template itself is plain HTML-like markup -
    // deliberate, because the uplift tool edits markup and a dialect it cannot read is a dialect it
    // cannot uplift. The compile boundary is crossed by the scaffolder and the uplift tool, not here.
    return `${body}\n`;
  }
  // vue: runtime template compiler, no build step
  return `import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const template = \`${body}\`;

export async function renderPage(data = {}) {
  const app = createSSRApp({ template, data: () => ({ ...data }) });
  return renderToString(app);
}

export async function renderDocument({ title = '${archetype.title}', data = {} } = {}) {
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>\${await renderPage(data)}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>\`;
}
`;
}

/**
 * The archetype's brand, as the page's own header.
 *
 * This is the store's brand, not one the template invented: the name and (when the target's mark is
 * self-contained) its svg. A brandless archetype renders NOTHING here rather than a made-up name - the
 * accepted target for account-recovery has no brand of its own, and "every build for this archetype
 * carries no brand" is a property worth being able to assert. The store's path is recorded on the
 * element so a reader can tell where the value came from without opening the spec.
 */
function brandMarkup(set) {
  if (!set || set.brand.state !== 'named') return '';
  const mark = set.brand.mark_self_contained ? `<span class="brand-mark" aria-hidden="true">${set.brand.mark}</span>\n      ` : '';
  return `<header class="brand" data-asset-store="assets/archetypes/${set.archetype}">
        ${mark}<span class="brand-name">${escapeHtml(set.brand.name)}</span>
      </header>`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stylesSource({ defects, framework, set = null }) {
  // A caller with no asset set gets the pre-store stylesheet, byte for byte. That is not nostalgia:
  // the training corpus records the tree hash of every generated project, and its 210 trees must not
  // move because a different consumer gained the archetype's palette. `assets` is likewise omitted from
  // such a spec rather than null, for the same reason. Every caller that IS given a set (the pilot) uses
  // the emission below.
  if (!set) return pilotPaletteStyles({ defects, framework });
  const eager = defects.includes('eager-invalid');
  // The palette and the font stack are the archetype's own when a set is supplied: the store's tokens are
  // emitted verbatim (they are already CSS custom properties, several of them light-dark()), and the
  // arm's own variables are aliases of the ones its roles resolve to. The lookup is by role because each
  // target names its tokens its own way - booking has --accent, contact-lead has --action - so the alias
  // is built from the name the set actually declares rather than from a hardcoded chain, which would fall
  // back to the pilot palette the moment the vocabulary differed. That fallback is the old behaviour and
  // is kept for a caller that supplies no set.
  const palette = set ? derivePalette(set) : null;
  const ref = (role, fallback) => (palette?.[role] ? `var(${palette[role].name})` : fallback);
  const root = set
    ? `:root {\n  color-scheme: light dark;\n${renderTokenDeclarations(set)}\n  --arm-fg: ${ref('fg', '#16181d')};\n  --arm-bg: ${ref('bg', '#ffffff')};\n  --arm-accent: ${ref('accent', '#1b4fd8')};\n  --arm-error: ${ref('error', '#b3261e')};\n}`
    : ':root { color-scheme: light dark; --arm-fg: #16181d; --arm-bg: #ffffff; --arm-accent: #1b4fd8; --arm-error: #b3261e; }';
  const dark = '';
  return `/* ${framework.name} arm. Responsive first, light and dark, with visible focus. */
${root}
* { box-sizing: border-box; }
body { margin: 0; padding: 1.5rem; font-family: ${ref('fontStack', 'system-ui, sans-serif')}; font-size: 16px; line-height: 1.5; color: var(--arm-fg); background: var(--arm-bg); }
main { max-width: 42rem; margin: 0 auto; }
header.brand { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.brand-mark { display: inline-flex; color: var(--arm-accent); }
.brand-name { font-weight: 700; letter-spacing: 0.01em; }
figure.reference-board { margin: 0 0 1.25rem; }
figure.reference-board img { display: block; width: 100%; height: auto; border: 1px solid var(--border-subtle, #cbd5e1); border-radius: 0.5rem; }
figure.reference-board figcaption { color: var(--text-muted, #64748b); font-size: 0.8125rem; margin-top: 0.35rem; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
.field { display: grid; gap: 0.25rem; margin-bottom: 1rem; }
label { font-weight: 600; }
input, textarea, select { font: inherit; padding: 0.6rem; border: 1px solid #8a8f98; border-radius: 0.4rem; width: 100%; }
input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid var(--arm-accent); outline-offset: 2px; }
button { font: inherit; padding: 0.7rem 1.1rem; border-radius: 0.4rem; border: 0; background: var(--arm-accent); color: white; }
.error-msg { display: none; color: var(--arm-error); font-size: 0.875rem; margin: 0.15rem 0 0; }
.form-status { min-height: 1.25rem; }
/* ${eager ? 'DEFECT: eager :invalid styling reports errors before the user has interacted.' : 'Only a field the user has actually left empty is reported.'} */
input${eager ? ':invalid' : ':user-invalid'}, textarea${eager ? ':invalid' : ':user-invalid'} { border-color: var(--arm-error); background-color: #fdecea; }
input${eager ? ':invalid' : ':user-invalid'} ~ .error-msg, textarea${eager ? ':invalid' : ':user-invalid'} ~ .error-msg { display: block; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; border-bottom: 1px solid #d5d8dd; padding: 0.4rem 0.3rem; }
@media (width <= 30rem) { body { padding: 1rem; } h1 { font-size: 1.35rem; } }${dark}
`;
}

/**
 * The stylesheet a build with no archetype asset set gets, unchanged since before the store existed.
 *
 * FROZEN - do not edit. pilot/TRAINING_CORPUS.json records the tree hash of all 210 of these projects,
 * and docs/train/corpus/tokens.json measures them, so an edit here invalidates a committed corpus and
 * the browser evidence that goes with it. A build that is given a set uses the emitter above; this one
 * is what "no set supplied" has always produced.
 */
function pilotPaletteStyles({ defects, framework }) {
  const eager = defects.includes('eager-invalid');
  return `/* ${framework.name} arm. Responsive first, light and dark, with visible focus. */
:root { color-scheme: light dark; --fg: #16181d; --bg: #ffffff; --accent: #1b4fd8; }
* { box-sizing: border-box; }
body { margin: 0; padding: 1.5rem; font: 16px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
main { max-width: 42rem; margin: 0 auto; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
.field { display: grid; gap: 0.25rem; margin-bottom: 1rem; }
label { font-weight: 600; }
input, textarea, select { font: inherit; padding: 0.6rem; border: 1px solid #8a8f98; border-radius: 0.4rem; width: 100%; }
input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
button { font: inherit; padding: 0.7rem 1.1rem; border-radius: 0.4rem; border: 0; background: var(--accent); color: white; }
.error-msg { display: none; color: #b3261e; font-size: 0.875rem; margin: 0.15rem 0 0; }
.form-status { min-height: 1.25rem; }
/* ${eager ? 'DEFECT: eager :invalid styling reports errors before the user has interacted.' : 'Only a field the user has actually left empty is reported.'} */
input${eager ? ':invalid' : ':user-invalid'}, textarea${eager ? ':invalid' : ':user-invalid'} { border-color: #b3261e; background-color: #fdecea; }
input${eager ? ':invalid' : ':user-invalid'} ~ .error-msg, textarea${eager ? ':invalid' : ':user-invalid'} ~ .error-msg { display: block; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; border-bottom: 1px solid #d5d8dd; padding: 0.4rem 0.3rem; }
@media (width <= 30rem) { body { padding: 1rem; } h1 { font-size: 1.35rem; } }
@media (prefers-color-scheme: dark) { :root { --fg: #eef0f4; --bg: #14161a; } input, textarea, select { background: #1b1e24; color: var(--fg); } }
`;
}

/**
 * The custom element the web-components arm defines.
 *
 * Shadow DOM is used for what it is for - style encapsulation for the component's own box - and a
 * <slot> keeps the server-rendered children in the page. A shadow root that swallowed the content
 * would make the arm's markup unreadable to the conformance signature, the a11y script and the uplift
 * tool all at once, which would measure the harness rather than the arm.
 *
 * The style is built with DOM calls rather than `innerHTML`, even though the string is a constant: the
 * arm's security property is read from the source (does this file assign live HTML anywhere?), and a
 * literal `innerHTML` in the clean baseline reads as a defect the project does not have.
 */
const WC_SCRIPT = `
// Web Components: the record section is a custom element, defined here with the platform's own APIs.
// No build step and no dependency; if the element never upgrades, the rendered markup still works.
class RecordEcho extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{display:block}';
    root.append(style, document.createElement('slot'));
  }
}
if (!customElements.get('record-echo')) customElements.define('record-echo', RecordEcho);
`;

function enhanceSource(archetype, { defects, framework }) {
  const unsafe = defects.includes('xss-innerhtml');
  // The clean baseline is the *same* script the uplift tool injects, imported rather than retyped:
  // when the two drifted, a project with no seeded defect still failed the announcement rule.
  const a11y = defects.includes('no-aria-sync')
    ? '// DEFECT: no aria-invalid synchronisation, so the error state exists only visually.'
    : A11Y_SCRIPT;

  // Training-only: a premature-submit defect. `form.submit()` bypasses the browser's own validation,
  // so an Enter press sends the form before the required choices are made. The pilot never passes this
  // token, so its enhance script is unchanged.
  const enterSubmit = defects.includes('enter-submits')
    ? `
// DEFECT (enter-submits): Enter in any field submits the form immediately, before required choices
// are made. form.submit() skips the browser's own validation, so an incomplete form is sent early.
for (const field of document.querySelectorAll('form input, form textarea, form select')) {
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      field.form?.submit();
    }
  });
}
`
    : '';

  const insertion = (indent) => {
    const pad = ' '.repeat(indent);
    const marker = `${pad}// The insertion ran with this value: the marker is what distinguishes "sanitised the payload\n${pad}// away" from "never touched the container", which the check must not confuse.\n${pad}container.dataset.echoInserted = String(value.length);`;
    return unsafe
      ? `${pad}// DEFECT: user-supplied text inserted as live HTML.\n${pad}container.innerHTML = value;\n${marker}`
      : `${pad}// MWG security/sanitize-untrusted-html: user-supplied markup is parsed as inert content.\n${pad}// TODO(baseline/element.sethtml): drop the textContent fallback and call setHTML directly.\n${pad}if (typeof container.setHTML === 'function') container.setHTML(value);\n${pad}else container.textContent = value;\n${marker}`;
  };
  // One branch, chosen at generation time. The first version emitted both and guarded the record path
  // with a top-level `return`, which is a syntax error in a module - so no project echoed anything and
  // the persistence assertion failed for all twenty-five. A generated script has to be valid for the
  // source it was generated for.
  const source = archetype.echo.source ?? 'record';
  const body =
    source === 'query'
      ? `const container = document.getElementById('record-echo');
if (container) {
  // The value this project reflects is the user's query, which the server rendered into the URL.
  const value = new URLSearchParams(location.search).get(container.dataset.echoParam) ?? '';
${insertion(2)}
}`
      : source === 'session'
      ? `const container = document.getElementById('record-echo');
if (container) {
  // The value comes from the session the server issued, so this is a session journey rather than a
  // record-reference journey - a third shape the pilot covers on purpose.
  const response = await fetch('/api/me');
  if (response.ok) {
    const data = await response.json();
    const value = data[container.dataset.echoField] ?? '';
${insertion(4)}
  }
}`
      : `const container = document.getElementById('record-echo');
const ref = location.pathname.split('/').filter(Boolean).pop();
if (container && ref) {
  const response = await fetch(\`/api/record/\${encodeURIComponent(ref)}\`);
  if (response.ok) {
    const data = await response.json();
    const value = data[container.dataset.echoField] ?? '';
${insertion(4)}
  }
}`;
  const searchEnhance = archetype.journey?.search
    ? `
const searchContainer = document.getElementById(${JSON.stringify(archetype.journey.search.resultsSelector.replace(/^#/, ''))});
if (searchContainer) {
  const query = new URLSearchParams(location.search).get(${JSON.stringify(archetype.journey.search.queryParam)}) ?? '';
  const searchInput = document.querySelector(\`input[name="\${${JSON.stringify(archetype.journey.search.queryParam)}}"]\`);
  if (searchInput && query) searchInput.value = query;
  const res = await fetch('/api/records?q=' + encodeURIComponent(query));
  if (res.ok) {
    const records = await res.json();
    while (searchContainer.firstChild) searchContainer.removeChild(searchContainer.firstChild);
    if (records.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-results';
      empty.textContent = 'No matching records found';
      searchContainer.appendChild(empty);
    } else {
      for (const rec of records) {
        const item = document.createElement('div');
        item.setAttribute('data-ref', rec.ref);
        item.textContent = Object.values(rec).join(' ');
        searchContainer.appendChild(item);
      }
    }
  }
}`
    : '';

  const updateEnhance = archetype.journey?.update
    ? `
const editForm = document.querySelector('form[action*="/edit/"]');
const refForEdit = location.pathname.split('/').filter(Boolean).pop();
if (editForm && refForEdit) {
  editForm.action = '/edit/' + encodeURIComponent(refForEdit);
  const editInput = editForm.querySelector(\`[name="\${${JSON.stringify(archetype.journey.update.field)}}"]\`);
  if (editInput) {
    const editRes = await fetch(\`/api/record/\${encodeURIComponent(refForEdit)}\`);
    if (editRes.ok) {
      const editRecord = await editRes.json();
      if (editRecord[${JSON.stringify(archetype.journey.update.field)}] !== undefined) {
        editInput.value = editRecord[${JSON.stringify(archetype.journey.update.field)}];
      }
    }
  }
}`
    : '';

  return `// Progressive enhancement for the ${archetype.id} flow: one plain script for every arm.
${a11y}
${enterSubmit}
${body}${searchEnhance}${updateEnhance}${gameEnhance(archetype)}
${framework?.name === 'webcomponents' ? WC_SCRIPT : ''}`;
}

/**
 * The session tables and statements, emitted only for a session-backed archetype.
 *
 * Built from quoted strings rather than a nested template literal, so the generated code needs no
 * escaping of its own - a nested backtick here is a syntax error in the generator.
 */
const sessionTables = (archetype) =>
  archetype.session
    ? [
        "db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, ref TEXT NOT NULL, created_at TEXT NOT NULL)');",
        "const insertSession = db.prepare('INSERT INTO sessions (sid, ref, created_at) VALUES (?, ?, ?)');",
        "const selectSession = db.prepare('SELECT ref FROM sessions WHERE sid = ?');",
      ].join('\n')
    : '';

/**
 * The drafts table, statements, and prefill helper, emitted only when multi-step journey is declared.
 *
 * Built from quoted strings rather than a nested template literal, matching sessionTables.
 */
const draftTables = (archetype) =>
  archetype.journey?.steps
    ? [
        "db.exec('CREATE TABLE IF NOT EXISTS drafts (sid TEXT, name TEXT, value TEXT, PRIMARY KEY (sid, name))');",
        "const insertDraft = db.prepare('INSERT OR REPLACE INTO drafts (sid, name, value) VALUES (?, ?, ?)');",
        "const selectDrafts = db.prepare('SELECT name, value FROM drafts WHERE sid = ?');",
        "const escDraft = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');",
        "const escRegex = (str) => String(str).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');",
        "function prefillDrafts(doc, draftRows) {",
        "  let result = doc;",
        "  for (const { name, value } of draftRows) {",
        "    const val = String(value ?? '');",
        "    const escapedVal = escDraft(val);",
        "    const inputRegex = new RegExp('(<input\\\\b(?=[^>]*\\\\bname=[\"\\']' + escRegex(name) + '[\"\\'])[^>]*>)', 'gi');",
        "    result = result.replace(inputRegex, (match) => {",
        "      if (/\\btype=[\"\\']?(?:hidden|submit|button|reset|image)[\"\\']?/i.test(match)) return match;",
        "      if (/\\bvalue=/i.test(match)) {",
        "        return match.replace(/\\bvalue=([\"\\']).*?\\1/i, 'value=\"' + escapedVal + '\"');",
        "      }",
        "      return match.replace(/\\s*(\\/?>)$/, ' value=\"' + escapedVal + '\"$1');",
        "    });",
        "    const textareaRegex = new RegExp('(<textarea\\\\b(?=[^>]*\\\\bname=[\"\\']' + escRegex(name) + '[\"\\'])[^>]*>)[\\s\\S]*?(<\\/textarea>)', 'gi');",
        "    result = result.replace(textareaRegex, '$1' + escapedVal + '$2');",
        "    const selectRegex = new RegExp('(<select\\\\b(?=[^>]*\\\\bname=[\"\\']' + escRegex(name) + '[\"\\'])[^>]*>)([\\s\\S]*?)(<\\/select>)', 'gi');",
        "    result = result.replace(selectRegex, (match, openTag, optionsHtml, closeTag) => {",
        "      let cleanOptions = optionsHtml.replace(/\\s+\\bselected\\b(=([\"\\'])selected\\2)?/gi, '');",
        "      let matched = false;",
        "      cleanOptions = cleanOptions.replace(/(<option\\b[^>]*>)([\\s\\S]*?)(<\\/option>)/gi, (optMatch, optOpen, optText, optClose) => {",
        "        if (matched) return optMatch;",
        "        const valAttrMatch = optOpen.match(/\\bvalue=([\"\\'])(.*?)\\1/i);",
        "        const optVal = valAttrMatch ? valAttrMatch[2] : optText.trim();",
        "        if (optVal === val || optVal === escapedVal) {",
        "          matched = true;",
        "          return optOpen.replace(/\\s*(\\/?>)$/, ' selected$1') + optText + optClose;",
        "        }",
        "        return optMatch;",
        "      });",
        "      return openTag + cleanOptions + closeTag;",
        "    });",
        "  }",
        "  return result;",
        "}",
      ].join('\n')
    : '';

function stepPageDocument(step, index, steps, archetype) {
  const nextPath = index < steps.length - 1 ? steps[index + 1].path : archetype.journey.startPath;
  const controls = [];
  for (const selector of Object.keys(step.fill ?? {})) {
    const name = selector.match(/name=["']?([^\]"']+)["']?/)?.[1] ?? '';
    const field = archetype.fields.find((f) => f.name === name);
    const label = field?.label ?? name;
    const type = field?.type ?? 'text';
    controls.push(`      <div class="field">
        <label for="step-${name}">${label}</label>
        <input type="${type}" id="step-${name}" name="${name}">
      </div>`);
  }
  for (const [selector, option] of Object.entries(step.select ?? {})) {
    const name = selector.match(/name=["']?([^\]"']+)["']?/)?.[1] ?? '';
    const field = archetype.fields.find((f) => f.name === name);
    const label = field?.label ?? name;
    const options = field?.options ?? [option];
    const opts = options.map((opt) => `          <option value="${opt}">${opt}</option>`).join('\n');
    controls.push(`      <div class="field">
        <label for="step-${name}">${label}</label>
        <select id="step-${name}" name="${name}">
${opts}
        </select>
      </div>`);
  }
  let submitAttr = '';
  if (step.submit) {
    const idMatch = step.submit.match(/#([A-Za-z0-9_-]+)/);
    const classMatch = step.submit.match(/\.([A-Za-z0-9_-]+)/);
    if (idMatch) submitAttr += ` id="${idMatch[1]}"`;
    if (classMatch) submitAttr += ` class="${classMatch[1]}"`;
  }
  const hasControls = controls.length > 0;
  const formHtml = hasControls
    ? `      <form method="post" action="/draft?next=${encodeURIComponent(nextPath)}">
${controls.join('\n')}
        <button type="submit"${submitAttr}>Continue</button>
      </form>`
    : `      <form method="get" action="${nextPath}">
        <button type="submit"${submitAttr}>Continue</button>
      </form>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Step ${index + 1}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>
      <h1>Step ${index + 1}</h1>
      \${carriedHtml}
${formHtml}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>`;
}

function searchPageDocument(search) {
  const containerId = search.resultsSelector.replace(/^#/, '');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Search</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>
      <h1>Search</h1>
      <form method="get" action="${search.path}">
        <label for="${search.queryParam}">Search</label>
        <input id="${search.queryParam}" name="${search.queryParam}" value="\${query.replace(/"/g, '&quot;')}">
        <button type="submit">Search</button>
      </form>
      <div id="${containerId}"></div>
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>`;
}
/*
 * The functional-route capabilities (mwg-train-37a): list pages, a detail page, and account
 * login/logout. Every block below is emitted ONLY when the archetype's spec opts in
 * (`capabilities` / `seed_accounts`); a spec that declares none of them regenerates byte-identically,
 * which is the hard gate on the 35 frozen pilot trees. The fragments are built from quoted strings,
 * like sessionTables, so the generated code needs no escaping of its own.
 */

const capabilitiesOf = (archetype) => ({ list_pages: false, detail_page: false, auth: false, cart: false, pricing_tiers: false, checkout: false, survey: false, game: false, workspace: false, ...(archetype.capabilities ?? {}) });

/*
 * The pricing-tiers capability (mwg-train-4lk): three tiers across a monthly/annual toggle, whose
 * inclusions differ by more than price, and a selection that survives into the next step. The prices
 * are COMPUTED from one source - each tier's monthly figure and the annual policy - so the annual
 * column and the saving cannot drift from the monthly column, which is what "computed rather than
 * restated" means here. Opt-in, like the other capabilities, so no existing tree moves.
 */
const pricingOf = (archetype) => archetype.pricingTiers ?? null;

/** The pricing capability's derived arithmetic and its three pages, dialect-independent. */
const pricingPages = (archetype) => {
  const pricing = pricingOf(archetype);
  return [
    `const PRICING = ${JSON.stringify(pricing)};`,
    "const pricingMoney = (amount) => esc(PRICING.currency) + ' ' + (Number.isInteger(amount) ? String(amount) : amount.toFixed(2));",
    'const pricingAnnual = (monthly) => monthly * PRICING.annual_months;',
    'const pricingSaving = (monthly) => monthly * 12 - pricingAnnual(monthly);',
    'const pricingPrice = (tier, period) => (period === \'annual\' ? pricingAnnual(tier.monthly) : tier.monthly);',
    'const pricingPage = (period) => {',
    '  const priceSuffix = period === \'annual\' ? \'per year\' : \'per month\';',
    "  const cards = PRICING.tiers.map((tier, index) => '<section aria-labelledby=\"tier-' + index + '\">' + '<h2 id=\"tier-' + index + '\">' + esc(tier.name) + '</h2>' + (tier.recommended ? '<p class=\"recommendation\">Recommended</p>' : '') + '<p id=\"price-' + index + '\" class=\"price\">' + pricingMoney(pricingPrice(tier, period)) + ' ' + priceSuffix + '</p>' + (period === 'annual' && pricingSaving(tier.monthly) > 0 ? '<p id=\"saving-' + index + '\" class=\"saving\">Saves ' + pricingMoney(pricingSaving(tier.monthly)) + ' a year</p>' : '') + '<ul>' + tier.features.map((feature) => '<li>' + esc(feature) + '</li>').join('') + '</ul>' + '<form method=\"post\" action=\"/pricing/select\">' + '<input type=\"hidden\" name=\"tier\" value=\"' + esc(tier.name) + '\">' + '<input type=\"hidden\" name=\"period\" value=\"' + period + '\">' + '<button type=\"submit\">Choose ' + esc(tier.name) + '</button>' + '</form>' + '</section>').join('');",
    "  const toggle = '<nav class=\"billing-period\">' + '<a href=\"/pricing?period=monthly\"' + (period === 'monthly' ? ' aria-current=\"page\"' : '') + '>Monthly</a> ' + '<a href=\"/pricing?period=annual\"' + (period === 'annual' ? ' aria-current=\"page\"' : '') + '>Annual</a>' + '</nav>';",
    "  const features = [...new Set(PRICING.tiers.flatMap((tier) => tier.features))];",
    "  const comparison = '<table><caption>What each tier includes</caption><thead><tr><th scope=\"col\">Feature</th>' + PRICING.tiers.map((tier) => '<th scope=\"col\">' + esc(tier.name) + '</th>').join('') + '</tr></thead><tbody>' + features.map((feature) => '<tr><th scope=\"row\">' + esc(feature) + '</th>' + PRICING.tiers.map((tier) => '<td>' + (tier.features.includes(feature) ? 'Included' : 'Not included') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';",
    "  return capabilityPage('Pricing', '<h1>Pricing</h1>' + toggle + '<p id=\"billing-period\">Showing ' + period + ' prices</p>' + cards + comparison);",
    '};',
    // The same shared-reference guard as the checkout receipt: a product's reference must not render a
    // confirmation page that reads fields the row does not have (mwg-train-le6 review, P1 class).
    'const pricingChoice = (row) => {',
    '  try {',
    "    const value = JSON.parse(row.payload);",
    "    return value !== null && typeof value === 'object' && typeof value.tier === 'string' && typeof value.period === 'string' ? value : null;",
    '  } catch {',
    '    return null;',
    '  }',
    '};',
    'const pricingConfirmationPage = (choice) => {',
    "  return capabilityPage('Your plan', '<h1>Your plan</h1>' + '<dl>' + '<dt>Billing period</dt><dd id=\"chosen-period\">' + esc(choice.period) + '</dd>' + '<dt>Tier</dt><dd id=\"chosen-tier\">' + esc(choice.tier) + '</dd>' + '<dt>Price</dt><dd id=\"chosen-price\">' + esc(choice.price) + '</dd>' + '</dl>');",
    '};',
  ].join('\n');
};

/** The pricing routes, raw arm: the tiers page, the selection write, and the confirmation read. */
const rawPricingRoutes = () =>
  [
    "  if (path === '/pricing' && request.method === 'GET') {",
    "    const pricingPeriod = url.searchParams.get('period') === 'annual' ? 'annual' : 'monthly';",
    '    return html(response, pricingPage(pricingPeriod));',
    '  }',
    "  if (path === '/pricing/select' && request.method === 'POST') {",
    '    const pricingBody = await parseBody(request);',
    '    const pricingTier = PRICING.tiers.find((tier) => tier.name === String(pricingBody.tier ?? \'\'));',
    '    if (!pricingTier) {',
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Choose one of the tiers this page lists.');",
    '    }',
    "    const pricingPeriod = String(pricingBody.period ?? '') === 'annual' ? 'annual' : 'monthly';",
    '    const pricingRef = randomUUID().slice(0, 8);',
    "    insert.run(pricingRef, new Date().toISOString(), JSON.stringify({ tier: pricingTier.name, period: pricingPeriod, price: pricingMoney(pricingPrice(pricingTier, pricingPeriod)) }));",
    "    response.writeHead(303, { location: '/pricing/' + pricingRef });",
    '    return response.end();',
    '  }',
    '  const pricingMatch = path.match(/^\\/pricing\\/([^/]+)$/);',
    "  if (pricingMatch && request.method === 'GET') {",
    '    const pricingRow = select.get(pricingMatch[1]);',
    '    if (!pricingRow) {',
    "      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('We could not find that selection.');",
    '    }',
    '    const pricingValue = pricingRow ? pricingChoice(pricingRow) : null;',
    '    if (!pricingValue) {',
    "      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('We could not find that selection.');",
    '    }',
    '    return html(response, pricingConfirmationPage(pricingValue));',
    '  }',
  ].join('\n');

/** The pricing routes, hono arm: the same three, in Hono's routing. */
const honoPricingRoutes = () =>
  [
    "app.get('/pricing', (c) => {",
    "  const pricingPeriod = c.req.query('period') === 'annual' ? 'annual' : 'monthly';",
    '  return c.html(pricingPage(pricingPeriod));',
    '});',
    "app.post('/pricing/select', async (c) => {",
    '  const pricingBody = await c.req.parseBody();',
    '  const pricingTier = PRICING.tiers.find((tier) => tier.name === String(pricingBody.tier ?? \'\'));',
    "  if (!pricingTier) return c.text('Choose one of the tiers this page lists.', 422);",
    "  const pricingPeriod = String(pricingBody.period ?? '') === 'annual' ? 'annual' : 'monthly';",
    '  const pricingRef = randomUUID().slice(0, 8);',
    "  insert.run(pricingRef, new Date().toISOString(), JSON.stringify({ tier: pricingTier.name, period: pricingPeriod, price: pricingMoney(pricingPrice(pricingTier, pricingPeriod)) }));",
    "  return c.redirect('/pricing/' + pricingRef, 303);",
    '});',
    "app.get('/pricing/:ref', (c) => {",
    "  const pricingRow = select.get(c.req.param('ref'));",
    "  if (!pricingRow) return c.text('We could not find that selection.', 404);",
    '  const pricingValue = pricingRow ? pricingChoice(pricingRow) : null;',
    "  if (!pricingValue) return c.text('We could not find that selection.', 404);",
    '  return c.html(pricingConfirmationPage(pricingValue));',
    '});',
  ].join('\n');

/*
 * The cart capability (mwg-train-11d): a storefront cart the visitor BUILDS across pages, with a
 * variant choice that is written with the record. The engine's session store cannot express it -
 * `drafts` is keyed (sid, name), so a second add overwrites the first - so the cart owns a multi-row
 * table and is emitted only when the spec opts in, exactly like list_pages/detail_page/auth.
 */
const cartVariantField = (archetype) => archetype.fields.find((field) => field.type === 'select');
const gameOf = (archetype) => (archetype.capabilities?.game === true ? archetype.game : null);
const cartQuantityField = (archetype) => archetype.fields.find((field) => field.type === 'number');
/** The checkout policy block, or null when the capability is off - the flag and the data travel together. */
const checkoutOf = (archetype) => (archetype.capabilities?.checkout === true ? archetype.checkout : null);
/** The survey policy block, or null when the capability is off - the flag and the data travel together. */
const surveyOf = (archetype) => (archetype.capabilities?.survey === true ? archetype.survey : null);
const workspaceOf = (archetype) => (archetype.capabilities?.workspace === true ? archetype.workspace : null);
const CART_SID_RAW =
  "(request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('sid='))?.slice('sid='.length)";
const CART_SID_HONO =
  "(c.req.header('cookie') ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('sid='))?.slice('sid='.length)";

/** One row per ADDED item, so adding a second product accumulates instead of overwriting the first. */
const cartTables = (checkout = false) =>
  checkout
    ? [
        // The unit price is captured when the item is added, in integer minor units, so a receipt can be
        // re-read later and still add up even if the product record changes afterwards (mwg-train-le6).
        "db.exec('CREATE TABLE IF NOT EXISTS cart_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, ref TEXT NOT NULL, variant TEXT NOT NULL, qty INTEGER NOT NULL, unit_price_minor INTEGER NOT NULL, created_at TEXT NOT NULL)');",
        "const insertCartItem = db.prepare('INSERT INTO cart_items (sid, ref, variant, qty, unit_price_minor, created_at) VALUES (?, ?, ?, ?, ?, ?)');",
        "const selectCartItems = db.prepare('SELECT id, ref, variant, qty, unit_price_minor FROM cart_items WHERE sid = ? ORDER BY id');",
      ].join('\n')
    : [
        "db.exec('CREATE TABLE IF NOT EXISTS cart_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, ref TEXT NOT NULL, variant TEXT NOT NULL, qty INTEGER NOT NULL, created_at TEXT NOT NULL)');",
        "const insertCartItem = db.prepare('INSERT INTO cart_items (sid, ref, variant, qty, created_at) VALUES (?, ?, ?, ?, ?)');",
        "const selectCartItems = db.prepare('SELECT id, ref, variant, qty FROM cart_items WHERE sid = ? ORDER BY id');",
      ].join('\n');

/** The cart's two pages: the product page carrying the variant choice, and the accumulated cart. */
const cartPages = (archetype) => {
  const variant = cartVariantField(archetype);
  const quantity = cartQuantityField(archetype);
  return [
    `const cartProductPage = (row) => capabilityPage('Product ' + row.ref, '<h1>Product ' + esc(row.ref) + '</h1>' + '<form id="add-to-cart" method="post" action="/cart/add">' + '<input type="hidden" name="ref" value="' + esc(row.ref) + '">' + '<label for="${variant.name}">${variant.label}</label>' + '<select id="${variant.name}" name="${variant.name}" required>' + ${JSON.stringify(variant.options ?? [])}.map((option) => '<option value="' + esc(option) + '">' + esc(option) + '</option>').join('') + '</select>' + '<label for="${quantity.name}">${quantity.label}</label>' + '<input id="${quantity.name}" name="${quantity.name}" type="number" min="1" value="1" required>' + '<button type="submit">Add to cart</button>' + '</form>')`,
    "const cartPage = (rows) => capabilityPage('Your cart', '<h1>Your cart</h1>' + (rows.length === 0 ? '<p id=\"cart-empty\">Your cart is empty.</p>' : '<ul id=\"cart-lines\">' + rows.map((row) => '<li data-ref=\"' + esc(row.ref) + '\" data-variant=\"' + esc(row.variant) + '\">' + esc(row.ref) + ' - ' + esc(row.variant) + ' x ' + esc(row.qty) + '</li>').join('') + '</ul>') + '<p id=\"cart-summary\">' + rows.length + ' line(s), ' + rows.reduce((total, row) => total + Number(row.qty), 0) + ' item(s)</p>')",
  ].join('\n');
};

/** The cart routes, raw arm: add an item (creating the visitor's sid), then read the accumulated cart. */
const rawCartRoutes = (archetype, cookieFlags, checkout = null) => {
  const variant = cartVariantField(archetype);
  const quantity = cartQuantityField(archetype);
  // A checkout is arithmetic over the cart's lines, so the line has to carry the price it was added at.
  // The price comes from the product record's own declared field, in integer minor units (mwg-train-le6).
  const price = checkout
    ? [
        `    const cartRecord = select.get(cartRef);`,
        `    const cartPriceValue = cartRecord ? JSON.parse(cartRecord.payload)[${JSON.stringify(checkout.price_field)}] : undefined;`,
        // `Number('')` and `Number(null)` are both 0, so a blank or null price would be stored as a free
        // item rather than refused: the raw value is checked before it is coerced (mwg-train-le6 review,
        // P2 and its P3 note - a row can carry JSON null, which is not the same as an absent key).
        `    const cartUnitPrice = cartPriceValue === undefined || cartPriceValue === null || String(cartPriceValue).trim() === '' ? NaN : Number(cartPriceValue);`,
        `    if (!Number.isInteger(cartUnitPrice) || cartUnitPrice < 0) {`,
        `      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });`,
        `      return response.end('That item has no price to check out with.');`,
        `    }`,
      ].join('\n')
    : '';
  return [
    "  if (path === '/cart' && request.method === 'GET') {",
    `    const cartSid = ${CART_SID_RAW};`,
    '    return html(response, cartPage(cartSid ? selectCartItems.all(cartSid) : []));',
    '  }',
    "  if (path === '/cart/add' && request.method === 'POST') {",
    '    const cartBody = await parseBody(request);',
    "    const cartRef = String(cartBody.ref ?? '').trim();",
    `    const cartVariant = String(cartBody[${JSON.stringify(variant.name)}] ?? '').trim();`,
    // The form marks both required, but a POST is not the form: an item with no product or no variant
    // would be stored and then rendered as an empty line (mwg-train-11d review).
    "    if (cartRef === '' || cartVariant === '') {",
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('An item needs a product and a variant.');",
    '    }',
    // `||`, not `??`: a browser can send `sid=` with an empty value, and `??` would accept that empty
    // string as the visitor's sid. The rows would then be stored under it while the read side treats an
    // empty sid as absent, so the cart would silently lose everything it had just accepted.
    `    const cartSid = ${CART_SID_RAW} || randomUUID();`,
    `    const cartQuantity = Math.max(1, Number.parseInt(String(cartBody[${JSON.stringify(quantity.name)}] ?? '1'), 10) || 1);`,
    price ? `${price}` : '',
    `    insertCartItem.run(cartSid, cartRef, cartVariant, cartQuantity${checkout ? ', cartUnitPrice' : ''}, new Date().toISOString());`,
    `    response.writeHead(303, { location: '/cart', 'set-cookie': 'sid=' + cartSid + '; ${cookieFlags}' });`,
    '    return response.end();',
    '  }',
  ].join('\n');
};

/** The cart routes, hono arm: the same two routes, in Hono's routing. */
const honoCartRoutes = (archetype, cookieFlags, checkout = null) => {
  const variant = cartVariantField(archetype);
  const quantity = cartQuantityField(archetype);
  const price = checkout
    ? [
        `  const cartRecord = select.get(cartRef);`,
        `  const cartPriceValue = cartRecord ? JSON.parse(cartRecord.payload)[${JSON.stringify(checkout.price_field)}] : undefined;`,
        `  const cartUnitPrice = cartPriceValue === undefined || cartPriceValue === null || String(cartPriceValue).trim() === '' ? NaN : Number(cartPriceValue);`,
        `  if (!Number.isInteger(cartUnitPrice) || cartUnitPrice < 0) return c.text('That item has no price to check out with.', 422);`,
      ].join('\n')
    : '';
  return [
    "app.get('/cart', (c) => {",
    `  const cartSid = ${CART_SID_HONO};`,
    '  return c.html(cartPage(cartSid ? selectCartItems.all(cartSid) : []));',
    '});',
    "app.post('/cart/add', async (c) => {",
    '  const cartBody = await c.req.parseBody();',
    "  const cartRef = String(cartBody.ref ?? '').trim();",
    `  const cartVariant = String(cartBody[${JSON.stringify(variant.name)}] ?? '').trim();`,
    "  if (cartRef === '' || cartVariant === '') return c.text('An item needs a product and a variant.', 422);",
    // See rawCartRoutes: an empty `sid=` cookie must not become the key rows are stored under.
    `  const cartSid = ${CART_SID_HONO} || randomUUID();`,
    `  const cartQuantity = Math.max(1, Number.parseInt(String(cartBody[${JSON.stringify(quantity.name)}] ?? '1'), 10) || 1);`,
    // The price is read BEFORE the insert that stores it: the other arm had this inverted and the
    // generated server failed on the first add with a temporal-dead-zone ReferenceError (mwg-train-le6).
    price ? `${price}` : '',
    `  insertCartItem.run(cartSid, cartRef, cartVariant, cartQuantity${checkout ? ', cartUnitPrice' : ''}, new Date().toISOString());`,
    `  c.header('set-cookie', 'sid=' + cartSid + '; ${cookieFlags}');`,
    "  return c.redirect('/cart', 303);",
    '});',
  ].join('\n');
};
/** The survey capability's statements: the answers one visitor has given so far, and nothing else. */
const surveyTables = () =>
  [
    "db.exec('CREATE TABLE IF NOT EXISTS survey_answers (sid TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (sid, name))');",
    "const insertSurveyAnswer = db.prepare('INSERT OR REPLACE INTO survey_answers (sid, name, value) VALUES (?, ?, ?)');",
    "const selectSurveyAnswers = db.prepare('SELECT name, value FROM survey_answers WHERE sid = ? ORDER BY rowid');",
    "const deleteSurveyAnswers = db.prepare('DELETE FROM survey_answers WHERE sid = ?');",
  ].join('\n');

/**
 * The survey pages and the branching rule: a question is asked only when its own condition is met by the
 * answers already given, a hidden question's stored answer is ignored everywhere (so changing an earlier
 * answer changes what the result is derived from), the visitor reviews the answers and can go back to
 * change any one of them, and the outcome is derived from the VISIBLE answers and recorded, so it can be
 * read back later (mwg-train-s0q).
 */
const surveyPages = (archetype) => {
  const survey = surveyOf(archetype);
  return [
    `const SURVEY = ${JSON.stringify(survey)};`,
    // The questions carry the FLOW (a field name and the condition it waits for); the control the visitor
    // actually sees is the declared field, so its label, type and options are emitted alongside.
    `const SURVEY_FIELDS = ${JSON.stringify(Object.fromEntries(survey.questions.map((question) => [question.field, (archetype.fields ?? []).find((field) => field.name === question.field) ?? {}])))};`,
    "const surveyQuestion = (name) => SURVEY.questions.find((question) => question.field === name) ?? null;",
    "const surveyAnswer = (answers, name) => answers.find((answer) => answer.name === name)?.value;",
    "const surveySatisfied = (when, answers) => {",
    "  const value = surveyAnswer(answers, when.field);",
    // An unanswered question cannot satisfy a condition: the question that depends on it is not asked.
    "  if (value === undefined) return false;",
    "  if (when.equals !== undefined) return value === String(when.equals);",
    "  if (Array.isArray(when.in)) return when.in.map(String).includes(value);",
    "  const numeric = Number(value);",
    "  if (!Number.isFinite(numeric)) return false;",
    "  if (when.at_most !== undefined) return numeric <= when.at_most;",
    "  if (when.at_least !== undefined) return numeric >= when.at_least;",
    "  return false;",
    "};",
    "const surveyVisible = (question, answers) => question.when === undefined || surveySatisfied(question.when, answers);",
    // Walking the questions in order is the point: a question is judged against the answers given to the
    // questions BEFORE it, and only a visible question's answer joins that set. A hidden question's
    // stale answer therefore cannot satisfy a condition further down - which is what makes changing an
    // earlier answer change the outcome rather than leave a phantom answer behind (mwg-train-s0q).
    "const surveyAsked = (answers) => {",
    "  const considered = [];",
    "  const asked = [];",
    "  for (const question of SURVEY.questions) {",
    "    if (question.when !== undefined && !surveySatisfied(question.when, considered)) continue;",
    "    asked.push(question);",
    "    considered.push({ name: question.field, value: surveyAnswer(answers, question.field) });",
    "  }",
    "  return asked;",
    "};",
    "const surveyNext = (answers) => surveyAsked(answers).find((question) => surveyAnswer(answers, question.field) === undefined) ?? null;",
    "const surveyOutcome = (answers) => {",
    "  const asked = surveyAsked(answers);",
    // The bands are evaluated against the answers that were ASKED, not against everything the visitor
    // once typed: an answer to a question the branch has since hidden must not decide the outcome.
    "  const considered = asked.map((question) => ({ name: question.field, value: surveyAnswer(answers, question.field) }));",
    "  const band = SURVEY.bands.find((entry) => entry.when === undefined || surveySatisfied(entry.when, considered)) ?? null;",
    "  return { outcome: band ? band.name : null, answers: considered.map((entry) => ({ field: entry.name, value: entry.value })) };",
    "};",
    "const surveyControl = (field, current) => {",
    "  const label = '<label for=\"answer\">' + esc(field.label ?? field.name) + '</label>';",
    "  if (field.type === 'select') return label + '<select id=\"answer\" name=\"answer\" required>' + (field.options ?? []).map((option) => '<option value=\"' + esc(option) + '\"' + (option === current ? ' selected' : '') + '>' + esc(option) + '</option>').join('') + '</select>';",
    "  if (field.type === 'textarea') return label + '<textarea id=\"answer\" name=\"answer\" required>' + esc(current ?? '') + '</textarea>';",
    "  const type = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text';",
    "  return label + '<input id=\"answer\" name=\"answer\" type=\"' + type + '\" value=\"' + esc(current ?? '') + '\" required>';",
    "};",
    "const surveyQuestionPage = (question, current, fromReview) => {",
    "  const definition = SURVEY_FIELDS[question.field] ?? { name: question.field };",
    "  return capabilityPage('Survey', '<h1>' + esc(SURVEY.title) + '</h1><p id=\"survey-progress\">Question ' + (surveyFlowIndex(question) + 1) + ' of ' + SURVEY.questions.length + '</p><form method=\"post\" action=\"/survey/answer\"><input type=\"hidden\" name=\"field\" value=\"' + esc(question.field) + '\"><input type=\"hidden\" name=\"from\" value=\"' + (fromReview ? 'review' : 'flow') + '\">' + surveyControl(definition, current) + '<button type=\"submit\">' + (fromReview ? 'Save and return to the review' : 'Next') + '</button></form>');",
    "};",
    "const surveyFlowIndex = (question) => SURVEY.questions.indexOf(question);",
    "const surveyReviewPage = (answers) => {",
    "  const asked = surveyAsked(answers);",
    "  const skipped = SURVEY.questions.filter((question) => !asked.includes(question));",
    "  const rows = asked.map((question) => '<li data-field=\"' + esc(question.field) + '\"><span class=\"answer\">' + esc(surveyAnswer(answers, question.field) ?? '') + '</span> <a href=\"/survey?question=' + encodeURIComponent(question.field) + '\">Change ' + esc(question.field) + '</a></li>').join('');",
    "  const notAsked = skipped.length === 0 ? '' : '<p id=\"survey-skipped\">Not asked, because of your earlier answers: ' + skipped.map((question) => esc(question.field)).join(', ') + '</p>';",
    "  return capabilityPage('Review your answers', '<h1>Review your answers</h1><ul id=\"survey-answers\">' + rows + '</ul>' + notAsked + '<form method=\"post\" action=\"/survey/submit\"><button type=\"submit\">Submit</button></form>');",
    "};",
    // The records table is shared with the engine's own reads, so a reference can name a product rather
    // than a result: a row that is not this capability's is a 404, not a TypeError that takes the process
    // with it. This is the class mwg-train-le6's review found in the checkout receipt, closed here before
    // this capability is handed over.
    "const surveyStored = (row) => {",
    "  try {",
    "    const value = JSON.parse(row.payload);",
    // Every ENTRY is checked, not only the array: a row carrying `answers: [null]` or `answers: [{}]` is
    // shaped like a result and is not one, and rendering it threw on `entry.field` - which killed the whole
    // process in the arms that share `http.createServer`, the same way a product row did in the checkout
    // receipt (mwg-train-s0q review, P1).
    "    return value !== null && typeof value === 'object' && Array.isArray(value.answers) && Object.hasOwn(value, 'outcome') && value.answers.every((entry) => entry !== null && typeof entry === 'object' && typeof entry.field === 'string' && typeof entry.value === 'string') ? value : null;",
    "  } catch {",
    "    return null;",
    "  }",
    "};",
    "const surveyResultPage = (ref, stored) => {",
    "  return capabilityPage('Your result', '<h1>Your result</h1><p id=\"survey-outcome\">' + esc(stored.outcome ?? '') + '</p><p id=\"survey-reference\">' + esc(ref) + '</p><dl id=\"survey-recap\">' + stored.answers.map((entry) => '<dt>' + esc(entry.field) + '</dt><dd>' + esc(entry.value) + '</dd>').join('') + '</dl>');",
    "};",
  ].join('\n');
};

/** The survey routes, raw arm: one question at a time, a review, and the derived result. */
const rawSurveyRoutes = () =>
  [
    "  if (path === '/survey' && request.method === 'GET') {",
    `    const surveySid = ${CART_SID_RAW};`,
    '    const surveyAnswers = surveySid ? selectSurveyAnswers.all(surveySid) : [];',
    "    const surveyWanted = url.searchParams.get('question');",
    // Asking for a question the branch currently hides is not a way to answer it: a question that is not
    // asked cannot be reached by naming it, only by changing the answer that hid it (mwg-train-s0q review,
    // P3).
    "    const surveyReachable = surveyAsked(surveyAnswers).some((question) => question.field === surveyWanted);",
    "    if (surveyWanted !== null && !surveyReachable) {",
    "      response.writeHead(303, { location: '/survey' });",
    "      return response.end();",
    "    }",
    "    const surveyCurrent = surveyWanted ? surveyQuestion(surveyWanted) : surveyNext(surveyAnswers);",
    "    if (!surveyCurrent) {",
    "      response.writeHead(303, { location: '/survey/review' });",
    "      return response.end();",
    "    }",
    "    const surveyFrom = url.searchParams.get('from') === 'review';",
    "    return html(response, surveyQuestionPage(surveyCurrent, surveyAnswer(surveyAnswers, surveyCurrent.field), surveyFrom));",
    '  }',
    "  if (path === '/survey/answer' && request.method === 'POST') {",
    '    const surveyBody = await parseBody(request);',
    `    const surveySid = ${CART_SID_RAW} || randomUUID();`,
    "    const answeredQuestion = surveyQuestion(String(surveyBody.field ?? ''));",
    // A POST is not the form: an answer for a question this survey does not ask is refused rather than
    // stored, and a blank answer is refused rather than recorded as an empty outcome.
    "    if (!answeredQuestion) {",
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('That is not a question this survey asks.');",
    "    }",
    // The branch decides which questions exist: an answer for one the current answers hide is refused
    // rather than stored, so a stored answer always belongs to a question that was actually asked
    // (mwg-train-s0q review, P3).
    "    if (!surveyAsked(selectSurveyAnswers.all(surveySid)).some((question) => question.field === answeredQuestion.field)) {",
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('That question is not part of the survey as answered so far.');",
    "    }",
    "    const surveyValue = String(surveyBody.answer ?? '').trim();",
    "    if (surveyValue === '') {",
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Answer the question before moving on.');",
    "    }",
    "    insertSurveyAnswer.run(surveySid, answeredQuestion.field, surveyValue);",
    "    const surveyNextUrl = String(surveyBody.from ?? '') === 'review' ? '/survey/review' : '/survey';",
    "    response.writeHead(303, { location: surveyNextUrl, 'set-cookie': 'sid=' + surveySid + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600' });",
    "    return response.end();",
    '  }',
    "  if (path === '/survey/review' && request.method === 'GET') {",
    `    const surveySid = ${CART_SID_RAW};`,
    '    const surveyAnswers = surveySid ? selectSurveyAnswers.all(surveySid) : [];',
    // The review is only reachable with every ASKED question answered; a hidden question is not asked,
    // so its stale answer cannot block the visitor here or reach the result.
    '    if (surveyNext(surveyAnswers)) {',
    "      response.writeHead(303, { location: '/survey' });",
    "      return response.end();",
    '    }',
    '    return html(response, surveyReviewPage(surveyAnswers));',
    '  }',
    "  if (path === '/survey/submit' && request.method === 'POST') {",
    '    const surveyBody = await parseBody(request);',
    `    const surveySid = ${CART_SID_RAW};`,
    '    const surveyAnswers = surveySid ? selectSurveyAnswers.all(surveySid) : [];',
    "    if (!surveySid || surveyNext(surveyAnswers)) {",
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Answer every question this survey asks before submitting.');",
    '    }',
    '    const surveyOutcomeValue = surveyOutcome(surveyAnswers);',
    '    const surveyRef = randomUUID().slice(0, 8);',
    '    insert.run(surveyRef, new Date().toISOString(), JSON.stringify(surveyOutcomeValue));',
    '    deleteSurveyAnswers.run(surveySid);',
    "    response.writeHead(303, { location: '/survey/result/' + surveyRef });",
    '    return response.end();',
    '  }',
    "  const surveyResultMatch = path.match(/^\\/survey\\/result\\/([^/]+)$/);",
    "  if (surveyResultMatch && request.method === 'GET') {",
    '    const surveyRow = select.get(surveyResultMatch[1]);',
    '    const surveyStoredValue = surveyRow ? surveyStored(surveyRow) : null;',
    '    if (!surveyStoredValue) {',
    "      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('We could not find that result.');",
    '    }',
    '    return html(response, surveyResultPage(surveyRow.ref, surveyStoredValue));',
    '  }',
  ].join('\n');

/** The survey routes, hono arm: the same five, in Hono's routing. */
const honoSurveyRoutes = () =>
  [
    "app.get('/survey', (c) => {",
    `  const surveySid = ${CART_SID_HONO};`,
    '  const surveyAnswers = surveySid ? selectSurveyAnswers.all(surveySid) : [];',
    "  const surveyWanted = c.req.query('question');",
    "  const surveyReachable = surveyAsked(surveyAnswers).some((question) => question.field === surveyWanted);",
    "  if (surveyWanted !== undefined && !surveyReachable) return c.redirect('/survey', 303);",
    '  const surveyCurrent = surveyWanted ? surveyQuestion(surveyWanted) : surveyNext(surveyAnswers);',
    "  if (!surveyCurrent) return c.redirect('/survey/review', 303);",
    "  return c.html(surveyQuestionPage(surveyCurrent, surveyAnswer(surveyAnswers, surveyCurrent.field), c.req.query('from') === 'review'));",
    '});',
    "app.post('/survey/answer', async (c) => {",
    '  const surveyBody = await c.req.parseBody();',
    `  const surveySid = ${CART_SID_HONO} || randomUUID();`,
    "  const answeredQuestion = surveyQuestion(String(surveyBody.field ?? ''));",
    "  if (!answeredQuestion) return c.text('That is not a question this survey asks.', 422);",
    "  if (!surveyAsked(selectSurveyAnswers.all(surveySid)).some((question) => question.field === answeredQuestion.field)) return c.text('That question is not part of the survey as answered so far.', 422);",
    "  const surveyValue = String(surveyBody.answer ?? '').trim();",
    "  if (surveyValue === '') return c.text('Answer the question before moving on.', 422);",
    '  insertSurveyAnswer.run(surveySid, answeredQuestion.field, surveyValue);',
    "  const surveyNextUrl = String(surveyBody.from ?? '') === 'review' ? '/survey/review' : '/survey';",
    "  c.header('set-cookie', 'sid=' + surveySid + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600');",
    '  return c.redirect(surveyNextUrl, 303);',
    '});',
    "app.get('/survey/review', (c) => {",
    `  const surveySid = ${CART_SID_HONO};`,
    '  const surveyAnswers = surveySid ? selectSurveyAnswers.all(surveySid) : [];',
    "  if (surveyNext(surveyAnswers)) return c.redirect('/survey', 303);",
    '  return c.html(surveyReviewPage(surveyAnswers));',
    '});',
    "app.post('/survey/submit', async (c) => {",
    `  const surveySid = ${CART_SID_HONO};`,
    '  const surveyAnswers = surveySid ? selectSurveyAnswers.all(surveySid) : [];',
    "  if (!surveySid || surveyNext(surveyAnswers)) return c.text('Answer every question this survey asks before submitting.', 422);",
    '  const surveyOutcomeValue = surveyOutcome(surveyAnswers);',
    '  const surveyRef = randomUUID().slice(0, 8);',
    '  insert.run(surveyRef, new Date().toISOString(), JSON.stringify(surveyOutcomeValue));',
    '  deleteSurveyAnswers.run(surveySid);',
    "  return c.redirect('/survey/result/' + surveyRef, 303);",
    '});',
    "app.get('/survey/result/:ref', (c) => {",
    "  const surveyRow = select.get(c.req.param('ref'));",
    "  const surveyStoredValue = surveyRow ? surveyStored(surveyRow) : null;",
    "  if (!surveyStoredValue) return c.text('We could not find that result.', 404);",
    '  return c.html(surveyResultPage(surveyRow.ref, surveyStoredValue));',
    '});',
  ].join('\n');

/** The checkout capability's statements: a paid checkout consumes the cart; a declined one must not. */
const checkoutTables = () =>
  ["const deleteCartItems = db.prepare('DELETE FROM cart_items WHERE sid = ?');"].join('\n');

/**
 * The checkout pages: arithmetic over the cart's lines, a simulated payment with a decline path, and a
 * durable receipt. Every stored figure is an integer number of minor units and every printed figure is
 * formatted by integer arithmetic, so a receipt read back later still adds up and no float ever touches
 * a charge (mwg-train-le6). Nothing about the card is stored, and the page says so.
 */
const checkoutPages = (archetype) => {
  const checkout = checkoutOf(archetype);
  return [
    `const CHECKOUT = ${JSON.stringify(checkout)};`,
    "const checkoutMoney = (minor, currency = CHECKOUT.currency) => (minor < 0 ? '-' : '') + esc(currency) + ' ' + Math.floor(Math.abs(minor) / 100) + '.' + String(Math.abs(minor) % 100).padStart(2, '0');",
    "const checkoutShippingTier = (name) => CHECKOUT.shipping.find((tier) => tier.name === name) ?? null;",
    // Tax is charged on the lines' subtotal, not on shipping, and is rounded exactly once to a whole
    // minor unit - the only rounding in the arithmetic.
    "const checkoutTaxOn = (subtotal) => Math.round((subtotal * CHECKOUT.tax_rate_percent) / 100);",
    "const checkoutFromCart = (rows, shipping) => {",
    "  const lines = rows.map((row) => ({ ref: row.ref, variant: row.variant, qty: row.qty, unit_price_minor: row.unit_price_minor, line_total_minor: row.qty * row.unit_price_minor }));",
    "  const subtotal = lines.reduce((sum, line) => sum + line.line_total_minor, 0);",
    "  const tax = checkoutTaxOn(subtotal);",
    "  return { cart: lines, subtotal_minor: subtotal, shipping_name: shipping.name, shipping_minor: shipping.price_minor, tax_rate_percent: CHECKOUT.tax_rate_percent, tax_minor: tax, total_minor: subtotal + shipping.price_minor + tax, currency: CHECKOUT.currency };",
    "};",
    "const checkoutLines = (lines, currency = CHECKOUT.currency) => lines.length === 0 ? '<p id=\"checkout-empty\">Your cart is empty, so there is nothing to pay for.</p>' : '<table id=\"checkout-lines\"><caption>What you are paying for</caption><thead><tr><th scope=\"col\">Item</th><th scope=\"col\">Variant</th><th scope=\"col\">Quantity</th><th scope=\"col\">Unit price</th><th scope=\"col\">Line total</th></tr></thead><tbody>' + lines.map((line) => '<tr data-ref=\"' + esc(line.ref) + '\" data-variant=\"' + esc(line.variant) + '\" data-qty=\"' + line.qty + '\"><th scope=\"row\">' + esc(line.ref) + '</th><td>' + esc(line.variant) + '</td><td class=\"quantity\">' + line.qty + '</td><td class=\"unit-price\">' + checkoutMoney(line.unit_price_minor, currency) + '</td><td class=\"line-total\">' + checkoutMoney(line.line_total_minor, currency) + '</td></tr>').join('') + '</tbody></table>';",
    // The RECEIPT's own currency is rendered on the receipt: it records what was charged, so re-reading it
    // later must not follow a store setting that changed since (mwg-train-le6 review, P2). The live pages
    // carry the same field through, so one function still serves both.
    "const checkoutTotals = (receipt, prefix) => '<dl class=\"totals\"><dt>Subtotal</dt><dd id=\"' + prefix + '-subtotal\">' + checkoutMoney(receipt.subtotal_minor, receipt.currency) + '</dd><dt>Shipping</dt><dd id=\"' + prefix + '-shipping\">' + checkoutMoney(receipt.shipping_minor, receipt.currency) + '</dd><dt>Tax (' + receipt.tax_rate_percent + '%)</dt><dd id=\"' + prefix + '-tax\">' + checkoutMoney(receipt.tax_minor, receipt.currency) + '</dd><dt>Total</dt><dd id=\"' + prefix + '-total\">' + checkoutMoney(receipt.total_minor, receipt.currency) + '</dd></dl>';",
    "const checkoutShippingForm = (receipt) => '<form method=\"get\" action=\"/checkout\"><label for=\"shipping\">Shipping</label><select id=\"shipping\" name=\"shipping\">' + CHECKOUT.shipping.map((tier) => '<option value=\"' + esc(tier.name) + '\"' + (tier.name === receipt.shipping_name ? ' selected' : '') + '>' + esc(tier.name) + ' - ' + checkoutMoney(tier.price_minor) + '</option>').join('') + '</select><button type=\"submit\">Update total</button></form>';",
    "const checkoutPaymentForm = (receipt) => '<form method=\"post\" action=\"/checkout/pay\"><input type=\"hidden\" name=\"shipping\" value=\"' + esc(receipt.shipping_name) + '\"><label for=\"card\">Card number (a simulation: nothing is stored or sent anywhere)</label><input type=\"text\" id=\"card\" name=\"card\" inputmode=\"numeric\" autocomplete=\"off\" required><button type=\"submit\">Pay ' + checkoutMoney(receipt.total_minor) + '</button></form>';",
    "const checkoutPage = (rows, shipping) => {",
    "  const receipt = checkoutFromCart(rows, shipping);",
    "  return capabilityPage('Checkout', '<h1>Checkout</h1>' + checkoutLines(receipt.cart) + (receipt.cart.length === 0 ? '' : checkoutShippingForm(receipt) + '<p>Shipping by <span id=\"checkout-shipping-name\">' + esc(receipt.shipping_name) + '</span></p>' + checkoutTotals(receipt, 'checkout') + checkoutPaymentForm(receipt)));",
    "};",
    "const checkoutDeclinedPage = (rows, shipping, reason) => {",
    "  const receipt = checkoutFromCart(rows, shipping);",
    "  return capabilityPage('Payment declined', '<h1>Payment declined</h1><p id=\"decline-reason\" role=\"alert\">' + esc(reason) + '</p><p id=\"cart-kept\">Your cart still has ' + receipt.cart.length + ' line(s), so nothing was lost.</p>' + checkoutLines(receipt.cart) + checkoutShippingForm(receipt) + '<p>Shipping by <span id=\"checkout-shipping-name\">' + esc(receipt.shipping_name) + '</span></p>' + checkoutTotals(receipt, 'checkout') + checkoutPaymentForm(receipt));",
    "};",
    // The records table is shared with the engine's own reads, so a reference can name a product rather
    // than a receipt. A row that is not a receipt is a 404 here, not a thrown TypeError one route away
    // from an unhandled rejection that kills the process (mwg-train-le6 review, P1).
    "const checkoutReceipt = (row) => {",
    "  try {",
    "    const value = JSON.parse(row.payload);",
    "    return value !== null && typeof value === 'object' && Array.isArray(value.cart) ? value : null;",
    "  } catch {",
    "    return null;",
    "  }",
    "};",
    "const receiptPage = (ref, receipt) => {",
    "  return capabilityPage('Receipt ' + ref, '<h1>Receipt</h1><p id=\"receipt-ref\">' + esc(ref) + '</p>' + checkoutLines(receipt.cart, receipt.currency) + checkoutTotals(receipt, 'receipt') + '<p id=\"receipt-paid\">Paid ' + checkoutMoney(receipt.total_minor, receipt.currency) + ' by ' + esc(receipt.shipping_name) + '</p>');",
    "};",
  ].join('\n');
};

/** The checkout routes, raw arm: the payable page, the simulated payment, and the durable receipt. */
const rawCheckoutRoutes = () =>
  [
    "  if (path === '/checkout' && request.method === 'GET') {",
    `    const checkoutSid = ${CART_SID_RAW};`,
    '    const checkoutRows = checkoutSid ? selectCartItems.all(checkoutSid) : [];',
    "    const checkoutChoice = checkoutShippingTier(url.searchParams.get('shipping') ?? '') ?? CHECKOUT.shipping[0];",
    '    return html(response, checkoutPage(checkoutRows, checkoutChoice));',
    '  }',
    "  if (path === '/checkout/pay' && request.method === 'POST') {",
    '    const checkoutBody = await parseBody(request);',
    `    const checkoutSid = ${CART_SID_RAW};`,
    '    const checkoutRows = checkoutSid ? selectCartItems.all(checkoutSid) : [];',
    "    const checkoutChoice = checkoutShippingTier(String(checkoutBody.shipping ?? ''));",
    // A payment against an empty or unknown-shaped request is refused before anything is charged, and
    // never consumes the cart: the consumer is the success path only.
    '    if (checkoutRows.length === 0) {',
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Your cart is empty, so there is nothing to pay for.');",
    '    }',
    '    if (!checkoutChoice) {',
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Choose one of the shipping options this page lists.');",
    '    }',
    "    const checkoutCard = String(checkoutBody.card ?? '').replace(/\\s+/g, '');",
    '    if (!/^\\d{12,19}$/.test(checkoutCard)) {',
    "      return html(response, checkoutDeclinedPage(checkoutRows, checkoutChoice, 'Enter a card number of 12 to 19 digits.'), 422);",
    '    }',
    // The simulation's only rule: a card ending 0002 is declined. The decline path is what makes this a
    // checkout rather than a happy path - it says why, and the cart is left exactly as it was.
    "    if (checkoutCard.endsWith('0002')) {",
    "      return html(response, checkoutDeclinedPage(checkoutRows, checkoutChoice, 'The bank declined this card. Nothing has been charged.'), 422);",
    '    }',
    '    const checkoutReceipt = checkoutFromCart(checkoutRows, checkoutChoice);',
    '    const checkoutRef = randomUUID().slice(0, 8);',
    '    insert.run(checkoutRef, new Date().toISOString(), JSON.stringify(checkoutReceipt));',
    '    deleteCartItems.run(checkoutSid);',
    "    response.writeHead(303, { location: '/checkout/receipt/' + checkoutRef });",
    '    return response.end();',
    '  }',
    "  const receiptMatch = path.match(/^\\/checkout\\/receipt\\/([^/]+)$/);",
    "  if (receiptMatch && request.method === 'GET') {",
    '    const receiptRow = select.get(receiptMatch[1]);',
    '    if (!receiptRow) {',
    "      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('We could not find that receipt.');",
    '    }',
    '    const receiptValue = checkoutReceipt(receiptRow);',
    '    if (!receiptValue) {',
    "      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('We could not find that receipt.');",
    '    }',
    '    return html(response, receiptPage(receiptRow.ref, receiptValue));',
    '  }',
  ].join('\n');

/** The checkout routes, hono arm: the same three, in Hono's routing. */
const honoCheckoutRoutes = () =>
  [
    "app.get('/checkout', (c) => {",
    `  const checkoutSid = ${CART_SID_HONO};`,
    '  const checkoutRows = checkoutSid ? selectCartItems.all(checkoutSid) : [];',
    "  const checkoutChoice = checkoutShippingTier(c.req.query('shipping') ?? '') ?? CHECKOUT.shipping[0];",
    '  return c.html(checkoutPage(checkoutRows, checkoutChoice));',
    '});',
    "app.post('/checkout/pay', async (c) => {",
    '  const checkoutBody = await c.req.parseBody();',
    `  const checkoutSid = ${CART_SID_HONO};`,
    '  const checkoutRows = checkoutSid ? selectCartItems.all(checkoutSid) : [];',
    "  const checkoutChoice = checkoutShippingTier(String(checkoutBody.shipping ?? ''));",
    "  if (checkoutRows.length === 0) return c.text('Your cart is empty, so there is nothing to pay for.', 422);",
    "  if (!checkoutChoice) return c.text('Choose one of the shipping options this page lists.', 422);",
    "  const checkoutCard = String(checkoutBody.card ?? '').replace(/\\s+/g, '');",
    "  if (!/^\\d{12,19}$/.test(checkoutCard)) return c.html(checkoutDeclinedPage(checkoutRows, checkoutChoice, 'Enter a card number of 12 to 19 digits.'), 422);",
    "  if (checkoutCard.endsWith('0002')) return c.html(checkoutDeclinedPage(checkoutRows, checkoutChoice, 'The bank declined this card. Nothing has been charged.'), 422);",
    '  const checkoutReceipt = checkoutFromCart(checkoutRows, checkoutChoice);',
    '  const checkoutRef = randomUUID().slice(0, 8);',
    '  insert.run(checkoutRef, new Date().toISOString(), JSON.stringify(checkoutReceipt));',
    '  deleteCartItems.run(checkoutSid);',
    "  return c.redirect('/checkout/receipt/' + checkoutRef, 303);",
    '});',
    "app.get('/checkout/receipt/:ref', (c) => {",
    "  const receiptRow = select.get(c.req.param('ref'));",
    "  const receiptValue = receiptRow ? checkoutReceipt(receiptRow) : null;",
    "  if (!receiptValue) return c.text('We could not find that receipt.', 404);",
    '  return c.html(receiptPage(receiptRow.ref, receiptValue));',
    '});',
  ].join('\n');


/**
 * The game's scoreboard, in its own table rather than in `records`.
 *
 * A score is not a submitted record: keeping it out of `records` means the engine's read-by-reference
 * routes can never be asked to render one, and the record flow's pages never show a score as if a visitor
 * had filled in a form (mwg-train-ypr).
 */
const gameTables = () =>
  [
    "db.exec('CREATE TABLE IF NOT EXISTS game_scores (ref TEXT PRIMARY KEY, score INTEGER NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL)');",
    "const insertGameScore = db.prepare('INSERT INTO game_scores (ref, score, outcome, created_at) VALUES (?, ?, ?, ?)');",
    "const selectGameScores = db.prepare('SELECT ref, score, outcome, created_at FROM game_scores ORDER BY score DESC, created_at ASC');",
  ].join('\n');

/**
 * The game's two pages: the field the loop plays in, and the scoreboard the recorded scores are read from.
 *
 * The markup is server-rendered and complete before the script runs - the field, the score, the lives and
 * the state are all in the document, so the page says what it is without JavaScript and the loop only has
 * to change what is already there.
 */
const gamePages = (archetype) => {
  const game = gameOf(archetype);
  return [
    `const GAME = ${JSON.stringify(game)};`,
    'const GAME_LANES = 4;',
    'const GAME_FALL_TICKS = 5;',
    "const gameField = (state) => '<div id=\"game-field\" data-state=\"' + state + '\" data-lane=\"1\" data-result=\"\" style=\"position:relative;width:' + GAME.width + 'px;height:' + GAME.height + 'px;overflow:hidden;border:1px solid #999\">' + '<div id=\"game-player\" data-lane=\"1\" style=\"position:absolute;bottom:0;left:0;width:36px;height:14px;background:#334\"></div>' + '<div id=\"game-target\" data-lane=\"1\" style=\"position:absolute;top:0;left:0;width:22px;height:22px;background:#b33\"></div>' + '</div>';",
    "const gamePage = () => capabilityPage('Play ' + GAME.label, '<h1>' + esc(GAME.label) + '</h1>' + '<p id=\"game-intro\">Press Enter or click the field to start. Move with the left and right arrow keys.</p>' + gameField('ready') + '<p>Score <span id=\"game-score\">0</span> of <span id=\"game-target-score\">' + GAME.target + '</span>, lives <span id=\"game-lives\">' + GAME.lives + '</span>.</p>' + '<p id=\"game-state\" role=\"status\" aria-live=\"polite\">Ready</p>' + '<button id=\"game-restart\" type=\"button\">Restart</button>' + '<p><a href=\"/play/scores\">Recorded scores</a></p>');",
    "const gameScoresPage = (rows) => capabilityPage('Recorded scores', '<h1>Recorded scores</h1>' + (rows.length === 0 ? '<p id=\"game-no-scores\">No scores have been recorded yet.</p>' : '<ol id=\"game-scores\">' + rows.map((row) => '<li data-ref=\"' + esc(row.ref) + '\"><span class=\"score\">' + row.score + '</span> - ' + esc(row.outcome) + '</li>').join('') + '</ol>'));",
    // The browser is not trusted: the score has to be one this game could have produced. A win must be at
    // or above the target and a loss below it, so a client cannot POST a win it did not play for, and a
    // score above the target cannot be recorded at all. Refused with a reason rather than stored.
    "const gameScoreRefusal = (score, outcome) => {",
    "  if (!Number.isInteger(score) || score < 0 || score > GAME.target) return 'That is not a score this game could have produced.';",
    "  if (outcome !== 'win' && outcome !== 'lose') return 'A game ends in a win or a loss.';",
    "  if ((outcome === 'win') !== (score >= GAME.target)) return 'That outcome does not match that score.';",
    "  return null;",
    "};",
  ].join('\n');
};

/** The game routes, raw arm: play, record a finished game, read the scoreboard. */
const rawGameRoutes = () =>
  [
    "  if (path === '/play' && request.method === 'GET') {",
    '    return html(response, gamePage());',
    '  }',
    "  if (path === '/play/scores' && request.method === 'GET') {",
    '    return html(response, gameScoresPage(selectGameScores.all()));',
    '  }',
    "  if (path === '/play/score' && request.method === 'POST') {",
    '    const gameBody = await parseBody(request);',
    "    const gameScoreText = String(gameBody.score ?? '').trim();",
    // The score arrives as text, so it is matched as digits: `Number('')` is 0 and `Number(' ')` is 0, and
    // a blank score must not be recorded as a legitimate zero (the class of bug mwg-train-le6's review
    // found in the price check).
    "    const gameScoreValue = /^[0-9]{1,4}$/.test(gameScoreText) ? Number(gameScoreText) : NaN;",
    "    const gameOutcomeValue = String(gameBody.outcome ?? '').trim();",
    '    const gameRefusal = gameScoreRefusal(gameScoreValue, gameOutcomeValue);',
    '    if (gameRefusal) {',
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    '      return response.end(gameRefusal);',
    '    }',
    "    insertGameScore.run(randomUUID().slice(0, 8), gameScoreValue, gameOutcomeValue, new Date().toISOString());",
    "    response.writeHead(303, { location: '/play/scores' });",
    '    return response.end();',
    '  }',
  ].join('\n');

/** The game routes, hono arm: the same three, in Hono's routing. */
const honoGameRoutes = () =>
  [
    "app.get('/play', (c) => {",
    '  return c.html(gamePage());',
    '});',
    "app.get('/play/scores', (c) => {",
    '  return c.html(gameScoresPage(selectGameScores.all()));',
    '});',
    "app.post('/play/score', async (c) => {",
    '  const gameBody = await c.req.parseBody();',
    "  const gameScoreText = String(gameBody.score ?? '').trim();",
    "  const gameScoreValue = /^[0-9]{1,4}$/.test(gameScoreText) ? Number(gameScoreText) : NaN;",
    "  const gameOutcomeValue = String(gameBody.outcome ?? '').trim();",
    '  const gameRefusal = gameScoreRefusal(gameScoreValue, gameOutcomeValue);',
    '  if (gameRefusal) return c.text(gameRefusal, 422);',
    "  insertGameScore.run(randomUUID().slice(0, 8), gameScoreValue, gameOutcomeValue, new Date().toISOString());",
    "  return c.redirect('/play/scores', 303);",
    '});',
  ].join('\n');

/**
 * The client input loop, the terminal state and the restart. Emitted only when the capability is on, and
 * appended to the ONE plain-JS script every arm already loads, so no arm needs framework-specific code
 * and a specification that does not opt in regenerates byte-identically (mwg-train-ypr).
 */
const gameEnhance = (archetype) => {
  const game = gameOf(archetype);
  if (!game) return '';
  return `
// The game: a fixed-timestep loop the visitor advances with the keyboard or the pointer, a terminal state
// that says which way it ended, a restart that returns to the initial state without a reload, and a score
// that is recorded by the server rather than only displayed.
{
  const gameFieldEl = document.getElementById('game-field');
  if (gameFieldEl) {
    const GAME_CONFIG = ${JSON.stringify(game)};
    const GAME_LANES = 4;
    const GAME_FALL_TICKS = 5;
    // The target is this tall, and its fall lands with its bottom on the player's row, so a catch is drawn
    // where it happens rather than off the bottom edge of the field.
    const GAME_TARGET_SIZE = 22;
    const gamePlayerEl = document.getElementById('game-player');
    const gameTargetEl = document.getElementById('game-target');
    const gameScoreEl = document.getElementById('game-score');
    const gameLivesEl = document.getElementById('game-lives');
    const gameStateEl = document.getElementById('game-state');
    let gameScore = 0;
    let gameLives = GAME_CONFIG.lives;
    let gameState = 'ready';
    let gameResult = '';
    let gamePlayerLane = 1;
    let gameLane = 1;
    let gameCycle = 1;
    let gameFall = 0;
    let gameTimer = null;
    const gameLaneLeft = (lane) => Math.round((GAME_CONFIG.width / GAME_LANES) * lane);
    const gameRender = () => {
      gameFieldEl.dataset.state = gameState;
      gameFieldEl.dataset.lane = String(gameLane);
      gameFieldEl.dataset.result = gameResult;
      gamePlayerEl.dataset.lane = String(gamePlayerLane);
      gameTargetEl.dataset.lane = String(gameLane);
      gamePlayerEl.style.left = gameLaneLeft(gamePlayerLane) + 'px';
      gameTargetEl.style.left = gameLaneLeft(gameLane) + 'px';
      gameTargetEl.style.top = Math.min(GAME_CONFIG.height - GAME_TARGET_SIZE, Math.round(((GAME_CONFIG.height - GAME_TARGET_SIZE) / GAME_FALL_TICKS) * gameFall)) + 'px';
      gameScoreEl.textContent = String(gameScore);
      gameLivesEl.textContent = String(gameLives);
      gameStateEl.textContent = gameState === 'ready' ? 'Ready' : gameState === 'playing' ? 'Playing' : gameResult === 'win' ? 'You win' : 'You lose';
    };
    const gameStop = (result) => {
      gameResult = result;
      gameState = 'over';
      if (gameTimer !== null) {
        clearInterval(gameTimer);
        gameTimer = null;
      }
      gameRender();
      // The score is recorded by the server, which is what makes it a score rather than a number on a
      // screen; the response is the scoreboard, which the visitor reaches by the link on the page.
      fetch('/play/score', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ score: String(gameScore), outcome: result }).toString(),
      });
    };
    const gameTick = () => {
      gameFall += 1;
      if (gameFall >= GAME_FALL_TICKS) {
        if (gamePlayerLane === gameLane) gameScore += 1;
        else gameLives -= 1;
        // The game ends BEFORE the next throw is set up. The first version advanced the lane and reset the
        // fall first, so the last render showed the NEXT target at the top of another lane instead of the
        // catch that had just happened - the words "You win" above a board that did not show why
        // (mwg-train-ypr review, P3).
        if (gameScore >= GAME_CONFIG.target) {
          gameStop('win');
          return;
        }
        if (gameLives <= 0) {
          gameStop('lose');
          return;
        }
        gameFall = 0;
        gameCycle += 1;
        gameLane = gameCycle % GAME_LANES;
      }
      gameRender();
    };
    const gameStart = () => {
      if (gameState === 'playing') return;
      gameScore = 0;
      gameLives = GAME_CONFIG.lives;
      gameResult = '';
      gameState = 'playing';
      gamePlayerLane = 1;
      gameLane = 1;
      gameCycle = 1;
      gameFall = 0;
      gameRender();
      gameTimer = setInterval(gameTick, GAME_CONFIG.tick_ms);
    };
    // The restart returns the field to the state it was served in, with no reload.
    const gameReset = () => {
      if (gameTimer !== null) {
        clearInterval(gameTimer);
        gameTimer = null;
      }
      gameScore = 0;
      gameLives = GAME_CONFIG.lives;
      gameResult = '';
      gameState = 'ready';
      gamePlayerLane = 1;
      gameLane = 1;
      gameCycle = 1;
      gameFall = 0;
      gameRender();
    };
    const gameMove = (delta) => {
      const next = gamePlayerLane + delta;
      if (next < 0 || next >= GAME_LANES) return;
      gamePlayerLane = next;
      gameRender();
    };
    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        gameMove(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        gameMove(1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (gameState === 'playing') return;
        if (gameState === 'over') gameReset();
        gameStart();
      }
    });
    // Pointer input: the visitor can play with the mouse or a finger as well as the keyboard.
    gameFieldEl.addEventListener('pointerdown', (event) => {
      const bounds = gameFieldEl.getBoundingClientRect();
      const lane = Math.max(0, Math.min(GAME_LANES - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * GAME_LANES)));
      gamePlayerLane = lane;
      if (gameState === 'ready') gameStart();
      else if (gameState === 'over') {
        gameReset();
        gameStart();
      }
      gameRender();
    });
    document.getElementById('game-restart')?.addEventListener('click', gameReset);
    gameRender();
  }
}
`;
};

/**
 * The workspace capability: a company the account owns, a second role that can read but not administer, an
 * onboarding step that carries the chosen use case and plan into the workspace, and one setting only the
 * owner can change (mwg-train-ksn).
 *
 * The permission boundary is enforced on the REQUEST, not by hiding the form: a member posting the admin
 * route is refused with 403 whether or not they ever saw the button. Every state-changing request also
 * carries a CSRF token derived from the session, because these are the first cookie-authenticated writes in
 * the engine - `SameSite=Lax` covers the cross-site POST case, and the token covers the rest.
 */
const workspaceTables = () =>
  [
    "db.exec('CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, use_case TEXT NOT NULL, plan TEXT NOT NULL, setting TEXT NOT NULL, created_at TEXT NOT NULL)');",
    "db.exec('CREATE TABLE IF NOT EXISTS memberships (email TEXT NOT NULL, workspace_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (email, workspace_id))');",
    "db.exec('CREATE TABLE IF NOT EXISTS invitations (email TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at TEXT NOT NULL)');",
    "const insertAccount = db.prepare('INSERT INTO accounts (email, password, display_name) VALUES (?, ?, ?)');",
    "const insertWorkspace = db.prepare('INSERT INTO workspaces (id, name, use_case, plan, setting, created_at) VALUES (?, ?, ?, ?, ?, ?)');",
    "const selectWorkspace = db.prepare('SELECT id, name, use_case, plan, setting FROM workspaces WHERE id = ?');",
    "const updateWorkspaceSetting = db.prepare('UPDATE workspaces SET setting = ? WHERE id = ?');",
    "const insertMembership = db.prepare('INSERT OR REPLACE INTO memberships (email, workspace_id, role, created_at) VALUES (?, ?, ?, ?)');",
    "const selectMemberships = db.prepare('SELECT email, role FROM memberships WHERE workspace_id = ? ORDER BY role, email');",
    "const selectMembershipFor = db.prepare('SELECT workspace_id, role FROM memberships WHERE email = ?');",
    "const insertInvitation = db.prepare('INSERT OR REPLACE INTO invitations (email, workspace_id, created_at) VALUES (?, ?, ?)');",
    "const selectInvitation = db.prepare('SELECT email, workspace_id FROM invitations WHERE email = ?');",
    "const deleteInvitation = db.prepare('DELETE FROM invitations WHERE email = ?');",
    // The token is derived from the session cookie, which a cross-site page cannot read: it is HttpOnly and
    // never rendered. A request without it, or with another session's token, is refused.
    "const workspaceCsrf = (sid) => createHash('sha256').update(String(sid) + ':workspace-csrf').digest('hex').slice(0, 32);",
    "const workspaceSameToken = (a, b) => Boolean(a) && Boolean(b) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));",
    "const workspaceRoleFor = (email) => selectMembershipFor.get(email)?.role ?? null;",
    "const workspaceOfMember = (email) => (email ? selectWorkspace.get(workspaceRoleFor(email) ? selectMembershipFor.get(email).workspace_id : '') ?? null : null);",
    "const workspaceEmailField = (value) => String(value ?? '').trim().toLowerCase();",
    "const workspaceEmailLooksReal = (value) => /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value);",
  ].join('\n');

/** The workspace pages: onboarding, the workspace itself, and the two owner-only forms. */
const workspacePages = (archetype) => {
  const workspace = workspaceOf(archetype);
  return [
    `const WORKSPACE = ${JSON.stringify(workspace)};`,
    "const workspaceOptions = (values, chosen) => values.map((value) => '<option value=\"' + esc(value) + '\"' + (value === chosen ? ' selected' : '') + '>' + esc(value) + '</option>').join('');",
    "const onboardingPage = (error, values) => capabilityPage('Create a workspace', '<h1>Create a workspace</h1>' + (error ? '<p role=\"alert\">' + esc(error) + '</p>' : '') + '<form id=\"onboarding-form\" method=\"post\" action=\"/onboarding\">' + '<label for=\"email\">Work email</label><input id=\"email\" name=\"email\" type=\"email\" autocomplete=\"username\" value=\"' + esc(values?.email ?? '') + '\" required>' + '<label for=\"display_name\">Your name</label><input id=\"display_name\" name=\"display_name\" type=\"text\" autocomplete=\"name\" value=\"' + esc(values?.display_name ?? '') + '\">' + '<label for=\"password\">Password</label><input id=\"password\" name=\"password\" type=\"password\" autocomplete=\"new-password\" minlength=\"8\" required>' + '<label for=\"workspace_name\">Workspace</label><input id=\"workspace_name\" name=\"workspace_name\" type=\"text\" value=\"' + esc(values?.workspace_name ?? WORKSPACE.name) + '\" required>' + '<label for=\"use_case\">What will you use it for?</label><select id=\"use_case\" name=\"use_case\">' + workspaceOptions(WORKSPACE.use_cases, values?.use_case) + '</select>' + '<label for=\"plan\">Plan</label><select id=\"plan\" name=\"plan\">' + workspaceOptions(WORKSPACE.plans, values?.plan) + '</select>' + '<button type=\"submit\">Create workspace</button></form>' + '<p><a href=\"/login\">Already have an account? Sign in</a></p>');",
    "const workspacePage = (workspace, members, role, csrf, notice) => capabilityPage(WORKSPACE.name, '<h1>' + esc(workspace.name) + '</h1>' + (notice ? '<p role=\"status\">' + esc(notice) + '</p>' : '') + '<dl id=\"workspace-facts\"><dt>Signed in as</dt><dd id=\"workspace-role\">' + esc(role) + '</dd><dt>Use case</dt><dd id=\"workspace-use-case\">' + esc(workspace.use_case) + '</dd><dt>Plan</dt><dd id=\"workspace-plan\">' + esc(workspace.plan) + '</dd><dt>' + esc(WORKSPACE.setting.label) + '</dt><dd id=\"workspace-setting\">' + esc(workspace.setting) + '</dd></dl>' + '<h2>Members</h2><ul id=\"workspace-members\">' + members.map((member) => '<li data-role=\"' + esc(member.role) + '\">' + esc(member.email) + '</li>').join('') + '</ul>' + (role === 'owner' ? '<form id=\"workspace-setting-form\" method=\"post\" action=\"/workspace/setting\"><input type=\"hidden\" name=\"csrf\" value=\"' + esc(csrf) + '\"><label for=\"setting\">' + esc(WORKSPACE.setting.label) + '</label><select id=\"setting\" name=\"setting\">' + workspaceOptions(WORKSPACE.setting.options, workspace.setting) + '</select><button type=\"submit\">Save setting</button></form>' + '<form id=\"workspace-invite-form\" method=\"post\" action=\"/workspace/invite\"><input type=\"hidden\" name=\"csrf\" value=\"' + esc(csrf) + '\"><label for=\"invite_email\">Invite a colleague</label><input id=\"invite_email\" name=\"invite_email\" type=\"email\" required><button type=\"submit\">Send invite</button></form>' : '<p id=\"workspace-read-only\">Only the workspace owner can change its settings or invite people.</p>') + '<form id=\"workspace-signout\" method=\"post\" action=\"/logout\"><input type=\"hidden\" name=\"csrf\" value=\"' + esc(csrf) + '\"><button type=\"submit\">Sign out</button></form>');",
  ].join('\n');
};

/** The workspace routes, raw arm: onboarding, read, the owner-only write, the invite, and the refusals. */
const rawWorkspaceRoutes = () =>
  [
    "  if (path === '/onboarding' && request.method === 'GET') {",
    "    if (authSessionEmail(request.headers.cookie)) {",
    "      response.writeHead(303, { location: '/workspace' });",
    "      return response.end();",
    "    }",
    '    return html(response, onboardingPage());',
    '  }',
    "  if (path === '/onboarding' && request.method === 'POST') {",
    '    const onboarding = await parseBody(request);',
    "    const onboardingEmail = workspaceEmailField(onboarding.email);",
    "    const onboardingPassword = String(onboarding.password ?? '');",
    "    const onboardingName = String(onboarding.display_name ?? '').trim() || onboardingEmail;",
    "    const onboardingWorkspaceName = String(onboarding.workspace_name ?? '').trim() || WORKSPACE.name;",
    "    const onboardingUseCase = String(onboarding.use_case ?? '');",
    "    const onboardingPlan = String(onboarding.plan ?? '');",
    "    const onboardingValues = { email: onboardingEmail, display_name: onboardingName, workspace_name: onboardingWorkspaceName, use_case: onboardingUseCase, plan: onboardingPlan };",
    // Refused with a reason rather than accepted and then unusable: an address that is not an address, a
    // password too short to be one, or a use case and plan this workspace does not offer.
    "    if (!workspaceEmailLooksReal(onboardingEmail)) return html(response, onboardingPage('Enter an email address.', onboardingValues), 422);",
    "    if (onboardingPassword.length < 8) return html(response, onboardingPage('A password needs at least 8 characters.', onboardingValues), 422);",
    "    if (!WORKSPACE.use_cases.includes(onboardingUseCase)) return html(response, onboardingPage('Choose what you will use it for.', onboardingValues), 422);",
    "    if (!WORKSPACE.plans.includes(onboardingPlan)) return html(response, onboardingPage('Choose a plan.', onboardingValues), 422);",
    "    if (selectAccountByEmail.get(onboardingEmail)) return html(response, onboardingPage('That address already has an account.', onboardingValues), 422);",
    "    const onboardingSid = randomUUID();",
    "    insertAccount.run(onboardingEmail, ACCOUNT_DISABLED, onboardingName);",
    "    savePassword(onboardingEmail, onboardingPassword);",
    // An invitation is how a second role exists: the invited address joins the EXISTING workspace, as a
    // member, rather than creating one of its own. No temporary password is ever generated or sent.
    "    const invitation = selectInvitation.get(onboardingEmail);",
    "    if (invitation) {",
    "      insertMembership.run(onboardingEmail, invitation.workspace_id, 'member', new Date().toISOString());",
    "      deleteInvitation.run(onboardingEmail);",
    "    } else {",
    "      const workspaceId = randomUUID().slice(0, 8);",
    "      insertWorkspace.run(workspaceId, onboardingWorkspaceName, onboardingUseCase, onboardingPlan, WORKSPACE.setting.options[0], new Date().toISOString());",
    "      insertMembership.run(onboardingEmail, workspaceId, 'owner', new Date().toISOString());",
    "    }",
    "    insertAuthSession.run(onboardingSid, onboardingEmail, new Date().toISOString());",
    "    response.writeHead(303, { location: '/workspace', 'set-cookie': 'sid=' + onboardingSid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600' });",
    '    return response.end();',
    '  }',
    "  if (path === '/workspace' && request.method === 'GET') {",
    "    const workspaceSession = sessionSid(request.headers.cookie);",
    "    const workspaceViewer = authSessionEmail(request.headers.cookie);",
    "    if (!workspaceSession || !workspaceViewer) {",
    "      response.writeHead(303, { location: '/login' });",
    "      return response.end();",
    "    }",
    "    const workspaceRow = workspaceOfMember(workspaceViewer);",
    "    if (!workspaceRow) {",
    "      response.writeHead(303, { location: '/onboarding' });",
    "      return response.end();",
    "    }",
    "    const workspaceRole = workspaceRoleFor(workspaceViewer);",
    "    return html(response, workspacePage(workspaceRow, selectMemberships.all(workspaceRow.id), workspaceRole, workspaceCsrf(workspaceSession)));",
    '  }',
    "  if (path === '/workspace/setting' && request.method === 'POST') {",
    "    const settingSession = sessionSid(request.headers.cookie);",
    "    const settingViewer = authSessionEmail(request.headers.cookie);",
    "    const settingBody = await parseBody(request);",
    "    if (!settingSession || !settingViewer) {",
    "      response.writeHead(303, { location: '/login' });",
    "      return response.end();",
    "    }",
    "    if (!workspaceSameToken(workspaceCsrf(settingSession), String(settingBody.csrf ?? ''))) {",
    "      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('That request did not come from your session.');",
    "    }",
    // The permission boundary, on the REQUEST: a member is refused here whether or not the form was drawn.
    "    if (workspaceRoleFor(settingViewer) !== 'owner') {",
    "      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Only the workspace owner can change this setting.');",
    "    }",
    "    const settingValue = String(settingBody.setting ?? '');",
    "    if (!WORKSPACE.setting.options.includes(settingValue)) {",
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('That is not a value this setting accepts.');",
    "    }",
    "    const settingWorkspace = workspaceOfMember(settingViewer);",
    "    updateWorkspaceSetting.run(settingValue, settingWorkspace.id);",
    "    response.writeHead(303, { location: '/workspace' });",
    '    return response.end();',
    '  }',
    "  if (path === '/workspace/invite' && request.method === 'POST') {",
    "    const inviteSession = sessionSid(request.headers.cookie);",
    "    const inviteViewer = authSessionEmail(request.headers.cookie);",
    "    const inviteBody = await parseBody(request);",
    "    if (!inviteSession || !inviteViewer) {",
    "      response.writeHead(303, { location: '/login' });",
    "      return response.end();",
    "    }",
    "    if (!workspaceSameToken(workspaceCsrf(inviteSession), String(inviteBody.csrf ?? ''))) {",
    "      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('That request did not come from your session.');",
    "    }",
    "    if (workspaceRoleFor(inviteViewer) !== 'owner') {",
    "      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Only the workspace owner can invite people.');",
    "    }",
    "    const inviteEmail = workspaceEmailField(inviteBody.invite_email);",
    "    if (!workspaceEmailLooksReal(inviteEmail)) {",
    "      response.writeHead(422, { 'content-type': 'text/plain; charset=utf-8' });",
    "      return response.end('Invite an email address.');",
    "    }",
    "    const inviteWorkspace = workspaceOfMember(inviteViewer);",
    "    insertInvitation.run(inviteEmail, inviteWorkspace.id, new Date().toISOString());",
    "    response.writeHead(303, { location: '/workspace' });",
    '    return response.end();',
    '  }',
  ].join('\n');

/** The workspace routes, hono arm: the same five. */
const honoWorkspaceRoutes = () =>
  [
    "app.get('/onboarding', (c) => {",
    "  if (authSessionEmail(c.req.header('cookie'))) return c.redirect('/workspace', 303);",
    '  return c.html(onboardingPage());',
    '});',
    "app.post('/onboarding', async (c) => {",
    '  const onboarding = await c.req.parseBody();',
    "  const onboardingEmail = workspaceEmailField(onboarding.email);",
    "  const onboardingPassword = String(onboarding.password ?? '');",
    "  const onboardingName = String(onboarding.display_name ?? '').trim() || onboardingEmail;",
    "  const onboardingWorkspaceName = String(onboarding.workspace_name ?? '').trim() || WORKSPACE.name;",
    "  const onboardingUseCase = String(onboarding.use_case ?? '');",
    "  const onboardingPlan = String(onboarding.plan ?? '');",
    "  const onboardingValues = { email: onboardingEmail, display_name: onboardingName, workspace_name: onboardingWorkspaceName, use_case: onboardingUseCase, plan: onboardingPlan };",
    "  if (!workspaceEmailLooksReal(onboardingEmail)) return c.html(onboardingPage('Enter an email address.', onboardingValues), 422);",
    "  if (onboardingPassword.length < 8) return c.html(onboardingPage('A password needs at least 8 characters.', onboardingValues), 422);",
    "  if (!WORKSPACE.use_cases.includes(onboardingUseCase)) return c.html(onboardingPage('Choose what you will use it for.', onboardingValues), 422);",
    "  if (!WORKSPACE.plans.includes(onboardingPlan)) return c.html(onboardingPage('Choose a plan.', onboardingValues), 422);",
    "  if (selectAccountByEmail.get(onboardingEmail)) return c.html(onboardingPage('That address already has an account.', onboardingValues), 422);",
    '  const onboardingSid = randomUUID();',
    '  insertAccount.run(onboardingEmail, ACCOUNT_DISABLED, onboardingName);',
    '  savePassword(onboardingEmail, onboardingPassword);',
    '  const invitation = selectInvitation.get(onboardingEmail);',
    '  if (invitation) {',
    "    insertMembership.run(onboardingEmail, invitation.workspace_id, 'member', new Date().toISOString());",
    '    deleteInvitation.run(onboardingEmail);',
    '  } else {',
    "    const workspaceId = randomUUID().slice(0, 8);",
    "    insertWorkspace.run(workspaceId, onboardingWorkspaceName, onboardingUseCase, onboardingPlan, WORKSPACE.setting.options[0], new Date().toISOString());",
    "    insertMembership.run(onboardingEmail, workspaceId, 'owner', new Date().toISOString());",
    '  }',
    "  insertAuthSession.run(onboardingSid, onboardingEmail, new Date().toISOString());",
    "  c.header('set-cookie', 'sid=' + onboardingSid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600');",
    "  return c.redirect('/workspace', 303);",
    '});',
    "app.get('/workspace', (c) => {",
    "  const workspaceSession = sessionSid(c.req.header('cookie'));",
    "  const workspaceViewer = authSessionEmail(c.req.header('cookie'));",
    "  if (!workspaceSession || !workspaceViewer) return c.redirect('/login', 303);",
    '  const workspaceRow = workspaceOfMember(workspaceViewer);',
    "  if (!workspaceRow) return c.redirect('/onboarding', 303);",
    "  return c.html(workspacePage(workspaceRow, selectMemberships.all(workspaceRow.id), workspaceRoleFor(workspaceViewer), workspaceCsrf(workspaceSession)));",
    '});',
    "app.post('/workspace/setting', async (c) => {",
    "  const settingSession = sessionSid(c.req.header('cookie'));",
    "  const settingViewer = authSessionEmail(c.req.header('cookie'));",
    '  const settingBody = await c.req.parseBody();',
    "  if (!settingSession || !settingViewer) return c.redirect('/login', 303);",
    "  if (!workspaceSameToken(workspaceCsrf(settingSession), String(settingBody.csrf ?? ''))) return c.text('That request did not come from your session.', 403);",
    "  if (workspaceRoleFor(settingViewer) !== 'owner') return c.text('Only the workspace owner can change this setting.', 403);",
    "  const settingValue = String(settingBody.setting ?? '');",
    "  if (!WORKSPACE.setting.options.includes(settingValue)) return c.text('That is not a value this setting accepts.', 422);",
    '  const settingWorkspace = workspaceOfMember(settingViewer);',
    '  updateWorkspaceSetting.run(settingValue, settingWorkspace.id);',
    "  return c.redirect('/workspace', 303);",
    '});',
    "app.post('/workspace/invite', async (c) => {",
    "  const inviteSession = sessionSid(c.req.header('cookie'));",
    "  const inviteViewer = authSessionEmail(c.req.header('cookie'));",
    '  const inviteBody = await c.req.parseBody();',
    "  if (!inviteSession || !inviteViewer) return c.redirect('/login', 303);",
    "  if (!workspaceSameToken(workspaceCsrf(inviteSession), String(inviteBody.csrf ?? ''))) return c.text('That request did not come from your session.', 403);",
    "  if (workspaceRoleFor(inviteViewer) !== 'owner') return c.text('Only the workspace owner can invite people.', 403);",
    "  const inviteEmail = workspaceEmailField(inviteBody.invite_email);",
    "  if (!workspaceEmailLooksReal(inviteEmail)) return c.text('Invite an email address.', 422);",
    '  const inviteWorkspace = workspaceOfMember(inviteViewer);',
    '  insertInvitation.run(inviteEmail, inviteWorkspace.id, new Date().toISOString());',
    "  return c.redirect('/workspace', 303);",
    '});',
  ].join('\n');

/** The small page renderers the capability handlers share, emitted only when a capability needs them. */
// The capability pages load the same single enhancement script the arm templates do, but ONLY when a
// capability that needs it is on. Without the tag the script was served and never loaded, so a capability
// whose behaviour is client-side - the game's loop is the one - got a page and no behaviour at all
// (mwg-train-ypr). The tag is gated rather than unconditional because every project with a list route emits this
// helper: ungated it was 53 bytes in each of the 203 recorded training trees that emit it, and it moved the corpus
// hash and the token record by exactly 10759 characters, which the full gate caught on the merger's merged tree
// 0d99d0f. Those three numbers were measured when the fix was reviewed; the estimate first written here - 51 bytes
// across all 210 trees - was wrong in both factors, which is why the gate, not the comment, is the authority.
const capabilityPages = (caps) =>
  [
    "const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');",
    `const capabilityPage = (title, body) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title) + '</title><link rel="stylesheet" href="/app/styles.css"></head><body><main>' + body + '</main>${caps.game ? '<script type="module" src="/app/enhance.js"></script>' : ''}</body></html>';`,
    "const loginPage = (error) => capabilityPage('Sign in', '<h1>Sign in</h1>' + (error ? '<p role=\"alert\">' + esc(error) + '</p>' : '') + '<form method=\"post\" action=\"/login\"><label for=\"email\">Email</label><input type=\"email\" id=\"email\" name=\"email\" required autocomplete=\"username\"><label for=\"password\">Password</label><input type=\"password\" id=\"password\" name=\"password\" required autocomplete=\"current-password\"><button type=\"submit\">Sign in</button></form>');",
    "const listPage = (title, detailPrefix, rows) => capabilityPage(title, '<h1>' + esc(title) + '</h1><ul>' + rows.map((row) => '<li><a href=\"' + detailPrefix + esc(row.ref) + '\">' + esc(row.ref) + '</a> ' + esc(JSON.stringify(row.payload)) + '</li>').join('') + '</ul>');",
    "const detailPage = (row) => capabilityPage('Record ' + row.ref, '<h1>Record ' + esc(row.ref) + '</h1><dl>' + Object.entries(JSON.parse(row.payload)).map(([key, value]) => '<dt>' + esc(key) + '</dt><dd>' + esc(value) + '</dd>').join('') + '</dl>');",
  ].join('\n');

/** The auth capability's tables, statements and seed accounts (the accounts table itself is per-arm). */
const authTables = (archetype) =>
  [
    "db.exec('CREATE TABLE IF NOT EXISTS auth_sessions (sid TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT NOT NULL)');",
    // Credentials live in their own table, and the legacy `accounts.password` column is written with a
    // DISABLED marker rather than a secret. The plaintext comparison this replaces
    // (`WHERE email = ? AND password = ?`) was the defect this bead exists to fix: it stored a password in
    // the clear and checked it by string equality (mwg-train-ksn).
    "db.exec('CREATE TABLE IF NOT EXISTS account_credentials (email TEXT PRIMARY KEY, kdf TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL)');",
    "const insertCredential = db.prepare('INSERT OR REPLACE INTO account_credentials (email, kdf, salt, digest) VALUES (?, ?, ?, ?)');",
    "const selectCredential = db.prepare('SELECT email, kdf, salt, digest FROM account_credentials WHERE email = ?');",
    // `!` in the legacy column means "no usable password here", the way a shadow file marks a locked
    // account: the credential is in account_credentials, and this column holds no secret at all.
    "const ACCOUNT_DISABLED = '!';",
    "const ACCOUNT_KDF = 'scrypt';",
    "const ACCOUNT_KEY_BYTES = 32;",
    // A named KDF with a per-user random salt. The cost parameters are stated rather than defaulted, so a
    // reader can see what is spent and raise it deliberately.
    "const ACCOUNT_KDF_PARAMS = { N: 16384, r: 8, p: 1 };",
    "const hashPassword = (password) => {",
    "  const salt = randomBytes(16).toString('hex');",
    "  const digest = scryptSync(String(password), salt, ACCOUNT_KEY_BYTES, ACCOUNT_KDF_PARAMS).toString('hex');",
    "  return { kdf: ACCOUNT_KDF, salt, digest };",
    "};",
    // Constant-time, and it does the same work whether or not the address has an account: a login that
    // answers faster for an address with no account tells an attacker which addresses have one.
    "const DUMMY_CREDENTIAL = hashPassword('not-a-password');",
    "const verifyPassword = (password, credential) => {",
    "  const row = credential ?? DUMMY_CREDENTIAL;",
    "  if (row.kdf !== ACCOUNT_KDF) return false;",
    "  const expected = Buffer.from(row.digest, 'hex');",
    // A digest that is not the length this code writes is not a credential, and this check is load-bearing:
    // `Buffer.from('', 'hex')` and `Buffer.from('xyz', 'hex')` are both ZERO-length, `scryptSync(pw, salt, 0)`
    // is zero-length, and `timingSafeEqual` between two empty buffers is TRUE - so a row whose digest was
    // emptied, truncated or corrupted would have accepted ANY password. Deriving from the fixed constant
    // rather than from the stored length also removes the 1-in-256 collision a one-byte digest would give
    // (mwg-train-ksn security review, P1, proven with a runnable snippet).
    "  if (expected.length !== ACCOUNT_KEY_BYTES) return false;",
    "  const actual = scryptSync(String(password), row.salt, ACCOUNT_KEY_BYTES, ACCOUNT_KDF_PARAMS);",
    "  const match = timingSafeEqual(expected, actual);",
    "  return Boolean(credential) && match;",
    "};",
    "const savePassword = (email, password) => {",
    "  const credential = hashPassword(password);",
    "  insertCredential.run(email, credential.kdf, credential.salt, credential.digest);",
    "};",
    "const insertAuthSession = db.prepare('INSERT INTO auth_sessions (sid, email, created_at) VALUES (?, ?, ?)');",
    "const selectAuthSession = db.prepare('SELECT email, created_at FROM auth_sessions WHERE sid = ?');",
    // The session's lifetime, in one place. It is the same hour the `Max-Age=3600` cookie asks the browser
    // for, and the server enforces it too: the browser's Max-Age is the browser's promise, and a sid
    // replayed by a script, an agent or a stolen cookie after it expired must not still be a session
    // (mwg-train-ksn security review, P2).
    "const AUTH_SESSION_SECONDS = 3600;",
    "const deleteAuthSession = db.prepare('DELETE FROM auth_sessions WHERE sid = ?');",
    // Looked up by email ONLY: the password is no longer part of the query.
    "const selectAccountByEmail = db.prepare('SELECT email, display_name FROM accounts WHERE email = ?');",
    // The seeded password is HASHED at boot: it is never stored, never logged, and never rendered. The
    // literal exists only in the specification this project is built from, which is the fixture, not the
    // database (mwg-train-ksn). Both statements come from ONE map callback, so `account` is in scope for
    // both - the first version of this edit put the second template in the map's argument list, where
    // `account` does not exist, and the generator crashed on the first seeded spec.
    ...(archetype.seedAccounts ?? []).map(
      (account) =>
        `db.prepare('INSERT OR IGNORE INTO accounts (email, password, display_name) VALUES (?, ?, ?)').run(${JSON.stringify(account.email)}, ACCOUNT_DISABLED, ${JSON.stringify(account.display_name ?? null)});\n` +
        `savePassword(${JSON.stringify(account.email)}, ${JSON.stringify(account.password)});`,
    ),
    'const sessionSid = (cookieHeader) =>',
    "  (cookieHeader ?? '')",
    "    .split(';')",
    '    .map((part) => part.trim())',
    "    .find((part) => part.startsWith('sid='))",
    "    ?.slice('sid='.length);",
    'const authSessionFresh = (row) => Date.now() - Date.parse(row.created_at) < AUTH_SESSION_SECONDS * 1000;',
    'const authSessionEmail = (cookieHeader) => {',
    '  const sid = sessionSid(cookieHeader);',
    '  const row = sid ? selectAuthSession.get(sid) : undefined;',
    // An unparseable or missing `created_at` is treated as expired rather than as fresh: a row this code
    // cannot date is a row it cannot vouch for.
    '  return row && authSessionFresh(row) ? row.email : undefined;',
    '};',
  ].join('\n');

/**
 * The login/logout handlers, raw arm.
 *
 * `/logout` deliberately does NOT require the CSRF token its form carries. Signing a visitor out is not a
 * privilege it can abuse - the worst outcome is a forced sign-out - and an `auth`-only project has no token
 * to send, so requiring one would break sign-out for every specification that does not also turn on the
 * workspace capability. `SameSite=Lax` is the control on the cross-site POST case, and the token is still
 * rendered so a project that wants to enforce it can (mwg-train-ksn security review, P3, answered rather
 * than ignored).
 */
const rawAuthRoutes = () =>
  [
    "  if (path === '/login' && request.method === 'GET') return html(response, loginPage());",
    "  if (path === '/login' && request.method === 'POST') {",
    '    const body = await parseBody(request);',
    "    const loginEmail = String(body.email ?? '').trim().toLowerCase();",
    "    const loginAccount = selectAccountByEmail.get(loginEmail);",
    "    const loginOk = verifyPassword(String(body.password ?? ''), selectCredential.get(loginEmail));",
    // One message for every failure, so the response cannot be used to ask whether an address exists.
    "    if (!loginAccount || !loginOk) return html(response, loginPage('Those credentials did not match an account.'), 401);",
    '    const sid = randomUUID();',
    '    insertAuthSession.run(sid, loginAccount.email, new Date().toISOString());',
    "    response.writeHead(303, { location: '/', 'set-cookie': 'sid=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600' });",
    '    return response.end();',
    '  }',
    "  if (path === '/logout' && request.method === 'POST') {",
    '    const sid = sessionSid(request.headers.cookie);',
    '    if (sid) deleteAuthSession.run(sid);',
    "    response.writeHead(303, { location: '/', 'set-cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });",
    '    return response.end();',
    '  }',
  ].join('\n');

/** The login/logout handlers, hono arm. */
const honoAuthRoutes = () =>
  [
    "app.get('/login', (c) => c.html(loginPage()));",
    "app.post('/login', async (c) => {",
    '  const body = await c.req.parseBody();',
    "  const loginEmail = String(body.email ?? '').trim().toLowerCase();",
    "  const loginAccount = selectAccountByEmail.get(loginEmail);",
    "  const loginOk = verifyPassword(String(body.password ?? ''), selectCredential.get(loginEmail));",
    "  if (!loginAccount || !loginOk) return c.html(loginPage('Those credentials did not match an account.'), 401);",
    '  const sid = randomUUID();',
    '  insertAuthSession.run(sid, loginAccount.email, new Date().toISOString());',
    "  c.header('set-cookie', 'sid=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600');",
    "  return c.redirect('/', 303);",
    '});',
    "app.post('/logout', (c) => {",
    "  const sid = sessionSid(c.req.header('cookie'));",
    '  if (sid) deleteAuthSession.run(sid);',
    "  c.header('set-cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');",
    "  return c.redirect('/', 303);",
    '});',
  ].join('\n');

/** The auth guard a protected page runs first (raw arm). */
const RAW_AUTH_GUARD = [
  '    if (!authSessionEmail(request.headers.cookie)) {',
    "      response.writeHead(303, { location: '/login' });",
    '      return response.end();',
    '    }',
].join('\n');

/** The functional list-page handlers, raw arm: one per declared list route. */
const rawListRoutes = (archetype, auth) => {
  const detailPrefix = archetype.routes.find((route) => route.kind === 'read-by-reference')?.path.replace(/:ref.*$/, '') ?? '/record/';
  return archetype.routes
    .filter((route) => route.kind === 'list')
    .map((route) =>
      [
        `  if (path === ${JSON.stringify(route.path)} && request.method === 'GET') {`,
        ...(auth ? [RAW_AUTH_GUARD] : []),
        '    const rows = list.all();',
        `    return html(response, listPage(${JSON.stringify(route.path)}, ${JSON.stringify(detailPrefix)}, rows));`,
        '  }',
      ].join('\n'),
    )
    .join('\n\n');
};

/** The functional list-page handlers, hono arm. */
const honoListRoutes = (archetype, auth) => {
  const detailPrefix = archetype.routes.find((route) => route.kind === 'read-by-reference')?.path.replace(/:ref.*$/, '') ?? '/record/';
  return archetype.routes
    .filter((route) => route.kind === 'list')
    .map((route) =>
      [
        `app.get(${JSON.stringify(route.path)}, (c) => {`,
        ...(auth ? ["  if (!authSessionEmail(c.req.header('cookie'))) return c.redirect('/login', 303);"] : []),
        `  return c.html(listPage(${JSON.stringify(route.path)}, ${JSON.stringify(detailPrefix)}, list.all()));`,
        '});',
      ].join('\n'),
    )
    .join('\n');
};

function serverSource(archetype, framework, defects = [], set = null) {
  const caps = capabilitiesOf(archetype);
  const writeRoute = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'));
  const insecureCookie = archetype.session && !framework.cookieFlags;
  const cookieFlags = archetype.session
    ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${framework.secureCookie ? '; Secure' : ''}`
    : null;
  // The cart's cookie is its own: `cart` cannot combine with `session` (both own `sid`), so it does not
  // reuse `cookieFlags`, which is null for a cart-only spec.
  const cartCookieFlags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${framework.secureCookie ? '; Secure' : ''}`;
  // The write route may be parameterised (e.g. /concerts/:id/reserve). The generic server matches it
  // with the same :param-to-capture rewrite it uses for the read route, so a literal write path (every
  // pilot route) is an exact match and a parameterised one captures each segment. The rewrite runs at
  // generation time, so the generated server carries a ready-to-compile pattern rather than the path.
  const parameterisedWrite = /:[A-Za-z0-9_]+/.test(writeRoute.path);
  const writeMatchSource = `^${writeRoute.path.replace(/:[A-Za-z0-9_]+/g, '([^/]+)')}$`;
  // A field that declares a lower bound is validated server-side too, unless the project is seeded with
  // accept-invalid-amount (training-only). The pilot declares no bounds, so this emits nothing for it.
  const minBounds = archetype.fields.filter((field) => field.min !== undefined).map((field) => ({ name: field.name, min: Number(field.min) }));
  const enforceMin = minBounds.length > 0 && !defects.includes('accept-invalid-amount');
  return `/**
 * ${archetype.id} server, ${framework.name} arm. Server-rendered pages, an ephemeral SQLite store, and
 * a JSON endpoint the enhancement script reads. Written to be readable rather than clever: the pilot
 * measures behaviour, and a reviewer has to be able to see what the server does.
 */
import { createServer } from 'node:http';
import { readFileSync${set ? ', existsSync' : ''} } from 'node:fs';
import { randomUUID${set ? ', createHash' : ''}${caps.workspace ? ', createHash' : ''}${caps.auth ? ', randomBytes, scryptSync, timingSafeEqual' : ''} } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDocument } from './app/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
${assetRuntime(set)}const arg = (name, fallback) => {
  const index = process.argv.indexOf(\`--\${name}\`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const port = Number(arg('port', process.env.PILOT_PORT ?? 3000));
const dbPath = arg('db', join(here, 'pilot.sqlite'));

const db = new DatabaseSync(dbPath);
db.exec(\`CREATE TABLE IF NOT EXISTS records (
  ref TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
)\`);
db.exec(\`CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, password TEXT NOT NULL, display_name TEXT)\`);

const insert = db.prepare('INSERT INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
const select = db.prepare('SELECT ref, created_at, payload FROM records WHERE ref = ?');
${sessionTables(archetype)}${archetype.journey?.update ? `\nconst updateRecord = db.prepare('UPDATE records SET payload = ? WHERE ref = ?');` : ''}${draftTables(archetype) ? `\n${draftTables(archetype)}` : ''}
${caps.auth ? `${authTables(archetype)}\n` : ''}${caps.cart ? `${cartTables(caps.checkout)}\n` : ''}${caps.checkout ? `${checkoutTables()}\n` : ''}${caps.survey ? `${surveyTables()}\n` : ''}${caps.game ? `${gameTables()}\n` : ''}${caps.workspace ? `${workspaceTables()}\n` : ''}const count = db.prepare('SELECT COUNT(*) AS n FROM records');
const list = db.prepare('SELECT ref, payload FROM records ORDER BY created_at DESC LIMIT 50');

${parameterisedWrite ? `// An edit flow edits something: the seeded record is what the form's action points at.
db.prepare('INSERT OR IGNORE INTO records (ref, created_at, payload) VALUES (?, ?, ?)').run('${EDIT_SEED_REF}', new Date().toISOString(), '{}');
const upsert = db.prepare('INSERT OR REPLACE INTO records (ref, created_at, payload) VALUES (?, ?, ?)');

` : ''}
const parseBody = (request) =>
  new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body))));
  });

const html = (response, document, status = 200, headers = {}) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
  response.end(document);
};
const json = (response, value, status = 200, headers = {}) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(value));
};

${caps.list_pages || caps.detail_page || caps.auth || caps.cart || caps.pricing_tiers || caps.checkout || caps.survey || caps.game || caps.workspace ? `${capabilityPages(caps)}${caps.cart ? `\n${cartPages(archetype)}` : ''}${caps.pricing_tiers ? `\n${pricingPages(archetype)}` : ''}${caps.checkout ? `\n${checkoutPages(archetype)}` : ''}${caps.survey ? `\n${surveyPages(archetype)}` : ''}${caps.game ? `\n${gamePages(archetype)}` : ''}${caps.workspace ? `\n${workspacePages(archetype)}` : ''}\n` : ''}const REQUIRED = ${JSON.stringify(archetype.fields.filter((field) => field.type !== 'select' && !field.optional).map((field) => field.name))};

${enforceMin ? `const MIN_BOUNDS = ${JSON.stringify(minBounds)};\n` : ''}// The cart form has its own fields. Validating it against the search form's required list refused every
// cart POST with 422, which the write journey caught: a second form on one page needs a second rule.
const EXTRA_ACTION = ${JSON.stringify(archetype.extraForm?.action ?? '')};
const EXTRA_REQUIRED = ${JSON.stringify([
  ...Object.keys(archetype.extraForm?.hidden ?? {}),
  ...archetype.fields
    .filter((field) => (archetype.extraForm?.fields ?? []).includes(field.slug) && field.type !== 'select' && !field.optional)
    .map((field) => field.name),
])};
const requiredFor = (path) => (EXTRA_ACTION !== '' && path === EXTRA_ACTION ? EXTRA_REQUIRED : REQUIRED);

// Every request this server answered, in order. The browser's own network log never reported the form
// POST, so the POST's status was being taken from the page it redirected to - which is how 'the POST
// succeeded' came to be claimed with no POST observed. The server is the witness for its own writes.
const requestLog = [];

const server = createServer(async (request, response) => {
  const url = new URL(request.url, \`http://\${request.headers.host ?? '127.0.0.1'}\`);
  const path = url.pathname;
  if (path !== '/__requests') {
    const writeHead = response.writeHead.bind(response);
    response.writeHead = (status, headers) => {
      requestLog.push({ method: request.method, path, status });
      return writeHead(status, headers);
    };
  }

  if (path === '/__health') return json(response, { ok: true });
  if (path === '/__requests' && request.method === 'GET') return json(response, requestLog);

  if (path.startsWith('/app/')) {
    const file = join(here, path);
    try {
      const body = readFileSync(file);
      const type = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/plain';
      response.writeHead(200, { 'content-type': \`\${type}; charset=utf-8\` });
      return response.end(body);
    } catch {
${set ? `      // Not in the tree, so it may be one of the archetype's boards: served from the store, and only if
      // its bytes still hash to the recorded digest. The provenance header is deliberate - a reader and a
      // test can both tell a board of the target from a file the build itself wrote.
      const asset = readArchetypeAsset(decodeAssetName(path.slice('/app/'.length)));
      if (asset) {
        response.writeHead(200, { 'content-type': asset.type, 'x-asset-source': \`\${ASSET_STORE}/images\`, 'cache-control': 'no-store' });
        return response.end(asset.body);
      }
` : ''}      response.writeHead(404);
      return response.end('not found');
    }
  }

  ${archetype.journey?.steps ? `if (path === '/' && request.method === 'GET') {
    const sidCookie = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sid='))
      ?.slice('sid='.length);
    const draftRows = sidCookie ? selectDrafts.all(sidCookie) : [];
    let doc = await renderDocument({ title: ${JSON.stringify(archetype.title)} });
    if (draftRows.length > 0) {
      doc = prefillDrafts(doc, draftRows);
      const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${escDraft(d.value)}</p>\`).join('\\n')}</div>\`;
      doc = doc.replace('</main>', \`\${carriedHtml}</main>\`);
    }
    return html(response, doc);
  }${archetype.journey.startPath !== '/' ? `\n\n  if (path === ${JSON.stringify(archetype.journey.startPath)} && request.method === 'GET') {
    const sidCookie = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sid='))
      ?.slice('sid='.length);
    const draftRows = sidCookie ? selectDrafts.all(sidCookie) : [];
    let doc = await renderDocument({ title: ${JSON.stringify(archetype.title)} });
    if (draftRows.length > 0) {
      doc = prefillDrafts(doc, draftRows);
      const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${escDraft(d.value)}</p>\`).join('\\n')}</div>\`;
      doc = doc.replace('</main>', \`\${carriedHtml}</main>\`);
    }
    return html(response, doc);
  }` : ''}` : `if (path === '/' && request.method === 'GET') return html(response, await renderDocument({ title: ${JSON.stringify(archetype.title)} }));`}

  ${parameterisedWrite ? `const writeMatch = path.match(new RegExp(${JSON.stringify(writeMatchSource)}));
  if (writeMatch && request.method === 'POST') {` : `if (path === '${writeRoute.path}' && request.method === 'POST') {`}
    const body = await parseBody(request);
    const missing = requiredFor(path).filter((field) => !String(body[field] ?? '').trim());
    if (missing.length > 0) {
      // The server validates as well as the client: a browser without JS must not be able to post an
      // empty record, and the response has to be a usable page again - an apology with no form strands
      // the user, which is its own defect.
      const document = await renderDocument({ title: 'Please correct the form', data: { errorSummary: \`Missing: \${missing.join(', ')}\` } });
      return html(response, document.replace('<h1>', \`<p role="alert">Missing: \${missing.join(', ')}</p><h1>\`), 422);
    }
    ${enforceMin ? `const underMinimum = MIN_BOUNDS.filter(({ name, min }) => {
      const raw = String(body[name] ?? '').trim();
      const value = Number(raw);
      return raw !== '' && (Number.isNaN(value) || value < min);
    }).map(({ name }) => name);
    if (underMinimum.length > 0) {
      const document = await renderDocument({ title: 'Please correct the form', data: { errorSummary: \`Below minimum: \${underMinimum.join(', ')}\` } });
      return html(response, document.replace('<h1>', \`<p role="alert">Below minimum: \${underMinimum.join(', ')}</p><h1>\`), 422);
    }
    ` : ''}${parameterisedWrite ? `// The edit target's own reference is the record key: posting an edit route updates THAT
    // record, so the ref is the captured segment and the write is an upsert, never a new row.
    const ref = writeMatch[1];` : 'const ref = randomUUID().slice(0, 8);'}
    ${defects.includes('client-only-state')
      ? '// DEFECT (client-only-state): the submission is kept only in component state, so nothing is written to the store and a reload of the confirmation route finds no record.'
      : `${parameterisedWrite ? 'upsert' : 'insert'}.run(ref, new Date().toISOString(), JSON.stringify(body));`}
${archetype.session ? `    // The session is what makes the follow-up page show the right record, so it is stored, not guessed.
    const sid = randomUUID();
    insertSession.run(sid, ref, new Date().toISOString());
    const headers = { 'set-cookie': \`sid=\${sid}; ${cookieFlags}\` };` : '    const headers = {};'}
    response.writeHead(303, { location: \`${writeRoute.redirect('${ref}')}\`.replace('\${ref}', ref), ...headers });
    return response.end();
  }

  const readRoute = ${JSON.stringify(archetype.routes.find((route) => route.kind === 'read-by-reference')?.path ?? '/record/:ref')};
  const readMatch = path.match(new RegExp('^' + readRoute.replace(':ref', '([^/]+)').replace(/\\//g, '\\\\/') + '$'));
  if (readMatch && request.method === 'GET') {
${caps.detail_page && caps.auth ? `${RAW_AUTH_GUARD}\n` : ''}    const row = select.get(readMatch[1]);
    if (!row) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return response.end('<!doctype html><title>Not found</title><p>We could not find that record.</p>');
    }
    ${archetype.journey?.update ? `const payload = JSON.parse(row.payload);
    const targetVal = String(payload[${JSON.stringify(archetype.journey.update.field)}] ?? '').replace(/"/g, '&quot;');
    const editForm = \`<form id="edit-form" method="post" action="/edit/\${row.ref}">
      <label for="edit-${archetype.journey.update.field}">${archetype.fields.find((f) => f.name === archetype.journey.update.field)?.label ?? archetype.journey.update.field}</label>
      <input id="edit-${archetype.journey.update.field}" name="${archetype.journey.update.field}" value="\${targetVal}">
      <button type="submit">Update</button>
    </form>\`;
    let doc = ${caps.detail_page ? 'detailPage(row)' : "await renderDocument({ title: 'Your submission', data: { ref: row.ref } })"};
    return html(response, doc.replace('</main>', \`\${editForm}</main>\`));` : `${caps.cart ? `return html(response, cartProductPage(row));` : caps.detail_page ? `return html(response, detailPage(row));` : `return html(response, await renderDocument({ title: 'Your submission', data: { ref: row.ref } }));`}`}
  }${archetype.journey?.update ? `\n\n  const editMatch = path.match(/^\\/edit\\/([^/]+)$/);
  if (editMatch && request.method === 'POST') {
    const editRef = editMatch[1];
    const row = select.get(editRef);
    if (!row) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return response.end('not found');
    }
    const body = await parseBody(request);
    const existing = JSON.parse(row.payload);
    const updated = { ...existing, ...body };
    const missing = REQUIRED.filter((field) => !String(updated[field] ?? '').trim());
    if (missing.length > 0) {
      const document = await renderDocument({ title: 'Please correct the form', data: { errorSummary: \`Missing: \${missing.join(', ')}\` } });
      return html(response, document.replace('<h1>', \`<p role="alert">Missing: \${missing.join(', ')}</p><h1>\`), 422);
    }
    updateRecord.run(JSON.stringify(updated), editRef);
    const readUrl = readRoute.replace(/:[A-Za-z0-9_]+/g, editRef);
    response.writeHead(303, { location: readUrl });
    return response.end();
  }` : ''}

  if (path === '/api/me' && request.method === 'GET') {
${caps.auth ? `    // The account session echo: which account the login cookie belongs to.
    const email = authSessionEmail(request.headers.cookie);
    if (!email) return json(response, { error: 'no session' }, 401);
    return json(response, { email });
` : `    // The session echo: who the server thinks you are, from the cookie it issued.
    const sid = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sid='))
      ?.slice('sid='.length);
    const session = sid ? selectSession.get(sid) : undefined;
    const record = session ? select.get(session.ref) : undefined;
    if (!record) return json(response, { error: 'no session' }, 401);
    return json(response, { ref: record.ref, ...JSON.parse(record.payload) });
`}  }

  if (path === '/api/records' && request.method === 'GET') {
${caps.auth ? `    if (!authSessionEmail(request.headers.cookie)) return json(response, { error: 'no session' }, 401);\n` : ''}    ${archetype.journey?.search ? `const q = url.searchParams.get('q');
    let rows = list.all();
    if (q) rows = rows.filter((row) => row.payload.toLowerCase().includes(q.toLowerCase()));
    return json(response, rows.map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })));` : `// The write journey's read side: what the server actually stored, listed back to the caller.
    return json(response, list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })));`}
  }

  if (path.startsWith('/api/record/') && request.method === 'GET') {
${caps.auth ? `    if (!authSessionEmail(request.headers.cookie)) return json(response, { error: 'no session' }, 401);
` : ''}    const row = select.get(path.split('/').pop());
    if (!row) return json(response, { error: 'not found' }, 404);
    return json(response, { ref: row.ref, ...JSON.parse(row.payload) });
  }

${caps.cart ? `${rawCartRoutes(archetype, cartCookieFlags, checkoutOf(archetype))}\n\n` : ''}${caps.checkout ? `${rawCheckoutRoutes()}\n\n` : ''}${caps.survey ? `${rawSurveyRoutes()}\n\n` : ''}${caps.game ? `${rawGameRoutes()}\n\n` : ''}${caps.workspace ? `${rawWorkspaceRoutes()}\n\n` : ''}${caps.pricing_tiers ? `${rawPricingRoutes()}\n\n` : ''}  // A route the archetype declares is a route the server must serve: /account was declared as the
  // account flow's page and never implemented, so the journey landed on a 404.
  if (${JSON.stringify(archetype.routes.filter((route) => route.kind === 'read-session').map((route) => route.path))}.includes(path) && request.method === 'GET') {
${caps.auth ? `${RAW_AUTH_GUARD}\n` : ''}    return html(response, await renderDocument({ title: 'Your account' }));
  }

${caps.auth ? `${rawAuthRoutes()}\n\n` : ''}${caps.list_pages ? rawListRoutes(archetype, caps.auth) : `  if (path === '/roster' || path === '/inbox' || path === '/attendees' || path === '/cart') {
    const rows = list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) }));
    return html(response, await renderDocument({ title: 'Records', data: { rows } }));
  }`}

  ${archetype.journey?.search
    ? (archetype.journey.search.path === '/search'
        ? `if (path === '/search' && request.method === 'GET') {
    const query = url.searchParams.get(${JSON.stringify(archetype.journey.search.queryParam)}) ?? '';
    return html(response, \`${searchPageDocument(archetype.journey.search)}\`);
  }`
        : `if (path === ${JSON.stringify(archetype.journey.search.path)} && request.method === 'GET') {
    const query = url.searchParams.get(${JSON.stringify(archetype.journey.search.queryParam)}) ?? '';
    return html(response, \`${searchPageDocument(archetype.journey.search)}\`);
  }

  if (path === '/search' && request.method === 'GET') {
    const query = url.searchParams.get('q') ?? '';
    const rows = list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
    return html(response, await renderDocument({ title: \`Search: \${query}\`, data: { query, rows } }));
  }`)
    : `if (path === '/search' && request.method === 'GET') {
    const query = url.searchParams.get('q') ?? '';
    const rows = list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
    return html(response, await renderDocument({ title: \`Search: \${query}\`, data: { query, rows } }));
  }`}${archetype.journey?.steps ? `\n\n  if ((path === '/draft' || ${JSON.stringify(archetype.journey.steps.map((s) => s.path))}.includes(path)) && request.method === 'POST') {
    const sidCookie = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sid='))
      ?.slice('sid='.length);
    const sid = sidCookie || randomUUID();
    const body = await parseBody(request);
    for (const [key, value] of Object.entries(body)) {
      if (key !== 'next') insertDraft.run(sid, key, String(value));
    }
    const stepNextMap = ${JSON.stringify(Object.fromEntries(archetype.journey.steps.map((s, idx, arr) => [s.path, idx < arr.length - 1 ? arr[idx + 1].path : archetype.journey.startPath])))};
    const nextUrl = url.searchParams.get('next') || stepNextMap[path] || ${JSON.stringify(archetype.journey.startPath)};
    const headers = { 'set-cookie': \`sid=\${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600\`, location: nextUrl };
    response.writeHead(303, headers);
    return response.end();
  }

  ${archetype.journey.steps.map((step, idx) => `if (path === '${step.path}' && request.method === 'GET') {
    const sidCookie = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sid='))
      ?.slice('sid='.length);
    const draftRows = sidCookie ? selectDrafts.all(sidCookie) : [];
    const carriedHtml = draftRows.length > 0
      ? \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${escDraft(d.value)}</p>\`).join('\\n')}</div>\`
      : '';
    let page = \`${stepPageDocument(step, idx, archetype.journey.steps, archetype)}\`;
    if (draftRows.length > 0) page = prefillDrafts(page, draftRows);
    return html(response, page);
  }`).join('\n  ')}` : ''}

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(\`listening on \${port} with \${dbPath}\`);
});
`;
}


/** The Hono arm's server: Hono owns routing and responses, node:http only carries them. */
function honoServerSource(archetype, framework, defects = [], set = null) {
  const caps = capabilitiesOf(archetype);
  const writeRoute = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'));
  // Hono routes :param segments natively; the FIRST parameter of an edit route is the record key.
  const parameterisedWrite = /:[A-Za-z0-9_]+/.test(writeRoute.path);
  const writeParam = writeRoute.path.match(/:([A-Za-z0-9_]+)/)?.[1] ?? 'id';
  const cookieFlags = archetype.session ? 'HttpOnly; SameSite=Lax; Path=/; Max-Age=3600' : null;
  // See serverSource: the cart owns its own cookie and `cart` cannot combine with `session`.
  const cartCookieFlags = 'HttpOnly; SameSite=Lax; Path=/; Max-Age=3600';
  // Hono routes :param segments natively, so a parameterised write path needs no rewrite here. Only the
  // training-only bounds validation and client-only-state tokens differ; the pilot passes neither.
  const minBounds = archetype.fields.filter((field) => field.min !== undefined).map((field) => ({ name: field.name, min: Number(field.min) }));
  const enforceMin = minBounds.length > 0 && !defects.includes('accept-invalid-amount');
  return `/**
 * ${archetype.id} server, hono arm: routing in Hono, pages as hono/html templates, records in SQLite.
 *
 * Hono runs on the server, so this arm keeps the same journey contract as the others (a POST that
 * writes, a GET that reads the record back, a JSON endpoint the enhancement script reads) while the
 * markup stays plain HTML strings rather than a virtual DOM.
 */
import { createServer } from 'node:http';
import { readFileSync${set ? ', existsSync' : ''} } from 'node:fs';
import { randomUUID${set ? ', createHash' : ''}${caps.workspace ? ', createHash' : ''}${caps.auth ? ', randomBytes, scryptSync, timingSafeEqual' : ''} } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { renderDocument, renderPage } from './app/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
${assetRuntime(set)}const arg = (name, fallback) => {
  const index = process.argv.indexOf(\`--\${name}\`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const port = Number(arg('port', process.env.PILOT_PORT ?? 3000));
const dbPath = arg('db', join(here, 'pilot.sqlite'));

const db = new DatabaseSync(dbPath);
db.exec(\`CREATE TABLE IF NOT EXISTS records (ref TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)\`);
const insert = db.prepare('INSERT INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
const select = db.prepare('SELECT ref, created_at, payload FROM records WHERE ref = ?');
${archetype.journey?.update ? `const updateRecord = db.prepare('UPDATE records SET payload = ? WHERE ref = ?');\n` : ''}${draftTables(archetype) ? `${draftTables(archetype)}\n` : ''}const list = db.prepare('SELECT ref, payload FROM records ORDER BY created_at DESC LIMIT 50');

${parameterisedWrite ? `// An edit flow edits something: the seeded record is what the form's action points at.
db.prepare('INSERT OR IGNORE INTO records (ref, created_at, payload) VALUES (?, ?, ?)').run('${EDIT_SEED_REF}', new Date().toISOString(), '{}');
const upsert = db.prepare('INSERT OR REPLACE INTO records (ref, created_at, payload) VALUES (?, ?, ?)');

` : ''}const REQUIRED = ${JSON.stringify(archetype.fields.filter((field) => field.type !== 'select' && !field.optional).map((field) => field.name))};

${enforceMin ? `const MIN_BOUNDS = ${JSON.stringify(minBounds)};\n` : ''}// The cart form has its own fields. Validating it against the search form's required list refused every
// cart POST with 422, which the write journey caught: a second form on one page needs a second rule.
const EXTRA_ACTION = ${JSON.stringify(archetype.extraForm?.action ?? '')};
const EXTRA_REQUIRED = ${JSON.stringify([
  ...Object.keys(archetype.extraForm?.hidden ?? {}),
  ...archetype.fields
    .filter((field) => (archetype.extraForm?.fields ?? []).includes(field.slug) && field.type !== 'select' && !field.optional)
    .map((field) => field.name),
])};
const requiredFor = (path) => (EXTRA_ACTION !== '' && path === EXTRA_ACTION ? EXTRA_REQUIRED : REQUIRED);
${sessionTables(archetype)}
${caps.auth ? `db.exec('CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, password TEXT NOT NULL, display_name TEXT)');
${authTables(archetype)}
` : ''}${caps.cart ? `${cartTables(caps.checkout)}\n` : ''}${caps.checkout ? `${checkoutTables()}\n` : ''}${caps.survey ? `${surveyTables()}\n` : ''}${caps.game ? `${gameTables()}\n` : ''}${caps.workspace ? `${workspaceTables()}\n` : ''}${caps.list_pages || caps.detail_page || caps.auth || caps.cart || caps.pricing_tiers || caps.checkout || caps.survey || caps.game || caps.workspace ? `${capabilityPages(caps)}${caps.cart ? `\n${cartPages(archetype)}` : ''}${caps.pricing_tiers ? `\n${pricingPages(archetype)}` : ''}${caps.checkout ? `\n${checkoutPages(archetype)}` : ''}${caps.survey ? `\n${surveyPages(archetype)}` : ''}${caps.game ? `\n${gamePages(archetype)}` : ''}${caps.workspace ? `\n${workspacePages(archetype)}` : ''}
` : ''}const requestLog = [];
const app = new Hono();
app.use('*', async (c, next) => {
  await next();
  if (c.req.path !== '/__requests') requestLog.push({ method: c.req.method, path: c.req.path, status: c.res.status });
});
app.get('/__requests', (c) => c.json(requestLog));

app.get('/__health', (c) => c.json({ ok: true }));

app.get('/app/:file', (c) => {
${set ? `  // The param read is INSIDE the try on purpose. Reading it decodes a percent-encoded path segment, and a
  // malformed escape is a throw; if that escaped the handler the whole server would go down on GET /app/%zz.
  let name = null;
  try {
    name = c.req.param('file');
` : `  const name = c.req.param('file');
  try {
`}    const body = readFileSync(join(here, 'app', name));
    const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/plain';
    return c.body(body, 200, { 'content-type': \`\${type}; charset=utf-8\` });
  } catch {${set ? `
    // Not in the tree, so it may be one of the archetype's boards: served from the store, and only if its
    // bytes still hash to the recorded digest. Kept on the existing single-segment route rather than a new
    // one deliberately - the route set is compared against the project's specification, and a second route
    // for assets would have to be declared there and would make the arm differ from its spec.
    const asset = readArchetypeAsset(name);
    if (asset) return c.body(asset.body, 200, { 'content-type': asset.type, 'x-asset-source': \`\${ASSET_STORE}/images\`, 'cache-control': 'no-store' });
` : ''}
    return c.text('not found', 404);
  }
});

${archetype.journey?.steps ? `app.get('/', async (c) => {
  const sidCookie = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const draftRows = sidCookie ? selectDrafts.all(sidCookie) : [];
  let doc = await renderDocument({ title: ${JSON.stringify(archetype.title)} });
  if (draftRows.length > 0) {
    doc = prefillDrafts(doc, draftRows);
    const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${escDraft(d.value)}</p>\`).join('\\n')}</div>\`;
    doc = doc.replace('</main>', \`\${carriedHtml}</main>\`);
  }
  return c.html(doc);
});${archetype.journey.startPath !== '/' ? `\n\napp.get(${JSON.stringify(archetype.journey.startPath)}, async (c) => {
  const sidCookie = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const draftRows = sidCookie ? selectDrafts.all(sidCookie) : [];
  let doc = await renderDocument({ title: ${JSON.stringify(archetype.title)} });
  if (draftRows.length > 0) {
    doc = prefillDrafts(doc, draftRows);
    const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${escDraft(d.value)}</p>\`).join('\\n')}</div>\`;
    doc = doc.replace('</main>', \`\${carriedHtml}</main>\`);
  }
  return c.html(doc);
});` : ''}` : `app.get('/', (c) => c.html(renderDocument({ title: ${JSON.stringify(archetype.title)} })));`}

app.post('${writeRoute.path}', async (c) => {
  const body = await c.req.parseBody();
  const missing = requiredFor(c.req.path).filter((field) => !String(body[field] ?? '').trim());
  if (missing.length > 0) {
    const document = await renderDocument({ title: 'Please correct the form' });
    // The rejected submission returns a usable page with the form, plus the reason.
    return c.html(document.replace('<h1>', \`<p role="alert">Missing: \${missing.join(', ')}</p><h1>\`), 422);
  }
  ${enforceMin ? `const underMinimum = MIN_BOUNDS.filter(({ name, min }) => {
    const raw = String(body[name] ?? '').trim();
    const value = Number(raw);
    return raw !== '' && (Number.isNaN(value) || value < min);
  }).map(({ name }) => name);
  if (underMinimum.length > 0) {
    const document = await renderDocument({ title: 'Please correct the form' });
    return c.html(document.replace('<h1>', \`<p role="alert">Below minimum: \${underMinimum.join(', ')}</p><h1>\`), 422);
  }
  ` : ''}${parameterisedWrite ? `// The edit target's own reference is the record key: posting an edit route updates THAT
  // record, so the ref is the captured parameter and the write is an upsert, never a new row.
  const ref = c.req.param('${writeParam}');` : 'const ref = randomUUID().slice(0, 8);'}
  ${defects.includes('client-only-state')
    ? '// DEFECT (client-only-state): the submission is kept only in component state, so nothing is written to the store and a reload of the confirmation route finds no record.'
    : `${parameterisedWrite ? 'upsert' : 'insert'}.run(ref, new Date().toISOString(), JSON.stringify(body));`}
${archetype.session ? `  const sid = randomUUID();
  insertSession.run(sid, ref, new Date().toISOString());
  c.header('set-cookie', \`sid=\${sid}; ${cookieFlags}\`);` : ''}
  return c.redirect(\`${writeRoute.redirect('${ref}')}\`.replace('\${ref}', ref), 303);
});

const readPath = ${JSON.stringify(archetype.routes.find((route) => route.kind === 'read-by-reference')?.path ?? '/record/:ref')};
app.get(readPath, ${archetype.journey?.update ? 'async ' : ''}(c) => {
${caps.detail_page && caps.auth ? "  if (!authSessionEmail(c.req.header('cookie'))) return c.redirect('/login', 303);\n" : ''}  const row = select.get(c.req.param('ref'));
  if (!row) return c.text('We could not find that record.', 404);
  ${archetype.journey?.update ? `const payload = JSON.parse(row.payload);
  const targetVal = String(payload[${JSON.stringify(archetype.journey.update.field)}] ?? '').replace(/"/g, '&quot;');
  const editForm = \`<form id="edit-form" method="post" action="/edit/\${row.ref}">
    <label for="edit-${archetype.journey.update.field}">${archetype.fields.find((f) => f.name === archetype.journey.update.field)?.label ?? archetype.journey.update.field}</label>
    <input id="edit-${archetype.journey.update.field}" name="${archetype.journey.update.field}" value="\${targetVal}">
    <button type="submit">Update</button>
  </form>\`;
  let doc = ${caps.detail_page ? 'detailPage(row)' : "await renderDocument({ title: 'Your submission' })"};
  return c.html(doc.replace('</main>', \`\${editForm}</main>\`));` : `${caps.cart ? `return c.html(cartProductPage(row));` : caps.detail_page ? `return c.html(detailPage(row));` : `return c.html(renderDocument({ title: 'Your submission' }));`}`}
});${archetype.journey?.update ? `\n\napp.post('/edit/:ref', async (c) => {
  const editRef = c.req.param('ref');
  const row = select.get(editRef);
  if (!row) return c.text('not found', 404);
  const body = await c.req.parseBody();
  const existing = JSON.parse(row.payload);
  const updated = { ...existing, ...body };
  const missing = REQUIRED.filter((field) => !String(updated[field] ?? '').trim());
  if (missing.length > 0) {
    const document = await renderDocument({ title: 'Please correct the form' });
    return c.html(document.replace('<h1>', \`<p role="alert">Missing: \${missing.join(', ')}</p><h1>\`), 422);
  }
  updateRecord.run(JSON.stringify(updated), editRef);
  const readUrl = readPath.replace(/:[A-Za-z0-9_]+/g, editRef);
  return c.redirect(readUrl, 303);
});` : ''}

${caps.auth || archetype.journey?.search ? `app.get('/api/records', (c) => {
${caps.auth ? "  if (!authSessionEmail(c.req.header('cookie'))) return c.json({ error: 'no session' }, 401);\n" : ''}${archetype.journey?.search ? `  const q = c.req.query('q');
  let rows = list.all();
  if (q) rows = rows.filter((row) => row.payload.toLowerCase().includes(q.toLowerCase()));
  return c.json(rows.map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })));` : `  return c.json(list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })));`}
});` : `app.get('/api/records', (c) => c.json(list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) }))));`}

${caps.auth ? `app.get('/api/me', (c) => {
  const email = authSessionEmail(c.req.header('cookie'));
  if (!email) return c.json({ error: 'no session' }, 401);
  return c.json({ email });
});` : `app.get('/api/me', (c) => {
  const sid = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const session = sid ? selectSession.get(sid) : undefined;
  const record = session ? select.get(session.ref) : undefined;
  if (!record) return c.json({ error: 'no session' }, 401);
  return c.json({ ref: record.ref, ...JSON.parse(record.payload) });
});`}

app.get('/api/record/:ref', (c) => {
${caps.auth ? "  if (!authSessionEmail(c.req.header('cookie'))) return c.json({ error: 'no session' }, 401);\n" : ''}  const row = select.get(c.req.param('ref'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ ref: row.ref, ...JSON.parse(row.payload) });
});

${caps.cart ? `${honoCartRoutes(archetype, cartCookieFlags, checkoutOf(archetype))}\n\n` : ''}${caps.checkout ? `${honoCheckoutRoutes()}\n\n` : ''}${caps.survey ? `${honoSurveyRoutes()}\n\n` : ''}${caps.game ? `${honoGameRoutes()}\n\n` : ''}${caps.workspace ? `${honoWorkspaceRoutes()}\n\n` : ''}${caps.pricing_tiers ? `${honoPricingRoutes()}\n\n` : ''}for (const sessionPage of ${JSON.stringify(archetype.routes.filter((route) => route.kind === 'read-session').map((route) => route.path))}) {
${caps.auth ? `  app.get(sessionPage, (c) => {
    if (!authSessionEmail(c.req.header('cookie'))) return c.redirect('/login', 303);
    return c.html(renderDocument({ title: 'Your account' }));
  });` : "  app.get(sessionPage, (c) => c.html(renderDocument({ title: 'Your account' })));"}
}

${caps.auth ? `${honoAuthRoutes()}

` : ''}${caps.list_pages ? `${honoListRoutes(archetype, caps.auth)}` : `for (const listing of ['/roster', '/inbox', '/attendees', '/cart']) {
  app.get(listing, (c) => c.html(renderDocument({ title: 'Records' })));
}`}

${archetype.journey?.search
  ? (archetype.journey.search.path === '/search'
      ? `app.get('/search', (c) => {
  const query = c.req.query(${JSON.stringify(archetype.journey.search.queryParam)}) ?? '';
  return c.html(\`${searchPageDocument(archetype.journey.search)}\`);
});`
      : `app.get(${JSON.stringify(archetype.journey.search.path)}, (c) => {
  const query = c.req.query(${JSON.stringify(archetype.journey.search.queryParam)}) ?? '';
  return c.html(\`${searchPageDocument(archetype.journey.search)}\`);
});

app.get('/search', (c) => c.html(renderDocument({ title: \`Search: \${c.req.query('q') ?? ''}\` })));`)
  : `app.get('/search', (c) => c.html(renderDocument({ title: \`Search: \${c.req.query('q') ?? ''}\` })));`}${archetype.journey?.steps ? `\n\napp.post('/draft', async (c) => {
  const sidCookie = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const sid = sidCookie || randomUUID();
  const body = await c.req.parseBody();
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'next') insertDraft.run(sid, key, String(value));
  }
  const nextUrl = c.req.query('next') || ${JSON.stringify(archetype.journey.startPath)};
  c.header('set-cookie', \`sid=\${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600\`);
  return c.redirect(nextUrl, 303);
});

${archetype.journey.steps.map((step, idx, arr) => {
  const nextPath = idx < arr.length - 1 ? arr[idx + 1].path : archetype.journey.startPath;
  return `app.post('${step.path}', async (c) => {
  const sidCookie = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const sid = sidCookie || randomUUID();
  const body = await c.req.parseBody();
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'next') insertDraft.run(sid, key, String(value));
  }
  c.header('set-cookie', \`sid=\${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600\`);
  const nextUrl = c.req.query('next') || '${nextPath}';
  return c.redirect(nextUrl, 303);
});

app.get('${step.path}', (c) => {
  const sidCookie = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const draftRows = sidCookie ? selectDrafts.all(sidCookie) : [];
  const carriedHtml = draftRows.length > 0
    ? \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${escDraft(d.value)}</p>\`).join('\\n')}</div>\`
    : '';
  let page = \`${stepPageDocument(step, idx, archetype.journey.steps, archetype)}\`;
  if (draftRows.length > 0) page = prefillDrafts(page, draftRows);
  return c.html(page);
});`;
}).join('\n\n')}` : ''}

app.get('/page', async (c) => c.text(await renderPage()));

// Bridge node:http onto Hono's fetch handler: the request and response objects are translated and
// nothing else is shared, so this arm really does route through Hono.
const server = createServer(async (request, response) => {
  const url = \`http://\${request.headers.host ?? '127.0.0.1'}\${request.url}\`;
  const chunks = [];
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    for await (const chunk of request) chunks.push(chunk);
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(key, value);
  const fetchRequest = new Request(url, {
    method: request.method,
    headers,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
  const fetchResponse = await app.fetch(fetchRequest);
  const outgoing = {};
  fetchResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    outgoing[key] = value;
  });
  const cookies = fetchResponse.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) outgoing['set-cookie'] = cookies;
  response.writeHead(fetchResponse.status, outgoing);
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
});

server.listen(port, '127.0.0.1', () => {
  console.log(\`listening on \${port} with \${dbPath}\`);
});
`;
}

/**
 * The Svelte arm's page module - the stable importer the shared server uses.
 *
 * The compiled component is a build output, so the module that renders it is kept separate: editing or
 * rebuilding the template never touches this file, and every arm's `server.mjs` still imports exactly
 * `./app/page.mjs`. That is what keeps one server source shared across seven arms.
 */
function sveltePageModule(archetype) {
  return `import { render } from 'svelte/server';

import Page from './page.compiled.mjs';

/** SSR the compiled component. No client runtime is involved in producing the document. */
export async function renderPage() {
  const { body } = render(Page, { props: {} });
  return body;
}

export async function renderDocument({ title = '${archetype.title}' } = {}) {
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>\${await renderPage()}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>\`;
}
`;
}

/**
 * Write one generated project to disk.
 *
 * The scaffolder and the corpus recorder must agree byte for byte, so there is exactly one
 * implementation of "a project on disk" - including the per-project package.json that the recorder
 * initially did not write, which made the plan appear to generate a different tree from the one the
 * pilot measured.
 */
const armPackages = {
  hono: ['hono'],
  raw: [],
  react: ['htm', 'react', 'react-dom'],
  preact: ['htm', 'preact', 'preact-render-to-string'],
  vue: ['vue'],
  webcomponents: [],
  svelte: ['svelte'],
};

export function writeProject(root, { projectId, files, spec, includeDependencies = false }) {
  // Only published capture projects opt in. Pilot and training manifests predate per-arm
  // dependencies and must remain byte-identical to their recorded trees.
  const manifest = { name: `pilot-${projectId}`, private: true, type: 'module', scripts: { start: 'node server.mjs' } };
  if (includeDependencies) {
    const packages = armPackages[spec.framework?.name];
    if (!packages) throw new Error(`unknown project framework '${spec.framework?.name}'`);
    const repositoryDependencies = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies;
    manifest.dependencies = Object.fromEntries(packages.map((name) => {
      if (!repositoryDependencies[name]) throw new Error(`missing repository dependency '${name}'`);
      return [name, repositoryDependencies[name]];
    }));
  }
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  writeFileSync(join(root, 'spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return root;
}

export function buildProjectFor(archetype, { frameworkName, defects = [], flags = {}, set = null, purpose = 'build' }) {
  const unknownDefects = defects.filter((d) => !GENERATOR_DEFECT_TOKENS.includes(d));
  if (unknownDefects.length > 0) {
    throw new Error(`buildProjectFor: unknown defect tokens [${unknownDefects.join(', ')}]. Known tokens: [${GENERATOR_DEFECT_TOKENS.join(', ')}]`);
  }

  if (!archetype?.id) throw new Error('buildProjectFor: an archetype with an id is required');
  // A set is optional so that a caller with no store (the training scaffolder, which must not consume
  // these sets: every one of them is excluded_from_training) keeps the plain palette it had. When one IS
  // supplied the rights are checked here rather than left to each caller to remember, and a set built for
  // the wrong purpose fails the build instead of becoming a finding later.
  if (set) {
    assertConsumable(set, { purpose });
    if (set.archetype !== archetype.id) throw new Error(`buildProjectFor: the asset set is for '${set.archetype}' but the archetype is '${archetype.id}'`);
  }
  const framework = { ...FRAMEWORKS[frameworkName], ...flags };
  if (!framework.name) throw new Error(`unknown framework ${frameworkName}`);
  const projectId = `${archetype.id}-${frameworkName}${flags.variant ? `-${flags.variant}` : ''}`;

  const files = {
    'server.mjs': framework.name === 'hono' ? honoServerSource(archetype, framework, defects, set) : serverSource(archetype, framework, defects, set),
    [framework.markupFile]: pageSource(archetype, { defects, framework, set }),
    [framework.stylesFile]: stylesSource({ defects, framework, set }),
    [framework.enhanceFile]: enhanceSource(archetype, { defects, framework }),
  };
  // An arm that declares a compile boundary (Svelte) also ships the compiled module and the page
  // module that imports it. Both are build outputs of the template above, so they are produced here
  // rather than hand-maintained beside it - and a project's tree hash therefore covers them.
  if (framework.compiledFile) {
    files[framework.compiledFile] = compileSvelteServer(files[framework.markupFile], framework.markupFile);
    files['app/page.mjs'] = sveltePageModule(archetype);
  }

  const spec = {
    project_id: projectId,
    archetype: archetype.id,
    archetype_title: archetype.title,
    // The archetype asset set this build was given, as a manifest: brand, token counts and the token
    // each role resolved to, the copy slots, the image register with digests, and the rights. It records
    // WHERE the assets come from rather than copying them - the boards are megabytes each, and the tree
    // is hashed and token-counted, so a copy would be both a huge duplicate and (because the token
    // counter reads every file as utf8) a source-character figure that means nothing. A build with no set
    // has no such key at all, so a caller that supplies none keeps the tree it had.
    ...(set ? { assets: assetManifest(set) } : {}),
    // Spread, not a hand-copied list: naming the fields one by one silently dropped a new one
    // (serverFile) the moment it was added to the table above.
    framework: { ...framework },
    routes: archetype.routes,
    fields: archetype.fields.map((field) => ({ slug: field.slug, name: field.name, type: field.type, autocomplete: field.autocomplete ?? null })),
    seeded_defects: defects,
    journey: archetype.journey,
    // The value the page must show back after a reload: the echoed field's own input, not the name.
    // The fill keys are selectors with an element prefix (`textarea[name=notes]`), so the expected
    // echoed value is found by suffix. Looking it up as a bare `[name=...]` returned undefined, which
    // silently skipped the persistence assertion entirely.
    echo_expect: archetype.echo
      ? (Object.entries(archetype.journey.fill ?? {}).find(([selector]) =>
          selector.endsWith(`[name=${archetype.fields.find((field) => field.slug === archetype.echo.field).name}]`),
        )?.[1] ?? null)
      : null,
    // The field is addressed by its *name* (`q`), not its slug (`query`): using the slug made every
    // content journey fail with "type([name=query]) failed: not found" on a form that has the field.
    content_journey: archetype.echo
      ? {
          source: archetype.echo.source ?? 'record',
          path: archetype.echo.source === 'query' ? (archetype.form?.action ?? '/') : (archetype.routes.find((route) => route.kind === 'read-by-reference')?.path.replace(':ref', 'REF') ?? '/'),
          param: archetype.echo.param ?? null,
          inputSelector: `[name=${archetype.fields.find((field) => field.slug === archetype.echo.field).name}]`,
          formSelector: archetype.journey.formSelector,
          echoField: archetype.echo.field,
        }
      : null,
    echo_source: archetype.echo?.source ?? 'record',
    write_journey: archetype.writeJourney ?? null,
    session_routes: archetype.routes.filter((route) => route.kind === 'read-session').map((route) => route.path),
    echo_container: '#record-echo',
    security_journey: archetype.securityJourney ?? null,
    session: Boolean(archetype.session),
    check_context: {
      formSelector: archetype.journey.formSelector,
      primaryField: `[name=${archetype.fields[0].name}]`,
      usernameField: `[name=email]`,
      passwordField: archetype.passwordField ?? `[name=password]`,
      addressField: '[name=address]',
      postcodeField: '[name=postcode]',
    },
    // Blocks the uplift tool reads. These are part of the spec contract: when they were missing the
    // tool reported "not iterable" and quietly improved nothing, which the pilot then measured as a
    // coverage gap rather than as the naming bug it was.
    // Only fields the project treats as required. A field the user may leave empty is not a field the
    // uplift tool should start requiring: that would change the task, which acceptance forbids.
    primaryFields: archetype.fields
      .filter((field) => field.type !== 'select' && !field.optional)
      .map((field) => ({
        slug: field.slug,
        name: field.name,
        elementPattern: `<${field.type === 'textarea' ? 'textarea' : 'input'}[^>]*name="${field.name}"[^>]*>`,
        elementPatternFirst: `<${field.type === 'textarea' ? 'textarea' : 'input'}[^>]*name="${field.name}"[^>]*>`,
      })),
    autofill: {
      usernamePattern: '(<input[^>]*type="email"[^>]*>)',
      passwordPattern: '(<input[^>]*type="password"[^>]*>)',
      streetPattern: '(<input[^>]*name="address"[^>]*>)',
      postcodePattern: '(<input[^>]*name="postcode"[^>]*>)',
    },
    required_rules: requiredRulesFor(archetype, defects),
  };
  return { projectId, files, spec };
}

/**
 * Which rules the measurement vector should run for this project: the ones its defects touch, plus
 * the always-on security/sanitisation checks when the archetype echoes user text back.
 */
function requiredRulesFor(archetype, defects) {
  // The four properties every project can express are always required. The autofill rules are required
  // only where the archetype has the fields the guide is about: requiring an address rule of a project
  // with no address block forced the check to answer NOT_APPLICABLE, and an applicability the project
  // had not declared was a hole through which an unmeasured rule could pass.
  const rules = new Set([
    'forms/required-field-feedback',
    'forms/validate-input-after-interaction',
    'accessibility/accessible-error-announcement',
    'security/sanitize-untrusted-html',
  ]);
  const autocompletes = archetype.fields.map((field) => field.autocomplete).filter(Boolean);
  if (autocompletes.includes('street-address') || autocompletes.includes('postal-code')) rules.add('forms/autofill-address-form');
  if (archetype.fields.some((field) => field.type === 'password') || archetype.fields.some((field) => field.autocomplete === 'username')) {
    rules.add('forms/autofill-sign-up-form');
  }
  void defects;
  return [...rules];
}

export { slug };

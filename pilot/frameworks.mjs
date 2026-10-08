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
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

function pageSource(archetype, { defects, framework }) {
  const rawBody = `
      <h1>${archetype.title}</h1>
      <p>${archetype.story}</p>
${formMarkup(archetype, { defects })}
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

function stylesSource({ defects, framework }) {
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
${body}${searchEnhance}${updateEnhance}
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

const capabilitiesOf = (archetype) => ({ list_pages: false, detail_page: false, auth: false, ...(archetype.capabilities ?? {}) });

/** The small page renderers the capability handlers share, emitted only when a capability needs them. */
const capabilityPages = () =>
  [
    "const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');",
    "const capabilityPage = (title, body) => '<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>' + esc(title) + '</title><link rel=\"stylesheet\" href=\"/app/styles.css\"></head><body><main>' + body + '</main></body></html>';",
    "const loginPage = (error) => capabilityPage('Sign in', '<h1>Sign in</h1>' + (error ? '<p role=\"alert\">' + esc(error) + '</p>' : '') + '<form method=\"post\" action=\"/login\"><label for=\"email\">Email</label><input type=\"email\" id=\"email\" name=\"email\" required autocomplete=\"username\"><label for=\"password\">Password</label><input type=\"password\" id=\"password\" name=\"password\" required autocomplete=\"current-password\"><button type=\"submit\">Sign in</button></form>');",
    "const listPage = (title, detailPrefix, rows) => capabilityPage(title, '<h1>' + esc(title) + '</h1><ul>' + rows.map((row) => '<li><a href=\"' + detailPrefix + esc(row.ref) + '\">' + esc(row.ref) + '</a> ' + esc(JSON.stringify(row.payload)) + '</li>').join('') + '</ul>');",
    "const detailPage = (row) => capabilityPage('Record ' + row.ref, '<h1>Record ' + esc(row.ref) + '</h1><dl>' + Object.entries(JSON.parse(row.payload)).map(([key, value]) => '<dt>' + esc(key) + '</dt><dd>' + esc(value) + '</dd>').join('') + '</dl>');",
  ].join('\n');

/** The auth capability's tables, statements and seed accounts (the accounts table itself is per-arm). */
const authTables = (archetype) =>
  [
    "db.exec('CREATE TABLE IF NOT EXISTS auth_sessions (sid TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT NOT NULL)');",
    "const insertAuthSession = db.prepare('INSERT INTO auth_sessions (sid, email, created_at) VALUES (?, ?, ?)');",
    "const selectAuthSession = db.prepare('SELECT email FROM auth_sessions WHERE sid = ?');",
    "const deleteAuthSession = db.prepare('DELETE FROM auth_sessions WHERE sid = ?');",
    "const selectAccount = db.prepare('SELECT email, display_name FROM accounts WHERE email = ? AND password = ?');",
    ...(archetype.seedAccounts ?? []).map(
      (account) =>
        `db.prepare('INSERT OR IGNORE INTO accounts (email, password, display_name) VALUES (?, ?, ?)').run(${JSON.stringify(account.email)}, ${JSON.stringify(account.password)}, ${JSON.stringify(account.display_name ?? null)});`,
    ),
    'const sessionSid = (cookieHeader) =>',
    "  (cookieHeader ?? '')",
    "    .split(';')",
    '    .map((part) => part.trim())',
    "    .find((part) => part.startsWith('sid='))",
    "    ?.slice('sid='.length);",
    'const authSessionEmail = (cookieHeader) => {',
    '  const sid = sessionSid(cookieHeader);',
    '  return sid ? selectAuthSession.get(sid)?.email : undefined;',
    '};',
  ].join('\n');

/** The login/logout handlers, raw arm. */
const rawAuthRoutes = () =>
  [
    "  if (path === '/login' && request.method === 'GET') return html(response, loginPage());",
    "  if (path === '/login' && request.method === 'POST') {",
    '    const body = await parseBody(request);',
    "    const account = selectAccount.get(String(body.email ?? ''), String(body.password ?? ''));",
    "    if (!account) return html(response, loginPage('Those credentials did not match an account.'), 401);",
    '    const sid = randomUUID();',
    '    insertAuthSession.run(sid, account.email, new Date().toISOString());',
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
    "  const account = selectAccount.get(String(body.email ?? ''), String(body.password ?? ''));",
    "  if (!account) return c.html(loginPage('Those credentials did not match an account.'), 401);",
    '  const sid = randomUUID();',
    '  insertAuthSession.run(sid, account.email, new Date().toISOString());',
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

function serverSource(archetype, framework, defects = []) {
  const caps = capabilitiesOf(archetype);
  const writeRoute = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'));
  const insecureCookie = archetype.session && !framework.cookieFlags;
  const cookieFlags = archetype.session
    ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${framework.secureCookie ? '; Secure' : ''}`
    : null;
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
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDocument } from './app/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
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
${sessionTables(archetype)}${archetype.journey?.update ? `\nconst updateRecord = db.prepare('UPDATE records SET payload = ? WHERE ref = ?');` : ''}${archetype.journey?.steps ? `\ndb.exec('CREATE TABLE IF NOT EXISTS drafts (sid TEXT, name TEXT, value TEXT, PRIMARY KEY (sid, name))');\nconst insertDraft = db.prepare('INSERT OR REPLACE INTO drafts (sid, name, value) VALUES (?, ?, ?)');\nconst selectDrafts = db.prepare('SELECT name, value FROM drafts WHERE sid = ?');` : ''}
${caps.auth ? `${authTables(archetype)}\n` : ''}const count = db.prepare('SELECT COUNT(*) AS n FROM records');
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

${caps.list_pages || caps.detail_page || caps.auth ? `${capabilityPages()}\n` : ''}const REQUIRED = ${JSON.stringify(archetype.fields.filter((field) => field.type !== 'select' && !field.optional).map((field) => field.name))};

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
      response.writeHead(404);
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
      const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${d.value}</p>\`).join('\\n')}</div>\`;
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
      const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${d.value}</p>\`).join('\\n')}</div>\`;
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
    let doc = await renderDocument({ title: 'Your submission', data: { ref: row.ref } });
    return html(response, doc.replace('</main>', \`\${editForm}</main>\`));` : `${caps.detail_page ? `return html(response, detailPage(row));` : `return html(response, await renderDocument({ title: 'Your submission', data: { ref: row.ref } }));`}`}
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

  // A route the archetype declares is a route the server must serve: /account was declared as the
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
      ? \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${d.value}</p>\`).join('\\n')}</div>\`
      : '';
    return html(response, \`${stepPageDocument(step, idx, archetype.journey.steps, archetype)}\`);
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
function honoServerSource(archetype, framework, defects = []) {
  const caps = capabilitiesOf(archetype);
  const writeRoute = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'));
  // Hono routes :param segments natively; the FIRST parameter of an edit route is the record key.
  const parameterisedWrite = /:[A-Za-z0-9_]+/.test(writeRoute.path);
  const writeParam = writeRoute.path.match(/:([A-Za-z0-9_]+)/)?.[1] ?? 'id';
  const cookieFlags = archetype.session ? 'HttpOnly; SameSite=Lax; Path=/; Max-Age=3600' : null;
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
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { renderDocument, renderPage } from './app/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const index = process.argv.indexOf(\`--\${name}\`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const port = Number(arg('port', process.env.PILOT_PORT ?? 3000));
const dbPath = arg('db', join(here, 'pilot.sqlite'));

const db = new DatabaseSync(dbPath);
db.exec(\`CREATE TABLE IF NOT EXISTS records (ref TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)\`);
const insert = db.prepare('INSERT INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
const select = db.prepare('SELECT ref, created_at, payload FROM records WHERE ref = ?');
${archetype.journey?.update ? `const updateRecord = db.prepare('UPDATE records SET payload = ? WHERE ref = ?');\n` : ''}${archetype.journey?.steps ? `db.exec('CREATE TABLE IF NOT EXISTS drafts (sid TEXT, name TEXT, value TEXT, PRIMARY KEY (sid, name))');\nconst insertDraft = db.prepare('INSERT OR REPLACE INTO drafts (sid, name, value) VALUES (?, ?, ?)');\nconst selectDrafts = db.prepare('SELECT name, value FROM drafts WHERE sid = ?');\n` : ''}const list = db.prepare('SELECT ref, payload FROM records ORDER BY created_at DESC LIMIT 50');

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
` : ''}${caps.list_pages || caps.detail_page || caps.auth ? `${capabilityPages()}
` : ''}const requestLog = [];
const app = new Hono();
app.use('*', async (c, next) => {
  await next();
  if (c.req.path !== '/__requests') requestLog.push({ method: c.req.method, path: c.req.path, status: c.res.status });
});
app.get('/__requests', (c) => c.json(requestLog));

app.get('/__health', (c) => c.json({ ok: true }));

app.get('/app/:file', (c) => {
  const name = c.req.param('file');
  try {
    const body = readFileSync(join(here, 'app', name));
    const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/plain';
    return c.body(body, 200, { 'content-type': \`\${type}; charset=utf-8\` });
  } catch {
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
    const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${d.value}</p>\`).join('\\n')}</div>\`;
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
    const carriedHtml = \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${d.value}</p>\`).join('\\n')}</div>\`;
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
  let doc = await renderDocument({ title: 'Your submission' });
  return c.html(doc.replace('</main>', \`\${editForm}</main>\`));` : `${caps.detail_page ? `return c.html(detailPage(row));` : `return c.html(renderDocument({ title: 'Your submission' }));`}`}
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

for (const sessionPage of ${JSON.stringify(archetype.routes.filter((route) => route.kind === 'read-session').map((route) => route.path))}) {
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
  return c.redirect('${nextPath}', 303);
});

app.get('${step.path}', (c) => {
  const sidCookie = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const draftRows = sidCookie ? selectDrafts.all(sidCookie) : [];
  const carriedHtml = draftRows.length > 0
    ? \`<div class="draft-carried">\${draftRows.map((d) => \`<p class="carried-value">\${d.value}</p>\`).join('\\n')}</div>\`
    : '';
  return c.html(\`${stepPageDocument(step, idx, archetype.journey.steps, archetype)}\`);
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
export function writeProject(root, { projectId, files, spec }) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  writeFileSync(join(root, 'spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: `pilot-${projectId}`, private: true, type: 'module', scripts: { start: 'node server.mjs' } }, null, 2)}\n`,
  );
  return root;
}

export function buildProjectFor(archetype, { frameworkName, defects = [], flags = {} }) {
  if (!archetype?.id) throw new Error('buildProjectFor: an archetype with an id is required');
  const framework = { ...FRAMEWORKS[frameworkName], ...flags };
  if (!framework.name) throw new Error(`unknown framework ${frameworkName}`);
  const projectId = `${archetype.id}-${frameworkName}${flags.variant ? `-${flags.variant}` : ''}`;

  const files = {
    'server.mjs': framework.name === 'hono' ? honoServerSource(archetype, framework, defects) : serverSource(archetype, framework, defects),
    [framework.markupFile]: pageSource(archetype, { defects, framework }),
    [framework.stylesFile]: stylesSource({ defects, framework }),
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

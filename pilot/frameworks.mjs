/**
 * The pilot's framework axis, and the project builder.
 *
 * Paul, 2026-10-08: framework diversity is a first-class axis - "usage of raw web platform, react and
 * many new frameworks". The pilot covers four rendering idioms over the same five archetypes:
 *
 *   raw    - semantic HTML and platform APIs, no framework at all. This is the interesting control:
 *            much of what MWG is about (modern elements, form design, cookies, transitions) is
 *            exactly what a framework either does for you or hides.
 *   react  - React 19, server-rendered, tagged-template markup via htm (no bundler, so the pilot
 *            needs no build step per project)
 *   preact - a second React-family runtime, same component shape, different engine
 *   vue    - Vue 3 with its runtime template compiler, server-rendered
 *
 * Every arm renders the page server-side and enhances it with one plain-JS script, because the point
 * of the pilot is the *server journey*: a client-only arm would make the persistence test meaningless.
 *
 * The generator takes a defect list, so an original with a known MWG gap is produced from the same
 * code that produces a clean one - and the uplift tool is measured against the gap it was given.
 */
import { ARCHETYPES } from './archetypes.mjs';

const slug = (value) => value.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

export const FRAMEWORKS = {
  raw: { name: 'raw', version: 'platform (no framework)', dialect: 'html', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', family: 'raw-web-platform' },
  react: { name: 'react', version: '19.2.0', dialect: 'react', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', family: 'react' },
  preact: { name: 'preact', version: '10.27.2', dialect: 'preact', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', family: 'react-family' },
  vue: { name: 'vue', version: '3.5.22', dialect: 'vue', markupFile: 'app/page.mjs', stylesFile: 'app/styles.css', enhanceFile: 'app/enhance.js', family: 'vue' },
};

/** Field markup. Attributes come from the archetype, and the defects decide which are left out. */
function fieldMarkup(field, { defects, dialect }) {
  const nameAttr = 'name';
  if (field.type === 'textarea') {
    const required = defects.includes('no-required') ? '' : ' required';
    return `      <label for="${field.slug}">${field.label}</label>
      <textarea id="${field.slug}" ${nameAttr}="${field.name}"${required}></textarea>`;
  }
  if (field.type === 'select') {
    const options = (field.options ?? []).map((option) => `        <option value="${option}">${option}</option>`).join('\n');
    return `      <label for="${field.slug}">${field.label}</label>
      <select id="${field.slug}" ${nameAttr}="${field.name}">
${options}
      </select>`;
  }
  const attrs = [`type="${field.type}"`, `id="${field.slug}"`, `${nameAttr}="${field.name}"`];
  if (!defects.includes('no-required')) attrs.push('required');
  // `no-autofill` is the whole-form defect; the per-purpose tokens are separate so a project can be
  // missing only the address hints (which is the realistic case: sign-in is usually done first).
  const autofillBlocked =
    defects.includes('no-autofill') ||
    (field.autocomplete === 'street-address' && defects.includes('no-autofill-address')) ||
    (field.autocomplete === 'postal-code' && defects.includes('no-autofill-address'));
  if (field.autocomplete && !autofillBlocked) attrs.push(`autocomplete="${field.autocomplete}"`);
  if (field.type === 'search' || field.type === 'number') attrs.push(`inputmode="${field.type === 'number' ? 'numeric' : 'search'}"`);
  return `      <label for="${field.slug}">${field.label}</label>
      <input ${attrs.join(' ')}>`;
}

function formMarkup(archetype, { defects }) {
  const action = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write')).path;
  const fields = archetype.fields.map((field) => fieldMarkup(field, { defects, dialect: 'html' })).join('\n');
  const errorBlocks = defects.includes('no-required')
    ? ''
    : archetype.fields
        .filter((field) => field.slug !== 'ticket')
        .map((field) => `      <p id="${field.slug}-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in ${field.label.toLowerCase()}.</p>`)
        .join('\n');
  const live = defects.includes('no-aria-sync') ? '' : '      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>\n';
  const aria = defects.includes('no-required') ? '' : '';
  return `    <form id="${archetype.id}-form" method="post" action="${action}" >
${live}      <div class="field">
${fields}
      </div>
${errorBlocks ? `      <div class="errors">\n${errorBlocks}\n      </div>\n` : ''}      <button type="submit">Submit</button>
    </form>${aria}`;
}

function echoMarkup(archetype) {
  return `      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="${archetype.echo.field}"></div>
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
  const body = framework.name === 'react' || framework.name === 'preact' ? selfCloseVoids(rawBody) : rawBody;
  if (framework.name === 'raw') {
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

function enhanceSource(archetype, { defects }) {
  const unsafe = defects.includes('xss-innerhtml');
  const a11y = defects.includes('no-aria-sync')
    ? '// DEFECT: no aria-invalid synchronisation, so the error state exists only visually.'
    : `function syncValidity(input) {
  if (input.matches(':user-invalid')) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}
for (const input of document.querySelectorAll('input, textarea, select')) {
  for (const event of ['blur', 'input', 'change']) input.addEventListener(event, () => syncValidity(input));
}`;
  const insertion = unsafe
    ? `  // DEFECT: user-supplied text inserted as live HTML.
    container.innerHTML = data[container.dataset.echoField] ?? '';`
    : `  // MWG security/sanitize-untrusted-html: parse user-supplied text as inert content.
  // TODO(baseline/element.sethtml): drop the textContent fallback and call setHTML directly.
  const value = data[container.dataset.echoField] ?? '';
  if (typeof container.setHTML === 'function') container.setHTML(value);
  else container.textContent = value;`;
  return `// Progressive enhancement for the ${archetype.id} flow: one plain script for every arm.
${a11y}

const container = document.getElementById('record-echo');
const ref = location.pathname.split('/').filter(Boolean).pop();
if (container && ref) {
  const response = await fetch(\`/api/record/\${encodeURIComponent(ref)}\`);
  if (response.ok) {
    const data = await response.json();
${insertion}
  }
}
`;
}

function serverSource(archetype, framework) {
  const writeRoute = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'));
  const insecureCookie = archetype.session && !framework.cookieFlags;
  const cookieFlags = archetype.session
    ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${framework.secureCookie ? '; Secure' : ''}`
    : null;
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
const count = db.prepare('SELECT COUNT(*) AS n FROM records');
const list = db.prepare('SELECT ref, payload FROM records ORDER BY created_at DESC LIMIT 50');

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

const REQUIRED = ${JSON.stringify(archetype.fields.filter((field) => field.type !== 'select').map((field) => field.name))};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, \`http://\${request.headers.host ?? '127.0.0.1'}\`);
  const path = url.pathname;

  if (path === '/__health') return json(response, { ok: true });

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

  if (path === '/' && request.method === 'GET') return html(response, await renderDocument({ title: ${JSON.stringify(archetype.title)} }));

  if (path === '${writeRoute.path}' && request.method === 'POST') {
    const body = await parseBody(request);
    const missing = REQUIRED.filter((field) => !String(body[field] ?? '').trim());
    if (missing.length > 0) {
      // The server validates as well as the client: a browser without JS must not be able to post an
      // empty record, and the response has to be a usable page again - an apology with no form strands
      // the user, which is its own defect.
      const document = await renderDocument({ title: 'Please correct the form', data: { errorSummary: \`Missing: \${missing.join(', ')}\` } });
      return html(response, document.replace('<h1>', \`<p role="alert">Missing: \${missing.join(', ')}</p><h1>\`), 422);
    }
    const ref = randomUUID().slice(0, 8);
${archetype.session ? `    const headers = { 'set-cookie': \`sid=\${randomUUID()}; ${cookieFlags}\` };` : '    const headers = {};'}
    insert.run(ref, new Date().toISOString(), JSON.stringify(body));
    response.writeHead(303, { location: \`${writeRoute.redirect('${ref}')}\`.replace('\${ref}', ref), ...headers });
    return response.end();
  }

  const readRoute = ${JSON.stringify(archetype.routes.find((route) => route.kind === 'read-by-reference')?.path ?? '/record/:ref')};
  const readMatch = path.match(new RegExp('^' + readRoute.replace(':ref', '([^/]+)').replace(/\\//g, '\\\\/') + '$'));
  if (readMatch && request.method === 'GET') {
    const row = select.get(readMatch[1]);
    if (!row) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return response.end('<!doctype html><title>Not found</title><p>We could not find that record.</p>');
    }
    return html(response, await renderDocument({ title: 'Your submission', data: { ref: row.ref } }));
  }

  if (path.startsWith('/api/record/') && request.method === 'GET') {
    const row = select.get(path.split('/').pop());
    if (!row) return json(response, { error: 'not found' }, 404);
    return json(response, { ref: row.ref, ...JSON.parse(row.payload) });
  }

  if (path === '/roster' || path === '/inbox' || path === '/attendees' || path === '/cart') {
    const rows = list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) }));
    return html(response, await renderDocument({ title: 'Records', data: { rows } }));
  }

  if (path === '/search' && request.method === 'GET') {
    const query = url.searchParams.get('q') ?? '';
    const rows = list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
    return html(response, await renderDocument({ title: \`Search: \${query}\`, data: { query, rows } }));
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(\`listening on \${port} with \${dbPath}\`);
});
`;
}

export function buildProject({ archetypeId, frameworkName, defects = [], flags = {} }) {
  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) throw new Error(`unknown archetype ${archetypeId}`);
  const framework = { ...FRAMEWORKS[frameworkName], ...flags };
  if (!framework.name) throw new Error(`unknown framework ${frameworkName}`);
  const projectId = `${archetypeId}-${frameworkName}${flags.variant ? `-${flags.variant}` : ''}`;

  const files = {
    'server.mjs': serverSource(archetype, framework),
    [framework.markupFile]: pageSource(archetype, { defects, framework }),
    [framework.stylesFile]: stylesSource({ defects, framework }),
    [framework.enhanceFile]: enhanceSource(archetype, { defects }),
  };

  const spec = {
    project_id: projectId,
    archetype: archetype.id,
    archetype_title: archetype.title,
    framework: { name: framework.name, version: framework.version, dialect: framework.dialect, family: framework.family, markupFile: framework.markupFile, stylesFile: framework.stylesFile, enhanceFile: framework.enhanceFile },
    routes: archetype.routes,
    fields: archetype.fields.map((field) => ({ slug: field.slug, name: field.name, type: field.type, autocomplete: field.autocomplete ?? null })),
    seeded_defects: defects,
    journey: archetype.journey,
    // The value the page must show back after a reload: the echoed field's own input, not the name.
    echo_expect: archetype.echo ? archetype.journey.fill[`[name=${archetype.echo.field}]`] : null,
    content_journey: archetype.echo
      ? { path: `${archetype.routes.find((route) => route.kind === 'read-by-reference')?.path.replace(':ref', 'REF') ?? '/'}`, inputSelector: `[name=${archetype.echo.field}]`, formSelector: `form#${archetype.id}-form`, echoField: archetype.echo.field }
      : null,
    security_journey: archetype.securityJourney ?? null,
    session: Boolean(archetype.session),
    check_context: {
      formSelector: `form#${archetype.id}-form`,
      primaryField: `[name=${archetype.fields[0].name}]`,
      usernameField: `[name=email]`,
      passwordField: `[name=password]`,
      addressField: '[name=address]',
      postcodeField: '[name=postcode]',
    },
    // Blocks the uplift tool reads. These are part of the spec contract: when they were missing the
    // tool reported "not iterable" and quietly improved nothing, which the pilot then measured as a
    // coverage gap rather than as the naming bug it was.
    primaryFields: archetype.fields
      .filter((field) => field.type !== 'select')
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
    required_rules: requiredRulesFor(defects),
  };
  return { projectId, files, spec };
}

/**
 * Which rules the measurement vector should run for this project: the ones its defects touch, plus
 * the always-on security/sanitisation checks when the archetype echoes user text back.
 */
function requiredRulesFor(defects) {
  const rules = new Set(['forms/required-field-feedback', 'forms/validate-input-after-interaction', 'accessibility/accessible-error-announcement']);
  if (defects.includes('no-autofill-signup') || defects.includes('no-autofill')) rules.add('forms/autofill-sign-up-form');
  if (defects.includes('no-autofill-address') || defects.includes('no-autofill')) rules.add('forms/autofill-address-form');
  rules.add('security/sanitize-untrusted-html');
  return [...rules];
}

export { slug };

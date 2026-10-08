/**
 * A very small kit for the evaluation control fixtures.
 *
 * The already-modern briefs are written against an "existing site", and the two sealed repair
 * families are written against a "defective starter". Both are projects that a run must be handed
 * before it can do anything, so both are authored here from one kit rather than ten bespoke servers.
 *
 * The kit is deliberately in-process: a fixture exports its routes and a test calls `handle()` with a
 * method and a path. Nothing in the test suite spawns a server or needs a free port, which is what
 * makes the fixture checks deterministic instead of flaky. `serve()` exists only so a person can run a
 * fixture in a browser.
 *
 * Nothing here is a framework. It is the smallest thing that can render a labelled form, persist a
 * record server-side, and serve a route, because those three are what the briefs' assertions name.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** A document shell with a navigation landmark. `body` is trusted markup; an array is joined line by line. */
export function document({ title, nav = [], body, lang = 'en' }) {
  const links = nav.map(({ href, label }) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join('');
  const bodyHtml = Array.isArray(body) ? body.filter(Boolean).join('\n') : body;
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body>
<header><nav aria-label="Main"><ul>${links}</ul></nav></header>
<main>
${bodyHtml}
</main>
</body>
</html>`;
}

/** One labelled field. The label is programmatically associated; that is a brief invariant, not a nicety. */
export function field({ name, label, type = 'text', required = false, autocomplete = null, options = null, value = '', min = null, step = null }) {
  const id = `field-${name}`;
  const autocompleteAttr = autocomplete ? ` autocomplete="${escapeHtml(autocomplete)}"` : '';
  const requiredAttr = required ? ' required aria-required="true"' : '';
  const rangeAttr = `${min === null ? '' : ` min="${escapeHtml(min)}"`}${step === null ? '' : ` step="${escapeHtml(step)}"`}`;
  const control =
    type === 'textarea'
      ? `<textarea id="${id}" name="${escapeHtml(name)}"${requiredAttr}${autocompleteAttr}>${escapeHtml(value)}</textarea>`
      : type === 'select'
        ? `<select id="${id}" name="${escapeHtml(name)}"${requiredAttr}>${(options ?? []).map((option) => `<option>${escapeHtml(option)}</option>`).join('')}</select>`
        : `<input id="${id}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${requiredAttr}${autocompleteAttr}${rangeAttr}>`;
  return `<p><label for="${id}">${escapeHtml(label)}</label>${control}</p>`;
}

/** A POST form. Errors are announced in a live region by default; a fixture can opt out to seed the defect. */
export function form({ action, id = 'main-form', fields = [], submit = 'Submit', error = null, announceErrors = true }) {
  const region = error
    ? announceErrors
      ? `<p id="${id}-error" role="alert">${escapeHtml(error)}</p>`
      : `<p id="${id}-error" class="invalid">${escapeHtml(error)}</p>`
    : '';
  return `<form id="${escapeHtml(id)}" method="post" action="${escapeHtml(action)}" novalidate>
${fields.join('\n')}
${region}
<p><button type="submit">${escapeHtml(submit)}</button></p>
</form>`;
}

/** A JSON-file store. `insert` is what "survives a reload" means; a fixture without one cannot pass. */
export function openStore(file, seed = {}) {
  const read = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : JSON.parse(JSON.stringify(seed)));
  const write = (data) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  };
  return {
    snapshot: read,
    insert(collection, record) {
      const data = read();
      data[collection] = data[collection] ?? [];
      data[collection].push(record);
      write(data);
      return record;
    },
    get(collection, id) {
      return (read()[collection] ?? []).find((record) => record.id === id) ?? null;
    },
    list(collection) {
      return read()[collection] ?? [];
    },
  };
}

/** Parse an `application/x-www-form-urlencoded` body. */
export function parseForm(body) {
  const params = new URLSearchParams(body ?? '');
  const out = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

function matchRoute(routes, method, path) {
  for (const route of routes) {
    if ((route.method ?? 'GET') !== method) continue;
    const names = [];
    const pattern = route.path.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    });
    const match = new RegExp(`^${pattern}$`).exec(path);
    if (match) {
      const params = {};
      names.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1]);
      });
      return { route, params };
    }
  }
  return null;
}

/**
 * Handle one request in-process: `{ method, path, body }` -> `{ status, headers, body }`.
 * This is the seam the tests and the snapshot script use, so no fixture needs a port to be checked.
 */
export async function handle(routes, { method = 'GET', path = '/', body = '' } = {}) {
  const found = matchRoute(routes, method, path);
  if (!found) return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'not found' };
  const request = { method, path, body, query: {}, form: parseForm(body) };
  const context = {
    request,
    params: found.params,
    send(status, responseBody, headers = { 'content-type': 'text/html; charset=utf-8' }) {
      return { status, headers, body: responseBody };
    },
    redirect(location, status = 303) {
      return { status, headers: { location }, body: '' };
    },
  };
  return found.route.handler(context);
}

/** Serve a fixture for a human. Prints the port on stdout so a script can wait for it. */
export function serve(routes, { port = 0 } = {}) {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://127.0.0.1');
    const result = await handle(routes, { method: req.method ?? 'GET', path: url.pathname, body });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Turn a fixture spec into routes. The already-modern baselines and the repair starters differ only
 * in their data and their `defects` flags, so one builder serves both and the difference between a
 * "modern" site and a "defective" one is explicit in the fixture rather than implicit in bespoke code.
 *
 * Page kinds: `static`, `list`, `detail`, `form`, `record`. Defect flags used by the repair starters:
 * `no-label`, `border-only-error`, `no-persistence`, `accept-invalid`, `no-keyboard-widget`,
 * `browser-only-totals`. A flag changes what is rendered or stored; it never changes the routes.
 */
export function createRoutes(spec, store) {
  const defects = new Set(spec.defects ?? []);
  const nav = spec.nav ?? [];
  const page = (title, body) => document({ title, nav, body });

  const itemLink = (item, href) => `<li>${href ? `<a href="${escapeHtml(href.replace(':id', item.id))}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}${item.meta ? ` <span class="meta">${escapeHtml(item.meta)}</span>` : ''}</li>`;

  const renderField = (fieldSpec, { withLabel = true } = {}) => {
    if (fieldSpec.widget === 'custom' && defects.has('no-keyboard-widget')) {
      // The seeded defect: a custom widget that looks like a dropdown but is a div, has no label and
      // cannot be reached or operated from the keyboard.
      return `<p><div role="combobox" class="amount-widget" data-value="${escapeHtml(fieldSpec.options?.[0] ?? '')}">${(fieldSpec.options ?? []).map((option) => `<span>${escapeHtml(option)}</span>`).join('')}</div></p>`;
    }
    if (!withLabel || defects.has('no-label')) {
      const id = `field-${fieldSpec.name}`;
      return `<p><input id="${id}" name="${escapeHtml(fieldSpec.name)}" type="${escapeHtml(fieldSpec.type ?? 'text')}"${fieldSpec.type === 'number' ? ' inputmode="decimal"' : ''}></p>`;
    }
    return field(fieldSpec);
  };

  const routes = [];
  for (const pageSpec of spec.pages ?? []) {
    if (pageSpec.kind === 'static') {
      routes.push({ path: pageSpec.path, handler: (ctx) => ctx.send(200, page(pageSpec.heading ?? spec.title, [`<h1>${escapeHtml(pageSpec.heading ?? spec.title)}</h1>`, ...(pageSpec.sections ?? []).map((section) => `<p>${escapeHtml(section)}</p>`)])) });
    } else if (pageSpec.kind === 'list') {
      routes.push({
        path: pageSpec.path,
        handler: (ctx) => {
          const items = store.list(pageSpec.collection);
          const list = items.length ? `<ul>${items.map((item) => itemLink(item, pageSpec.item)).join('')}</ul>` : `<p>${escapeHtml(pageSpec.empty ?? 'Nothing here yet.')}</p>`;
          // A running total. Server-rendered from stored data by default; a fixture with the
          // `browser-only-totals` defect renders an empty element and works it out in the browser instead.
          const total = pageSpec.total
            ? defects.has('browser-only-totals')
              ? `<p id="${escapeHtml(pageSpec.collection)}-total"></p><script>document.getElementById('${escapeHtml(pageSpec.collection)}-total').textContent = 'Total: ' + (window.__${escapeHtml(pageSpec.collection)} ?? []).reduce((sum, row) => sum + Number(row.${escapeHtml(pageSpec.total.field)}), 0);</script>`
              : `<p id="${escapeHtml(pageSpec.collection)}-total">Total: ${items.reduce((sum, row) => sum + Number(row[pageSpec.total.field] ?? 0), 0)}</p>`
            : '';
          return ctx.send(200, page(pageSpec.heading ?? spec.title, [`<h1>${escapeHtml(pageSpec.heading ?? spec.title)}</h1>`, pageSpec.intro ? `<p>${escapeHtml(pageSpec.intro)}</p>` : '', total, list]));
        },
      });
    } else if (pageSpec.kind === 'detail') {
      routes.push({
        path: pageSpec.path,
        handler: (ctx) => {
          const item = store.get(pageSpec.collection, ctx.params.id);
          if (!item) return ctx.send(404, page('Not found', '<h1>Not found</h1>'));
          const saveFields = (pageSpec.saveFields ?? []).map((fieldSpec) => field(fieldSpec));
          const save = pageSpec.saveAction
            ? `<form method="post" action="${escapeHtml(pageSpec.saveAction.replace(':id', item.id))}"><input type="hidden" name="id" value="${escapeHtml(item.id)}">${saveFields.join('')}<button type="submit">${escapeHtml(pageSpec.saveLabel ?? 'Save to shortlist')}</button></form>`
            : '';
          return ctx.send(200, page(item.title, [`<h1>${escapeHtml(item.title)}</h1>`, item.meta ? `<p>${escapeHtml(item.meta)}</p>` : '', item.body ? `<p>${escapeHtml(item.body)}</p>` : '', item.audio ? `<audio controls src="${escapeHtml(item.audio)}"></audio>` : '', save]));
        },
      });
    } else if (pageSpec.kind === 'record') {
      routes.push({
        path: pageSpec.path,
        handler: (ctx) => {
          const record = store.get(pageSpec.collection, ctx.params.id);
          if (!record) return ctx.send(404, page('Not found', '<h1>Not found</h1>'));
          const rows = (pageSpec.show ?? Object.keys(record)).filter((key) => key !== 'id').map((key) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(record[key] ?? '')}</dd>`).join('');
          return ctx.send(200, page(pageSpec.heading ?? 'Confirmation', [`<h1>${escapeHtml(pageSpec.heading ?? 'Confirmation')}</h1>`, `<dl>${rows}</dl>`]));
        },
      });
    } else if (pageSpec.kind === 'form') {
      const render = (ctx, error) => {
        const fields = (pageSpec.fields ?? []).map((fieldSpec) => renderField(fieldSpec));
        return ctx.send(200, page(pageSpec.heading ?? spec.title, [`<h1>${escapeHtml(pageSpec.heading ?? spec.title)}</h1>`, ...(pageSpec.sections ?? []).map((section) => `<p>${escapeHtml(section)}</p>`), form({ action: pageSpec.action ?? pageSpec.path, fields, submit: pageSpec.submit, error, announceErrors: !defects.has('border-only-error') })]));
      };
      routes.push({ path: pageSpec.path, handler: (ctx) => render(ctx, null) });
      routes.push({
        method: 'POST',
        path: pageSpec.action ?? pageSpec.path,
        handler: (ctx) => {
          const laxValidation = defects.has('lax-validation');
          const lax = (fieldSpec) => laxValidation && fieldSpec.lax === true;
          const requiredMissing = (pageSpec.fields ?? []).filter((fieldSpec) => fieldSpec.required && !ctx.request.form[fieldSpec.name] && !lax(fieldSpec));
          const formatBad = (pageSpec.fields ?? []).filter((fieldSpec) => {
            if (lax(fieldSpec)) return false;
            const raw = ctx.request.form[fieldSpec.name];
            if (raw === undefined || raw === '') return false;
            if (fieldSpec.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) return true;
            if (fieldSpec.min !== undefined && Number(raw) < fieldSpec.min) return true;
            return false;
          });
          // `skip-required` accepts an incomplete form (the early-Enter defect) but still explains a bad
          // value. `lax-validation` drops every check on the fields marked `lax` (the ledger's amount),
          // leaving the other fields enforced so the two defects stay distinguishable.
          const skipRequired = defects.has('skip-required');
          const invalid = (!skipRequired && requiredMissing.length > 0) || formatBad.length > 0;
          if (invalid) {
            const names = [...(skipRequired ? [] : requiredMissing), ...formatBad].map((fieldSpec) => fieldSpec.name).join(', ');
            return render(ctx, `Please provide a valid ${names}`);
          }
          const record = { id: `${pageSpec.collection}-${store.list(pageSpec.collection).length + 1}`, ...ctx.request.form };
          // `no-persistence` is the seeded "confirmation is rebuilt from memory" defect: the record never
          // reaches the store, so it is gone on the next request.
          if (!defects.has('no-persistence')) store.insert(pageSpec.collection, record);
          return ctx.redirect((pageSpec.success ?? '/').replace(':id', record.id));
        },
      });
    }
  }

  for (const saveSpec of spec.saves ?? []) {
    routes.push({
      method: 'POST',
      path: saveSpec.path,
      handler: (ctx) => {
        const item = store.get(saveSpec.collection, ctx.request.form.id);
        if (item && !defects.has('no-persistence')) {
          const { id: _id, ...extra } = ctx.request.form;
          store.insert(saveSpec.into, { id: `${store.list(saveSpec.into).length + 1}`, title: item.title, meta: item.meta ?? '', ...extra });
        }
        return ctx.redirect(saveSpec.success ?? saveSpec.path);
      },
    });
  }

  return routes;
}

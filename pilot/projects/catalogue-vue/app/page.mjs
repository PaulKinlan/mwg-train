import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const template = `
      <header class="brand" data-asset-store="assets/archetypes/catalogue">
        <span class="brand-mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"> <path d="M4 10h16M6 10l1.5 9h9L18 10M9 6c0-1.5 1-2 3-2s3 .5 3 2"/> </svg></span>
      <span class="brand-name">Kiln &amp; Copper</span>
      </header>
      <h1>Searchable reference catalogue</h1>
      <p>A parts catalogue with server-side search, paging and a session cart.</p>
      <figure class="reference-board">
        <img src="/app/step1-grid.jpg" alt="Reference board for catalogue" width="1280" height="900" loading="lazy" decoding="async">
        <figcaption>Reference board for catalogue</figcaption>
      </figure>
    <form id="search-form" method="get" action="/search">
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="query">Search parts</label>
      <input type="search" id="query" name="q" required aria-errormessage="query-error" inputmode="search">
      <p id="query-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in search parts.</p>
      </div>
      <button type="submit">Submit</button>
    </form>
    <form id="cart-form" method="post" action="/cart">

      <label for="quantity">Quantity</label>
      <input type="number" id="quantity" name="quantity" inputmode="numeric">

      <label for="item">Part number</label>
      <input type="text" id="item" name="item" required aria-errormessage="item-error">
      <p id="item-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in part number.</p>
      <button type="submit">Add to cart</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="query" data-echo-source="query" data-echo-param="q"></div>
      </section>`;

export async function renderPage(data = {}) {
  const app = createSSRApp({ template, data: () => ({ ...data }) });
  return renderToString(app);
}

const escapeTitle = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export async function renderDocument({ title = 'Searchable reference catalogue', data = {} } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeTitle(title)}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>${await renderPage(data)}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>`;
}

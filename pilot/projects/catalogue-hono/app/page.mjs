import { html } from 'hono/html';

// One tagged template for the page body, exposed two ways so the route handler can hand Hono a full
// document and the tests can read the body alone.
const body = html`
      <h1>Searchable reference catalogue</h1>
      <p>A parts catalogue with server-side search, paging and a session cart.</p>
    <form id="search-form" method="get" action="/search">
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="query">Search parts</label>
      <input type="search" id="query" name="q" inputmode="search">

      </div>
      <button type="submit">Submit</button>
    </form>
    <form id="cart-form" method="post" action="/cart">

      <label for="quantity">Quantity</label>
      <input type="number" id="quantity" name="quantity" inputmode="numeric">
      <label for="item">Part number</label>
      <input type="text" id="item" name="item">
      <button type="submit">Add to cart</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="query" data-echo-source="query" data-echo-param="q"></div>
      </section>`;

export async function renderPage() {
  return body.toString();
}

export async function renderDocument({ title = 'Searchable reference catalogue' } = {}) {
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>${body}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>`.toString();
}

export async function renderPage(data = {}) {
  return `
      <h1>Searchable reference catalogue</h1>
      <p>A parts catalogue with server-side search, paging and a session cart.</p>
    <form id="search-form" method="get" action="/search">
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="query">Search parts</label>
      <input type="search" id="query" name="q" required inputmode="search">
      <p id="query-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in search parts.</p>
      <label for="quantity">Quantity</label>
      <input type="number" id="quantity" name="quantity" inputmode="numeric">

      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="query" data-echo-source="query" data-echo-param="q"></div>
      </section>`;
}

export async function renderDocument({ title = 'Searchable reference catalogue', data = {} } = {}) {
  const body = await renderPage(data);
  return `<!doctype html>
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
</html>`;
}

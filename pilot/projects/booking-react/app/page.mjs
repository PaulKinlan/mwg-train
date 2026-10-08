import { html } from 'htm/react';
import { renderToStaticMarkup } from 'react-dom/server';

function Page() {
  return html`
      <h1>Evening class booking</h1>
      <p>A training centre takes bookings for evening classes and shows the booking back to the student.</p>
    <form id="booking-form" method="post" action="/book" >
      <div class="field">
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" autocomplete="name" />
      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="username" />
      <label for="address">Delivery address</label>
      <input type="text" id="address" name="address" />
      <label for="postcode">Postcode</label>
      <input type="text" id="postcode" name="postcode" />
      <label for="notes">Anything we should know?</label>
      <textarea id="notes" name="notes"></textarea>
      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="notes"></div>
      </section>`;
}

export async function renderPage() {
  return renderToStaticMarkup(html`<${Page} />`);
}

export async function renderDocument({ title = 'Evening class booking' } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>${await renderPage()}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>`;
}

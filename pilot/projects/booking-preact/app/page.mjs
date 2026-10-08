import { html } from 'htm/preact';
import { renderToString } from 'preact-render-to-string';

function Page() {
  return html`
      <h1>Evening class booking</h1>
      <p>A training centre takes bookings for evening classes and shows the booking back to the student.</p>
    <form id="booking-form" method="post" action="/book" >
      <div class="field">
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" required autocomplete="name" />
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="username" />
      <label for="address">Delivery address</label>
      <input type="text" id="address" name="address" required />
      <label for="postcode">Postcode</label>
      <input type="text" id="postcode" name="postcode" required />
      <label for="notes">Anything we should know?</label>
      <textarea id="notes" name="notes" required></textarea>
      </div>
      <div class="errors">
      <p id="name-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in full name.</p>
      <p id="email-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in email.</p>
      <p id="address-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in delivery address.</p>
      <p id="postcode-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in postcode.</p>
      <p id="notes-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in anything we should know?.</p>
      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="notes"></div>
      </section>`;
}

export async function renderPage() {
  return renderToString(html`<${Page} />`);
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

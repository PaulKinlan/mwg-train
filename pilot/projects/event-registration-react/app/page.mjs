import { html } from 'htm/react';
import { renderToStaticMarkup } from 'react-dom/server';

function Page() {
  return html`
      <header class="brand" data-asset-store="assets/archetypes/event-registration">
        <span class="brand-name">Future Web 2026</span>
      </header>
      <h1>Event registration with capacity</h1>
      <p>Registration for a limited-capacity event, with a server-enforced waitlist.</p>
      <figure class="reference-board">
        <img src="/app/step1-event.jpg" alt="Reference board for event-registration" width="1280" height="900" loading="lazy" decoding="async" />
        <figcaption>Reference board for event-registration</figcaption>
      </figure>
    <form id="registration-form" method="post" action="/register">
      <div class="field">
      <label for="name">Attendee name</label>
      <input type="text" id="name" name="name" required aria-errormessage="name-error" />
      <p id="name-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in attendee name.</p>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required aria-errormessage="email-error" autocomplete="email" />
      <p id="email-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in email.</p>
      <label for="ticket">Ticket</label>
      <select id="ticket" name="ticket" required aria-errormessage="ticket-error">
        <option value="standard">standard</option>
        <option value="accessible">accessible</option>
        <option value="student">student</option>
      </select>
      <p id="ticket-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in ticket.</p>
      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="name" data-echo-source="record" data-echo-param=""></div>
      </section>`;
}

export async function renderPage() {
  return renderToStaticMarkup(html`<${Page} />`);
}

const escapeTitle = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export async function renderDocument({ title = 'Event registration with capacity' } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeTitle(title)}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>${await renderPage()}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>`;
}

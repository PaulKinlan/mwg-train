import { html } from 'htm/react';
import { renderToStaticMarkup } from 'react-dom/server';

function Page() {
  return html`
      <h1>Event registration with capacity</h1>
      <p>Registration for a limited-capacity event, with a server-enforced waitlist.</p>
    <form id="event-registration-form" method="post" action="/register" >
      <div class="field">
      <label for="name">Attendee name</label>
      <input type="text" id="name" name="name" required />
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email" />
      <label for="ticket">Ticket</label>
      <select id="ticket" name="ticket">
        <option value="standard">standard</option>
        <option value="accessible">accessible</option>
        <option value="student">student</option>
      </select>
      </div>
      <div class="errors">
      <p id="name-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in attendee name.</p>
      <p id="email-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in email.</p>
      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="name"></div>
      </section>`;
}

export async function renderPage() {
  return renderToStaticMarkup(html`<${Page} />`);
}

export async function renderDocument({ title = 'Event registration with capacity' } = {}) {
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

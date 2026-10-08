import { html } from 'hono/html';

// One tagged template for the page body, exposed two ways so the route handler can hand Hono a full
// document and the tests can read the body alone.
const body = html`
      <h1>Event registration with capacity</h1>
      <p>Registration for a limited-capacity event, with a server-enforced waitlist.</p>
    <form id="registration-form" method="post" action="/register">
      <div class="field">
      <label for="name">Attendee name</label>
      <input type="text" id="name" name="name" required>
      <p id="name-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in attendee name.</p>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email">
      <p id="email-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in email.</p>
      <label for="ticket">Ticket</label>
      <select id="ticket" name="ticket">
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

export async function renderPage() {
  return body.toString();
}

export async function renderDocument({ title = 'Event registration with capacity' } = {}) {
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

import { html } from 'hono/html';

// One tagged template for the page body, exposed two ways so the route handler can hand Hono a full
// document and the tests can read the body alone.
const body = html`
      <h1>Public-service enquiry form</h1>
      <p>A council service takes enquiries, validates them, and shows the enquirer their reference.</p>
    <form id="enquiry-form" method="post" action="/enquiry">
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="name">Your name</label>
      <input type="text" id="name" name="name" autocomplete="name">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="email">
      <label for="message">How can we help?</label>
      <textarea id="message" name="message"></textarea>

      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="message" data-echo-source="record" data-echo-param=""></div>
      </section>`;

export async function renderPage() {
  return body.toString();
}

export async function renderDocument({ title = 'Public-service enquiry form' } = {}) {
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

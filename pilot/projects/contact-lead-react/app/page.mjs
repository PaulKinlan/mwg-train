import { html } from 'htm/react';
import { renderToStaticMarkup } from 'react-dom/server';

function Page() {
  return html`
      <h1>Public-service enquiry form</h1>
      <p>A council service takes enquiries, validates them, and shows the enquirer their reference.</p>
    <form id="enquiry-form" method="post" action="/enquiry">
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="name">Your name</label>
      <input type="text" id="name" name="name" required aria-errormessage="name-error" autocomplete="name" />
      <p id="name-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in your name.</p>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required aria-errormessage="email-error" autocomplete="email" />
      <p id="email-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in email.</p>
      <label for="message">How can we help?</label>
      <textarea id="message" name="message" required aria-errormessage="message-error"></textarea>
      <p id="message-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in how can we help?.</p>
      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="message" data-echo-source="record" data-echo-param=""></div>
      </section>`;
}

export async function renderPage() {
  return renderToStaticMarkup(html`<${Page} />`);
}

export async function renderDocument({ title = 'Public-service enquiry form' } = {}) {
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

import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const template = `
      <h1>Public-service enquiry form</h1>
      <p>A council service takes enquiries, validates them, and shows the enquirer their reference.</p>
    <form id="contact-lead-form" method="post" action="/enquiry" >
      <div class="field">
      <label for="name">Your name</label>
      <input type="text" id="name" name="name" required autocomplete="name">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email">
      <label for="message">How can we help?</label>
      <textarea id="message" name="message" required></textarea>
      </div>
      <div class="errors">
      <p id="name-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in your name.</p>
      <p id="email-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in email.</p>
      <p id="message-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in how can we help?.</p>
      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="message"></div>
      </section>`;

export async function renderPage(data = {}) {
  const app = createSSRApp({ template, data: () => ({ ...data }) });
  return renderToString(app);
}

export async function renderDocument({ title = 'Public-service enquiry form', data = {} } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/app/styles.css">
  </head>
  <body>
    <main>${await renderPage(data)}
    </main>
    <script type="module" src="/app/enhance.js"></script>
  </body>
</html>`;
}

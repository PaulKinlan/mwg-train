import { html } from 'hono/html';

// One tagged template for the page body, exposed two ways so the route handler can hand Hono a full
// document and the tests can read the body alone.
const body = html`
      <h1>Account sign-in and recovery</h1>
      <p>Sign-up, sign-in with a server session, and a password-reset request.</p>
    <form id="signup-form" method="post" action="/signup">
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="email">Email</label>
      <input type="email" id="email" name="email">
      <label for="password">Password</label>
      <input type="password" id="password" name="password">
      <label for="displayName">Display name</label>
      <input type="text" id="displayName" name="displayName">

      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="displayName" data-echo-source="session" data-echo-param=""></div>
      </section>`;

export async function renderPage() {
  return body.toString();
}

export async function renderDocument({ title = 'Account sign-in and recovery' } = {}) {
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

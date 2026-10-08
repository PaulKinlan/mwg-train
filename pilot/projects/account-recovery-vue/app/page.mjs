import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const template = `
      <h1>Account sign-in and recovery</h1>
      <p>Sign-up, sign-in with a server session, and a password-reset request.</p>
    <form id="account-recovery-form" method="post" action="/signup" >
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="username">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>
      <label for="displayName">Display name</label>
      <input type="text" id="displayName" name="displayName" required>
      </div>
      <div class="errors">
      <p id="email-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in email.</p>
      <p id="password-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in password.</p>
      <p id="displayName-error" class="error-msg" hidden><span aria-hidden="true">✕</span> Please fill in display name.</p>
      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="displayName"></div>
      </section>`;

export async function renderPage(data = {}) {
  const app = createSSRApp({ template, data: () => ({ ...data }) });
  return renderToString(app);
}

export async function renderDocument({ title = 'Account sign-in and recovery', data = {} } = {}) {
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

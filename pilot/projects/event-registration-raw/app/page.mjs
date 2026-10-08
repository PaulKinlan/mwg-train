export async function renderPage(data = {}) {
  return `
      <h1>Event registration with capacity</h1>
      <p>Registration for a limited-capacity event, with a server-enforced waitlist.</p>
    <form id="registration-form" method="post" action="/register">
      <div role="alert" aria-live="assertive" class="form-status" data-form-status></div>
      <div class="field">
      <label for="name">Attendee name</label>
      <input type="text" id="name" name="name">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="email">
      <label for="ticket">Ticket</label>
      <select id="ticket" name="ticket">
        <option value="standard">standard</option>
        <option value="accessible">accessible</option>
        <option value="student">student</option>
      </select>

      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="name" data-echo-source="record" data-echo-param=""></div>
      </section>`;
}

export async function renderDocument({ title = 'Event registration with capacity', data = {} } = {}) {
  const body = await renderPage(data);
  return `<!doctype html>
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
</html>`;
}

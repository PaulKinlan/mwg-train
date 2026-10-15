
      <header class="brand" data-asset-store="assets/archetypes/event-registration">
        <span class="brand-name">Future Web 2026</span>
      </header>
      <h1>Event registration with capacity</h1>
      <p>Registration for a limited-capacity event, with a server-enforced waitlist.</p>
      <figure class="reference-board">
        <img src="/app/step1-event.jpg" alt="Reference board for event-registration" width="1280" height="900" loading="lazy" decoding="async">
        <figcaption>Reference board for event-registration</figcaption>
      </figure>
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
      </section>

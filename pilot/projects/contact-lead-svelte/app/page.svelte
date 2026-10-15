
      <header class="brand" data-asset-store="assets/archetypes/contact-lead">
        <span class="brand-name">ARKHITECTS Studio</span>
      </header>
      <h1>Public-service enquiry form</h1>
      <p>A council service takes enquiries, validates them, and shows the enquirer their reference.</p>
      <figure class="reference-board">
        <img src="/app/step1-form.jpg" alt="Reference board for contact-lead" width="1280" height="900" loading="lazy" decoding="async">
        <figcaption>Reference board for contact-lead</figcaption>
      </figure>
    <form id="enquiry-form" method="post" action="/enquiry">
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
      </section>

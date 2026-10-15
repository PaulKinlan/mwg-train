
      <header class="brand" data-asset-store="assets/archetypes/booking">
        <span class="brand-name">Evening Class Studio</span>
      </header>
      <h1>Evening class booking</h1>
      <p>A training centre takes bookings for evening classes and shows the booking back to the student.</p>
      <figure class="reference-board">
        <img src="/app/step1-browse.jpg" alt="Reference board for booking" width="1280" height="900" loading="lazy" decoding="async">
        <figcaption>Reference board for booking</figcaption>
      </figure>
    <form id="booking-form" method="post" action="/book">
      <div class="field">
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" autocomplete="name">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="username">
      <label for="address">Delivery address</label>
      <input type="text" id="address" name="address">
      <label for="postcode">Postcode</label>
      <input type="text" id="postcode" name="postcode">
      <label for="notes">Anything we should know?</label>
      <textarea id="notes" name="notes"></textarea>

      </div>
      <button type="submit">Submit</button>
    </form>
      <section class="record" aria-labelledby="record-heading">
        <h2 id="record-heading">Your submission</h2>
        <div id="record-echo" data-echo-field="notes" data-echo-source="record" data-echo-param=""></div>
      </section>


      <h1>Account sign-in and recovery</h1>
      <p>Sign-up, sign-in with a server session, and a password-reset request.</p>
      <figure class="reference-board">
        <img src="/app/step1-request.jpg" alt="Reference board for account-recovery" width="1280" height="900" loading="lazy" decoding="async">
        <figcaption>Reference board for account-recovery</figcaption>
      </figure>
    <form id="signup-form" method="post" action="/signup">
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
      </section>

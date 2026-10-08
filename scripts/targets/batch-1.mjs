/**
 * Target designs batch 1: tr-01 through tr-10
 */
export const BATCH_1 = [
  // tr-01: Mobile bicycle mechanic service booking (booking)
  {
    family_id: 'tr-01',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VeloFix Mobile Mechanic — Doorstep Bicycle Tuning &amp; Repair</title>
  <style>
    :root {
      --vf-bg: #0f172a;
      --vf-surface: #1e293b;
      --vf-card: #273549;
      --vf-border: #334155;
      --vf-accent: #10b981;
      --vf-accent-hover: #059669;
      --vf-text: #f8fafc;
      --vf-text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--vf-bg); color: var(--vf-text); line-height: 1.5; padding: 1.5rem; }
    .vf-container { max-width: 1200px; margin: 0 auto; }
    header.vf-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1.25rem; border-bottom: 1px solid var(--vf-border); margin-bottom: 1.5rem; }
    .vf-brand { display: flex; align-items: center; gap: 0.75rem; }
    .vf-logo { width: 36px; height: 36px; background: var(--vf-accent); border-radius: 8px; display: grid; place-items: center; font-weight: 800; color: #022c22; }
    .vf-brand-title { font-size: 1.25rem; font-weight: 700; }
    nav.vf-nav { display: flex; gap: 1rem; }
    nav.vf-nav a { color: var(--vf-text-muted); text-decoration: none; font-size: 0.95rem; padding: 0.35rem 0.65rem; border-radius: 6px; }
    nav.vf-nav a[aria-current="page"] { color: var(--vf-accent); background: rgba(16, 185, 129, 0.1); font-weight: 600; }
    .vf-hero { display: grid; grid-template-columns: 1.8fr 1fr; gap: 2rem; align-items: start; }
    .vf-panel { background: var(--vf-surface); border: 1px solid var(--vf-border); border-radius: 12px; padding: 1.75rem; }
    .vf-panel h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .vf-subtitle { color: var(--vf-text-muted); margin-bottom: 1.5rem; font-size: 1rem; }
    .vf-form-grid { display: grid; gap: 1.25rem; }
    .vf-fieldset { border: 1px solid var(--vf-border); border-radius: 8px; padding: 1rem; background: var(--vf-card); }
    .vf-legend { font-size: 0.9rem; font-weight: 600; color: var(--vf-accent); padding: 0 0.5rem; }
    .vf-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; }
    .vf-field { display: flex; flex-direction: column; gap: 0.35rem; }
    label { font-size: 0.875rem; font-weight: 600; color: var(--vf-text); }
    input, select, textarea { background: #0f172a; border: 1px solid var(--vf-border); color: var(--vf-text); padding: 0.6rem 0.75rem; border-radius: 6px; font-size: 0.95rem; }
    input:focus, select:focus, textarea:focus { outline: 2px solid var(--vf-accent); border-color: transparent; }
    .vf-packages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 0.5rem; }
    .vf-pkg-card { background: #0f172a; border: 1px solid var(--vf-border); border-radius: 6px; padding: 0.75rem; text-align: center; cursor: pointer; }
    .vf-pkg-card label { display: block; cursor: pointer; }
    .vf-pkg-name { font-weight: 700; font-size: 0.95rem; color: #fff; }
    .vf-pkg-price { color: var(--vf-accent); font-size: 1.1rem; font-weight: 800; margin: 0.25rem 0; }
    .vf-btn-submit { background: var(--vf-accent); color: #022c22; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem 1.5rem; border-radius: 8px; cursor: pointer; margin-top: 0.5rem; }
    .vf-btn-submit:hover { background: var(--vf-accent-hover); }
    aside.vf-sidebar { display: flex; flex-direction: column; gap: 1.25rem; }
    .vf-info-card { background: var(--vf-surface); border: 1px solid var(--vf-border); border-radius: 10px; padding: 1.25rem; }
    .vf-info-card h2 { font-size: 1.15rem; margin-bottom: 0.75rem; color: var(--vf-accent); }
    .vf-info-card ul { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem; color: var(--vf-text-muted); }
    .vf-status-badge { display: inline-block; background: rgba(16,185,129,0.2); color: var(--vf-accent); padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.8rem; }
    footer.vf-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--vf-border); font-size: 0.85rem; color: var(--vf-text-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="vf-container">
    <header class="vf-header">
      <div class="vf-brand">
        <div class="vf-logo">VF</div>
        <div class="vf-brand-title">VeloFix Mobile Mechanic</div>
      </div>
      <nav class="vf-nav" aria-label="Main Navigation">
        <a href="/">Home</a>
        <a href="/services">Services</a>
        <a href="/book" aria-current="page">Book a Van Visit</a>
        <a href="/bookings">My Booking</a>
      </nav>
    </header>
    <main class="vf-hero">
      <section class="vf-panel">
        <h1>Schedule Doorstep Bicycle Tune-Up</h1>
        <p class="vf-subtitle">Our mobile repair van visits your home or workplace with full professional tooling.</p>
        <form id="velofix-booking" class="vf-form-grid" method="post" action="/book">
          <fieldset class="vf-fieldset">
            <legend class="vf-legend">1. Select Service Package</legend>
            <div class="vf-packages">
              <div class="vf-pkg-card">
                <label for="pkg-commuter">
                  <input type="radio" id="pkg-commuter" name="package" value="commuter" checked>
                  <div class="vf-pkg-name">Commuter Tune</div>
                  <div class="vf-pkg-price">£45</div>
                  <div style="font-size:0.8rem;color:#94a3b8">Brakes &amp; Gears</div>
                </label>
              </div>
              <div class="vf-pkg-card">
                <label for="pkg-general">
                  <input type="radio" id="pkg-general" name="package" value="general">
                  <div class="vf-pkg-name">Full Overhaul</div>
                  <div class="vf-pkg-price">£85</div>
                  <div style="font-size:0.8rem;color:#94a3b8">Drivetrain &amp; Bearings</div>
                </label>
              </div>
              <div class="vf-pkg-card">
                <label for="pkg-pro">
                  <input type="radio" id="pkg-pro" name="package" value="pro">
                  <div class="vf-pkg-name">Race Precision</div>
                  <div class="vf-pkg-price">£135</div>
                  <div style="font-size:0.8rem;color:#94a3b8">Hydraulics &amp; Wheels</div>
                </label>
              </div>
            </div>
          </fieldset>
          <fieldset class="vf-fieldset">
            <legend class="vf-legend">2. Location &amp; Contact Details</legend>
            <div class="vf-row-2">
              <div class="vf-field">
                <label for="customer_name">Full Name</label>
                <input type="text" id="customer_name" name="customer_name" required placeholder="Alex Turner">
              </div>
              <div class="vf-field">
                <label for="contact_phone">Phone Number (Required)</label>
                <input type="tel" id="contact_phone" name="contact_phone" required placeholder="07700 900123">
              </div>
            </div>
            <div class="vf-row-2">
              <div class="vf-field">
                <label for="service_address">Street Address</label>
                <input type="text" id="service_address" name="service_address" required placeholder="14 Riverside Crescent">
              </div>
              <div class="vf-field">
                <label for="service_postcode">Postcode</label>
                <input type="text" id="service_postcode" name="service_postcode" required placeholder="NW1 4NP">
              </div>
            </div>
          </fieldset>
          <fieldset class="vf-fieldset">
            <legend class="vf-legend">3. Appointment Slot</legend>
            <div class="vf-row-2">
              <div class="vf-field">
                <label for="appointment_date">Preferred Date</label>
                <input type="date" id="appointment_date" name="appointment_date" required value="2026-10-15">
              </div>
              <div class="vf-field">
                <label for="time_slot">Time Window</label>
                <select id="time_slot" name="time_slot" required>
                  <option value="morning">Morning (08:30 - 12:00)</option>
                  <option value="afternoon">Afternoon (12:30 - 16:30)</option>
                  <option value="evening">Late Slot (17:00 - 19:30)</option>
                </select>
              </div>
            </div>
            <div class="vf-field" style="margin-top:0.75rem">
              <label for="bike_notes">Bicycle Make, Model &amp; Known Issues</label>
              <textarea id="bike_notes" name="bike_notes" rows="2" placeholder="e.g. Ridgeback Voyage touring bike, rear derailleur skipping in 4th gear"></textarea>
            </div>
          </fieldset>
          <button type="submit" class="vf-btn-submit">Confirm Mechanic Dispatch</button>
        </form>
      </section>
      <aside class="vf-sidebar">
        <div class="vf-info-card">
          <h2>Van Service Coverage</h2>
          <span class="vf-status-badge">Van #2 Active Today</span>
          <ul style="margin-top:0.75rem">
            <li><strong>Service Area:</strong> Within 12 miles of central depot</li>
            <li><strong>Doorstep Setup:</strong> Fully self-powered workshop</li>
            <li><strong>Payment:</strong> Invoiced securely on completion</li>
            <li><strong>Parts guarantee:</strong> 6-month warranty on installed cabling and pads</li>
          </ul>
        </div>
        <div class="vf-info-card">
          <h2>What happens next?</h2>
          <ul>
            <li>1. Instant confirmed booking reference generated</li>
            <li>2. Mechanic calls 20 minutes before arrival</li>
            <li>3. Complete safety test ride performed on-site</li>
          </ul>
        </div>
      </aside>
    </main>
    <footer class="vf-footer">
      <p>VeloFix Mobile Mechanic Ltd • Registered Mobile Workshop • All repairs guaranteed</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-02: Seasonal cider pre-orders and local pickup (web-shop)
  {
    family_id: 'tr-02',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Foxhill Orchard &amp; Press — Seasonal Cider Pre-Orders</title>
  <style>
    :root {
      --fo-bg: #fdfbf7;
      --fo-bark: #382013;
      --fo-amber: #b45309;
      --fo-gold: #f59e0b;
      --fo-cream: #fef3c7;
      --fo-border: #e2d9cc;
      --fo-text: #261a12;
      --fo-muted: #786657;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--fo-bg); color: var(--fo-text); line-height: 1.5; padding: 1.5rem; }
    .fo-shell { max-width: 1200px; margin: 0 auto; }
    header.fo-header { border-bottom: 2px solid var(--fo-amber); padding-bottom: 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: flex-end; }
    .fo-title-area h1 { font-size: 2rem; color: var(--fo-bark); letter-spacing: -0.5px; }
    .fo-tagline { font-style: italic; color: var(--fo-muted); font-size: 0.95rem; }
    nav.fo-nav { display: flex; gap: 1.25rem; font-family: -apple-system, sans-serif; font-size: 0.9rem; }
    nav.fo-nav a { text-decoration: none; color: var(--fo-bark); font-weight: 600; }
    nav.fo-nav a[aria-current="page"] { color: var(--fo-amber); text-decoration: underline; }
    .fo-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; }
    .fo-catalog { display: grid; gap: 1.5rem; }
    .fo-cider-card { background: #fff; border: 1px solid var(--fo-border); border-radius: 8px; padding: 1.25rem; display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .fo-cider-card h3 { font-size: 1.2rem; color: var(--fo-bark); margin-bottom: 0.25rem; }
    .fo-cider-desc { font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--fo-muted); margin-bottom: 0.5rem; }
    .fo-price-tag { font-family: -apple-system, sans-serif; font-weight: 700; color: var(--fo-amber); font-size: 1.1rem; }
    .fo-qty-box { display: flex; align-items: center; gap: 0.5rem; font-family: -apple-system, sans-serif; }
    .fo-qty-box input { width: 64px; padding: 0.4rem; border: 1px solid var(--fo-border); border-radius: 4px; text-align: center; font-size: 1rem; }
    .fo-checkout-card { background: #fff; border: 1px solid var(--fo-border); border-radius: 8px; padding: 1.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.03); }
    .fo-checkout-card h2 { font-size: 1.35rem; color: var(--fo-bark); margin-bottom: 1rem; border-bottom: 1px solid var(--fo-border); padding-bottom: 0.5rem; }
    .fo-form-group { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; font-family: -apple-system, sans-serif; }
    .fo-form-group label { font-size: 0.85rem; font-weight: 600; color: var(--fo-bark); }
    .fo-form-group input, .fo-form-group select { padding: 0.55rem; border: 1px solid var(--fo-border); border-radius: 4px; font-size: 0.95rem; }
    .fo-btn-order { width: 100%; background: var(--fo-amber); color: #fff; border: none; padding: 0.85rem; border-radius: 6px; font-weight: 700; font-family: -apple-system, sans-serif; font-size: 1rem; cursor: pointer; }
    .fo-btn-order:hover { background: #92400e; }
    .fo-pickup-notice { margin-top: 1rem; padding: 0.75rem; background: var(--fo-cream); border-radius: 6px; font-family: -apple-system, sans-serif; font-size: 0.8rem; color: #78350f; }
    footer.fo-footer { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--fo-border); text-align: center; font-size: 0.85rem; color: var(--fo-muted); font-family: -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div class="fo-shell">
    <header class="fo-header">
      <div class="fo-title-area">
        <h1>Foxhill Orchard &amp; Cider Press</h1>
        <p class="fo-tagline">Heritage single-orchard pressings • Autumn 2026 Batch Pre-Orders</p>
      </div>
      <nav class="fo-nav" aria-label="Store Navigation">
        <a href="/">The Orchard</a>
        <a href="/ciders" aria-current="page">Pre-Order Bottles</a>
        <a href="/cart">Cask Cart</a>
        <a href="/orders">Pickup Slips</a>
      </nav>
    </header>
    <main class="fo-layout">
      <section>
        <h2 style="font-size:1.4rem;color:#382013;margin-bottom:1rem">Harvest Pressings Available for Weekend Pickup</h2>
        <form id="order-form" method="post" action="/checkout">
          <div class="fo-catalog">
            <article class="fo-cider-card">
              <div>
                <h3>Kingston Black Single Variety (750ml)</h3>
                <p class="fo-cider-desc">Dry, structured bittersharp cider fermented in neutral oak casks. 6.8% ABV.</p>
                <div class="fo-price-tag">£7.50 / bottle</div>
              </div>
              <div class="fo-qty-box">
                <label for="qty_kingston">Bottles:</label>
                <input type="number" id="qty_kingston" name="qty_kingston" min="0" max="24" value="2">
              </div>
            </article>
            <article class="fo-cider-card">
              <div>
                <h3>Orchard Scrumpy Unfiltered (1 Litre Flagon)</h3>
                <p class="fo-cider-desc">Cloudy farmhouse blend of Dabinett and Yarlington Mill. Naturally sparkling. 6.2% ABV.</p>
                <div class="fo-price-tag">£8.20 / flagon</div>
              </div>
              <div class="fo-qty-box">
                <label for="qty_scrumpy">Flagons:</label>
                <input type="number" id="qty_scrumpy" name="qty_scrumpy" min="0" max="12" value="1">
              </div>
            </article>
            <article class="fo-cider-card">
              <div>
                <h3>Foxhill Autumn Perry (750ml)</h3>
                <p class="fo-cider-desc">Pressed from heritage Blakeney Red and Hendre Huffcap perry pears. Delicate floral notes. 5.5% ABV.</p>
                <div class="fo-price-tag">£8.90 / bottle</div>
              </div>
              <div class="fo-qty-box">
                <label for="qty_perry">Bottles:</label>
                <input type="number" id="qty_perry" name="qty_perry" min="0" max="18" value="0">
              </div>
            </article>
          </div>
          <div class="fo-checkout-card" style="margin-top: 1.5rem;">
            <h2>Farm Gate Collection Details</h2>
            <div class="fo-form-group">
              <label for="customer_name">Full Name</label>
              <input type="text" id="customer_name" name="customer_name" required placeholder="Eleanor Vance">
            </div>
            <div class="fo-form-group">
              <label for="customer_email">Email Address</label>
              <input type="email" id="customer_email" name="customer_email" required placeholder="eleanor@example.test">
            </div>
            <div class="fo-form-group">
              <label for="pickup_date">Pickup Weekend Slot</label>
              <select id="pickup_date" name="pickup_date" required>
                <option value="sat-morning">Saturday 17 Oct (10:00 - 13:00)</option>
                <option value="sat-afternoon">Saturday 17 Oct (13:30 - 17:00)</option>
                <option value="sun-morning">Sunday 18 Oct (11:00 - 15:00)</option>
              </select>
            </div>
            <button type="submit" class="fo-btn-order">Submit Cider Pre-Order</button>
            <div class="fo-pickup-notice">
              Collection address: Foxhill Barn, Ciderhouse Lane, HR4 7PJ. Re-usable bottle return scheme: £0.50 rebate per returned clean flagon.
            </div>
          </div>
        </form>
      </section>
      <aside>
        <div class="fo-checkout-card">
          <h2>Orchard Notes</h2>
          <p style="font-size:0.9rem;color:#786657;margin-bottom:1rem">All our fruit is unsprayed and hand-harvested from standard trees planted in 1968. Wild yeast ferment only.</p>
          <h3 style="font-size:1.05rem;color:#382013;margin-bottom:0.5rem">Collection Protocol</h3>
          <ul style="font-size:0.85rem;color:#786657;display:flex;flex-direction:column;gap:0.4rem;padding-left:1.2rem">
            <li>Drive directly up the orchard lane to the press building</li>
            <li>State your order confirmation reference code</li>
            <li>Payment taken at collection via contactless card or cash</li>
          </ul>
        </div>
      </aside>
    </main>
    <footer class="fo-footer">
      <p>Foxhill Orchard &amp; Press • Traditional Farmhouse Cider Producers • Licensed Premises</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-03: Pottery studio shared kiln firings schedule (booking)
  {
    family_id: 'tr-03',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Terraform Ceramics Co-op — Kiln Firing Shelf Booking</title>
  <style>
    :root {
      --tc-clay: #c2410c;
      --tc-sand: #fef3c7;
      --tc-earth: #78350f;
      --tc-slate: #292524;
      --tc-bg: #fafaf9;
      --tc-border: #e7e5e4;
      --tc-surface: #ffffff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Trebuchet MS", "Lucida Sans", Arial, sans-serif; background: var(--tc-bg); color: var(--tc-slate); line-height: 1.5; padding: 1.5rem; }
    .tc-wrap { max-width: 1200px; margin: 0 auto; }
    header.tc-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--tc-clay); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .tc-brand { font-size: 1.4rem; font-weight: 800; color: var(--tc-earth); letter-spacing: 0.5px; }
    nav.tc-nav a { margin-left: 1.25rem; text-decoration: none; color: var(--tc-slate); font-weight: 600; font-size: 0.95rem; }
    nav.tc-nav a[aria-current="page"] { color: var(--tc-clay); border-bottom: 2px solid var(--tc-clay); padding-bottom: 0.2rem; }
    .tc-grid { display: grid; grid-template-columns: 1.7fr 1.1fr; gap: 2rem; align-items: start; }
    .tc-card { background: var(--tc-surface); border: 1px solid var(--tc-border); border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .tc-card h2 { color: var(--tc-earth); font-size: 1.3rem; margin-bottom: 0.5rem; }
    .tc-card p.tc-sub { color: #78716c; font-size: 0.9rem; margin-bottom: 1.25rem; }
    .tc-form-row { margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.35rem; }
    .tc-form-row label { font-size: 0.85rem; font-weight: 700; color: var(--tc-slate); }
    .tc-form-row input, .tc-form-row select, .tc-form-row textarea { padding: 0.6rem; border: 1px solid var(--tc-border); border-radius: 6px; font-size: 0.95rem; }
    .tc-schedule-table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.85rem; }
    .tc-schedule-table th, .tc-schedule-table td { padding: 0.65rem 0.5rem; border-bottom: 1px solid var(--tc-border); text-align: left; }
    .tc-schedule-table th { background: var(--tc-sand); color: var(--tc-earth); font-weight: 700; }
    .tc-badge-open { background: #dcfce7; color: #15803d; padding: 0.2rem 0.45rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; }
    .tc-badge-full { background: #fee2e2; color: #b91c1c; padding: 0.2rem 0.45rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; }
    .tc-btn-book { background: var(--tc-clay); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.8rem 1.5rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.75rem; }
    .tc-btn-book:hover { background: #9a3412; }
    footer.tc-foot { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--tc-border); text-align: center; font-size: 0.85rem; color: #78716c; }
  </style>
</head>
<body>
  <div class="tc-wrap">
    <header class="tc-head">
      <div class="tc-brand">TERRAFORM CERAMICS CO-OP</div>
      <nav class="tc-nav" aria-label="Studio Nav">
        <a href="/">Studio Home</a>
        <a href="/kilns">Kiln Specs</a>
        <a href="/reserve" aria-current="page">Reserve Shelf</a>
        <a href="/schedule">Public Calendar</a>
      </nav>
    </header>
    <main class="tc-grid">
      <section class="tc-card">
        <h2>Reserve Kiln Shelf Space</h2>
        <p class="tc-sub">Book space in our Skutt 1227 electric kilns. Bisque firing Cone 06; Glaze firing Cone 6.</p>
        <form id="kiln-reserve-form" method="post" action="/reserve">
          <div class="tc-form-row">
            <label for="member_id">Studio Member ID</label>
            <input type="text" id="member_id" name="member_id" required placeholder="TC-408">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="tc-form-row">
              <label for="firing_date">Firing Run Date</label>
              <select id="firing_date" name="firing_date" required>
                <option value="2026-10-18">Sun 18 Oct — Bisque (Cone 06)</option>
                <option value="2026-10-21">Wed 21 Oct — Glaze (Cone 6)</option>
                <option value="2026-10-25">Sun 25 Oct — Glaze (Cone 6)</option>
              </select>
            </div>
            <div class="tc-form-row">
              <label for="cone_temperature">Firing Cone Temperature</label>
              <select id="cone_temperature" name="cone_temperature" required>
                <option value="cone-06">Cone 06 (Bisque ~1000°C)</option>
                <option value="cone-6" selected>Cone 6 (Mid-fire Stoneware ~1220°C)</option>
                <option value="cone-10">Cone 10 (Specialty Lustre)</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="tc-form-row">
              <label for="shelf_count">Number of Half-Shelves</label>
              <input type="number" id="shelf_count" name="shelf_count" min="1" max="6" value="2" required>
            </div>
            <div class="tc-form-row">
              <label for="max_height">Max Piece Height (Inches)</label>
              <input type="number" id="max_height" name="max_height" min="1" max="16" value="7" required>
            </div>
          </div>
          <div class="tc-form-row">
            <label for="clay_body">Clay Body &amp; Glaze Formulation Notes</label>
            <textarea id="clay_body" name="clay_body" rows="3" placeholder="e.g. B-Mix with grog, commercial Amaco Potter's Choice glaze on exterior only, no runny glaze on base." required></textarea>
          </div>
          <button type="submit" class="tc-btn-book">Confirm Kiln Space Reservation</button>
        </form>
      </section>
      <aside class="tc-card">
        <h2>Live Firing Schedule</h2>
        <p class="tc-sub">Kiln 1 (Big Bertha) &amp; Kiln 2 (The Pioneer)</p>
        <table class="tc-schedule-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Cone</th>
              <th>Space</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>18 Oct</td>
              <td>Bisque</td>
              <td>06</td>
              <td><span class="tc-badge-open">2 shelves left</span></td>
            </tr>
            <tr>
              <td>21 Oct</td>
              <td>Glaze</td>
              <td>6</td>
              <td><span class="tc-badge-open">4 shelves left</span></td>
            </tr>
            <tr>
              <td>25 Oct</td>
              <td>Glaze</td>
              <td>6</td>
              <td><span class="tc-badge-full">Full</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:1.25rem;font-size:0.8rem;color:#78716c;background:var(--tc-sand);padding:0.75rem;border-radius:6px">
          <strong>Firing Rule:</strong> Wax resist must be applied 1/4 inch up from the base of all glaze ware. Kiln shelf damage penalty applies if glaze runs onto kiln wash.
        </div>
      </aside>
    </main>
    <footer class="tc-foot">
      <p>Terraform Ceramics Community Co-op • 48 Pottery Yard • Studio Hours: 08:00 - 22:00 Daily</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-04: Community solar array daily output and member credits (dashboard)
  {
    family_id: 'tr-04',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SunHarbor Community Solar — Array Telemetry &amp; Member Credits</title>
  <style>
    :root {
      --sh-sky: #0284c7;
      --sh-dark: #0f172a;
      --sh-panel: #1e293b;
      --sh-yellow: #facc15;
      --sh-text: #f8fafc;
      --sh-muted: #94a3b8;
      --sh-border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--sh-dark); color: var(--sh-text); line-height: 1.5; padding: 1.5rem; }
    .sh-container { max-width: 1200px; margin: 0 auto; }
    header.sh-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--sh-border); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .sh-logo { font-size: 1.3rem; font-weight: 800; color: var(--sh-yellow); display: flex; align-items: center; gap: 0.5rem; }
    nav.sh-nav a { color: var(--sh-muted); text-decoration: none; margin-left: 1rem; font-size: 0.9rem; }
    nav.sh-nav a[aria-current="page"] { color: #fff; font-weight: 700; border-bottom: 2px solid var(--sh-yellow); padding-bottom: 0.2rem; }
    .sh-stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 1.5rem; }
    .sh-stat-card { background: var(--sh-panel); border: 1px solid var(--sh-border); border-radius: 8px; padding: 1.25rem; }
    .sh-stat-title { font-size: 0.85rem; color: var(--sh-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .sh-stat-val { font-size: 2rem; font-weight: 800; color: #fff; margin: 0.25rem 0; }
    .sh-stat-sub { font-size: 0.8rem; color: #4ade80; }
    .sh-main-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 1.5rem; align-items: start; }
    .sh-card { background: var(--sh-panel); border: 1px solid var(--sh-border); border-radius: 8px; padding: 1.5rem; }
    .sh-card h2 { font-size: 1.25rem; margin-bottom: 1rem; color: #fff; }
    table.sh-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    table.sh-table th, table.sh-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--sh-border); text-align: left; }
    table.sh-table th { color: var(--sh-muted); font-weight: 600; }
    .sh-form-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; }
    .sh-form-field label { font-size: 0.85rem; font-weight: 600; color: var(--sh-muted); }
    .sh-form-field input, .sh-form-field select { background: #0f172a; border: 1px solid var(--sh-border); color: #fff; padding: 0.6rem; border-radius: 6px; font-size: 0.95rem; }
    .sh-btn { background: var(--sh-sky); color: #fff; border: none; font-weight: 700; padding: 0.75rem 1.25rem; border-radius: 6px; cursor: pointer; width: 100%; }
    .sh-btn:hover { background: #0369a1; }
    .sh-credit-result { margin-top: 1.25rem; padding: 1rem; background: rgba(2, 132, 199, 0.1); border: 1px solid var(--sh-sky); border-radius: 6px; }
    footer.sh-foot { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--sh-border); text-align: center; font-size: 0.85rem; color: var(--sh-muted); }
  </style>
</head>
<body>
  <div class="sh-container">
    <header class="sh-head">
      <div class="sh-logo">☀ SunHarbor Solar Co-op</div>
      <nav class="sh-nav" aria-label="Portal Navigation">
        <a href="/">Overview</a>
        <a href="/generation" aria-current="page">Telemetry</a>
        <a href="/credits">Member Portal</a>
        <a href="/reports">Annual Report</a>
      </nav>
    </header>
    <div class="sh-stats-row">
      <div class="sh-stat-card">
        <div class="sh-stat-title">Current Generation Output</div>
        <div class="sh-stat-val">42.8 kW</div>
        <div class="sh-stat-sub">↑ 85.6% of peak rated 50kW array</div>
      </div>
      <div class="sh-stat-card">
        <div class="sh-stat-title">Cumulative This Month</div>
        <div class="sh-stat-val">5,840 kWh</div>
        <div class="sh-stat-sub">Equivalent to 4.2 tonnes CO₂ offset</div>
      </div>
      <div class="sh-stat-card">
        <div class="sh-stat-title">Participating Households</div>
        <div class="sh-stat-val">64 Homes</div>
        <div class="sh-stat-sub">100% active credit allocation</div>
      </div>
    </div>
    <main class="sh-main-grid">
      <section class="sh-card">
        <h2>Today's Hourly Inverter Readings (Array 1 &amp; 2)</h2>
        <table class="sh-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Irradiance</th>
              <th>Array kW</th>
              <th>Grid Export (kWh)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>08:00</td><td>320 W/m²</td><td>14.2 kW</td><td>12.8 kWh</td><td>Optimal</td></tr>
            <tr><td>09:00</td><td>510 W/m²</td><td>24.6 kW</td><td>22.4 kWh</td><td>Optimal</td></tr>
            <tr><td>10:00</td><td>680 W/m²</td><td>34.1 kW</td><td>32.8 kWh</td><td>Optimal</td></tr>
            <tr><td>11:00</td><td>820 W/m²</td><td>41.5 kW</td><td>39.7 kWh</td><td>Peak</td></tr>
            <tr><td>12:00</td><td>890 W/m²</td><td>43.2 kW</td><td>42.0 kWh</td><td>Peak</td></tr>
            <tr><td>13:00</td><td>870 W/m²</td><td>42.8 kW</td><td>41.2 kWh</td><td>Optimal</td></tr>
          </tbody>
        </table>
      </section>
      <section class="sh-card">
        <h2>Member Credit Balance Query</h2>
        <form id="credit-query-form" method="get" action="/credits">
          <div class="sh-form-field">
            <label for="account_number">Member Account or Meter Number</label>
            <input type="text" id="account_number" name="account_number" value="SH-8821" required>
          </div>
          <div class="sh-form-field">
            <label for="statement_period">Billing Period</label>
            <select id="statement_period" name="statement_period" required>
              <option value="2026-10">October 2026 (In Progress)</option>
              <option value="2026-09">September 2026 (Finalized)</option>
              <option value="2026-08">August 2026 (Finalized)</option>
            </select>
          </div>
          <button type="submit" class="sh-btn">Calculate Accrued Solar Credits</button>
        </form>
        <div class="sh-credit-result">
          <div style="font-size:0.8rem;color:var(--sh-muted)">Account SH-8821 • Meter #44091</div>
          <div style="font-size:1.4rem;font-weight:700;color:#fff;margin:0.25rem 0">92.4 kWh Accrued Credit</div>
          <div style="font-size:0.8rem;color:#38bdf8">Estimated utility offset: £24.95 credit applied on next council bill</div>
        </div>
      </section>
    </main>
    <footer class="sh-foot">
      <p>SunHarbor Community Solar Co-operative • Civic Rooftop Installation • Open Telemetry Standard</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-05: Wildlife rehabilitation volunteer intake and credentials (onboarding-auth)
  {
    family_id: 'tr-05',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meadowbrook Wildlife Hospital — Volunteer Onboarding &amp; Credentials</title>
  <style>
    :root {
      --wb-green: #14532d;
      --wb-leaf: #22c55e;
      --wb-light: #f0fdf4;
      --wb-border: #cbd5e1;
      --wb-dark: #0f172a;
      --wb-card: #ffffff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: var(--wb-dark); line-height: 1.5; padding: 1.5rem; }
    .wb-shell { max-width: 1100px; margin: 0 auto; }
    header.wb-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--wb-green); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .wb-brand-title { font-size: 1.35rem; font-weight: 800; color: var(--wb-green); }
    nav.wb-nav a { text-decoration: none; color: #475569; font-weight: 600; margin-left: 1.25rem; font-size: 0.9rem; }
    nav.wb-nav a[aria-current="page"] { color: var(--wb-green); border-bottom: 2px solid var(--wb-leaf); padding-bottom: 0.2rem; }
    .wb-hero { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; }
    .wb-form-card { background: var(--wb-card); border: 1px solid var(--wb-border); border-radius: 10px; padding: 2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
    .wb-form-card h1 { font-size: 1.6rem; color: var(--wb-green); margin-bottom: 0.5rem; }
    .wb-intro { color: #64748b; font-size: 0.95rem; margin-bottom: 1.5rem; }
    fieldset.wb-section { border: 1px solid var(--wb-border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; }
    legend.wb-legend { font-weight: 700; color: var(--wb-green); padding: 0 0.5rem; font-size: 0.95rem; }
    .wb-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .wb-input-group { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
    .wb-input-group label { font-size: 0.85rem; font-weight: 600; color: #334155; }
    .wb-input-group input, .wb-input-group select { padding: 0.6rem; border: 1px solid var(--wb-border); border-radius: 6px; font-size: 0.95rem; }
    .wb-btn-submit { background: var(--wb-green); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem 1.5rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .wb-btn-submit:hover { background: #166534; }
    aside.wb-sidebar { display: flex; flex-direction: column; gap: 1.25rem; }
    .wb-side-card { background: var(--wb-card); border: 1px solid var(--wb-border); border-radius: 8px; padding: 1.25rem; }
    .wb-side-card h2 { font-size: 1.15rem; color: var(--wb-green); margin-bottom: 0.5rem; }
    .wb-badge-req { background: #fee2e2; color: #991b1b; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    footer.wb-footer { margin-top: 2.5rem; border-top: 1px solid var(--wb-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="wb-shell">
    <header class="wb-header">
      <div class="wb-brand-title">Meadowbrook Wildlife Hospital</div>
      <nav class="wb-nav" aria-label="Volunteer Navigation">
        <a href="/">Hospital Home</a>
        <a href="/register" aria-current="page">Volunteer Application</a>
        <a href="/login">Volunteer Sign In</a>
        <a href="/volunteer/profile">Status Board</a>
      </nav>
    </header>
    <main class="wb-hero">
      <section class="wb-form-card">
        <h1>Volunteer Intake &amp; Handling Registration</h1>
        <p class="wb-intro">Join our dedicated team of wildlife rehabilitators caring for injured birds, hedgehogs, and small mammals.</p>
        <form id="volunteer-reg" method="post" action="/register">
          <fieldset class="wb-section">
            <legend class="wb-legend">1. Personal &amp; Emergency Contact</legend>
            <div class="wb-row-2">
              <div class="wb-input-group">
                <label for="volunteer_name">Full Name</label>
                <input type="text" id="volunteer_name" name="volunteer_name" required placeholder="Hannah Davies">
              </div>
              <div class="wb-input-group">
                <label for="volunteer_email">Email Address</label>
                <input type="email" id="volunteer_email" name="volunteer_email" required placeholder="hannah@example.test">
              </div>
            </div>
            <div class="wb-row-2">
              <div class="wb-input-group">
                <label for="phone">Phone Number</label>
                <input type="tel" id="phone" name="phone" required placeholder="07700 900543">
              </div>
              <div class="wb-input-group">
                <label for="emergency_phone">Emergency Contact Phone</label>
                <input type="tel" id="emergency_phone" name="emergency_phone" required placeholder="07700 900876">
              </div>
            </div>
          </fieldset>
          <fieldset class="wb-section">
            <legend class="wb-legend">2. Vaccination &amp; Handling Experience</legend>
            <div class="wb-input-group">
              <label for="species_focus">Primary Animal Focus</label>
              <select id="species_focus" name="species_focus" required>
                <option value="songbirds">Avian / Songbirds &amp; Waterfowl</option>
                <option value="raptors">Birds of Prey (Requires min 1 yr exp)</option>
                <option value="mammals" selected>Small Mammals (Hedgehogs, Badgers, Squirrels)</option>
                <option value="reptiles">Reptiles &amp; Amphibians</option>
              </select>
            </div>
            <div class="wb-input-group">
              <label for="tetanus_date">Date of Last Tetanus Booster</label>
              <input type="date" id="tetanus_date" name="tetanus_date" required value="2025-04-12">
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin:0.5rem 0">
              <input type="checkbox" id="rabies_clearance" name="rabies_clearance" value="yes" required>
              <label for="rabies_clearance" style="font-size:0.85rem">I confirm I have up-to-date vaccinations and agree to strictly follow safety bite protocols.</label>
            </div>
          </fieldset>
          <fieldset class="wb-section">
            <legend class="wb-legend">3. Portal Security Credentials</legend>
            <div class="wb-row-2">
              <div class="wb-input-group">
                <label for="account_password">Create Volunteer Password</label>
                <input type="password" id="account_password" name="account_password" required minlength="8" placeholder="••••••••••••">
              </div>
              <div class="wb-input-group">
                <label for="shift_preference">Weekly Shift Availability</label>
                <select id="shift_preference" name="shift_preference" required>
                  <option value="sat-morning">Saturday Mornings (08:00 - 12:30)</option>
                  <option value="sun-afternoon">Sunday Afternoons (13:00 - 17:30)</option>
                  <option value="tue-evening">Tuesday Evening Clinic (17:00 - 20:30)</option>
                </select>
              </div>
            </div>
          </fieldset>
          <button type="submit" class="wb-btn-submit">Submit Volunteer Intake Application</button>
        </form>
      </section>
      <aside class="wb-sidebar">
        <div class="wb-side-card">
          <h2>Application Standards</h2>
          <p style="font-size:0.85rem;color:#475569;margin-bottom:0.75rem">Volunteers must be 18+ and complete a 2-hour clinical hygiene orientation before unsupervised shifts.</p>
          <span class="wb-badge-req">Mandatory</span>
          <div style="font-size:0.8rem;color:#64748b;margin-top:0.5rem">Tetanus booster within 10 years is required for all animal care handlers.</div>
        </div>
        <div class="wb-side-card">
          <h2>Current Urgencies</h2>
          <ul style="font-size:0.85rem;color:#475569;display:flex;flex-direction:column;gap:0.5rem;padding-left:1rem">
            <li>Autumn hedgehog underweight triage</li>
            <li>Owl flight pen maintenance</li>
            <li>Emergency transport drivers</li>
          </ul>
        </div>
      </aside>
    </main>
    <footer class="wb-footer">
      <p>Meadowbrook Wildlife Hospital • Registered Wildlife Charity #40291 • Valley Road, Little Combe</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-06: Craft guild artisan profiles and studio open days (directory-listing)
  {
    family_id: 'tr-06',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Highland Guild of Craftsmen — Artisan Directory &amp; Open Studios</title>
  <style>
    :root {
      --cg-bark: #451a03;
      --cg-copper: #b45309;
      --cg-parchment: #fdfbf7;
      --cg-stone: #f5f5f4;
      --cg-border: #e7e5e4;
      --cg-text: #292524;
      --cg-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Palatino", "Georgia", serif; background: var(--cg-parchment); color: var(--cg-text); line-height: 1.5; padding: 1.5rem; }
    .cg-wrap { max-width: 1200px; margin: 0 auto; }
    header.cg-head { border-bottom: 2px solid var(--cg-copper); padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
    .cg-brand { font-size: 1.5rem; font-weight: 700; color: var(--cg-bark); letter-spacing: 0.5px; }
    nav.cg-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: var(--cg-muted); font-weight: 600; margin-left: 1.25rem; font-size: 0.9rem; }
    nav.cg-nav a[aria-current="page"] { color: var(--cg-copper); font-weight: 700; }
    .cg-search-bar { background: #fff; border: 1px solid var(--cg-border); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.75rem; display: flex; gap: 1rem; align-items: flex-end; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .cg-field { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; font-family: -apple-system, sans-serif; }
    .cg-field label { font-size: 0.85rem; font-weight: 600; color: var(--cg-bark); }
    .cg-field input, .cg-field select { padding: 0.55rem; border: 1px solid var(--cg-border); border-radius: 6px; font-size: 0.95rem; }
    .cg-btn-search { font-family: -apple-system, sans-serif; background: var(--cg-copper); color: #fff; border: none; padding: 0.65rem 1.5rem; border-radius: 6px; font-weight: 700; cursor: pointer; }
    .cg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 2rem; }
    article.cg-maker-card { background: #fff; border: 1px solid var(--cg-border); border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .cg-maker-badge { font-family: -apple-system, sans-serif; display: inline-block; background: #fef3c7; color: #92400e; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; align-self: flex-start; margin-bottom: 0.5rem; }
    .cg-maker-card h3 { font-size: 1.2rem; color: var(--cg-bark); margin-bottom: 0.25rem; }
    .cg-maker-town { font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--cg-muted); margin-bottom: 0.75rem; }
    .cg-maker-bio { font-size: 0.95rem; color: #44403c; margin-bottom: 1rem; }
    .cg-maker-open { font-family: -apple-system, sans-serif; font-size: 0.85rem; background: var(--cg-stone); padding: 0.5rem 0.75rem; border-radius: 6px; color: var(--cg-bark); }
    footer.cg-foot { border-top: 1px solid var(--cg-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--cg-muted); }
  </style>
</head>
<body>
  <div class="cg-wrap">
    <header class="cg-head">
      <div class="cg-brand">Highland Guild of Craftsmen</div>
      <nav class="cg-nav" aria-label="Directory Navigation">
        <a href="/">Guild History</a>
        <a href="/makers" aria-current="page">Artisan Directory</a>
        <a href="/disciplines">Craft Disciplines</a>
        <a href="/opendays">Open Studio Calendar</a>
      </nav>
    </header>
    <main>
      <form id="maker-filter" class="cg-search-bar" method="get" action="/makers">
        <div class="cg-field" style="flex:1.5">
          <label for="q">Search Makers or Craft Keywords</label>
          <input type="search" id="q" name="q" placeholder="e.g. Ash bowl, Windsor chair, tapestry...">
        </div>
        <div class="cg-field">
          <label for="craft">Craft Discipline</label>
          <select id="craft" name="craft">
            <option value="">All Disciplines</option>
            <option value="woodworking" selected>Woodworking &amp; Cabinetry</option>
            <option value="ceramics">Stoneware Ceramics</option>
            <option value="textiles">Hand Weaving &amp; Tweed</option>
            <option value="metalwork">Blacksmithing &amp; Ironwork</option>
          </select>
        </div>
        <div class="cg-field">
          <label for="county">Parish / District</label>
          <select id="county" name="county">
            <option value="">All Regions</option>
            <option value="inverness">Strathspey &amp; Inverness</option>
            <option value="deeside">Royal Deeside</option>
            <option value="lochaber">Lochaber &amp; Coast</option>
          </select>
        </div>
        <button type="submit" class="cg-btn-search">Filter Directory</button>
      </form>
      <div class="cg-grid">
        <article class="cg-maker-card">
          <div>
            <span class="cg-maker-badge">Woodturning &amp; Green Wood</span>
            <h3>Callum Fraser</h3>
            <div class="cg-maker-town">Glenfiddich Workshop, Dufftown</div>
            <p class="cg-maker-bio">Turning heirloom bowls, quaichs, and porridge spurtles from windblown Scottish oak and sycamore.</p>
          </div>
          <div class="cg-maker-open">
            <strong>Next Open Studio:</strong> Sat 24 Oct • 10:00 - 16:00
          </div>
        </article>
        <article class="cg-maker-card">
          <div>
            <span class="cg-maker-badge">Fine Cabinetmaking</span>
            <h3>Moira MacLeod</h3>
            <div class="cg-maker-town">Riverside Mill, Aviemore</div>
            <p class="cg-maker-bio">Contemporary hardwood dining tables and dovetailed blanket chests using locally felled Scottish larch.</p>
          </div>
          <div class="cg-maker-open">
            <strong>Next Open Studio:</strong> Sun 25 Oct • 11:00 - 15:00
          </div>
        </article>
        <article class="cg-maker-card">
          <div>
            <span class="cg-maker-badge">Traditional Coopering</span>
            <h3>Duncan Campbell</h3>
            <div class="cg-maker-town">The Old Cooperage, Craigellachie</div>
            <p class="cg-maker-bio">Crafting whisky casks, wooden planters, and traditional oak butter churns with hand adze and hoop driver.</p>
          </div>
          <div class="cg-maker-open">
            <strong>Next Open Studio:</strong> Fri 30 Oct • 13:00 - 17:00
          </div>
        </article>
      </div>
    </main>
    <footer class="cg-foot">
      <p>Highland Guild of Craftsmen • Preserving Heritage Handcrafts since 1894 • Supported by Regional Arts Fund</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-07: Dark sky observatory public viewing night sign-up (event-registration)
  {
    family_id: 'tr-07',
    title: 'Starlight Ridge Dark Sky Observatory — Public Viewing Pass',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Starlight Ridge Dark Sky Observatory — Public Viewing Pass</title>
  <style>
    :root {
      --ds-bg: #030712;
      --ds-surface: #0b1120;
      --ds-card: #111c33;
      --ds-border: #1e2e4f;
      --ds-cyan: #38bdf8;
      --ds-indigo: #6366f1;
      --ds-text: #f1f5f9;
      --ds-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ds-bg); color: var(--ds-text); line-height: 1.5; padding: 1.5rem; }
    .ds-wrap { max-width: 1200px; margin: 0 auto; }
    header.ds-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--ds-border); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .ds-brand { font-size: 1.35rem; font-weight: 800; color: var(--ds-cyan); display: flex; align-items: center; gap: 0.5rem; }
    nav.ds-nav a { text-decoration: none; color: var(--ds-muted); font-size: 0.9rem; margin-left: 1.25rem; }
    nav.ds-nav a[aria-current="page"] { color: #fff; font-weight: 700; border-bottom: 2px solid var(--ds-cyan); padding-bottom: 0.2rem; }
    .ds-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .ds-panel { background: var(--ds-surface); border: 1px solid var(--ds-border); border-radius: 12px; padding: 1.75rem; }
    .ds-panel h1 { font-size: 1.65rem; color: #fff; margin-bottom: 0.5rem; }
    .ds-lead { font-size: 0.95rem; color: var(--ds-muted); margin-bottom: 1.5rem; }
    .ds-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; }
    .ds-field label { font-size: 0.85rem; font-weight: 600; color: var(--ds-cyan); }
    .ds-field input, .ds-field select, .ds-field textarea { background: #030712; border: 1px solid var(--ds-border); color: #fff; padding: 0.6rem; border-radius: 6px; font-size: 0.95rem; }
    .ds-field input:focus, .ds-field select:focus { outline: 2px solid var(--ds-cyan); }
    .ds-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .ds-btn-reg { background: var(--ds-indigo); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 8px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .ds-btn-reg:hover { background: #4f46e5; }
    .ds-info-block { background: var(--ds-card); border: 1px solid var(--ds-border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; }
    .ds-info-block h3 { font-size: 1.1rem; color: var(--ds-cyan); margin-bottom: 0.5rem; }
    .ds-cap-tag { display: inline-block; background: rgba(56,189,248,0.15); color: var(--ds-cyan); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem; }
    footer.ds-foot { margin-top: 2.5rem; border-top: 1px solid var(--ds-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--ds-muted); }
  </style>
</head>
<body>
  <div class="ds-wrap">
    <header class="ds-head">
      <div class="ds-brand">✦ Starlight Ridge Dark Sky Observatory</div>
      <nav class="ds-nav" aria-label="Observatory Navigation">
        <a href="/">Sky Clear Index</a>
        <a href="/events">Public Schedule</a>
        <a href="/register" aria-current="page">Book Night Pass</a>
        <a href="/passes">Gate Pass Receipt</a>
      </nav>
    </header>
    <main class="ds-grid">
      <section class="ds-panel">
        <h1>Public Telescope Viewing Pass Registration</h1>
        <p class="ds-lead">Join resident astronomers on the summit ridge for deep-sky observation through our 24-inch Planewave reflector.</p>
        <form id="observatory-booking" method="post" action="/register">
          <div class="ds-field">
            <label for="event_session">Select Viewing Night &amp; Target Celestial Object</label>
            <select id="event_session" name="event_session" required>
              <option value="oct-24">Sat 24 Oct (19:30 - 22:30) — Orion Nebula &amp; Pleiades (New Moon)</option>
              <option value="oct-31">Sat 31 Oct (19:30 - 22:30) — Andromeda Galaxy &amp; Double Cluster</option>
              <option value="nov-07">Sat 07 Nov (19:00 - 22:00) — Jupiter Cloud Bands &amp; Galilean Moons</option>
            </select>
          </div>
          <div class="ds-row">
            <div class="ds-field">
              <label for="lead_attendee">Lead Attendee Name</label>
              <input type="text" id="lead_attendee" name="lead_attendee" required placeholder="Dr. Sarah Lin">
            </div>
            <div class="ds-field">
              <label for="attendee_email">Email for Digital Pass</label>
              <input type="email" id="attendee_email" name="attendee_email" required placeholder="sarah.lin@example.test">
            </div>
          </div>
          <div class="ds-row">
            <div class="ds-field">
              <label for="adult_tickets">Adult Visitors (16+)</label>
              <input type="number" id="adult_tickets" name="adult_tickets" min="1" max="5" value="2" required>
            </div>
            <div class="ds-field">
              <label for="child_tickets">Child Visitors (8 - 15)</label>
              <input type="number" id="child_tickets" name="child_tickets" min="0" max="4" value="1">
            </div>
          </div>
          <div class="ds-field">
            <label for="accessibility_notes">Mobility &amp; Accessibility Requirements</label>
            <textarea id="accessibility_notes" name="accessibility_notes" rows="2" placeholder="e.g. Step-free wheelchair lift access required for main telescope platform."></textarea>
          </div>
          <button type="submit" class="ds-btn-reg">Generate Observatory Gate Pass</button>
        </form>
      </section>
      <aside>
        <div class="ds-info-block">
          <h3>Capacity &amp; Dark Sky Protocol</h3>
          <div style="margin-bottom:0.75rem"><span class="ds-cap-tag">Strict 25 Visitors / Night</span></div>
          <p style="font-size:0.85rem;color:var(--ds-muted);margin-bottom:0.75rem">Red-filtered headlamps only. White flashlights and phone screens are strictly prohibited on the viewing terrace.</p>
          <ul style="font-size:0.85rem;color:var(--ds-muted);display:flex;flex-direction:column;gap:0.4rem;padding-left:1.2rem">
            <li>Summit elevation: 1,840ft (Dress warmly)</li>
            <li>Hot tea provided at the warming hut</li>
            <li>Event proceeds in cloudy weather with digital planetarium show</li>
          </ul>
        </div>
      </aside>
    </main>
    <footer class="ds-foot">
      <p>Starlight Ridge Dark Sky Observatory • International Dark Sky Sanctuary • Summit Road, Peak District</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-08: Community darkroom maintenance and supply requests (support-helpdesk)
  {
    family_id: 'tr-08',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grain &amp; Silver Darkroom Co-op — Equipment &amp; Chemistry Helpdesk</title>
  <style>
    :root {
      --dr-bg: #09090b;
      --dr-surface: #18181b;
      --dr-card: #27272a;
      --dr-border: #3f3f46;
      --dr-amber: #f59e0b;
      --dr-text: #f4f4f5;
      --dr-muted: #a1a1aa;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--dr-bg); color: var(--dr-text); line-height: 1.5; padding: 1.5rem; }
    .dr-shell { max-width: 1200px; margin: 0 auto; }
    header.dr-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--dr-amber); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .dr-brand { font-size: 1.35rem; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
    .dr-brand span { color: var(--dr-amber); }
    nav.dr-nav a { text-decoration: none; color: var(--dr-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.dr-nav a[aria-current="page"] { color: var(--dr-amber); }
    .dr-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .dr-box { background: var(--dr-surface); border: 1px solid var(--dr-border); border-radius: 8px; padding: 1.5rem; }
    .dr-box h2 { font-size: 1.3rem; color: #fff; margin-bottom: 0.5rem; }
    .dr-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; }
    .dr-field label { font-size: 0.85rem; font-weight: 600; color: var(--dr-muted); }
    .dr-field input, .dr-field select, .dr-field textarea { background: #09090b; border: 1px solid var(--dr-border); color: #fff; padding: 0.6rem; border-radius: 6px; font-size: 0.95rem; }
    .dr-btn { background: var(--dr-amber); color: #000; border: none; font-size: 1rem; font-weight: 700; padding: 0.75rem 1.25rem; border-radius: 6px; cursor: pointer; width: 100%; }
    .dr-btn:hover { background: #d97706; }
    table.dr-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    table.dr-table th, table.dr-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--dr-border); text-align: left; }
    table.dr-table th { color: var(--dr-muted); }
    .dr-pill-open { background: rgba(245,158,11,0.2); color: var(--dr-amber); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .dr-pill-fixed { background: rgba(34,197,94,0.2); color: #4ade80; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    footer.dr-foot { margin-top: 2.5rem; border-top: 1px solid var(--dr-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--dr-muted); }
  </style>
</head>
<body>
  <div class="dr-shell">
    <header class="dr-head">
      <div class="dr-brand">GRAIN &amp; SILVER <span>DARKROOM CO-OP</span></div>
      <nav class="dr-nav" aria-label="Helpdesk Nav">
        <a href="/">Darkroom Rules</a>
        <a href="/tickets" aria-current="page">Maintenance Log</a>
        <a href="/chemicals">Chemical Stocks</a>
        <a href="/roster">Enlarger Bookings</a>
      </nav>
    </header>
    <main class="dr-grid">
      <section class="dr-box">
        <h2>Submit Equipment or Chemistry Ticket</h2>
        <p style="color:var(--dr-muted);font-size:0.9rem;margin-bottom:1.25rem">Report faulty enlarger bulbs, sticky timers, chemistry replenishment, or clogged wash siphons.</p>
        <form id="support-ticket-form" method="post" action="/tickets/new">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="dr-field">
              <label for="bay_station">Darkroom Bay / Station</label>
              <select id="bay_station" name="bay_station" required>
                <option value="bay-1">Bay 1 — Beseler 23CII (35mm/6x6)</option>
                <option value="bay-2">Bay 2 — Omega D2 (4x5 Large Format)</option>
                <option value="bay-3">Bay 3 — De Vere 504 Dichroic</option>
                <option value="wash-sink">Central Wash Sink &amp; Siphon</option>
                <option value="print-dryer">Rotary Glazing Dryer</option>
              </select>
            </div>
            <div class="dr-field">
              <label for="category">Issue Category</label>
              <select id="category" name="category" required>
                <option value="optics">Enlarger Lens / Condenser / Bulb</option>
                <option value="timer">Digital / Mechanical Timer Fault</option>
                <option value="chemistry" selected>Chemical Stock Depleted (Fixer/Dev)</option>
                <option value="plumbing">Sink Drain / Water Temp Valve</option>
              </select>
            </div>
          </div>
          <div class="dr-field">
            <label for="urgency">Urgency Level</label>
            <select id="urgency" name="urgency" required>
              <option value="routine">Routine — Station still usable</option>
              <option value="priority">Priority — Station out of action</option>
              <option value="critical">Critical Safety Hazard — Wet floor / electrical</option>
            </select>
          </div>
          <div class="dr-field">
            <label for="description">Fault Details &amp; Observations</label>
            <textarea id="description" name="description" rows="3" required placeholder="e.g. Rapid fixer in tank B is exhausted (tested with Hypo-Chek, precipitate formed). New working solution needed."></textarea>
          </div>
          <div class="dr-field">
            <label for="member_code">Reported by (Member Name or Code)</label>
            <input type="text" id="member_code" name="member_code" required placeholder="Julian K. (#112)">
          </div>
          <button type="submit" class="dr-btn">Log Maintenance Ticket</button>
        </form>
      </section>
      <aside class="dr-box">
        <h2>Active Issue Board</h2>
        <table class="dr-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Station</th>
              <th>Problem</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>#108</td>
              <td>Bay 2</td>
              <td>50mm lens click-stop loose</td>
              <td><span class="dr-pill-open">Investigating</span></td>
            </tr>
            <tr>
              <td>#107</td>
              <td>Sink</td>
              <td>Ilford Washaid exhausted</td>
              <td><span class="dr-pill-fixed">Replenished</span></td>
            </tr>
            <tr>
              <td>#105</td>
              <td>Dryer</td>
              <td>Thermostat knob stiff</td>
              <td><span class="dr-pill-fixed">Repaired</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:1.5rem;font-size:0.8rem;color:var(--dr-muted);border:1px dashed var(--dr-border);padding:0.75rem;border-radius:6px">
          <strong>Chemistry Protocol:</strong> Spent fixer must NEVER be poured down the drain. Pour into the silver recovery drum in the wash bay.
        </div>
      </aside>
    </main>
    <footer class="dr-foot">
      <p>Grain &amp; Silver Co-operative Darkroom • 12 Printmakers Court • Members 24hr Keycard Access</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-09: Wild edibles identification field course booking (course-enrolment)
  {
    family_id: 'tr-09',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Forage &amp; Fern Botanical School — Wild Edibles Field Course Booking</title>
  <style>
    :root {
      --ff-moss: #14532d;
      --ff-leaf: #16a34a;
      --ff-bark: #78350f;
      --ff-paper: #f0fdf4;
      --ff-card: #ffffff;
      --ff-border: #bbf7d0;
      --ff-text: #14532d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--ff-paper); color: #1f2937; line-height: 1.5; padding: 1.5rem; }
    .ff-container { max-width: 1150px; margin: 0 auto; }
    header.ff-header { border-bottom: 2px solid var(--ff-moss); padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
    .ff-brand { font-size: 1.4rem; font-weight: 700; color: var(--ff-moss); }
    nav.ff-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: #374151; font-weight: 600; margin-left: 1.25rem; font-size: 0.9rem; }
    nav.ff-nav a[aria-current="page"] { color: var(--ff-moss); text-decoration: underline; }
    .ff-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .ff-card { background: var(--ff-card); border: 1px solid var(--ff-border); border-radius: 10px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .ff-card h1, .ff-card h2 { color: var(--ff-moss); margin-bottom: 0.5rem; font-size: 1.45rem; }
    .ff-form-group { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; font-family: -apple-system, sans-serif; }
    .ff-form-group label { font-size: 0.85rem; font-weight: 600; color: #1f2937; }
    .ff-form-group input, .ff-form-group select, .ff-form-group textarea { padding: 0.6rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; }
    .ff-btn { font-family: -apple-system, sans-serif; background: var(--ff-moss); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .ff-btn:hover { background: #166534; }
    .ff-curriculum-item { border-left: 3px solid var(--ff-leaf); padding-left: 0.75rem; margin-bottom: 1rem; }
    .ff-curriculum-item h4 { font-size: 1rem; color: var(--ff-moss); margin-bottom: 0.2rem; }
    .ff-curriculum-item p { font-size: 0.85rem; color: #4b5563; font-family: -apple-system, sans-serif; }
    footer.ff-footer { margin-top: 2.5rem; border-top: 1px solid var(--ff-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: #6b7280; }
  </style>
</head>
<body>
  <div class="ff-container">
    <header class="ff-header">
      <div class="ff-brand">Forage &amp; Fern Botanical School</div>
      <nav class="ff-nav" aria-label="Course Navigation">
        <a href="/">Curriculum</a>
        <a href="/courses">All Masterclasses</a>
        <a href="/enrol" aria-current="page">Course Enrolment</a>
        <a href="/enrolments">My Student Roster</a>
      </nav>
    </header>
    <main class="ff-grid">
      <section class="ff-card">
        <h1>Enrol in Autumn Woodland Foraging Walk</h1>
        <p style="font-family:-apple-system,sans-serif;font-size:0.95rem;color:#4b5563;margin-bottom:1.5rem">A full-day hands-on field identification masterclass exploring ancient deciduous woodland in the Blackdown Hills.</p>
        <form id="course-enrolment-form" method="post" action="/enrol">
          <div class="ff-form-group">
            <label for="course_date">Available Course Session</label>
            <select id="course_date" name="course_date" required>
              <option value="2026-10-17">Saturday 17 October (09:30 - 16:30) — Fungi &amp; Hedgerow Berries</option>
              <option value="2026-10-24">Saturday 24 October (09:30 - 16:30) — Edible Roots &amp; Acorn Processing</option>
              <option value="2026-11-07">Saturday 07 November (09:30 - 16:30) — Winter Bark &amp; Lichen Identification</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="ff-form-group">
              <label for="student_name">Participant Full Name</label>
              <input type="text" id="student_name" name="student_name" required placeholder="Robin Fletcher">
            </div>
            <div class="ff-form-group">
              <label for="student_email">Email Address</label>
              <input type="email" id="student_email" name="student_email" required placeholder="robin@example.test">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="ff-form-group">
              <label for="emergency_contact">Emergency Contact Phone (Required)</label>
              <input type="tel" id="emergency_contact" name="emergency_contact" required placeholder="07700 900334">
            </div>
            <div class="ff-form-group">
              <label for="experience_level">Prior Botanical Experience</label>
              <select id="experience_level" name="experience_level" required>
                <option value="beginner">Complete Beginner (No prior botany)</option>
                <option value="intermediate">Intermediate (Knows common families)</option>
                <option value="advanced">Advanced (Uses dichotomous keys)</option>
              </select>
            </div>
          </div>
          <div class="ff-form-group">
            <label for="dietary_notes">Dietary Restrictions or Known Plant Allergies</label>
            <textarea id="dietary_notes" name="dietary_notes" rows="2" placeholder="e.g. Nut allergy, vegetarian (lunch is wild mushroom risotto provided by school)"></textarea>
          </div>
          <button type="submit" class="ff-btn">Confirm Course Enrolment</button>
        </form>
      </section>
      <aside class="ff-card">
        <h2>Field Session Syllabus</h2>
        <div class="ff-curriculum-item">
          <h4>09:30 — Spore Prints &amp; Cap Taxonomy</h4>
          <p>Microscopic gill inspection and distinguishing poisonous Amanita from edible field agarics.</p>
        </div>
        <div class="ff-curriculum-item">
          <h4>12:30 — Woodland Campfire Lunch</h4>
          <p>Cooking wild chanterelles, sweet chestnuts, and nettle infusion over beech charcoal.</p>
        </div>
        <div class="ff-curriculum-item">
          <h4>14:00 — Ethical Harvest &amp; Basketry</h4>
          <p>UK Wildlife &amp; Countryside Act legalities, sustainable one-third harvesting rule.</p>
        </div>
      </aside>
    </main>
    <footer class="ff-footer">
      <p>Forage &amp; Fern Botanical School • Woodland Education Centre • Highwood Meadow, Somerset</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-10: Residential street safety and crosswalk feedback survey (survey-form)
  {
    family_id: 'tr-10',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Greenwood Safe Streets — Community Crosswalk &amp; Traffic Survey</title>
  <style>
    :root {
      --ss-navy: #1e3a8a;
      --ss-amber: #d97706;
      --ss-card: #ffffff;
      --ss-bg: #f8fafc;
      --ss-border: #cbd5e1;
      --ss-text: #0f172a;
      --ss-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ss-bg); color: var(--ss-text); line-height: 1.5; padding: 1.5rem; }
    .ss-wrap { max-width: 1100px; margin: 0 auto; }
    header.ss-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--ss-navy); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .ss-title { font-size: 1.4rem; font-weight: 800; color: var(--ss-navy); }
    nav.ss-nav a { text-decoration: none; color: var(--ss-muted); font-weight: 600; margin-left: 1.25rem; font-size: 0.9rem; }
    nav.ss-nav a[aria-current="page"] { color: var(--ss-navy); border-bottom: 2px solid var(--ss-amber); padding-bottom: 0.2rem; }
    .ss-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; }
    .ss-card { background: var(--ss-card); border: 1px solid var(--ss-border); border-radius: 8px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .ss-card h1 { font-size: 1.5rem; color: var(--ss-navy); margin-bottom: 0.5rem; }
    .ss-sub { font-size: 0.95rem; color: var(--ss-muted); margin-bottom: 1.5rem; }
    .ss-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; }
    .ss-field label { font-size: 0.85rem; font-weight: 600; color: var(--ss-text); }
    .ss-field input, .ss-field select, .ss-field textarea { padding: 0.6rem; border: 1px solid var(--ss-border); border-radius: 6px; font-size: 0.95rem; }
    .ss-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.25rem; }
    .ss-check-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
    .ss-rating-group { display: flex; gap: 1rem; margin-top: 0.5rem; }
    .ss-rating-option { display: flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; }
    .ss-btn { background: var(--ss-navy); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .ss-btn:hover { background: #172554; }
    footer.ss-foot { margin-top: 2.5rem; border-top: 1px solid var(--ss-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--ss-muted); }
  </style>
</head>
<body>
  <div class="ss-wrap">
    <header class="ss-header">
      <div class="ss-title">Greenwood Safe Streets Initiative</div>
      <nav class="ss-nav" aria-label="Survey Navigation">
        <a href="/">Project Goals</a>
        <a href="/survey" aria-current="page">Citizen Questionnaire</a>
        <a href="/results">Live Response Data</a>
      </nav>
    </header>
    <main class="ss-layout">
      <section class="ss-card">
        <h1>Pedestrian Safety &amp; Crosswalk Feedback</h1>
        <p class="ss-sub">Tell the community council where traffic calming, zebra crossings, and sightline improvements are needed.</p>
        <form id="street-survey-form" method="post" action="/survey">
          <div class="ss-field">
            <label for="street_location">Street Name or Intersection</label>
            <input type="text" id="street_location" name="street_location" required placeholder="e.g. Elm Grove &amp; Mill Road junction">
          </div>
          <div class="ss-field">
            <label for="neighbourhood_zone">Neighbourhood Sector</label>
            <select id="neighbourhood_zone" name="neighbourhood_zone" required>
              <option value="school-zone">North Sector — Elementary School Perimeter</option>
              <option value="market-cross">Central Commercial — High Street Crossing</option>
              <option value="station-link">South Sector — Railway Commuter Route</option>
              <option value="park-loop">West Sector — Community Park Entrance</option>
            </select>
          </div>
          <div class="ss-field">
            <label>Observed Traffic Hazards (Check all that apply)</label>
            <div class="ss-checks">
              <div class="ss-check-item">
                <input type="checkbox" id="hz_speed" name="hazard_speeding" value="1">
                <label for="hz_speed">Vehicles exceeding 20mph</label>
              </div>
              <div class="ss-check-item">
                <input type="checkbox" id="hz_crosswalk" name="hazard_crosswalk" value="1">
                <label for="hz_crosswalk">No safe crossing point</label>
              </div>
              <div class="ss-check-item">
                <input type="checkbox" id="hz_pavement" name="hazard_pavement" value="1">
                <label for="hz_pavement">Pavement parking obstruction</label>
              </div>
              <div class="ss-check-item">
                <input type="checkbox" id="hz_blind" name="hazard_blind_corner" value="1">
                <label for="hz_blind">Blind corner or overgrown hedges</label>
              </div>
            </div>
          </div>
          <div class="ss-field">
            <label>Overall Pedestrian Safety Rating (1 = Extremely Dangerous, 5 = Very Safe)</label>
            <div class="ss-rating-group">
              <label class="ss-rating-option"><input type="radio" name="safety_score" value="1" required> 1</label>
              <label class="ss-rating-option"><input type="radio" name="safety_score" value="2"> 2</label>
              <label class="ss-rating-option"><input type="radio" name="safety_score" value="3" checked> 3</label>
              <label class="ss-rating-option"><input type="radio" name="safety_score" value="4"> 4</label>
              <label class="ss-rating-option"><input type="radio" name="safety_score" value="5"> 5</label>
            </div>
          </div>
          <div class="ss-field">
            <label for="proposed_solution">Your Recommended Solution</label>
            <textarea id="proposed_solution" name="proposed_solution" rows="3" placeholder="e.g. Raised zebra crossing with flashing belisha beacons outside school gate."></textarea>
          </div>
          <button type="submit" class="ss-btn">Submit Street Safety Consultation</button>
        </form>
      </section>
      <aside class="ss-card">
        <h2>Council Action Plan</h2>
        <p style="font-size:0.85rem;color:var(--ss-muted);margin-bottom:1rem">Results are aggregated and presented to the Parish Transport Committee quarterly.</p>
        <div style="background:#eff6ff;padding:0.75rem;border-radius:6px;font-size:0.85rem;color:#1e3a8a;margin-bottom:1rem">
          <strong>248 Responses Collected:</strong> 72% cite speeding near school crossing as primary safety concern.
        </div>
        <h3 style="font-size:1rem;color:var(--ss-navy);margin-bottom:0.4rem">Recent Interventions</h3>
        <ul style="font-size:0.85rem;color:var(--ss-muted);display:flex;flex-direction:column;gap:0.4rem;padding-left:1.2rem">
          <li>New speed cushion on Oakridge Lane</li>
          <li>Dropped kerbs installed at Post Office</li>
          <li>School drop-off clear zone painted</li>
        </ul>
      </aside>
    </main>
    <footer class="ss-foot">
      <p>Greenwood Community Safe Streets Forum • In association with Municipal Traffic Board</p>
    </footer>
  </div>
</body>
</html>`
  }
];

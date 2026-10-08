/**
 * Target designs batch 3: tr-21 through tr-30
 */
export const BATCH_3 = [
  // tr-21: Volunteer driver hospital appointment lift coordination (booking)
  {
    family_id: 'tr-21',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Good Neighbour Community Transit — Volunteer Hospital Lift Booking</title>
  <style>
    :root {
      --gn-teal: #0f766e;
      --gn-blue: #0284c7;
      --gn-card: #ffffff;
      --gn-border: #cbd5e1;
      --gn-bg: #f8fafc;
      --gn-text: #0f172a;
      --gn-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--gn-bg); color: var(--gn-text); line-height: 1.5; padding: 1.5rem; }
    .gn-wrap { max-width: 1200px; margin: 0 auto; }
    header.gn-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--gn-teal); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .gn-brand { font-size: 1.35rem; font-weight: 800; color: var(--gn-teal); }
    nav.gn-nav a { text-decoration: none; color: var(--gn-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.gn-nav a[aria-current="page"] { color: var(--gn-teal); border-bottom: 2px solid var(--gn-teal); padding-bottom: 0.2rem; }
    .gn-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .gn-card { background: var(--gn-card); border: 1px solid var(--gn-border); border-radius: 8px; padding: 1.75rem; }
    .gn-card h1, .gn-card h2 { font-size: 1.4rem; color: var(--gn-teal); margin-bottom: 0.5rem; }
    .gn-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .gn-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .gn-field label { font-size: 0.85rem; font-weight: 600; color: var(--gn-text); }
    .gn-field input, .gn-field select, .gn-field textarea { padding: 0.55rem; border: 1px solid var(--gn-border); border-radius: 6px; font-size: 0.95rem; }
    .gn-btn { background: var(--gn-teal); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .gn-btn:hover { background: #115e59; }
    table.gn-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    table.gn-table th, table.gn-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
    table.gn-table th { background: #f1f5f9; color: var(--gn-teal); }
    footer.gn-foot { margin-top: 2.5rem; border-top: 1px solid var(--gn-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--gn-muted); }
  </style>
</head>
<body>
  <div class="gn-wrap">
    <header class="gn-head">
      <div class="gn-brand">Good Neighbour Community Care Transit</div>
      <nav class="gn-nav" aria-label="Transit Nav">
        <a href="/">Service Info</a>
        <a href="/rides">Pending Journeys</a>
        <a href="/book-ride" aria-current="page">Request Patient Lift</a>
        <a href="/dispatch">Driver Dispatch Board</a>
      </nav>
    </header>
    <main class="gn-grid">
      <section class="gn-card">
        <h1>Book Outpatient Hospital Transport Lift</h1>
        <p style="font-size:0.9rem;color:var(--gn-muted);margin-bottom:1.25rem">Free volunteer door-to-door lift service connecting elderly and isolated rural neighbours with outpatient clinic appointments.</p>
        <form id="lift-booking-form" method="post" action="/book-ride">
          <div class="gn-row-2">
            <div class="gn-field">
              <label for="passenger_name">Passenger Full Name</label>
              <input type="text" id="passenger_name" name="passenger_name" required placeholder="Mrs. Vera Jenkins">
            </div>
            <div class="gn-field">
              <label for="contact_phone">Contact Telephone</label>
              <input type="tel" id="contact_phone" name="contact_phone" required placeholder="07700 900441">
            </div>
          </div>
          <div class="gn-field">
            <label for="pickup_address">Home Pickup Address &amp; Postcode</label>
            <input type="text" id="pickup_address" name="pickup_address" required placeholder="8 Rose Cottage Lane, Little Brampton, EX20 4QR">
          </div>
          <div class="gn-row-2">
            <div class="gn-field">
              <label for="hospital_destination">Hospital Clinic / Treatment Centre</label>
              <select id="hospital_destination" name="hospital_destination" required>
                <option value="royal-devon">Royal Devon &amp; Exeter Hospital (Wonford)</option>
                <option value="torbay-eye">Torbay Hospital (Eye Clinic)</option>
                <option value="community-hosp">Okehampton Community Health Centre</option>
              </select>
            </div>
            <div class="gn-field">
              <label for="appointment_time">Required Clinic Arrival Time</label>
              <input type="time" id="appointment_time" name="appointment_time" value="10:15" required>
            </div>
          </div>
          <div class="gn-row-2">
            <div class="gn-field">
              <label for="appointment_date">Appointment Date</label>
              <input type="date" id="appointment_date" name="appointment_date" value="2026-10-20" required>
            </div>
            <div class="gn-field">
              <label for="mobility_aid">Mobility &amp; Vehicle Requirements</label>
              <select id="mobility_aid" name="mobility_aid" required>
                <option value="independent">Ambulant (No folding equipment)</option>
                <option value="walker" selected>Folding Rollator / Walking Frame in Boot</option>
                <option value="wheelchair">Folding Transfer Wheelchair</option>
                <option value="carer">Carer / Companion Accompanying</option>
              </select>
            </div>
          </div>
          <button type="submit" class="gn-btn">Register Hospital Transport Request</button>
        </form>
      </section>
      <aside class="gn-card">
        <h2>Volunteer Driver Dispatch</h2>
        <p style="font-size:0.85rem;color:var(--gn-muted);margin-bottom:0.75rem">Volunteer drivers accept trips based on parish proximity and boot capacity.</p>
        <table class="gn-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Destination</th>
              <th>Arrival</th>
              <th>Driver</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>19 Oct</td>
              <td>Wonford Eye Clinic</td>
              <td>09:30</td>
              <td><span style="color:#15803d;font-weight:700">Assigned: Dave M.</span></td>
            </tr>
            <tr>
              <td>20 Oct</td>
              <td>Okehampton Health</td>
              <td>14:00</td>
              <td><span style="color:#b45309;font-weight:700">Awaiting Driver</span></td>
            </tr>
          </tbody>
        </table>
      </aside>
    </main>
    <footer class="gn-foot">
      <p>Good Neighbour Community Transit Charity • Registered Charity #10492 • DBS-Checked Volunteer Drivers</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-22: Urban forestry street tree health reporting (dashboard)
  {
    family_id: 'tr-22',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Canopy Guardian — Urban Street Tree Health &amp; Watering Monitor</title>
  <style>
    :root {
      --cg-green: #047857;
      --cg-lime: #84cc16;
      --cg-slate: #0f172a;
      --cg-card: #1e293b;
      --cg-border: #334155;
      --cg-text: #f8fafc;
      --cg-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--cg-slate); color: var(--cg-text); line-height: 1.5; padding: 1.5rem; }
    .cg-wrap { max-width: 1200px; margin: 0 auto; }
    header.cg-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--cg-green); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .cg-brand { font-size: 1.35rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    nav.cg-nav a { text-decoration: none; color: var(--cg-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.cg-nav a[aria-current="page"] { color: var(--cg-lime); border-bottom: 2px solid var(--cg-lime); padding-bottom: 0.2rem; }
    .cg-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 1.5rem; }
    .cg-metric-card { background: var(--cg-card); border: 1px solid var(--cg-border); border-radius: 8px; padding: 1.25rem; }
    .cg-metric-title { font-size: 0.8rem; text-transform: uppercase; color: var(--cg-muted); }
    .cg-metric-val { font-size: 1.8rem; font-weight: 800; color: #fff; margin: 0.2rem 0; }
    .cg-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .cg-card { background: var(--cg-card); border: 1px solid var(--cg-border); border-radius: 8px; padding: 1.5rem; }
    .cg-card h2 { font-size: 1.3rem; margin-bottom: 0.75rem; color: #fff; }
    table.cg-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    table.cg-table th, table.cg-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--cg-border); text-align: left; }
    table.cg-table th { color: var(--cg-muted); }
    .cg-risk-high { background: rgba(239,68,68,0.2); color: #f87171; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; }
    .cg-risk-ok { background: rgba(34,197,94,0.2); color: #4ade80; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; }
    .cg-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .cg-field label { font-size: 0.85rem; font-weight: 600; color: var(--cg-muted); }
    .cg-field input, .cg-field select { background: #0f172a; border: 1px solid var(--cg-border); color: #fff; padding: 0.55rem; border-radius: 6px; font-size: 0.95rem; }
    .cg-btn { background: var(--cg-green); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .cg-btn:hover { background: #065f46; }
    footer.cg-foot { margin-top: 2.5rem; border-top: 1px solid var(--cg-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--cg-muted); }
  </style>
</head>
<body>
  <div class="cg-wrap">
    <header class="cg-head">
      <div class="cg-brand">🌳 Canopy Guardian — Urban Forestry</div>
      <nav class="cg-nav" aria-label="Canopy Nav">
        <a href="/">Canopy Summary</a>
        <a href="/trees" aria-current="page">Street Inventory</a>
        <a href="/log">Log Watering</a>
        <a href="/volunteer">Tree Stewards</a>
      </nav>
    </header>
    <div class="cg-metrics">
      <div class="cg-metric-card">
        <div class="cg-metric-title">Young Trees Monitored</div>
        <div class="cg-metric-val">142 Saplings</div>
        <div style="font-size:0.8rem;color:var(--cg-lime)">Planted 2024 - 2026</div>
      </div>
      <div class="cg-metric-card">
        <div class="cg-metric-title">Watered This Week</div>
        <div class="cg-metric-val">98 Trees</div>
        <div style="font-size:0.8rem;color:#38bdf8">69% of drought quota</div>
      </div>
      <div class="cg-metric-card">
        <div class="cg-metric-title">Critical Drought Alert</div>
        <div class="cg-metric-val">12 Trees</div>
        <div style="font-size:0.8rem;color:#f87171">No water logged in 10+ days</div>
      </div>
    </div>
    <main class="cg-grid">
      <section class="cg-card">
        <h2>Civic Street Tree Inventory &amp; Status</h2>
        <table class="cg-table">
          <thead>
            <tr>
              <th>Tree ID</th>
              <th>Species</th>
              <th>Location</th>
              <th>Last Watered</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>TR-088</td>
              <td>Field Maple (<em>Acer campestre</em>)</td>
              <td>Elm Grove #14</td>
              <td>Yesterday</td>
              <td><span class="cg-risk-ok">Hydrated</span></td>
            </tr>
            <tr>
              <td>TR-092</td>
              <td>Small-leaved Lime (<em>Tilia cordata</em>)</td>
              <td>High St #42</td>
              <td>9 days ago</td>
              <td><span class="cg-risk-high">Water Needed</span></td>
            </tr>
            <tr>
              <td>TR-104</td>
              <td>Rowan (<em>Sorbus aucuparia</em>)</td>
              <td>Station Approach</td>
              <td>3 days ago</td>
              <td><span class="cg-risk-ok">Optimal</span></td>
            </tr>
          </tbody>
        </table>
      </section>
      <aside class="cg-card">
        <h2>Log Volunteer Watering Event</h2>
        <form id="tree-water-form" method="post" action="/trees/log">
          <div class="cg-field">
            <label for="tree_tag">Street Tree Tag ID</label>
            <input type="text" id="tree_tag" name="tree_tag" required placeholder="TR-092">
          </div>
          <div class="cg-field">
            <label for="gallons">Litres / Gallons Applied</label>
            <select id="gallons" name="gallons" required>
              <option value="20-litres">Full 20L Slow-Release Treegator Bag</option>
              <option value="40-litres">2x Buckets (40 Litres)</option>
              <option value="hose-5min">Council Tanker Fill (60+ Litres)</option>
            </select>
          </div>
          <div class="cg-field">
            <label for="mulch_condition">Mulch Ring Condition</label>
            <select id="mulch_condition" name="mulch_condition" required>
              <option value="good">Good depth (3 inches, weed-free)</option>
              <option value="scattered">Scattered / Weeds encroaching</option>
              <option value="bare">Bare soil (Mulch replenishment needed)</option>
            </select>
          </div>
          <div class="cg-field">
            <label for="steward_initials">Volunteer Steward Initials</label>
            <input type="text" id="steward_initials" name="steward_initials" required placeholder="MK">
          </div>
          <button type="submit" class="cg-btn">Record Watering Event</button>
        </form>
      </aside>
    </main>
    <footer class="cg-foot">
      <p>Canopy Guardian Urban Tree Stewardship • Supported by Municipal Environment Committee • Open Sensor Registry</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-23: Home energy retrofit subsidy eligibility check (survey-form)
  {
    family_id: 'tr-23',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Civic Warm Homes Partnership — Home Retrofit Grant &amp; Heat Pump Subsidy Calculator</title>
  <style>
    :root {
      --wh-orange: #c2410c;
      --wh-blue: #0369a1;
      --wh-card: #ffffff;
      --wh-border: #fed7aa;
      --wh-bg: #fffbeb;
      --wh-text: #1c1917;
      --wh-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--wh-bg); color: var(--wh-text); line-height: 1.5; padding: 1.5rem; }
    .wh-wrap { max-width: 1100px; margin: 0 auto; }
    header.wh-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--wh-orange); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .wh-brand { font-size: 1.35rem; font-weight: 800; color: var(--wh-orange); }
    nav.wh-nav a { text-decoration: none; color: var(--wh-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.wh-nav a[aria-current="page"] { color: var(--wh-orange); border-bottom: 2px solid var(--wh-orange); padding-bottom: 0.2rem; }
    .wh-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .wh-card { background: var(--wh-card); border: 1px solid var(--wh-border); border-radius: 8px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .wh-card h1, .wh-card h2 { font-size: 1.45rem; color: var(--wh-orange); margin-bottom: 0.5rem; }
    .wh-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .wh-field label { font-size: 0.85rem; font-weight: 600; color: var(--wh-text); }
    .wh-field input, .wh-field select { padding: 0.55rem; border: 1px solid #d6d3d1; border-radius: 6px; font-size: 0.95rem; }
    .wh-btn { background: var(--wh-orange); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .wh-btn:hover { background: #9a3412; }
    .wh-grant-pill { background: #ffedd5; border: 1px solid var(--wh-border); border-radius: 6px; padding: 0.75rem; margin-bottom: 0.75rem; }
    .wh-grant-val { font-size: 1.25rem; font-weight: 800; color: var(--wh-orange); }
    footer.wh-foot { margin-top: 2.5rem; border-top: 1px solid #e7e5e4; padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--wh-muted); }
  </style>
</head>
<body>
  <div class="wh-wrap">
    <header class="wh-head">
      <div class="wh-brand">Civic Warm Homes Partnership</div>
      <nav class="wh-nav" aria-label="Calculator Nav">
        <a href="/">Grant Schemes</a>
        <a href="/calculator" aria-current="page">Self-Assessment Tool</a>
        <a href="/reports">Saved Assessments</a>
      </nav>
    </header>
    <main class="wh-grid">
      <section class="wh-card">
        <h1>Home Energy Retrofit Subsidy Eligibility</h1>
        <p style="font-size:0.9rem;color:var(--wh-muted);margin-bottom:1.25rem">Check qualification for the £7,500 Boiler Upgrade Scheme and Local Authority Energy Advice grants.</p>
        <form id="subsidy-calc-form" method="post" action="/calculator/submit">
          <div class="wh-field">
            <label for="postcode">Property Postcode</label>
            <input type="text" id="postcode" name="postcode" required placeholder="TR19 7AA">
          </div>
          <div class="wh-field">
            <label for="build_era">Property Age &amp; Construction Era</label>
            <select id="build_era" name="build_era" required>
              <option value="pre-1919">Pre-1919 (Solid Granite / Sandstone Wall)</option>
              <option value="1919-1944" selected>1919 - 1944 (Interwar Cavity / Uninsulated)</option>
              <option value="1945-1980">1945 - 1980 (Cavity Brick, Partial Loft)</option>
              <option value="modern">Post-1980 (Modern insulated construction)</option>
            </select>
          </div>
          <div class="wh-field">
            <label for="current_heating">Existing Primary Heating Fuel</label>
            <select id="current_heating" name="current_heating" required>
              <option value="oil-boiler">Heating Oil Tank Boiler (Non-condensing)</option>
              <option value="gas-boiler">Mains Gas Boiler (Older than 10 years)</option>
              <option value="lpg">LPG Bottled Gas</option>
              <option value="electric-storage">Old Electric Night Storage Heaters</option>
            </select>
          </div>
          <div class="wh-field">
            <label for="loft_insulation">Current Loft Insulation Depth</label>
            <select id="loft_insulation" name="loft_insulation" required>
              <option value="none">Zero / Under 50mm</option>
              <option value="partial">100mm - 150mm (Needs top-up to 270mm standard)</option>
              <option value="full">270mm+ Mineral wool (Fully insulated)</option>
            </select>
          </div>
          <div class="wh-field">
            <label for="income_bracket">Household Annual Income Band</label>
            <select id="income_bracket" name="income_bracket" required>
              <option value="under-31k">Under £31,000 / Means-tested benefit entitlement</option>
              <option value="over-31k">Above £31,000</option>
            </select>
          </div>
          <button type="submit" class="wh-btn">Calculate Qualifying Subsidies</button>
        </form>
      </section>
      <aside class="wh-card">
        <h2>Available Grant Schemes</h2>
        <div class="wh-grant-pill">
          <div class="wh-grant-val">£7,500 BUS Grant</div>
          <div style="font-weight:700;font-size:0.9rem">Boiler Upgrade Scheme</div>
          <div style="font-size:0.8rem;color:var(--wh-muted)">Direct voucher discount off air source or ground source heat pump installation.</div>
        </div>
        <div class="wh-grant-pill">
          <div class="wh-grant-val">100% Fully Funded</div>
          <div style="font-weight:700;font-size:0.9rem">ECO4 / HUG2 Scheme</div>
          <div style="font-size:0.8rem;color:var(--wh-muted)">Free solid wall insulation and solar panels for off-gas properties with EPC D, E, F or G.</div>
        </div>
      </aside>
    </main>
    <footer class="wh-foot">
      <p>Civic Warm Homes Partnership • Energy Saving Trust Accredited Assessment Framework • Council Climate Emergency Plan</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-24: Weekend farmers market pitch booking and power requirements (booking)
  {
    family_id: 'tr-24',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Market Cross Farmers Market — Stallholder Pitch &amp; Power Booking</title>
  <style>
    :root {
      --fm-red: #991b1b;
      --fm-straw: #fefce8;
      --fm-green: #166534;
      --fm-card: #ffffff;
      --fm-border: #fecaca;
      --fm-text: #1c1917;
      --fm-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafaf9; color: var(--fm-text); line-height: 1.5; padding: 1.5rem; }
    .fm-wrap { max-width: 1200px; margin: 0 auto; }
    header.fm-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--fm-red); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .fm-brand { font-size: 1.35rem; font-weight: 800; color: var(--fm-red); }
    nav.fm-nav a { text-decoration: none; color: var(--fm-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.fm-nav a[aria-current="page"] { color: var(--fm-red); border-bottom: 2px solid var(--fm-red); padding-bottom: 0.2rem; }
    .fm-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .fm-card { background: var(--fm-card); border: 1px solid #e7e5e4; border-radius: 8px; padding: 1.5rem; }
    .fm-card h1, .fm-card h2 { font-size: 1.35rem; color: var(--fm-red); margin-bottom: 0.5rem; }
    .fm-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .fm-field label { font-size: 0.85rem; font-weight: 600; color: var(--fm-text); }
    .fm-field input, .fm-field select { padding: 0.55rem; border: 1px solid #d6d3d1; border-radius: 6px; font-size: 0.95rem; }
    .fm-btn { background: var(--fm-red); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .fm-btn:hover { background: #7f1d1d; }
    .fm-stall-map { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 1rem; }
    .fm-stall-box { border: 1px solid #d6d3d1; border-radius: 4px; padding: 0.75rem 0.5rem; text-align: center; font-size: 0.8rem; background: #f5f5f4; }
    .fm-stall-box.taken { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
    .fm-stall-box.available { background: #dcfce7; border-color: #86efac; color: #166534; font-weight: 700; }
    footer.fm-foot { margin-top: 2.5rem; border-top: 1px solid #e7e5e4; padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--fm-muted); }
  </style>
</head>
<body>
  <div class="fm-wrap">
    <header class="fm-head">
      <div class="fm-brand">Market Cross Farmers Market (Bi-Weekly)</div>
      <nav class="fm-nav" aria-label="Market Nav">
        <a href="/">Trader Charter</a>
        <a href="/pitches" aria-current="page">Pitch Allocation</a>
        <a href="/market-layout">Square Map</a>
        <a href="/bookings">Vendor Passes</a>
      </nav>
    </header>
    <main class="fm-grid">
      <section class="fm-card">
        <h1>Stallholder Pitch Reservation &amp; Power Hookup</h1>
        <p style="font-size:0.9rem;color:var(--fm-muted);margin-bottom:1.25rem">Reserve trading pitches for upcoming Saturday farmers market on the historic Market Cross cobbles.</p>
        <form id="pitch-booking-form" method="post" action="/pitches/book">
          <div class="fm-field">
            <label for="trading_name">Vendor / Farm Trading Name</label>
            <input type="text" id="trading_name" name="trading_name" required placeholder="Blackmore Vale Cheese Co.">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="fm-field">
              <label for="produce_category">Primary Produce Category</label>
              <select id="produce_category" name="produce_category" required>
                <option value="dairy" selected>Artisan Cheese &amp; Raw Milk</option>
                <option value="meat">Grass-fed Beef, Lamb &amp; Game</option>
                <option value="bakery">Heritage Bread &amp; Pastries</option>
                <option value="veg">Organic Seasonal Vegetables</option>
                <option value="hot-food">Hot Street Food (Gas / Elec)</option>
              </select>
            </div>
            <div class="fm-field">
              <label for="market_saturday">Market Date</label>
              <select id="market_saturday" name="market_saturday" required>
                <option value="2026-10-17">Saturday 17 Oct (08:30 - 14:00)</option>
                <option value="2026-10-31">Saturday 31 Oct (Halloween Market)</option>
                <option value="2026-11-14">Saturday 14 Nov (Winter Produce)</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="fm-field">
              <label for="pitch_id">Preferred Pitch Slot</label>
              <select id="pitch_id" name="pitch_id" required>
                <option value="pitch-04">Pitch 04 — North Covered Arcade (3m x 3m)</option>
                <option value="pitch-07" selected>Pitch 07 — Central Cross Cobbles (3m x 3m)</option>
                <option value="pitch-11">Pitch 11 — South Perimeter Van Space</option>
              </select>
            </div>
            <div class="fm-field">
              <label for="power_supply">Electrical Hookup Required</label>
              <select id="power_supply" name="power_supply" required>
                <option value="none">No Power Needed (Ambient Goods)</option>
                <option value="13a-single" selected>13A Single Socket (Refrigeration Display)</option>
                <option value="16a-commando">16A Blue Commando (Heavy Hot Plate)</option>
              </select>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0">
            <input type="checkbox" id="hygiene_rating" name="hygiene_rating" value="yes" required>
            <label for="hygiene_rating" style="font-size:0.85rem">I certify our business holds Local Authority Food Hygiene Rating 4 or 5 and £5m Public Liability Insurance.</label>
          </div>
          <button type="submit" class="fm-btn">Reserve Market Trading Pitch</button>
        </form>
      </section>
      <aside class="fm-card">
        <h2>Market Square Pitch Status</h2>
        <div class="fm-stall-map">
          <div class="fm-stall-box taken">P01<br>Bakery</div>
          <div class="fm-stall-box taken">P02<br>Butcher</div>
          <div class="fm-stall-box taken">P03<br>Greens</div>
          <div class="fm-stall-box available">P04<br>Open</div>
          <div class="fm-stall-box taken">P05<br>Cider</div>
          <div class="fm-stall-box taken">P06<br>Fish</div>
          <div class="fm-stall-box available">P07<br>Open</div>
          <div class="fm-stall-box taken">P08<br>Pies</div>
        </div>
      </aside>
    </main>
    <footer class="fm-foot">
      <p>Market Cross Farmers Market Committee • Ancient Market Rights Royal Charter 1324 • Parish Square</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-25: Community elder oral history recordings and transcript index (docs-site)
  {
    family_id: 'tr-25',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Voices of the Mill Valley — Elder Oral History Archive &amp; Transcript Index</title>
  <style>
    :root {
      --oh-indigo: #1e1b4b;
      --oh-gold: #b45309;
      --oh-card: #ffffff;
      --oh-border: #e2e8f0;
      --oh-bg: #f8fafc;
      --oh-text: #1e293b;
      --oh-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--oh-bg); color: var(--oh-text); line-height: 1.5; padding: 1.5rem; }
    .oh-shell { max-width: 1200px; margin: 0 auto; }
    header.oh-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--oh-indigo); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .oh-brand { font-size: 1.45rem; font-weight: 700; color: var(--oh-indigo); }
    nav.oh-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: var(--oh-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.oh-nav a[aria-current="page"] { color: var(--oh-indigo); text-decoration: underline; }
    .oh-grid { display: grid; grid-template-columns: 280px 1fr 320px; gap: 1.75rem; align-items: start; }
    .oh-card { background: var(--oh-card); border: 1px solid var(--oh-border); border-radius: 8px; padding: 1.5rem; }
    .oh-card h1, .oh-card h2 { font-size: 1.35rem; color: var(--oh-indigo); margin-bottom: 0.5rem; }
    .oh-filter-select { font-family: -apple-system, sans-serif; width: 100%; padding: 0.5rem; border: 1px solid var(--oh-border); border-radius: 6px; margin-bottom: 0.75rem; }
    .oh-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; font-family: -apple-system, sans-serif; font-size: 0.85rem; }
    .oh-list a { text-decoration: none; color: var(--oh-text); padding: 0.4rem; border-radius: 4px; display: block; }
    .oh-list a.active { background: #ede9fe; color: var(--oh-indigo); font-weight: 700; }
    .oh-transcript { font-size: 0.95rem; color: #334155; line-height: 1.6; }
    .oh-timecode { font-family: monospace; font-size: 0.8rem; color: var(--oh-gold); font-weight: 700; }
    .oh-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; font-family: -apple-system, sans-serif; }
    .oh-field label { font-size: 0.85rem; font-weight: 600; color: var(--oh-text); }
    .oh-field input, .oh-field textarea { padding: 0.55rem; border: 1px solid var(--oh-border); border-radius: 6px; font-size: 0.95rem; }
    .oh-btn { font-family: -apple-system, sans-serif; background: var(--oh-indigo); color: #fff; border: none; font-size: 0.95rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; cursor: pointer; width: 100%; }
    .oh-btn:hover { background: #312e81; }
    footer.oh-foot { margin-top: 2.5rem; border-top: 1px solid var(--oh-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--oh-muted); }
  </style>
</head>
<body>
  <div class="oh-shell">
    <header class="oh-head">
      <div class="oh-brand">Voices of the Mill Valley</div>
      <nav class="oh-nav" aria-label="Archive Nav">
        <a href="/">About the Project</a>
        <a href="/interviews" aria-current="page">Interview Index</a>
        <a href="/decades">Decade Timeline</a>
        <a href="/curators">Curator Desk</a>
      </nav>
    </header>
    <main class="oh-grid">
      <aside class="oh-card">
        <h2>Oral Memoirs</h2>
        <label for="decade_filter" style="font-family:-apple-system,sans-serif;font-size:0.8rem;font-weight:600">Filter by Historical Decade</label>
        <select id="decade_filter" class="oh-filter-select">
          <option value="1930s">1930s — Great Depression &amp; Rural Labour</option>
          <option value="1940s">1940s — Wartime Agriculture &amp; Land Army</option>
          <option value="1950s" selected>1950s — Postwar Textile Mechanisation</option>
          <option value="1960s">1960s — Mill Closures &amp; Transition</option>
        </select>
        <ul class="oh-list">
          <li><a href="#int-01" class="active">George Hedley — Loom Tender (Weaving Shed #4)</a></li>
          <li><a href="#int-02">Winifred Cross — Carding Room Supervisor</a></li>
          <li><a href="#int-03">Albert Ward — Millrace Engineer &amp; Stoker</a></li>
        </ul>
      </aside>
      <article class="oh-card">
        <h1>Interview Transcript: George Hedley (Recorded 1984)</h1>
        <p style="font-style:italic;color:var(--oh-muted);margin-bottom:1rem;font-size:0.9rem">Recorded at Albion Weaving Sheds • Interviewer: Dr. Rachel Vance • Audio Tape Box #14</p>
        <div class="oh-transcript">
          <p><span class="oh-timecode">[04:12]</span> "I started as a bobbin lad in October 1952. Sixty shuttle looms running simultaneously in one room—you could feel the floor vibrating right up through the soles of your clogs before you even opened the fire door."</p>
          <p style="margin-top:0.75rem"><span class="oh-timecode">[07:45]</span> "We had no ear defenders in those days. You learned to read each other's lips from forty feet away. If a warp thread broke, the weaver caught it with a hand-knot in two seconds flat without shutting the loom down."</p>
        </div>
      </article>
      <section class="oh-card">
        <h2>Annotate Historical Footnote</h2>
        <p style="font-family:-apple-system,sans-serif;font-size:0.85rem;color:var(--oh-muted);margin-bottom:1rem">Contribute corroborating local names, dates, or mill machinery terminology.</p>
        <form id="footnote-form" method="post" action="/interviews/hedley/notes">
          <div class="oh-field">
            <label for="researcher_name">Researcher / Relative Name</label>
            <input type="text" id="researcher_name" name="researcher_name" required placeholder="Dr. Alan Hedley">
          </div>
          <div class="oh-field">
            <label for="timecode_ref">Referenced Timecode</label>
            <input type="text" id="timecode_ref" name="timecode_ref" value="[04:12]" required>
          </div>
          <div class="oh-field">
            <label for="annotation_note">Historical Footnote / Mill Vocabulary</label>
            <textarea id="annotation_note" name="annotation_note" rows="3" required placeholder="e.g. Albion Mill installed automatic Northrop looms in late 1953, replacing the Lancashire shuttle looms referenced here."></textarea>
          </div>
          <button type="submit" class="oh-btn">Submit Archival Footnote</button>
        </form>
      </section>
    </main>
    <footer class="oh-foot">
      <p>Voices of the Mill Valley • County Historical Archive • Digitised with Heritage Lottery Support</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-26: Single-origin coffee subscription renewal and grind preference (web-shop)
  {
    family_id: 'tr-26',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atlas Roasters — Single-Origin Coffee Subscription Manager</title>
  <style>
    :root {
      --ar-roast: #261814;
      --ar-gold: #b45309;
      --ar-card: #ffffff;
      --ar-border: #e7e5e4;
      --ar-bg: #fafaf9;
      --ar-text: #292524;
      --ar-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ar-bg); color: var(--ar-text); line-height: 1.5; padding: 1.5rem; }
    .ar-wrap { max-width: 1100px; margin: 0 auto; }
    header.ar-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--ar-gold); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .ar-brand { font-size: 1.35rem; font-weight: 800; color: var(--ar-roast); }
    nav.ar-nav a { text-decoration: none; color: var(--ar-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.ar-nav a[aria-current="page"] { color: var(--ar-gold); border-bottom: 2px solid var(--ar-gold); padding-bottom: 0.2rem; }
    .ar-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .ar-card { background: var(--ar-card); border: 1px solid var(--ar-border); border-radius: 8px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .ar-card h1, .ar-card h2 { font-size: 1.4rem; color: var(--ar-roast); margin-bottom: 0.5rem; }
    .ar-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; }
    .ar-field label { font-size: 0.85rem; font-weight: 600; color: var(--ar-text); }
    .ar-field input, .ar-field select { padding: 0.55rem; border: 1px solid #d6d3d1; border-radius: 6px; font-size: 0.95rem; }
    .ar-btn { background: var(--ar-roast); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .ar-btn:hover { background: #382013; }
    .ar-grind-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-top: 0.25rem; }
    .ar-grind-opt { border: 1px solid var(--ar-border); border-radius: 6px; padding: 0.65rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
    footer.ar-foot { margin-top: 2.5rem; border-top: 1px solid var(--ar-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--ar-muted); }
  </style>
</head>
<body>
  <div class="ar-wrap">
    <header class="ar-head">
      <div class="ar-brand">☕ Atlas Roasters Single Origin Club</div>
      <nav class="ar-nav" aria-label="Subscription Nav">
        <a href="/">Roastery Profile</a>
        <a href="/subscriptions" aria-current="page">Subscription Manager</a>
        <a href="/origins">Harvest Calendar</a>
      </nav>
    </header>
    <main class="ar-grid">
      <section class="ar-card">
        <h1>Update Subscription Preferences</h1>
        <p style="font-size:0.9rem;color:var(--ar-muted);margin-bottom:1.25rem">Adjust your monthly single-origin micro-lot allocation, grind coarseness, and bag dispatch frequency.</p>
        <form id="coffee-sub-form" method="post" action="/subscriptions/SUB-9941/edit">
          <div class="ar-field">
            <label for="subscriber_code">Subscriber ID</label>
            <input type="text" id="subscriber_code" name="subscriber_code" value="SUB-9941" required readonly style="background:#f5f5f4">
          </div>
          <div class="ar-field">
            <label for="bean_origin">Active Single-Origin Micro-Lot</label>
            <select id="bean_origin" name="bean_origin" required>
              <option value="ethiopia" selected>Ethiopia Guji Highland — Natural Process (Bergamot &amp; Peach)</option>
              <option value="colombia">Colombia Huila Finca El Paraiso — Washed (Caramel &amp; Plum)</option>
              <option value="kenya">Kenya Nyeri Peaberry — Washed (Blackcurrant &amp; Lime)</option>
              <option value="sumatra">Sumatra Kerinci Mountain — Wet Hulled (Cedar &amp; Cacao)</option>
            </select>
          </div>
          <div class="ar-field">
            <label>Brewing Grind Setting</label>
            <div class="ar-grind-grid">
              <label class="ar-grind-opt"><input type="radio" name="grind" value="whole-bean" checked> Whole Bean (Aroma Lock)</label>
              <label class="ar-grind-opt"><input type="radio" name="grind" value="espresso"> Fine (Espresso / Moka)</label>
              <label class="ar-grind-opt"><input type="radio" name="grind" value="filter"> Medium (V60 / Chemex)</label>
              <label class="ar-grind-opt"><input type="radio" name="grind" value="french-press"> Coarse (Cafetière / Cold Brew)</label>
            </div>
          </div>
          <div class="ar-field">
            <label for="delivery_frequency">Delivery Frequency</label>
            <select id="delivery_frequency" name="delivery_frequency" required>
              <option value="weekly">Weekly Dispatch (250g bag fresh roast)</option>
              <option value="fortnightly" selected>Fortnightly Dispatch (Every 2 weeks)</option>
              <option value="monthly">Monthly Double Pack (2x 250g bags)</option>
            </select>
          </div>
          <button type="submit" class="ar-btn">Save Updated Subscription Settings</button>
        </form>
      </section>
      <aside class="ar-card">
        <h2>Next Roast Dispatch</h2>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:0.75rem;margin-bottom:1rem;font-size:0.85rem">
          <strong>Roasting Batch:</strong> Tuesday 20 October on our 15kg Giesen roaster. Shipped carbon-neutral within 24 hours of cooling.
        </div>
        <h3 style="font-size:1rem;color:var(--ar-roast);margin-bottom:0.4rem">Farm Gate Provenance</h3>
        <p style="font-size:0.85rem;color:var(--ar-muted)">We pay an average of 145% above Fairtrade minimum price directly to smallholder farm cooperatives.</p>
      </aside>
    </main>
    <footer class="ar-foot">
      <p>Atlas Roasters Specialty Coffee • The Roastery Arches, Bermondsey • B-Corp Certified</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-27: Parish church acoustic concert seat selection (booking)
  {
    family_id: 'tr-27',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>St. Jude’s Chamber Music — Acoustic Concert Pew Reservation</title>
  <style>
    :root {
      --sj-stone: #44403c;
      --sj-ruby: #831843;
      --sj-gold: #d97706;
      --sj-card: #ffffff;
      --sj-border: #e7e5e4;
      --sj-bg: #fafaf9;
      --sj-text: #1c1917;
      --sj-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--sj-bg); color: var(--sj-text); line-height: 1.5; padding: 1.5rem; }
    .sj-wrap { max-width: 1200px; margin: 0 auto; }
    header.sj-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--sj-ruby); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .sj-brand { font-size: 1.45rem; font-weight: 700; color: var(--sj-ruby); }
    nav.sj-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: var(--sj-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.sj-nav a[aria-current="page"] { color: var(--sj-ruby); text-decoration: underline; }
    .sj-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .sj-card { background: var(--sj-card); border: 1px solid var(--sj-border); border-radius: 8px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .sj-card h1, .sj-card h2 { font-size: 1.45rem; color: var(--sj-ruby); margin-bottom: 0.5rem; }
    .sj-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; font-family: -apple-system, sans-serif; }
    .sj-field label { font-size: 0.85rem; font-weight: 600; color: var(--sj-text); }
    .sj-field input, .sj-field select { padding: 0.55rem; border: 1px solid #d6d3d1; border-radius: 6px; font-size: 0.95rem; }
    .sj-btn { font-family: -apple-system, sans-serif; background: var(--sj-ruby); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .sj-btn:hover { background: #9d174d; }
    .sj-seating-chart { background: #f5f5f4; border: 1px solid var(--sj-border); border-radius: 6px; padding: 1rem; margin-bottom: 1.25rem; font-family: -apple-system, sans-serif; font-size: 0.85rem; }
    footer.sj-foot { margin-top: 2.5rem; border-top: 1px solid var(--sj-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--sj-muted); }
  </style>
</head>
<body>
  <div class="sj-wrap">
    <header class="sj-head">
      <div class="sj-brand">St. Jude’s Chamber Music Series</div>
      <nav class="sj-nav" aria-label="Concert Nav">
        <a href="/">Concert Season</a>
        <a href="/concerts" aria-current="page">Reserve Pew Seats</a>
        <a href="/acoustics">Church Architecture</a>
        <a href="/reservations">Booking Slips</a>
      </nav>
    </header>
    <main class="sj-grid">
      <section class="sj-card">
        <h1>Acoustic Chamber Evening: Purcell &amp; Dowland</h1>
        <p style="font-family:-apple-system,sans-serif;font-size:0.9rem;color:var(--sj-muted);margin-bottom:1.25rem">Performed by candlelight in the 14th-century rib-vaulted nave with exceptional natural acoustic resonance.</p>
        <div class="sj-seating-chart">
          <strong>Nave Seating Plan:</strong> Pews A1 - A6 (Front Centre) • Pews B1 - B8 (Mid Nave) • North Transept (Acoustic Side Aisle)
        </div>
        <form id="pew-booking-form" method="post" action="/concerts/dowland/reserve">
          <div class="sj-field">
            <label for="pew_section">Select Pew Section</label>
            <select id="pew_section" name="pew_section" required>
              <option value="pew-a-front">Front Nave Pews (A3 - A4) — £18.00 / seat</option>
              <option value="pew-b-mid" selected>Mid Nave Pews (B2 - B4) — £14.00 / seat</option>
              <option value="north-transept">North Transept Side Aisle — £10.00 / seat</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="sj-field">
              <label for="attendee_name">Lead Booking Name</label>
              <input type="text" id="attendee_name" name="attendee_name" required placeholder="Canon Thomas More">
            </div>
            <div class="sj-field">
              <label for="contact_email">Email for Confirmation Voucher</label>
              <input type="email" id="contact_email" name="contact_email" required placeholder="thomas@example.test">
            </div>
          </div>
          <div class="sj-field">
            <label for="seat_quantity">Number of Seats in Pew</label>
            <input type="number" id="seat_quantity" name="seat_quantity" min="1" max="6" value="2" required>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;margin:0.5rem 0;font-family:-apple-system,sans-serif">
            <input type="checkbox" id="wheelchair_space" name="wheelchair_space" value="yes">
            <label for="wheelchair_space" style="font-size:0.85rem">Requires step-free pew end position for wheelchair / companion</label>
          </div>
          <button type="submit" class="sj-btn">Confirm Pew Reservation</button>
        </form>
      </section>
      <aside class="sj-card">
        <h2>Concert Logistics</h2>
        <ul style="font-family:-apple-system,sans-serif;font-size:0.85rem;color:#44403c;display:flex;flex-direction:column;gap:0.5rem;padding-left:1.2rem;margin-top:0.5rem">
          <li>Doors open 18:45; performance commences promptly at 19:30</li>
          <li>Mulled cider and programme included in parish hall during interval</li>
          <li>Church nave is heated, but seat cushions are warmly recommended</li>
        </ul>
      </aside>
    </main>
    <footer class="sj-foot">
      <p>St. Jude’s Parish Church Heritage Trust • Preserving Historic Music in Medieval Spaces • High Street, Burford</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-28: Outdoor equipment loan repair and missing part tickets (support-helpdesk)
  {
    family_id: 'tr-28',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Trailhead Youth Gear Locker — Equipment Repair &amp; Maintenance Tickets</title>
  <style>
    :root {
      --th-forest: #064e3b;
      --th-yellow: #eab308;
      --th-slate: #1f2937;
      --th-card: #ffffff;
      --th-border: #d1d5db;
      --th-bg: #f9fafb;
      --th-text: #111827;
      --th-muted: #6b7280;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--th-bg); color: var(--th-text); line-height: 1.5; padding: 1.5rem; }
    .th-wrap { max-width: 1200px; margin: 0 auto; }
    header.th-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--th-forest); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .th-brand { font-size: 1.35rem; font-weight: 800; color: var(--th-forest); }
    nav.th-nav a { text-decoration: none; color: var(--th-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.th-nav a[aria-current="page"] { color: var(--th-forest); border-bottom: 2px solid var(--th-forest); padding-bottom: 0.2rem; }
    .th-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .th-card { background: var(--th-card); border: 1px solid var(--th-border); border-radius: 8px; padding: 1.5rem; }
    .th-card h1, .th-card h2 { font-size: 1.35rem; color: var(--th-forest); margin-bottom: 0.5rem; }
    .th-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .th-field label { font-size: 0.85rem; font-weight: 600; color: var(--th-text); }
    .th-field input, .th-field select, .th-field textarea { padding: 0.55rem; border: 1px solid var(--th-border); border-radius: 6px; font-size: 0.95rem; }
    .th-btn { background: var(--th-forest); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .th-btn:hover { background: #065f46; }
    table.th-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    table.th-table th, table.th-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--th-border); text-align: left; }
    table.th-table th { background: #f3f4f6; color: var(--th-forest); }
    footer.th-foot { margin-top: 2.5rem; border-top: 1px solid var(--th-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--th-muted); }
  </style>
</head>
<body>
  <div class="th-wrap">
    <header class="th-head">
      <div class="th-brand">⛺ Trailhead Youth Gear Locker</div>
      <nav class="th-nav" aria-label="Gear Nav">
        <a href="/">Equipment Loans</a>
        <a href="/gear">Locker Inventory</a>
        <a href="/tickets" aria-current="page">Log Damaged Gear</a>
        <a href="/repairs">Repair Workshop</a>
      </nav>
    </header>
    <main class="th-grid">
      <section class="th-card">
        <h1>Log Equipment Damage or Missing Part Ticket</h1>
        <p style="font-size:0.9rem;color:var(--th-muted);margin-bottom:1.25rem">Report torn tent flysheets, bent alloy poles, clogged multifuel stoves, or missing backpack buckles after group expeditions.</p>
        <form id="gear-damage-form" method="post" action="/tickets/new">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="th-field">
              <label for="gear_serial">Equipment Serial / Asset Barcode</label>
              <input type="text" id="gear_serial" name="gear_serial" required placeholder="TNT-V2-044">
            </div>
            <div class="th-field">
              <label for="gear_category">Equipment Category</label>
              <select id="gear_category" name="gear_category" required>
                <option value="tent" selected>3-Season Expedition Tent (Geodesic)</option>
                <option value="pack">65L Expedition Rucksack</option>
                <option value="stove">MSR Whisperlite Multifuel Camp Stove</option>
                <option value="mat">Inflatable Sleeping Pad (Puncture)</option>
              </select>
            </div>
          </div>
          <div class="th-field">
            <label for="urgency">Repair Urgency</label>
            <select id="urgency" name="urgency" required>
              <option value="routine">Routine — Needed within 3 weeks</option>
              <option value="urgent">Urgent — Reserved for Duke of Edinburgh expedition next Friday</option>
              <option value="scrap">Severe Damage — Assess for component harvesting</option>
            </select>
          </div>
          <div class="th-field">
            <label for="damage_notes">Defect Description &amp; Specific Missing Hardware</label>
            <textarea id="damage_notes" name="damage_notes" rows="3" required placeholder="e.g. Middle gold Easton pole section is bent at 45 degrees near ferrule. Rainfly zip tooth missing on vestibule."></textarea>
          </div>
          <div class="th-field">
            <label for="leader_name">Expedition Leader Name</label>
            <input type="text" id="leader_name" name="leader_name" required placeholder="Sarah Jenkins (1st Valley Scouts)">
          </div>
          <button type="submit" class="th-btn">Submit Damage Ticket to Workshop</button>
        </form>
      </section>
      <aside class="th-card">
        <h2>Locker Maintenance Queue</h2>
        <table class="th-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Item</th>
              <th>Issue</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>TNT-018</td>
              <td>Terra Nova 3P</td>
              <td>Seam tape peeling</td>
              <td><span style="color:#b45309;font-weight:700">In Workshop</span></td>
            </tr>
            <tr>
              <td>STV-005</td>
              <td>Trangia 27</td>
              <td>Strap buckle snapped</td>
              <td><span style="color:#15803d;font-weight:700">Parts Ordered</span></td>
            </tr>
          </tbody>
        </table>
      </aside>
    </main>
    <footer class="th-foot">
      <p>Trailhead Youth Gear Locker • Community Outdoor Gear Loan Trust • Registered Charity #10294</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-29: Memorial tree fund contributions and planting site tracker (expense-tracker)
  {
    family_id: 'tr-29',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Community Woodland Trust — Memorial Tree Fund &amp; Dedication Ledger</title>
  <style>
    :root {
      --cw-green: #14532d;
      --cw-brass: #854d0e;
      --cw-card: #ffffff;
      --cw-border: #bbf7d0;
      --cw-bg: #f0fdf4;
      --cw-text: #14532d;
      --cw-muted: #4b5563;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--cw-bg); color: #1c1917; line-height: 1.5; padding: 1.5rem; }
    .cw-wrap { max-width: 1200px; margin: 0 auto; }
    header.cw-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--cw-green); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .cw-brand { font-size: 1.4rem; font-weight: 700; color: var(--cw-green); }
    nav.cw-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: var(--cw-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.cw-nav a[aria-current="page"] { color: var(--cw-green); text-decoration: underline; }
    .cw-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .cw-card { background: var(--cw-card); border: 1px solid var(--cw-border); border-radius: 8px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .cw-card h1, .cw-card h2 { font-size: 1.45rem; color: var(--cw-green); margin-bottom: 0.5rem; }
    .cw-progress-box { background: #dcfce7; border: 1px solid var(--cw-border); border-radius: 6px; padding: 1rem; margin-bottom: 1.25rem; font-family: -apple-system, sans-serif; }
    .cw-bar-outer { height: 12px; background: #bbf7d0; border-radius: 6px; overflow: hidden; margin: 0.5rem 0; }
    .cw-bar-inner { height: 100%; width: 71%; background: var(--cw-green); border-radius: 6px; }
    .cw-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; font-family: -apple-system, sans-serif; }
    .cw-field label { font-size: 0.85rem; font-weight: 600; color: #1c1917; }
    .cw-field input, .cw-field select, .cw-field textarea { padding: 0.55rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; }
    .cw-btn { font-family: -apple-system, sans-serif; background: var(--cw-green); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .cw-btn:hover { background: #166534; }
    table.cw-table { width: 100%; border-collapse: collapse; font-family: -apple-system, sans-serif; font-size: 0.85rem; margin-top: 0.5rem; }
    table.cw-table th, table.cw-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
    table.cw-table th { background: #f0fdf4; color: var(--cw-green); }
    footer.cw-foot { margin-top: 2.5rem; border-top: 1px solid var(--cw-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--cw-muted); }
  </style>
</head>
<body>
  <div class="cw-wrap">
    <header class="cw-head">
      <div class="cw-brand">Community Woodland Trust</div>
      <nav class="cw-nav" aria-label="Trust Nav">
        <a href="/">Woodland Reserve</a>
        <a href="/funds" aria-current="page">Memorial Tree Fund</a>
        <a href="/contribute">Pledge Tree</a>
        <a href="/ledger">Public Ledger</a>
      </nav>
    </header>
    <main class="cw-grid">
      <section class="cw-card">
        <h1>Memorial Tree Planting Contribution</h1>
        <p style="font-family:-apple-system,sans-serif;font-size:0.9rem;color:var(--cw-muted);margin-bottom:1rem">Pledge a native English sapling with a hand-engraved Welsh slate plaque in our community memorial copse.</p>
        <div class="cw-progress-box">
          <div style="display:flex;justify-content:space-between;font-size:0.9rem;font-weight:700">
            <span>£14,250 Raised of £20,000 Target</span>
            <span>285 of 400 Trees Planted</span>
          </div>
          <div class="cw-bar-outer"><div class="cw-bar-inner"></div></div>
        </div>
        <form id="tree-pledge-form" method="post" action="/contribute">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="cw-field">
              <label for="donor_name">Donor Full Name</label>
              <input type="text" id="donor_name" name="donor_name" required placeholder="Eleanor Vance">
            </div>
            <div class="cw-field">
              <label for="honouree">Dedicated In Memory Of</label>
              <input type="text" id="honouree" name="honouree" required placeholder="Captain Arthur Vance">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="cw-field">
              <label for="species_choice">Native Tree Species Choice</label>
              <select id="species_choice" name="species_choice" required>
                <option value="pedunculate-oak" selected>English Oak (<em>Quercus robur</em>)</option>
                <option value="copper-beech">Copper Beech (<em>Fagus sylvatica</em>)</option>
                <option value="wild-cherry">Wild Cherry (<em>Prunus avium</em>)</option>
                <option value="mountain-ash">Rowan / Mountain Ash</option>
              </select>
            </div>
            <div class="cw-field">
              <label for="contribution_amount">Contribution Amount (£ min 50)</label>
              <input type="number" id="contribution_amount" name="contribution_amount" min="50" step="10" value="75" required>
            </div>
          </div>
          <div class="cw-field">
            <label for="dedication_message">Plaque Inscription Message</label>
            <textarea id="dedication_message" name="dedication_message" rows="2" placeholder="e.g. For Arthur, who loved walking these valleys. Forever rooted in peace."></textarea>
          </div>
          <button type="submit" class="cw-btn">Record Memorial Tree Contribution</button>
        </form>
      </section>
      <aside class="cw-card">
        <h2>Recent Memorial Ledger</h2>
        <table class="cw-table">
          <thead>
            <tr>
              <th>Tree</th>
              <th>Dedicated To</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Oak #284</td>
              <td>Margaret Bell</td>
              <td>£150.00</td>
            </tr>
            <tr>
              <td>Beech #283</td>
              <td>Dr. Julian Reed</td>
              <td>£75.00</td>
            </tr>
            <tr>
              <td>Cherry #282</td>
              <td>Alice Davies</td>
              <td>£50.00</td>
            </tr>
          </tbody>
        </table>
      </aside>
    </main>
    <footer class="cw-foot">
      <p>Community Woodland Trust • Registered Charity #104921 • Dedicated Ancient Tree Planting Project</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-30: Low-tide beach cleanup zone assignment and kit allocation (event-registration)
  {
    family_id: 'tr-30',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shoreline Marine Stewardship — Coastal Beach Cleanup &amp; Kit Pass</title>
  <style>
    :root {
      --sm-ocean: #075985;
      --sm-teal: #0f766e;
      --sm-card: #ffffff;
      --sm-border: #bae6fd;
      --sm-bg: #f0fdfa;
      --sm-text: #0f172a;
      --sm-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--sm-bg); color: var(--sm-text); line-height: 1.5; padding: 1.5rem; }
    .sm-wrap { max-width: 1200px; margin: 0 auto; }
    header.sm-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--sm-ocean); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .sm-brand { font-size: 1.35rem; font-weight: 800; color: var(--sm-ocean); }
    nav.sm-nav a { text-decoration: none; color: var(--sm-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.sm-nav a[aria-current="page"] { color: var(--sm-ocean); border-bottom: 2px solid var(--sm-ocean); padding-bottom: 0.2rem; }
    .sm-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .sm-card { background: var(--sm-card); border: 1px solid var(--sm-border); border-radius: 8px; padding: 1.75rem; }
    .sm-card h1, .sm-card h2 { font-size: 1.4rem; color: var(--sm-ocean); margin-bottom: 0.5rem; }
    .sm-tide-alert { background: #e0f2fe; border: 1px solid var(--sm-border); border-radius: 6px; padding: 0.85rem; margin-bottom: 1.25rem; font-size: 0.9rem; }
    .sm-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .sm-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .sm-field label { font-size: 0.85rem; font-weight: 600; color: var(--sm-text); }
    .sm-field input, .sm-field select { padding: 0.55rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; }
    .sm-btn { background: var(--sm-ocean); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .sm-btn:hover { background: #0c4a6e; }
    footer.sm-foot { margin-top: 2.5rem; border-top: 1px solid var(--sm-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--sm-muted); }
  </style>
</head>
<body>
  <div class="sm-wrap">
    <header class="sm-head">
      <div class="sm-brand">🌊 Shoreline Marine Stewardship</div>
      <nav class="sm-nav" aria-label="Cleanup Nav">
        <a href="/">Tide Timetable</a>
        <a href="/cleanups">Coastal Events</a>
        <a href="/register" aria-current="page">Volunteer Pass</a>
        <a href="/passes">Pass Verification</a>
      </nav>
    </header>
    <main class="sm-grid">
      <section class="sm-card">
        <h1>Low-Tide Coastal Beach Cleanup &amp; Kit Pass</h1>
        <div class="sm-tide-alert">
          <strong>Low Tide Window:</strong> Saturday 24 Oct • Extreme Low Water 10:15 (-0.4m chart datum). Access to outer reef tidepools and shingle spit.
        </div>
        <form id="beach-cleanup-form" method="post" action="/cleanups/autumn-tide/register">
          <div class="sm-row-2">
            <div class="sm-field">
              <label for="volunteer_name">Volunteer Name</label>
              <input type="text" id="volunteer_name" name="volunteer_name" required placeholder="Marcus Vance">
            </div>
            <div class="sm-field">
              <label for="volunteer_phone">Contact Mobile</label>
              <input type="tel" id="volunteer_phone" name="volunteer_phone" required placeholder="07700 900552">
            </div>
          </div>
          <div class="sm-field">
            <label for="beach_sector">Assigned Coastal Cleanup Sector</label>
            <select id="beach_sector" name="beach_sector" required>
              <option value="sector-a">Sector A — North Shingle Spit (Plastic bottles &amp; rope)</option>
              <option value="sector-b" selected>Sector B — Pier Tidepools (Ghost nets &amp; monofilament)</option>
              <option value="sector-c">Sector C — Estuary Mudflats (Wellingtons required)</option>
            </select>
          </div>
          <div class="sm-row-2">
            <div class="sm-field">
              <label for="briefing_slot">Safety Briefing Time</label>
              <select id="briefing_slot" name="briefing_slot" required>
                <option value="slot-0900">09:00 AM (First wave briefing)</option>
                <option value="slot-0930" selected>09:30 AM (Family &amp; group briefing)</option>
              </select>
            </div>
            <div class="sm-field">
              <label for="kit_glove_size">Litter Picker &amp; Glove Kit Size</label>
              <select id="kit_glove_size" name="kit_glove_size" required>
                <option value="adult-m">Adult Medium Kevlar Gloves + Long Picker</option>
                <option value="adult-l">Adult Large Gloves + Long Picker</option>
                <option value="junior">Junior Heavy Gloves + Short Picker</option>
              </select>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0">
            <input type="checkbox" id="safety_briefing_ack" name="safety_briefing_ack" value="yes" required>
            <label for="safety_briefing_ack" style="font-size:0.85rem">I agree to attend the slipway safety briefing and follow tide warden signals.</label>
          </div>
          <button type="submit" class="sm-btn">Register Volunteer Cleanup Pass</button>
        </form>
      </section>
      <aside class="sm-card">
        <h2>Kit Collection Station</h2>
        <p style="font-size:0.85rem;color:var(--sm-muted);margin-bottom:0.75rem">Collect your sanitised kit at Harbour Slipway Marquee 15 minutes before your briefing.</p>
        <ul style="font-size:0.85rem;color:#334155;display:flex;flex-direction:column;gap:0.4rem;padding-left:1.2rem">
          <li>Puncture-resistant marine safety gloves</li>
          <li>Ergonomic aluminium litter grabber</li>
          <li>Colour-coded marine debris sorting bags</li>
          <li>Sharps box container at marshal station</li>
        </ul>
      </aside>
    </main>
    <footer class="sm-foot">
      <p>Shoreline Marine Stewardship Trust • Dedicated to Clean Seas &amp; Marine Habitats • Slipway Quay</p>
    </footer>
  </div>
</body>
</html>`
  }
];

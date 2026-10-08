/**
 * Target designs batch 2: tr-11 through tr-20
 */
export const BATCH_2 = [
  // tr-11: Sourdough cottage bakery weekly loaf orders (restaurant-ordering)
  {
    family_id: 'tr-11',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Crust &amp; Crumb Micro-Bakery — Friday Bake Loaf Pre-Orders</title>
  <style>
    :root {
      --cb-crust: #78350f;
      --cb-warm: #fef3c7;
      --cb-bread: #451a03;
      --cb-bg: #fffbeb;
      --cb-border: #fde68a;
      --cb-card: #ffffff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--cb-bg); color: #292524; line-height: 1.5; padding: 1.5rem; }
    .cb-container { max-width: 1200px; margin: 0 auto; }
    header.cb-head { border-bottom: 2px solid var(--cb-crust); padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
    .cb-brand { font-size: 1.5rem; font-weight: 700; color: var(--cb-bread); }
    nav.cb-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: #78350f; font-weight: 600; margin-left: 1.25rem; font-size: 0.9rem; }
    nav.cb-nav a[aria-current="page"] { border-bottom: 2px solid var(--cb-crust); padding-bottom: 0.2rem; }
    .cb-grid { display: grid; grid-template-columns: 2fr 1.1fr; gap: 2rem; align-items: start; }
    .cb-card { background: var(--cb-card); border: 1px solid var(--cb-border); border-radius: 8px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .cb-card h1 { font-size: 1.6rem; color: var(--cb-bread); margin-bottom: 0.5rem; }
    .cb-menu-item { display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: center; padding: 1rem 0; border-bottom: 1px solid #fef3c7; }
    .cb-item-title { font-size: 1.15rem; font-weight: 700; color: var(--cb-bread); }
    .cb-item-desc { font-family: -apple-system, sans-serif; font-size: 0.85rem; color: #78716c; margin-top: 0.2rem; }
    .cb-qty-field { font-family: -apple-system, sans-serif; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
    .cb-qty-field input { width: 60px; padding: 0.4rem; border: 1px solid #d6d3d1; border-radius: 4px; text-align: center; font-size: 1rem; }
    .cb-order-form { font-family: -apple-system, sans-serif; margin-top: 1.5rem; background: var(--cb-warm); padding: 1.25rem; border-radius: 8px; }
    .cb-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
    .cb-field label { font-size: 0.85rem; font-weight: 700; color: var(--cb-bread); }
    .cb-field input, .cb-field select { padding: 0.55rem; border: 1px solid #d6d3d1; border-radius: 6px; font-size: 0.95rem; background: #fff; }
    .cb-btn { width: 100%; background: var(--cb-crust); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; margin-top: 0.5rem; }
    .cb-btn:hover { background: #92400e; }
    footer.cb-foot { margin-top: 2.5rem; border-top: 1px solid var(--cb-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: #a8a29e; }
  </style>
</head>
<body>
  <div class="cb-container">
    <header class="cb-head">
      <div class="cb-brand">Crust &amp; Crumb Micro-Bakery</div>
      <nav class="cb-nav" aria-label="Bakery Nav">
        <a href="/">Our Sourdough Starter</a>
        <a href="/menu" aria-current="page">Weekly Bake Menu</a>
        <a href="/order">Reserve Bread</a>
        <a href="/orders">Pickup Slips</a>
      </nav>
    </header>
    <main class="cb-grid">
      <section class="cb-card">
        <h1>Friday Bake Menu &amp; Loaf Reservation</h1>
        <p style="font-family:-apple-system,sans-serif;font-size:0.95rem;color:#78716c;margin-bottom:1rem">All bread is fermented for 28 hours using organic stoneground flour and baked in small batches on our stone deck hearth.</p>
        <form id="bakery-order-form" method="post" action="/order">
          <div class="cb-menu-item">
            <div>
              <div class="cb-item-title">Country White Boule (850g) — £4.60</div>
              <div class="cb-item-desc">75% hydration wheat loaf with crunchy caramelised blistered crust and open crumb.</div>
            </div>
            <div class="cb-qty-field">
              <label for="loaf_country">Loaves:</label>
              <input type="number" id="loaf_country" name="loaf_country" min="0" max="6" value="1">
            </div>
          </div>
          <div class="cb-menu-item">
            <div>
              <div class="cb-item-title">Seeded Spelt &amp; Rye Batard (750g) — £5.10</div>
              <div class="cb-item-desc">Whole spelt with dark rye levain, toasted sunflower, pumpkin, and brown flaxseed.</div>
            </div>
            <div class="cb-qty-field">
              <label for="loaf_spelt">Loaves:</label>
              <input type="number" id="loaf_spelt" name="loaf_spelt" min="0" max="6" value="1">
            </div>
          </div>
          <div class="cb-menu-item">
            <div>
              <div class="cb-item-title">Kalamata Olive &amp; Fresh Rosemary (800g) — £5.40</div>
              <div class="cb-item-desc">Packed with whole pitted Greek olives, garden rosemary, and organic extra virgin olive oil.</div>
            </div>
            <div class="cb-qty-field">
              <label for="loaf_olive">Loaves:</label>
              <input type="number" id="loaf_olive" name="loaf_olive" min="0" max="4" value="0">
            </div>
          </div>
          <div class="cb-menu-item">
            <div>
              <div class="cb-item-title">Cardamom Morning Buns (Box of 4) — £7.00</div>
              <div class="cb-item-desc">Swedish style sourdough laminated buns spiced with freshly crushed green cardamom.</div>
            </div>
            <div class="cb-qty-field">
              <label for="cardamom_box">Boxes:</label>
              <input type="number" id="cardamom_box" name="cardamom_box" min="0" max="4" value="0">
            </div>
          </div>
          <div class="cb-order-form">
            <h3 style="font-size:1.1rem;color:var(--cb-bread);margin-bottom:0.75rem">Collection Details</h3>
            <div class="cb-field">
              <label for="customer_name">Customer Name</label>
              <input type="text" id="customer_name" name="customer_name" required placeholder="Clara Oswald">
            </div>
            <div class="cb-field">
              <label for="customer_phone">Mobile Number for SMS Collection Alert</label>
              <input type="tel" id="customer_phone" name="customer_phone" required placeholder="07700 900221">
            </div>
            <div class="cb-field">
              <label for="pickup_window">Friday Collection Slot</label>
              <select id="pickup_window" name="pickup_window" required>
                <option value="window-1">Early Afternoon: 14:00 - 16:00</option>
                <option value="window-2" selected>Late Afternoon: 16:00 - 18:30</option>
                <option value="window-3">Evening Porch Box: 18:30 - 20:00</option>
              </select>
            </div>
            <button type="submit" class="cb-btn">Place Weekly Bread Order</button>
          </div>
        </form>
      </section>
      <aside class="cb-card">
        <h2 style="font-size:1.2rem;color:var(--cb-bread);margin-bottom:0.75rem">Bakehouse Notes</h2>
        <p style="font-family:-apple-system,sans-serif;font-size:0.85rem;color:#78716c;margin-bottom:1rem">Orders lock Wednesday at 20:00 to allow 28-hour slow levain feeding and fermentation.</p>
        <div style="font-family:-apple-system,sans-serif;background:#fffbeb;border:1px solid #fef3c7;padding:0.75rem;border-radius:6px;font-size:0.85rem">
          <strong>Porch Collection:</strong> Pick up directly from our bakery hatch at 22 Baker's Lane. Bring your own bread bag or tea towel to keep loaves crisp.
        </div>
      </aside>
    </main>
    <footer class="cb-foot">
      <p>Crust &amp; Crumb Micro-Bakery • Artisan Sourdough • Smallholder Flour Mill Partner</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-12: Local heat pump and solar installer apprenticeships (job-board)
  {
    family_id: 'tr-12',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CleanTech Trades Network — Heat Pump &amp; Solar Apprenticeships</title>
  <style>
    :root {
      --ct-slate: #0f172a;
      --ct-surface: #1e293b;
      --ct-teal: #0d9488;
      --ct-amber: #f59e0b;
      --ct-border: #334155;
      --ct-text: #f8fafc;
      --ct-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ct-slate); color: var(--ct-text); line-height: 1.5; padding: 1.5rem; }
    .ct-shell { max-width: 1200px; margin: 0 auto; }
    header.ct-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--ct-teal); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .ct-brand { font-size: 1.35rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    nav.ct-nav a { text-decoration: none; color: var(--ct-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.ct-nav a[aria-current="page"] { color: var(--ct-teal); border-bottom: 2px solid var(--ct-teal); padding-bottom: 0.2rem; }
    .ct-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .ct-card { background: var(--ct-surface); border: 1px solid var(--ct-border); border-radius: 8px; padding: 1.5rem; }
    .ct-card h1, .ct-card h2 { font-size: 1.4rem; color: #fff; margin-bottom: 0.75rem; }
    .ct-job-item { background: #0f172a; border: 1px solid var(--ct-border); border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
    .ct-job-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem; }
    .ct-job-title { font-size: 1.1rem; font-weight: 700; color: var(--ct-teal); }
    .ct-wage-badge { background: rgba(245,158,11,0.15); color: var(--ct-amber); font-size: 0.8rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; }
    .ct-job-meta { font-size: 0.85rem; color: var(--ct-muted); margin-bottom: 0.5rem; }
    .ct-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .ct-field label { font-size: 0.85rem; font-weight: 600; color: var(--ct-muted); }
    .ct-field input, .ct-field select, .ct-field textarea { background: #0f172a; border: 1px solid var(--ct-border); color: #fff; padding: 0.6rem; border-radius: 6px; font-size: 0.95rem; }
    .ct-btn { background: var(--ct-teal); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .ct-btn:hover { background: #0f766e; }
    footer.ct-foot { margin-top: 2.5rem; border-top: 1px solid var(--ct-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--ct-muted); }
  </style>
</head>
<body>
  <div class="ct-shell">
    <header class="ct-head">
      <div class="ct-brand">⚡ CleanTech Trades Network</div>
      <nav class="ct-nav" aria-label="Job Board Nav">
        <a href="/">Trade Overview</a>
        <a href="/jobs" aria-current="page">Apprenticeship Vacancies</a>
        <a href="/employers">Contractor Network</a>
        <a href="/applications">Candidate Status</a>
      </nav>
    </header>
    <main class="ct-grid">
      <section class="ct-card">
        <h1>Renewable Energy Apprenticeship Opportunities</h1>
        <div style="display:flex;gap:0.5rem;margin-bottom:1.25rem">
          <input type="search" id="trade-search" placeholder="Search vacancies by location or skill..." style="flex:1;background:#0f172a;border:1px solid var(--ct-border);color:#fff;padding:0.5rem;border-radius:4px">
        </div>
        <div class="ct-job-item">
          <div class="ct-job-header">
            <div class="ct-job-title">Level 3 Heat Pump Installation Technician Apprentice</div>
            <span class="ct-wage-badge">£18,500 - £22,000 / yr</span>
          </div>
          <div class="ct-job-meta">Apex Geothermal &amp; Air Solutions • Exeter &amp; East Devon</div>
          <p style="font-size:0.9rem;color:var(--ct-muted)">4-day work placement + 1-day block release college study. Learn hydronic balancing, refrigerant loop testing, and MCS compliance.</p>
        </div>
        <div class="ct-job-item">
          <div class="ct-job-header">
            <div class="ct-job-title">Commercial Solar PV &amp; Battery Storage Trainee</div>
            <span class="ct-wage-badge">£19,000 / yr</span>
          </div>
          <div class="ct-job-meta">Solaria Commercial Systems • Taunton Depot</div>
          <p style="font-size:0.9rem;color:var(--ct-muted)">Rooftop mounting systems, DC string wiring, inverter commissioning, and grid tie isolation procedures.</p>
        </div>
      </section>
      <aside class="ct-card">
        <h2>Submit Candidate Application</h2>
        <form id="apprentice-application" method="post" action="/jobs/apply">
          <div class="ct-field">
            <label for="applicant_name">Candidate Full Name</label>
            <input type="text" id="applicant_name" name="applicant_name" required placeholder="Liam Brooks">
          </div>
          <div class="ct-field">
            <label for="applicant_email">Email Address</label>
            <input type="email" id="applicant_email" name="applicant_email" required placeholder="liam@example.test">
          </div>
          <div class="ct-field">
            <label for="target_trade">Target Discipline</label>
            <select id="target_trade" name="target_trade" required>
              <option value="heat-pumps" selected>Air Source / Ground Source Heat Pumps</option>
              <option value="solar-pv">Solar Photovoltaic &amp; Battery Systems</option>
              <option value="ev-charging">Commercial EV Charging Infrastructure</option>
            </select>
          </div>
          <div class="ct-field">
            <label for="qualifications_summary">GCSE / Technical Qualifications</label>
            <textarea id="qualifications_summary" name="qualifications_summary" rows="3" placeholder="e.g. GCSE Maths &amp; English Grade 5+, City &amp; Guilds Level 2 Plumbing or Electrical diploma." required></textarea>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;margin:0.5rem 0">
            <input type="checkbox" id="driver_license" name="driver_license" value="yes">
            <label for="driver_license" style="font-size:0.85rem">Holds Full UK Manual Driving Licence</label>
          </div>
          <button type="submit" class="ct-btn">Submit Trainee Application</button>
        </form>
      </aside>
    </main>
    <footer class="ct-foot">
      <p>CleanTech Trades Network • In partnership with Green Skills Training Accord • Supported by Dept for Net Zero</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-13: Backyard composting guidelines and soil test registry (docs-site)
  {
    family_id: 'tr-13',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Urban Soil Collaborative — Composting Handbook &amp; Soil Test Registry</title>
  <style>
    :root {
      --us-earth: #3b251a;
      --us-leaf: #15803d;
      --us-straw: #fef08a;
      --us-card: #ffffff;
      --us-border: #e7e5e4;
      --us-text: #292524;
      --us-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafaf9; color: var(--us-text); line-height: 1.5; padding: 1.5rem; }
    .us-wrap { max-width: 1200px; margin: 0 auto; }
    header.us-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--us-leaf); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .us-brand { font-size: 1.4rem; font-weight: 800; color: var(--us-earth); }
    nav.us-nav a { text-decoration: none; color: var(--us-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.us-nav a[aria-current="page"] { color: var(--us-leaf); border-bottom: 2px solid var(--us-leaf); padding-bottom: 0.2rem; }
    .us-layout { display: grid; grid-template-columns: 260px 1fr 340px; gap: 1.75rem; align-items: start; }
    .us-sidebar { background: var(--us-card); border: 1px solid var(--us-border); border-radius: 8px; padding: 1.25rem; }
    .us-sidebar h3 { font-size: 0.95rem; text-transform: uppercase; color: var(--us-muted); margin-bottom: 0.75rem; letter-spacing: 0.5px; }
    .us-nav-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem; }
    .us-nav-list a { text-decoration: none; color: var(--us-text); }
    .us-nav-list a.active { color: var(--us-leaf); font-weight: 700; }
    .us-content { background: var(--us-card); border: 1px solid var(--us-border); border-radius: 8px; padding: 1.75rem; }
    .us-content h1 { font-size: 1.6rem; color: var(--us-earth); margin-bottom: 0.75rem; }
    .us-reg-form { background: var(--us-card); border: 1px solid var(--us-border); border-radius: 8px; padding: 1.5rem; }
    .us-reg-form h2 { font-size: 1.25rem; color: var(--us-leaf); margin-bottom: 0.5rem; }
    .us-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .us-field label { font-size: 0.85rem; font-weight: 600; color: var(--us-text); }
    .us-field input, .us-field select { padding: 0.55rem; border: 1px solid var(--us-border); border-radius: 6px; font-size: 0.95rem; }
    .us-btn { background: var(--us-leaf); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; cursor: pointer; width: 100%; }
    .us-btn:hover { background: #166534; }
    footer.us-foot { margin-top: 2.5rem; border-top: 1px solid var(--us-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--us-muted); }
  </style>
</head>
<body>
  <div class="us-wrap">
    <header class="us-head">
      <div class="us-brand">🌱 Urban Soil Collaborative</div>
      <nav class="us-nav" aria-label="Docs Nav">
        <a href="/docs" aria-current="page">Handbook Chapters</a>
        <a href="/soil-tests">Community Soil Registry</a>
        <a href="/workshops">Compost Bins</a>
      </nav>
    </header>
    <main class="us-layout">
      <aside class="us-sidebar">
        <h3>Handbook Sections</h3>
        <ul class="us-nav-list">
          <li><a href="#carbon-nitrogen" class="active">1. The 30:1 C:N Ratio</a></li>
          <li><a href="#moisture">2. Moisture &amp; The Squeeze Test</a></li>
          <li><a href="#turning">3. Hot Piles vs Cold Turning</a></li>
          <li><a href="#troubleshooting">4. Odour &amp; Fly Troubleshooting</a></li>
          <li><a href="#testing">5. Testing Finished Humus</a></li>
        </ul>
      </aside>
      <article class="us-content">
        <h1>Compost Balancing: Carbon Greens &amp; Nitrogen Browns</h1>
        <p style="color:#57534e;margin-bottom:1rem">Achieving rapid aerobic breakdown without foul anaerobic odours requires a carbon-to-nitrogen ratio of approximately 30 parts carbon to 1 part nitrogen by dry weight.</p>
        <h2 style="font-size:1.2rem;color:var(--us-earth);margin-top:1.25rem;margin-bottom:0.5rem">High-Carbon Browns (Energy Source)</h2>
        <ul style="padding-left:1.2rem;font-size:0.9rem;color:#44403c;margin-bottom:1rem">
          <li>Dried autumn deciduous leaves (60:1 ratio)</li>
          <li>Untreated sawdust and wood shavings (400:1 ratio)</li>
          <li>Shredded unbleached corrugated cardboard (350:1 ratio)</li>
        </ul>
        <h2 style="font-size:1.2rem;color:var(--us-earth);margin-top:1.25rem;margin-bottom:0.5rem">High-Nitrogen Greens (Microbial Food)</h2>
        <ul style="padding-left:1.2rem;font-size:0.9rem;color:#44403c">
          <li>Fresh grass clippings and green garden trimmings (20:1 ratio)</li>
          <li>Raw vegetable kitchen scraps and coffee grounds (20:1 ratio)</li>
          <li>Well-rotted poultry or horse manure (15:1 ratio)</li>
        </ul>
      </article>
      <section class="us-reg-form">
        <h2>Submit Plot Soil Test</h2>
        <p style="font-size:0.85rem;color:var(--us-muted);margin-bottom:1rem">Contribute measurements from your community garden raised beds or allotment.</p>
        <form id="soil-test-entry" method="post" action="/soil-tests/new">
          <div class="us-field">
            <label for="plot_sector">Allotment / Garden Plot Identifier</label>
            <input type="text" id="plot_sector" name="plot_sector" required placeholder="Plot 14-B (South Allotments)">
          </div>
          <div class="us-field">
            <label for="soil_ph">Measured Soil pH</label>
            <input type="number" id="soil_ph" name="soil_ph" step="0.1" min="4.0" max="9.0" value="6.8" required>
          </div>
          <div class="us-field">
            <label for="organic_matter">Organic Matter Percentage (%)</label>
            <input type="number" id="organic_matter" name="organic_matter" step="0.5" min="1" max="30" value="8.5" required>
          </div>
          <div class="us-field">
            <label for="sample_date">Sampling Date</label>
            <input type="date" id="sample_date" name="sample_date" value="2026-10-12" required>
          </div>
          <button type="submit" class="us-btn">Record Soil Measurement</button>
        </form>
      </section>
    </main>
    <footer class="us-foot">
      <p>Urban Soil Collaborative • Community Composting &amp; Soil Regeneration Network • Open Research Licence</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-14: Self-guided heritage walking tour stops and transcripts (directory-listing)
  {
    family_id: 'tr-14',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stonegate Heritage Trail — Historical Stops &amp; Audio Transcripts</title>
  <style>
    :root {
      --st-plum: #581c87;
      --st-gold: #b45309;
      --st-sand: #f5f5f4;
      --st-card: #ffffff;
      --st-border: #e7e5e4;
      --st-text: #292524;
      --st-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: #fafaf9; color: var(--st-text); line-height: 1.5; padding: 1.5rem; }
    .st-shell { max-width: 1200px; margin: 0 auto; }
    header.st-head { border-bottom: 2px solid var(--st-plum); padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
    .st-brand { font-size: 1.45rem; font-weight: 700; color: var(--st-plum); }
    nav.st-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: var(--st-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.st-nav a[aria-current="page"] { color: var(--st-plum); text-decoration: underline; }
    .st-grid { display: grid; grid-template-columns: 320px 1fr 340px; gap: 1.75rem; align-items: start; }
    .st-stops-list { background: var(--st-card); border: 1px solid var(--st-border); border-radius: 8px; padding: 1.25rem; }
    .st-stops-list h3 { font-size: 1rem; color: var(--st-plum); margin-bottom: 0.75rem; }
    .st-stop-item { padding: 0.75rem; border-radius: 6px; margin-bottom: 0.5rem; background: var(--st-sand); }
    .st-stop-item.active { border-left: 4px solid var(--st-plum); background: #f3e8ff; }
    .st-stop-num { font-size: 0.75rem; font-weight: 700; color: var(--st-plum); font-family: -apple-system, sans-serif; }
    .st-stop-title { font-weight: 700; font-size: 0.95rem; }
    .st-transcript-card { background: var(--st-card); border: 1px solid var(--st-border); border-radius: 8px; padding: 1.75rem; }
    .st-transcript-card h1 { font-size: 1.5rem; color: var(--st-plum); margin-bottom: 0.5rem; }
    .st-comment-card { background: var(--st-card); border: 1px solid var(--st-border); border-radius: 8px; padding: 1.5rem; }
    .st-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; font-family: -apple-system, sans-serif; }
    .st-field label { font-size: 0.85rem; font-weight: 600; color: var(--st-text); }
    .st-field input, .st-field textarea { padding: 0.55rem; border: 1px solid var(--st-border); border-radius: 6px; font-size: 0.95rem; }
    .st-btn { font-family: -apple-system, sans-serif; background: var(--st-plum); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; cursor: pointer; width: 100%; }
    .st-btn:hover { background: #6b21a8; }
    footer.st-foot { margin-top: 2.5rem; border-top: 1px solid var(--st-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--st-muted); }
  </style>
</head>
<body>
  <div class="st-shell">
    <header class="st-head">
      <div class="st-brand">Stonegate Heritage Trail</div>
      <nav class="st-nav" aria-label="Trail Nav">
        <a href="/">Trail Map</a>
        <a href="/stops" aria-current="page">Waypoint Transcripts</a>
        <a href="/guide">Audio Downloads</a>
        <a href="/trust">Civic Trust</a>
      </nav>
    </header>
    <main class="st-grid">
      <aside class="st-stops-list">
        <h3>Tour Stops (1.8 Miles Total)</h3>
        <div class="st-stop-item active">
          <div class="st-stop-num">STOP 01 • 0.0 MILES</div>
          <div class="st-stop-title">The Old Guildhall (1642)</div>
        </div>
        <div class="st-stop-item">
          <div class="st-stop-num">STOP 02 • 0.3 MILES</div>
          <div class="st-stop-title">Millrace Weir &amp; Waterwheel</div>
        </div>
        <div class="st-stop-item">
          <div class="st-stop-num">STOP 03 • 0.7 MILES</div>
          <div class="st-stop-title">Tanner’s Row &amp; Vats</div>
        </div>
        <div class="st-stop-item">
          <div class="st-stop-num">STOP 04 • 1.2 MILES</div>
          <div class="st-stop-title">St. Martin’s Almshouses</div>
        </div>
      </aside>
      <article class="st-transcript-card">
        <h1>Stop 1: The Old Guildhall (Built 1642)</h1>
        <p style="font-style:italic;color:var(--st-muted);margin-bottom:1.25rem">Transcript of narration by Civic Historian Margaret Bell (Recorded Sept 2026)</p>
        <p style="font-size:0.95rem;color:#44403c;margin-bottom:1rem">"Standing before the twin jettied gables of the Guildhall, one is looking directly at English oak timber framing that survived the Great Fire of 1684. The upper chamber served as the wool merchants' woolstaple weighing room."</p>
        <p style="font-size:0.95rem;color:#44403c;margin-bottom:1rem">"Notice the leaded casement windows: the small diamond panes were salvaged from the earlier 14th-century guild chapel. Beneath the carriage arch, the original iron-shod oak gates still hang from hand-forged strap hinges."</p>
      </article>
      <section class="st-comment-card">
        <h2 style="font-size:1.25rem;color:var(--st-plum);margin-bottom:0.5rem">Visitor Reflection</h2>
        <p style="font-family:-apple-system,sans-serif;font-size:0.85rem;color:var(--st-muted);margin-bottom:1rem">Contribute a family memory or architectural observation for this heritage stop.</p>
        <form id="trail-comment-form" method="post" action="/stops/1/comment">
          <div class="st-field">
            <label for="visitor_name">Your Name</label>
            <input type="text" id="visitor_name" name="visitor_name" required placeholder="Arthur Pendelton">
          </div>
          <div class="st-field">
            <label for="visitor_note">Historical Memory or Architectural Note</label>
            <textarea id="visitor_note" name="visitor_note" rows="3" required placeholder="e.g. My great-grandfather worked the wool scale on the ground floor in 1912..."></textarea>
          </div>
          <button type="submit" class="st-btn">Record Visitor Memory</button>
        </form>
      </section>
    </main>
    <footer class="st-foot">
      <p>Stonegate Heritage Civic Trust • Registered Charity #11094 • Self-Guided Trail Supported by National Lottery</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-15: Tenant collective maintenance expense logging (expense-tracker)
  {
    family_id: 'tr-15',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Oakridge Tenant Co-operative — Maintenance Ledger &amp; Expenses</title>
  <style>
    :root {
      --ot-slate: #1e293b;
      --ot-brick: #b91c1c;
      --ot-card: #ffffff;
      --ot-border: #cbd5e1;
      --ot-bg: #f8fafc;
      --ot-text: #0f172a;
      --ot-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ot-bg); color: var(--ot-text); line-height: 1.5; padding: 1.5rem; }
    .ot-wrap { max-width: 1200px; margin: 0 auto; }
    header.ot-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--ot-slate); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .ot-brand { font-size: 1.35rem; font-weight: 800; color: var(--ot-slate); }
    nav.ot-nav a { text-decoration: none; color: var(--ot-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.ot-nav a[aria-current="page"] { color: var(--ot-slate); border-bottom: 2px solid var(--ot-brick); padding-bottom: 0.2rem; }
    .ot-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .ot-box { background: var(--ot-card); border: 1px solid var(--ot-border); border-radius: 8px; padding: 1.5rem; }
    .ot-box h1, .ot-box h2 { font-size: 1.35rem; color: var(--ot-slate); margin-bottom: 0.75rem; }
    table.ot-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    table.ot-table th, table.ot-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--ot-border); text-align: left; }
    table.ot-table th { background: #f1f5f9; color: var(--ot-slate); }
    .ot-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .ot-field label { font-size: 0.85rem; font-weight: 600; color: var(--ot-text); }
    .ot-field input, .ot-field select { padding: 0.55rem; border: 1px solid var(--ot-border); border-radius: 6px; font-size: 0.95rem; }
    .ot-btn { background: var(--ot-slate); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .ot-btn:hover { background: #0f172a; }
    footer.ot-foot { margin-top: 2.5rem; border-top: 1px solid var(--ot-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--ot-muted); }
  </style>
</head>
<body>
  <div class="ot-wrap">
    <header class="ot-head">
      <div class="ot-brand">Oakridge Tenant Co-operative (12 Flats)</div>
      <nav class="ot-nav" aria-label="Ledger Nav">
        <a href="/">Building Charter</a>
        <a href="/expenses" aria-current="page">Maintenance Ledger</a>
        <a href="/expenses/new">Log Expense</a>
        <a href="/audit">Annual Accounts</a>
      </nav>
    </header>
    <main class="ot-grid">
      <section class="ot-box">
        <h1>Communal Maintenance Ledger (Q4 2026)</h1>
        <div style="background:#f1f5f9;padding:0.75rem;border-radius:6px;margin-bottom:1rem;display:flex;justify-content:space-between">
          <span><strong>Quarterly Budget:</strong> £2,400.00</span>
          <span><strong>Total Logged Spend:</strong> £1,142.80</span>
          <span><strong>Remaining Reserve:</strong> £1,257.20</span>
        </div>
        <table class="ot-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Vendor / Description</th>
              <th>Amount</th>
              <th>Flat</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>02 Oct</td>
              <td>Plumbing</td>
              <td>Draindoc Ltd — Gully clearing</td>
              <td>£185.00</td>
              <td>Flat 3</td>
            </tr>
            <tr>
              <td>06 Oct</td>
              <td>Lighting</td>
              <td>Rexel Electrical — 6x LED tubes</td>
              <td>£48.60</td>
              <td>Flat 7</td>
            </tr>
            <tr>
              <td>11 Oct</td>
              <td>Grounds</td>
              <td>Greenleaf — Winter shrub pruning</td>
              <td>£220.00</td>
              <td>Flat 1</td>
            </tr>
          </tbody>
        </table>
      </section>
      <aside class="ot-box">
        <h2>Log Communal Expenditure</h2>
        <form id="expense-log-form" method="post" action="/expenses/new">
          <div class="ot-field">
            <label for="expense_date">Date of Purchase</label>
            <input type="date" id="expense_date" name="expense_date" value="2026-10-14" required>
          </div>
          <div class="ot-field">
            <label for="category">Maintenance Category</label>
            <select id="category" name="category" required>
              <option value="plumbing">Plumbing &amp; Water Services</option>
              <option value="electrical">Lighting &amp; Security Intercom</option>
              <option value="grounds">Garden &amp; Refuse Area Upkeep</option>
              <option value="winter-salt">Winter De-Icing &amp; Gritting</option>
              <option value="locks">Door Closer &amp; Lock Servicing</option>
            </select>
          </div>
          <div class="ot-field">
            <label for="vendor">Merchant / Contractor Name</label>
            <input type="text" id="vendor" name="vendor" required placeholder="Screwfix / Local Hardware">
          </div>
          <div class="ot-field">
            <label for="amount">Total Amount (£)</label>
            <input type="number" id="amount" name="amount" step="0.01" min="0.01" required placeholder="34.50">
          </div>
          <div class="ot-field">
            <label for="resident_flat">Resident Submitting (Flat Number)</label>
            <input type="text" id="resident_flat" name="resident_flat" required placeholder="Flat 4">
          </div>
          <button type="submit" class="ot-btn">Add Expense to Co-op Ledger</button>
        </form>
      </aside>
    </main>
    <footer class="ot-foot">
      <p>Oakridge Tenant Co-operative Society • Self-Managed Tenancy • Registered Mutual #29401</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-16: Rare perennial cuttings and seed strain index (library-catalogue)
  {
    family_id: 'tr-16',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Heirloom Perennial Repository — Cuttings &amp; Seed Strain Index</title>
  <style>
    :root {
      --hp-sage: #15803d;
      --hp-purple: #7c3aed;
      --hp-card: #ffffff;
      --hp-border: #e2e8f0;
      --hp-bg: #f8fafc;
      --hp-text: #1e293b;
      --hp-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--hp-bg); color: var(--hp-text); line-height: 1.5; padding: 1.5rem; }
    .hp-shell { max-width: 1200px; margin: 0 auto; }
    header.hp-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--hp-sage); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .hp-brand { font-size: 1.4rem; font-weight: 700; color: var(--hp-sage); }
    nav.hp-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: var(--hp-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.hp-nav a[aria-current="page"] { color: var(--hp-sage); text-decoration: underline; }
    .hp-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .hp-card { background: var(--hp-card); border: 1px solid var(--hp-border); border-radius: 8px; padding: 1.5rem; }
    .hp-card h1, .hp-card h2 { font-size: 1.35rem; color: var(--hp-sage); margin-bottom: 0.75rem; }
    .hp-filter-bar { display: flex; gap: 1rem; margin-bottom: 1.25rem; font-family: -apple-system, sans-serif; }
    .hp-field { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
    .hp-field label { font-size: 0.85rem; font-weight: 600; color: var(--hp-text); }
    .hp-field input, .hp-field select { padding: 0.55rem; border: 1px solid var(--hp-border); border-radius: 6px; font-size: 0.95rem; }
    table.hp-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; font-family: -apple-system, sans-serif; }
    table.hp-table th, table.hp-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--hp-border); text-align: left; }
    table.hp-table th { background: #f1f5f9; color: var(--hp-text); font-weight: 700; }
    .hp-btn { font-family: -apple-system, sans-serif; background: var(--hp-sage); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .hp-btn:hover { background: #166534; }
    footer.hp-foot { margin-top: 2.5rem; border-top: 1px solid var(--hp-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--hp-muted); }
  </style>
</head>
<body>
  <div class="hp-shell">
    <header class="hp-head">
      <div class="hp-brand">Heirloom Perennial Repository</div>
      <nav class="hp-nav" aria-label="Repository Nav">
        <a href="/">About the Seed Bank</a>
        <a href="/cultivars" aria-current="page">Living Cultivars</a>
        <a href="/request">Request Cuttings</a>
        <a href="/requests">Collection Slips</a>
      </nav>
    </header>
    <main class="hp-grid">
      <section class="hp-card">
        <h1>Rare Perennial Cultivars &amp; Propagation Bank</h1>
        <div class="hp-filter-bar">
          <div class="hp-field">
            <label for="sun_exposure">Sun Exposure</label>
            <select id="sun_exposure" name="sun_exposure">
              <option value="full-sun" selected>Full Sun (6+ hrs daily)</option>
              <option value="part-shade">Partial Shade</option>
              <option value="damp-shade">Damp Woodland Shade</option>
            </select>
          </div>
          <div class="hp-field">
            <label for="season">Flowering Season</label>
            <select id="season" name="season">
              <option value="summer">Late Summer</option>
              <option value="autumn" selected>Autumn (Sept - Nov)</option>
              <option value="spring">Early Spring</option>
            </select>
          </div>
        </div>
        <table class="hp-table">
          <thead>
            <tr>
              <th>Botanical Name</th>
              <th>Common Name</th>
              <th>Soil</th>
              <th>Cuttings Available</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><em>Salvia confertiflora</em></td>
              <td>Red Velvet Sage</td>
              <td>Well-drained</td>
              <td><strong>6 bundles</strong></td>
            </tr>
            <tr>
              <td><em>Echinacea pallida</em> 'Hula Dancer'</td>
              <td>Pale Purple Coneflower</td>
              <td>Chalky loam</td>
              <td><strong>12 bundles</strong></td>
            </tr>
            <tr>
              <td><em>Actaea matsumurae</em></td>
              <td>White Pearl Bugbane</td>
              <td>Moist humus</td>
              <td><strong>4 bundles</strong></td>
            </tr>
          </tbody>
        </table>
      </section>
      <aside class="hp-card">
        <h2>Reserve Propagation Cuttings</h2>
        <form id="cutting-request-form" method="post" action="/request">
          <div class="hp-field" style="margin-bottom:0.85rem">
            <label for="member_id">Botanical Society Member ID</label>
            <input type="text" id="member_id" name="member_id" required placeholder="HPR-302">
          </div>
          <div class="hp-field" style="margin-bottom:0.85rem">
            <label for="specimen_name">Specimen Variety Requested</label>
            <input type="text" id="specimen_name" name="specimen_name" required value="Salvia confertiflora">
          </div>
          <div class="hp-field" style="margin-bottom:0.85rem">
            <label for="quantity">Number of Stem Cuttings</label>
            <input type="number" id="quantity" name="quantity" min="1" max="5" value="2" required>
          </div>
          <div class="hp-field" style="margin-bottom:0.85rem">
            <label for="pickup_date">Collection Date from Glasshouse</label>
            <input type="date" id="pickup_date" name="pickup_date" value="2026-10-22" required>
          </div>
          <button type="submit" class="hp-btn">Submit Cutting Reservation</button>
        </form>
      </aside>
    </main>
    <footer class="hp-foot">
      <p>Heirloom Perennial Repository • Conservation Glasshouses, Devon • Dedicated to Plant Genetic Biodiversity</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-17: Rural farm animal vet visit scheduling (booking)
  {
    family_id: 'tr-17',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Valley &amp; Moor Livestock Veterinary — Ambulatory Farm Visit Booking</title>
  <style>
    :root {
      --vm-green: #14532d;
      --vm-rust: #991b1b;
      --vm-straw: #fef9c3;
      --vm-card: #ffffff;
      --vm-border: #cbd5e1;
      --vm-bg: #f8fafc;
      --vm-text: #0f172a;
      --vm-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--vm-bg); color: var(--vm-text); line-height: 1.5; padding: 1.5rem; }
    .vm-wrap { max-width: 1200px; margin: 0 auto; }
    header.vm-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--vm-green); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .vm-brand { font-size: 1.35rem; font-weight: 800; color: var(--vm-green); }
    nav.vm-nav a { text-decoration: none; color: var(--vm-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.vm-nav a[aria-current="page"] { color: var(--vm-green); border-bottom: 2px solid var(--vm-green); padding-bottom: 0.2rem; }
    .vm-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .vm-card { background: var(--vm-card); border: 1px solid var(--vm-border); border-radius: 8px; padding: 1.75rem; }
    .vm-card h1 { font-size: 1.5rem; color: var(--vm-green); margin-bottom: 0.5rem; }
    .vm-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .vm-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .vm-field label { font-size: 0.85rem; font-weight: 600; color: var(--vm-text); }
    .vm-field input, .vm-field select, .vm-field textarea { padding: 0.6rem; border: 1px solid var(--vm-border); border-radius: 6px; font-size: 0.95rem; }
    .vm-btn { background: var(--vm-green); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .vm-btn:hover { background: #166534; }
    .vm-urgent-banner { background: #fee2e2; border-left: 4px solid var(--vm-rust); padding: 0.75rem; border-radius: 4px; margin-bottom: 1.25rem; font-size: 0.85rem; color: #991b1b; }
    footer.vm-foot { margin-top: 2.5rem; border-top: 1px solid var(--vm-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--vm-muted); }
  </style>
</head>
<body>
  <div class="vm-wrap">
    <header class="vm-head">
      <div class="vm-brand">Valley &amp; Moor Livestock Veterinary</div>
      <nav class="vm-nav" aria-label="Practice Nav">
        <a href="/">Practice Team</a>
        <a href="/services">Clinical Services</a>
        <a href="/book-visit" aria-current="page">Book Farm Call</a>
        <a href="/visits">Dispatch Board</a>
      </nav>
    </header>
    <main class="vm-grid">
      <section class="vm-card">
        <h1>Schedule On-Site Veterinary Farm Visit</h1>
        <div class="vm-urgent-banner">
          <strong>Emergency Cases:</strong> For prolapse, severe bloat, or acute downer cows, call the 24hr duty vet immediately on 07700 900888 rather than booking online.
        </div>
        <form id="farm-visit-form" method="post" action="/book-visit">
          <div class="vm-row-2">
            <div class="vm-field">
              <label for="cph_number">County Parish Holding (CPH) Number</label>
              <input type="text" id="cph_number" name="cph_number" required placeholder="36/142/0081">
            </div>
            <div class="vm-field">
              <label for="farm_name">Farm Holding Name &amp; Contact</label>
              <input type="text" id="farm_name" name="farm_name" required placeholder="Highland Lea Farm (Mr. Evans)">
            </div>
          </div>
          <div class="vm-row-2">
            <div class="vm-field">
              <label for="species">Primary Species Requiring Examination</label>
              <select id="species" name="species" required>
                <option value="dairy-cattle">Dairy Herd (Mastitis, Fertility, Lameness)</option>
                <option value="beef-cattle">Beef Suckler Herd</option>
                <option value="sheep" selected>Sheep Flock (Pregnancy scan, Foot rot)</option>
                <option value="equine">Equine / Horse Checkup</option>
                <option value="swine">Swine / Commercial Pigs</option>
              </select>
            </div>
            <div class="vm-field">
              <label for="headcount">Estimated Number of Animals</label>
              <input type="number" id="headcount" name="headcount" min="1" max="250" value="8" required>
            </div>
          </div>
          <div class="vm-row-2">
            <div class="vm-field">
              <label for="visit_date">Requested Date</label>
              <input type="date" id="visit_date" name="visit_date" value="2026-10-16" required>
            </div>
            <div class="vm-field">
              <label for="dispatch_slot">Visit Window</label>
              <select id="dispatch_slot" name="dispatch_slot" required>
                <option value="morning">Morning Routine (08:30 - 12:00)</option>
                <option value="afternoon">Afternoon (13:00 - 16:30)</option>
              </select>
            </div>
          </div>
          <div class="vm-field">
            <label for="emergency_phone">On-Farm Contact Phone (Required)</label>
            <input type="tel" id="emergency_phone" name="emergency_phone" required placeholder="07700 900665">
          </div>
          <div class="vm-field">
            <label for="symptoms_summary">Symptoms, Herd History &amp; Access Notes</label>
            <textarea id="symptoms_summary" name="symptoms_summary" rows="3" required placeholder="e.g. 8 ewes showing signs of contagious ovine digital dermatitis in lower pasture. Crush available in home barn. Gate code 4491."></textarea>
          </div>
          <button type="submit" class="vm-btn">Confirm Veterinary Dispatch Request</button>
        </form>
      </section>
      <aside class="vm-card">
        <h2 style="font-size:1.2rem;color:var(--vm-green);margin-bottom:0.75rem">Biosecurity Protocol</h2>
        <p style="font-size:0.85rem;color:var(--vm-muted);margin-bottom:1rem">Our clinical team enforces strict Defra vehicle disinfection protocols between farm visits.</p>
        <ul style="font-size:0.85rem;color:#475569;display:flex;flex-direction:column;gap:0.4rem;padding-left:1.2rem">
          <li>Fresh protective overalls donned at every holding gate</li>
          <li>Virkon S boot dip bath performed on arrival and departure</li>
          <li>Full electronic veterinary medicine administration record provided</li>
        </ul>
      </aside>
    </main>
    <footer class="vm-foot">
      <p>Valley &amp; Moor Livestock Veterinary Practice • RCVS Accredited Farm Practice • Dartmoor Road, Okehampton</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-18: Bring-your-own-container bulk dry goods orders (web-shop)
  {
    family_id: 'tr-18',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weigh &amp; Refill Zero Waste Pantry — Click &amp; Collect Bulk Staples</title>
  <style>
    :root {
      --wr-kraft: #78350f;
      --wr-green: #15803d;
      --wr-card: #ffffff;
      --wr-border: #e7e5e4;
      --wr-bg: #fafaf9;
      --wr-text: #292524;
      --wr-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--wr-bg); color: var(--wr-text); line-height: 1.5; padding: 1.5rem; }
    .wr-shell { max-width: 1200px; margin: 0 auto; }
    header.wr-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--wr-green); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .wr-brand { font-size: 1.35rem; font-weight: 800; color: var(--wr-green); }
    nav.wr-nav a { text-decoration: none; color: var(--wr-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.wr-nav a[aria-current="page"] { color: var(--wr-green); border-bottom: 2px solid var(--wr-green); padding-bottom: 0.2rem; }
    .wr-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; align-items: start; }
    .wr-card { background: var(--wr-card); border: 1px solid var(--wr-border); border-radius: 8px; padding: 1.5rem; }
    .wr-card h1, .wr-card h2 { font-size: 1.4rem; color: var(--wr-kraft); margin-bottom: 0.5rem; }
    .wr-item { display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid #f5f5f4; }
    .wr-item-title { font-weight: 700; font-size: 1rem; color: var(--wr-text); }
    .wr-item-desc { font-size: 0.8rem; color: var(--wr-muted); }
    .wr-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .wr-field label { font-size: 0.85rem; font-weight: 600; color: var(--wr-text); }
    .wr-field input, .wr-field select { padding: 0.55rem; border: 1px solid var(--wr-border); border-radius: 6px; font-size: 0.95rem; }
    .wr-btn { background: var(--wr-green); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .wr-btn:hover { background: #166534; }
    footer.wr-foot { margin-top: 2.5rem; border-top: 1px solid var(--wr-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--wr-muted); }
  </style>
</head>
<body>
  <div class="wr-shell">
    <header class="wr-head">
      <div class="wr-brand">♻ Weigh &amp; Refill Zero Waste Pantry</div>
      <nav class="wr-nav" aria-label="Pantry Nav">
        <a href="/">Refill Guide</a>
        <a href="/products" aria-current="page">Pantry Bulk Goods</a>
        <a href="/basket">My Refill Basket</a>
        <a href="/orders">Collection Slips</a>
      </nav>
    </header>
    <main class="wr-grid">
      <section class="wr-card">
        <h1>Pre-Pack Bulk Refill Order</h1>
        <p style="font-size:0.9rem;color:var(--wr-muted);margin-bottom:1rem">Select organic staples by weight in grams. Bring your clean dry jars or borrow sterilized pantry deposit jars on collection.</p>
        <form id="bulk-refill-form" method="post" action="/checkout">
          <div class="wr-item">
            <div>
              <div class="wr-item-title">Organic Rolled Jumbo Porridge Oats</div>
              <div class="wr-item-desc">British grown gluten-free certified oats • £0.35 per 100g</div>
            </div>
            <div style="display:flex;align-items:center;gap:0.4rem">
              <label for="weight_oats" style="font-size:0.85rem">Weight (g):</label>
              <input type="number" id="weight_oats" name="weight_oats" min="0" max="5000" step="50" value="750" style="width:75px;padding:0.4rem;border:1px solid #d6d3d1;border-radius:4px;text-align:center">
            </div>
          </div>
          <div class="wr-item">
            <div>
              <div class="wr-item-title">Organic Green French Puy Lentils</div>
              <div class="wr-item-desc">Puy variety whole lentils • £0.55 per 100g</div>
            </div>
            <div style="display:flex;align-items:center;gap:0.4rem">
              <label for="weight_lentils" style="font-size:0.85rem">Weight (g):</label>
              <input type="number" id="weight_lentils" name="weight_lentils" min="0" max="3000" step="50" value="500" style="width:75px;padding:0.4rem;border:1px solid #d6d3d1;border-radius:4px;text-align:center">
            </div>
          </div>
          <div class="wr-item">
            <div>
              <div class="wr-item-title">Raw California Organic Almonds</div>
              <div class="wr-item-desc">Unsalted, whole skin-on almonds • £1.20 per 100g</div>
            </div>
            <div style="display:flex;align-items:center;gap:0.4rem">
              <label for="weight_almonds" style="font-size:0.85rem">Weight (g):</label>
              <input type="number" id="weight_almonds" name="weight_almonds" min="0" max="2000" step="50" value="300" style="width:75px;padding:0.4rem;border:1px solid #d6d3d1;border-radius:4px;text-align:center">
            </div>
          </div>
          <div class="wr-item">
            <div>
              <div class="wr-item-title">Organic Brown Basmati Rice</div>
              <div class="wr-item-desc">Fairtrade long grain whole grain rice • £0.42 per 100g</div>
            </div>
            <div style="display:flex;align-items:center;gap:0.4rem">
              <label for="weight_rice" style="font-size:0.85rem">Weight (g):</label>
              <input type="number" id="weight_rice" name="weight_rice" min="0" max="5000" step="50" value="1000" style="width:75px;padding:0.4rem;border:1px solid #d6d3d1;border-radius:4px;text-align:center">
            </div>
          </div>
      </section>
      <aside class="wr-card">
        <h2>Jar Drop-off &amp; Collection</h2>
        <div class="wr-field">
          <label for="customer_name">Customer Name</label>
          <input type="text" id="customer_name" name="customer_name" required placeholder="Fiona Gallagher">
        </div>
        <div class="wr-field">
          <label for="customer_email">Email Address</label>
          <input type="email" id="customer_email" name="customer_email" required placeholder="fiona@example.test">
        </div>
        <div class="wr-field">
          <label for="refill_option">Container Arrangement</label>
          <select id="refill_option" name="refill_option" required>
            <option value="drop-off">I will drop off my labelled clean jars morning of pickup</option>
            <option value="deposit-jars">Borrow returnable deposit glass jars (£1/jar)</option>
            <option value="brown-bags">Pack into 100% recycled unbleached paper sacks</option>
          </select>
        </div>
        <div class="wr-field">
          <label for="pickup_slot">Collection Window</label>
          <select id="pickup_slot" name="pickup_slot" required>
            <option value="thu-pm">Thursday 15 Oct (14:00 - 18:00)</option>
            <option value="fri-pm">Friday 16 Oct (14:00 - 18:00)</option>
            <option value="sat-am">Saturday 17 Oct (10:00 - 14:00)</option>
          </select>
        </div>
        <button type="submit" class="wr-btn">Submit Pre-Pack Order</button>
        </form>
      </aside>
    </main>
    <footer class="wr-foot">
      <p>Weigh &amp; Refill Zero Waste Pantry • 19 Greenmarket Row • Plastic-Free Community Retail</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-19: Tidal river rowing skiff safety and tide tracker (booking)
  {
    family_id: 'tr-19',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Estuary Community Rowing Club — Skiff Outing &amp; Tide Safety Manifest</title>
  <style>
    :root {
      --rc-blue: #0369a1;
      --rc-ocean: #0c4a6e;
      --rc-orange: #ea580c;
      --rc-card: #ffffff;
      --rc-border: #bae6fd;
      --rc-bg: #f0fdfa;
      --rc-text: #0f172a;
      --rc-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--rc-bg); color: var(--rc-text); line-height: 1.5; padding: 1.5rem; }
    .rc-shell { max-width: 1200px; margin: 0 auto; }
    header.rc-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--rc-blue); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .rc-brand { font-size: 1.35rem; font-weight: 800; color: var(--rc-ocean); }
    nav.rc-nav a { text-decoration: none; color: var(--rc-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.rc-nav a[aria-current="page"] { color: var(--rc-blue); border-bottom: 2px solid var(--rc-blue); padding-bottom: 0.2rem; }
    .rc-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .rc-card { background: var(--rc-card); border: 1px solid var(--rc-border); border-radius: 8px; padding: 1.5rem; }
    .rc-card h1, .rc-card h2 { font-size: 1.4rem; color: var(--rc-ocean); margin-bottom: 0.5rem; }
    .rc-tide-box { background: #e0f2fe; border: 1px solid var(--rc-border); border-radius: 6px; padding: 0.85rem; margin-bottom: 1.25rem; display: flex; justify-content: space-around; font-size: 0.9rem; }
    .rc-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .rc-field label { font-size: 0.85rem; font-weight: 600; color: var(--rc-text); }
    .rc-field input, .rc-field select { padding: 0.55rem; border: 1px solid var(--rc-border); border-radius: 6px; font-size: 0.95rem; }
    .rc-btn { background: var(--rc-blue); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.85rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .rc-btn:hover { background: var(--rc-ocean); }
    table.rc-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    table.rc-table th, table.rc-table td { padding: 0.6rem 0.5rem; border-bottom: 1px solid #e0f2fe; text-align: left; }
    table.rc-table th { background: #f0f9ff; color: var(--rc-ocean); }
    footer.rc-foot { margin-top: 2.5rem; border-top: 1px solid var(--rc-border); padding-top: 1rem; text-align: center; font-size: 0.85rem; color: var(--rc-muted); }
  </style>
</head>
<body>
  <div class="rc-shell">
    <header class="rc-head">
      <div class="rc-brand">⚓ Estuary Community Rowing Club</div>
      <nav class="rc-nav" aria-label="Boathouse Nav">
        <a href="/">Tide &amp; Weather</a>
        <a href="/skiffs">Club Fleet</a>
        <a href="/book-outing" aria-current="page">Log Launch Manifest</a>
        <a href="/safety-log">Water Safety Board</a>
      </nav>
    </header>
    <main class="rc-grid">
      <section class="rc-card">
        <h1>Skiff Outing Reservation &amp; Safety Manifest</h1>
        <div class="rc-tide-box">
          <div><strong>High Tide:</strong> 14:22 (4.8m Spring)</div>
          <div><strong>Low Tide:</strong> 20:45 (0.9m)</div>
          <div><strong>Estuary Flow:</strong> 3.4 knots seaward</div>
        </div>
        <form id="skiff-safety-form" method="post" action="/book-outing">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="rc-field">
              <label for="skiff_id">Select Rowing Skiff</label>
              <select id="skiff_id" name="skiff_id" required>
                <option value="skiff-1">Skiff 1 — St. Piran (4-oar + Cox, Larch)</option>
                <option value="skiff-2" selected>Skiff 2 — Wave Queen (4-oar + Cox, Oak)</option>
                <option value="skiff-3">Skiff 3 — Cormorant (Pair + Coxswain)</option>
              </select>
            </div>
            <div class="rc-field">
              <label for="coxswain_name">Qualified Coxswain Name</label>
              <input type="text" id="coxswain_name" name="coxswain_name" required placeholder="Captain Mark Ross">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="rc-field">
              <label for="crew_headcount">Total Rower Headcount</label>
              <input type="number" id="crew_headcount" name="crew_headcount" min="2" max="6" value="5" required>
            </div>
            <div class="rc-field">
              <label for="lifejacket_count">Certified 150N Lifejackets on Board</label>
              <input type="number" id="lifejacket_count" name="lifejacket_count" min="2" max="8" value="5" required>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="rc-field">
              <label for="launch_time">Planned Slipway Launch Time</label>
              <input type="time" id="launch_time" name="launch_time" value="13:30" required>
            </div>
            <div class="rc-field">
              <label for="recovery_time">Estimated Recovery Time</label>
              <input type="time" id="recovery_time" name="recovery_time" value="15:30" required>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0">
            <input type="checkbox" id="vhf_radio" name="vhf_radio" value="yes" required>
            <label for="vhf_radio" style="font-size:0.85rem">I certify the crew carries Channel 16 handheld marine VHF radio and flares in the watertight stern locker.</label>
          </div>
          <button type="submit" class="rc-btn">File Boathouse Safety Manifest</button>
        </form>
      </section>
      <aside class="rc-card">
        <h2>Active Outings on Estuary</h2>
        <table class="rc-table">
          <thead>
            <tr>
              <th>Skiff</th>
              <th>Cox</th>
              <th>Launch</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>St. Piran</td>
              <td>J. Tregarthen</td>
              <td>11:00</td>
              <td><span style="color:#15803d;font-weight:700">On Water</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:1.5rem;font-size:0.8rem;color:var(--rc-muted);background:#fef2f2;border:1px solid #fecaca;padding:0.75rem;border-radius:6px">
          <strong>Safety Rule:</strong> No club skiff may proceed seaward past Black Rock Beacon after low water slack without committee permission.
        </div>
      </aside>
    </main>
    <footer class="rc-foot">
      <p>Estuary Community Rowing Club • Affiliated with Scottish Coastal Rowing Association • Custom House Quay</p>
    </footer>
  </div>
</body>
</html>`
  },

  // tr-20: Traditional tune tune-sheet repository and tempo notes (community-forum)
  {
    family_id: 'tr-20',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ceilidh &amp; Session Tune Vault — Folk Music Archive &amp; Tempo Notes</title>
  <style>
    :root {
      --fv-brown: #450a0a;
      --fv-gold: #b45309;
      --fv-parchment: #fefce8;
      --fv-card: #ffffff;
      --fv-border: #fef08a;
      --fv-text: #292524;
      --fv-muted: #78716c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--fv-parchment); color: var(--fv-text); line-height: 1.5; padding: 1.5rem; }
    .fv-shell { max-width: 1200px; margin: 0 auto; }
    header.fv-head { border-bottom: 2px solid var(--fv-brown); padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
    .fv-brand { font-size: 1.45rem; font-weight: 700; color: var(--fv-brown); }
    nav.fv-nav a { font-family: -apple-system, sans-serif; text-decoration: none; color: var(--fv-muted); font-size: 0.9rem; margin-left: 1.25rem; font-weight: 600; }
    nav.fv-nav a[aria-current="page"] { color: var(--fv-brown); text-decoration: underline; }
    .fv-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 2rem; align-items: start; }
    .fv-card { background: var(--fv-card); border: 1px solid var(--fv-border); border-radius: 8px; padding: 1.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .fv-card h1, .fv-card h2 { font-size: 1.4rem; color: var(--fv-brown); margin-bottom: 0.5rem; }
    .fv-tune-meta { font-family: -apple-system, sans-serif; display: flex; gap: 1rem; font-size: 0.85rem; color: var(--fv-gold); font-weight: 700; margin-bottom: 1rem; }
    .fv-notation-box { background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 6px; padding: 1rem; font-family: "Courier New", monospace; font-size: 0.9rem; line-height: 1.4; color: #1c1917; margin-bottom: 1.25rem; white-space: pre-wrap; }
    .fv-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; font-family: -apple-system, sans-serif; }
    .fv-field label { font-size: 0.85rem; font-weight: 600; color: var(--fv-text); }
    .fv-field input, .fv-field select, .fv-field textarea { padding: 0.55rem; border: 1px solid #d6d3d1; border-radius: 6px; font-size: 0.95rem; }
    .fv-btn { font-family: -apple-system, sans-serif; background: var(--fv-brown); color: #fff; border: none; font-size: 1rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .fv-btn:hover { background: #7f1d1d; }
    footer.fv-foot { margin-top: 2.5rem; border-top: 1px solid var(--fv-border); padding-top: 1rem; text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; color: var(--fv-muted); }
  </style>
</head>
<body>
  <div class="fv-shell">
    <header class="fv-head">
      <div class="fv-brand">Ceilidh &amp; Session Tune Vault</div>
      <nav class="fv-nav" aria-label="Archive Nav">
        <a href="/">Session Etiquette</a>
        <a href="/tunes" aria-current="page">Tune Archive</a>
        <a href="/sets">Standard Sets</a>
        <a href="/recordings">Field Tapes</a>
      </nav>
    </header>
    <main class="fv-grid">
      <article class="fv-card">
        <h1>The Wind That Shakes the Barley (Reel in D Major)</h1>
        <div class="fv-tune-meta">
          <span>Key: D Major</span>
          <span>Rhythm: 4/4 Reel</span>
          <span>Standard Tempo: 108 - 114 BPM</span>
        </div>
        <div class="fv-notation-box">
T: The Wind That Shakes The Barley
R: reel
M: 4/4
L: 1/8
K: Dmaj
|:A2AB AFED|B2BA B2d2|A2AB AFED|gfed B2d2:|
|:f2fd g2ge|f2fd bc'd'b|f2fd g2ge|afdf e2d2:|
        </div>
        <p style="font-size:0.9rem;color:#57534e">Traditional Scottish &amp; Irish reel. Often played as the opening tune in a set leading into <em>The Drowsy Maggie</em> or <em>The Silver Spear</em>.</p>
      </article>
      <section class="fv-card">
        <h2>Musician Tempo &amp; Chord Notes</h2>
        <form id="tune-notes-form" method="post" action="/tunes/barley/notes">
          <div class="fv-field">
            <label for="musician_handle">Musician Name or Session Role</label>
            <input type="text" id="musician_handle" name="musician_handle" required placeholder="Fiddle Pete (Belfast)">
          </div>
          <div class="fv-field">
            <label for="instrument">Instrument</label>
            <select id="instrument" name="instrument" required>
              <option value="fiddle" selected>Fiddle / Violin</option>
              <option value="flute">Wooden Flute / Tin Whistle</option>
              <option value="pipes">Uilleann Pipes / Border Pipes</option>
              <option value="guitar">DADGAD Guitar Accompaniment</option>
              <option value="accordion">Button Accordion / Melodeon</option>
            </select>
          </div>
          <div class="fv-field">
            <label for="suggested_bpm">Recommended Session BPM</label>
            <input type="number" id="suggested_bpm" name="suggested_bpm" min="80" max="140" value="112" required>
          </div>
          <div class="fv-field">
            <label for="variation_notes">Chord Substitutions or Regional Variation Notes</label>
            <textarea id="variation_notes" name="variation_notes" rows="3" required placeholder="e.g. Try substituting Bm for G in the second bar of the B-part when accompanying with bouzouki."></textarea>
          </div>
          <button type="submit" class="fv-btn">Post Musician Note to Archive</button>
        </form>
      </section>
    </main>
    <footer class="fv-foot">
      <p>Ceilidh &amp; Session Tune Vault • Open Folk Music Preservation Project • Published under CC0 Traditional Heritage</p>
    </footer>
  </div>
</body>
</html>`
  }
];

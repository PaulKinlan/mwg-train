/**
 * Target designs batch 4: tr-31 through tr-39 (the 9 modern interactive & editorial archetypes)
 */
export const BATCH_4 = [
  // tr-31: Aether Audio Aether One planar magnetic headphone launch and pre-order (scroll-storytelling-launch)
  {
    family_id: 'tr-31',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aether Audio — Aether One Planar Magnetic Headphone Launch &amp; Pre-Order</title>
  <style>
    :root {
      --ae-bg: #14110f;
      --ae-surface: #1f1a17;
      --ae-card: #29221e;
      --ae-border: #3d332c;
      --ae-copper: #d97706;
      --ae-gold: #f59e0b;
      --ae-text: #fafaf9;
      --ae-muted: #a8a29e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ae-bg); color: var(--ae-text); line-height: 1.5; padding: 1.5rem; }
    .ae-wrap { max-width: 1200px; margin: 0 auto; }
    header.ae-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--ae-border); margin-bottom: 1.5rem; }
    .ae-brand { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em; color: var(--ae-text); }
    nav.ae-nav { display: flex; gap: 1rem; align-items: center; }
    nav.ae-nav a { color: var(--ae-muted); text-decoration: none; font-size: 0.9rem; padding: 0.35rem 0.65rem; border-radius: 6px; }
    nav.ae-nav a[aria-current="page"] { color: var(--ae-gold); background: var(--ae-surface); font-weight: 600; }
    main.ae-main { display: grid; grid-template-columns: 1.45fr 1fr; gap: 1.75rem; align-items: start; }
    section.ae-stage { background: var(--ae-surface); border: 1px solid var(--ae-border); border-radius: 12px; padding: 1.75rem; }
    section.ae-stage h1 { font-size: 1.85rem; margin-bottom: 0.5rem; }
    .ae-lede { color: var(--ae-muted); margin-bottom: 1.25rem; }
    .ae-badges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    .ae-badge { background: var(--ae-card); border: 1px solid var(--ae-border); border-radius: 8px; padding: 0.85rem; }
    .ae-badge strong { display: block; color: var(--ae-gold); font-size: 1.05rem; }
    .ae-badge span { font-size: 0.82rem; color: var(--ae-muted); }
    .ae-anatomy { background: var(--ae-card); border: 1px solid var(--ae-border); border-radius: 10px; padding: 1.25rem; }
    .ae-anatomy h2 { font-size: 1.15rem; margin-bottom: 0.6rem; color: var(--ae-gold); }
    .ae-anatomy ul { list-style: none; display: grid; gap: 0.5rem; font-size: 0.9rem; color: var(--ae-muted); }
    aside.ae-workbench { background: var(--ae-surface); border: 1px solid var(--ae-border); border-radius: 12px; padding: 1.5rem; }
    aside.ae-workbench h2 { font-size: 1.25rem; margin-bottom: 0.75rem; }
    .ae-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .ae-field label { font-size: 0.85rem; font-weight: 600; }
    .ae-field input, .ae-field select, .ae-field textarea { background: var(--ae-bg); border: 1px solid var(--ae-border); color: var(--ae-text); padding: 0.6rem 0.75rem; border-radius: 6px; font-size: 0.92rem; }
    .ae-btn { width: 100%; background: var(--ae-copper); color: var(--ae-text); border: none; border-radius: 8px; padding: 0.85rem; font-size: 0.98rem; font-weight: 700; cursor: pointer; }
    footer.ae-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--ae-border); font-size: 0.82rem; color: var(--ae-muted); display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="ae-wrap">
    <header class="ae-header">
      <div class="ae-brand">Aether Audio · Aether One</div>
      <nav class="ae-nav" aria-label="Chapter Navigation">
        <a href="/" aria-current="page">01 Overview</a>
        <a href="/preorders">02 Acoustics &amp; Finish</a>
        <a href="/preorders">03 Pre-Order Batch 04</a>
      </nav>
    </header>
    <main class="ae-main">
      <section class="ae-stage">
        <h1>Precision You Can See Through</h1>
        <p class="ae-lede">Open-back reference planar magnetic headphones milled from raw titanium and warm brushed copper.</p>
        <div class="ae-badges">
          <div class="ae-badge"><strong>98 mm Planar</strong><span>2-micron ultra-thin diaphragm</span></div>
          <div class="ae-badge"><strong>0.04% THD</strong><span>Measured at 1 kHz / 100 dB SPL</span></div>
          <div class="ae-badge"><strong>310 g Chassis</strong><span>CNC-milled grade-5 titanium</span></div>
        </div>
        <div class="ae-anatomy">
          <h2>Exploded Acoustic Transducer Stack</h2>
          <ul>
            <li><strong>Layer 01 — CNC Aluminium Baffle:</strong> Open-grille acoustic lattice minimises standing-wave reflections.</li>
            <li><strong>Layer 02 — Dual Neodymium Array:</strong> Symmetrical N52 flux field across the entire 98 mm aperture.</li>
            <li><strong>Layer 03 — 2-Micron Diaphragm:</strong> Vapor-deposited copper trace voice coil with zero break-up modes.</li>
          </ul>
        </div>
      </section>
      <aside class="ae-workbench">
        <h2>Reserve Aether One (£649)</h2>
        <form id="aether-preorder-form" method="post" action="/preorders">
          <div class="ae-field">
            <label for="buyer">Full name</label>
            <input type="text" id="buyer" name="buyer" required placeholder="Clara Vance">
          </div>
          <div class="ae-field">
            <label for="email">Confirmation email</label>
            <input type="email" id="email" name="email" required placeholder="clara.vance@aether-acoustics.example">
          </div>
          <div class="ae-field">
            <label for="finish">Chassis finish</label>
            <select id="finish" name="finish" required>
              <option value="Anodised Obsidian">Anodised Obsidian</option>
              <option value="Raw Bead-Blasted Titanium">Raw Bead-Blasted Titanium</option>
              <option value="Warm Brushed Copper" selected>Warm Brushed Copper</option>
            </select>
          </div>
          <div class="ae-field">
            <label for="earpads">Ear-pad material</label>
            <select id="earpads" name="earpads" required>
              <option value="Perforated Lambskin">Perforated Lambskin</option>
              <option value="Acoustic Micro-Suede" selected>Acoustic Micro-Suede</option>
            </select>
          </div>
          <div class="ae-field">
            <label for="engraving">Headband engraving note</label>
            <textarea id="engraving" name="engraving" rows="2" placeholder="Studio Reference Batch 04"></textarea>
          </div>
          <button type="submit" class="ae-btn">Pre-order Aether One · £649</button>
        </form>
      </aside>
    </main>
    <footer class="ae-footer">
      <span>Aether Audio Ltd · Unit 14 Clerkenwell Workshops, London</span>
      <span>Ships 18 Nov 2026 · 5-year transducer warranty</span>
    </footer>
  </div>
</body>
</html>`,
  },

  // tr-32: Signal Grid daily frequency routing puzzle and streak leaderboard (browser-puzzle-game)
  {
    family_id: 'tr-32',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signal Grid — Daily Frequency Routing Puzzle &amp; Streak Leaderboard</title>
  <style>
    :root {
      --sg-bg: #f6f4ee;
      --sg-surface: #ffffff;
      --sg-tile: #ede9fe;
      --sg-border: #d6d3c9;
      --sg-teal: #0d9488;
      --sg-amber: #d97706;
      --sg-text: #1c1917;
      --sg-muted: #57534e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--sg-bg); color: var(--sg-text); line-height: 1.5; padding: 1.5rem; }
    .sg-wrap { max-width: 1200px; margin: 0 auto; }
    header.sg-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 2px solid var(--sg-text); margin-bottom: 1.5rem; }
    .sg-brand { font-size: 1.35rem; font-weight: 800; }
    nav.sg-nav { display: flex; gap: 1rem; }
    nav.sg-nav a { color: var(--sg-muted); text-decoration: none; font-weight: 600; font-size: 0.9rem; }
    nav.sg-nav a[aria-current="page"] { color: var(--sg-teal); }
    main.sg-main { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.75rem; align-items: start; }
    section.sg-board-panel { background: var(--sg-surface); border: 1px solid var(--sg-border); border-radius: 10px; padding: 1.5rem; }
    section.sg-board-panel h1 { font-size: 1.5rem; margin-bottom: 0.4rem; }
    .sg-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.45rem; margin: 1rem 0; }
    .sg-cell { background: var(--sg-bg); border: 1px solid var(--sg-border); border-radius: 6px; padding: 0.7rem 0.4rem; text-align: center; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 700; }
    .sg-cell.active { border-color: var(--sg-teal); color: var(--sg-teal); background: var(--sg-tile); }
    aside.sg-log { background: var(--sg-surface); border: 1px solid var(--sg-border); border-radius: 10px; padding: 1.5rem; }
    aside.sg-log h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .sg-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .sg-field label { font-size: 0.85rem; font-weight: 700; }
    .sg-field input, .sg-field select, .sg-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--sg-border); border-radius: 6px; background: var(--sg-bg); color: var(--sg-text); font-size: 0.92rem; }
    .sg-btn { width: 100%; background: var(--sg-teal); color: var(--sg-surface); border: none; border-radius: 6px; padding: 0.8rem; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
    footer.sg-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--sg-border); font-size: 0.82rem; color: var(--sg-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="sg-wrap">
    <header class="sg-header">
      <div class="sg-brand">Signal Grid · Daily Puzzle #142</div>
      <nav class="sg-nav" aria-label="Puzzle Navigation">
        <a href="/" aria-current="page">Daily Board (Par 14)</a>
        <a href="/runs">Submitted Runs</a>
        <a href="/leaderboard">Streak Leaderboard</a>
      </nav>
    </header>
    <main class="sg-main">
      <section class="sg-board-panel">
        <h1>Route 440 Hz Teal &amp; 660 Hz Amber Without Collision</h1>
        <p style="font-size:0.9rem;color:var(--sg-muted)">Place Mirrors (/), Phase Splitters (+), and Harmonic Filters across coordinates A1–F6.</p>
        <div class="sg-grid" aria-label="6 by 6 Signal Routing Matrix">
          <div class="sg-cell active">A1 · 440Hz</div><div class="sg-cell">B1 · /</div><div class="sg-cell">C1</div><div class="sg-cell">D1</div><div class="sg-cell">E1</div><div class="sg-cell">F1</div>
          <div class="sg-cell">A2</div><div class="sg-cell active">B2 · \</div><div class="sg-cell">C2</div><div class="sg-cell active">D2 · /</div><div class="sg-cell">E2</div><div class="sg-cell">F2</div>
          <div class="sg-cell active">A3 · 660Hz</div><div class="sg-cell">B3</div><div class="sg-cell">C3</div><div class="sg-cell active">D4 · Split+</div><div class="sg-cell">E3</div><div class="sg-cell">F3</div>
          <div class="sg-cell">A4</div><div class="sg-cell">B4</div><div class="sg-cell">C4</div><div class="sg-cell">D4</div><div class="sg-cell active">E4 · Filter</div><div class="sg-cell active">F4 · LOCK</div>
        </div>
      </section>
      <aside class="sg-log">
        <h2>Record Verified Puzzle Run</h2>
        <form id="signal-run-form" method="post" action="/runs">
          <div class="sg-field">
            <label for="callsign">Operator callsign</label>
            <input type="text" id="callsign" name="callsign" required placeholder="Tamsin Kale">
          </div>
          <div class="sg-field">
            <label for="moves">Moves used</label>
            <input type="number" id="moves" name="moves" required value="14">
          </div>
          <div class="sg-field">
            <label for="routing_mode">Signal mode</label>
            <select id="routing_mode" name="routing_mode" required>
              <option value="Standard Par 14">Standard Par 14</option>
              <option value="Phase Splitter" selected>Phase Splitter</option>
              <option value="Harmonic Lock">Harmonic Lock</option>
            </select>
          </div>
          <div class="sg-field">
            <label for="solution_summary">Route notes</label>
            <textarea id="solution_summary" name="solution_summary" rows="2" required placeholder="Phase splitter at D4 locked both receivers cleanly."></textarea>
          </div>
          <button type="submit" class="sg-btn">Submit Solution to Daily Leaderboard</button>
        </form>
      </aside>
    </main>
    <footer class="sg-footer">Signal Grid Logic Press · Daily Puzzle #142 · Keyboard shortcuts: Arrows move · Space place · Z undo</footer>
  </div>
</body>
</html>`,
  },

  // tr-33: Kestrel Sprint 24 firmware issue tracker and quick-create workbench (saas-workspace-board)
  {
    family_id: 'tr-33',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kestrel Workspace — Sprint 24 Firmware Issue Tracker &amp; Inspector</title>
  <style>
    :root {
      --ks-bg: #f8f7f4;
      --ks-surface: #ffffff;
      --ks-rail: #f1efe9;
      --ks-border: #e4e2dd;
      --ks-emerald: #059669;
      --ks-amber: #d97706;
      --ks-text: #18181b;
      --ks-muted: #52525b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ks-bg); color: var(--ks-text); line-height: 1.5; padding: 1.5rem; }
    .ks-wrap { max-width: 1200px; margin: 0 auto; }
    header.ks-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--ks-border); margin-bottom: 1.5rem; }
    .ks-brand { font-size: 1.3rem; font-weight: 800; }
    nav.ks-nav { display: flex; gap: 1rem; }
    nav.ks-nav a { color: var(--ks-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    nav.ks-nav a[aria-current="page"] { color: var(--ks-emerald); }
    main.ks-main { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem; align-items: start; }
    section.ks-board { background: var(--ks-surface); border: 1px solid var(--ks-border); border-radius: 10px; padding: 1.5rem; }
    section.ks-board h1 { font-size: 1.45rem; margin-bottom: 0.5rem; }
    .ks-issue-card { background: var(--ks-rail); border: 1px solid var(--ks-border); border-radius: 8px; padding: 0.9rem; margin-top: 0.75rem; }
    .ks-issue-card strong { color: var(--ks-emerald); font-family: ui-monospace, monospace; font-size: 0.85rem; }
    aside.ks-inspector { background: var(--ks-surface); border: 1px solid var(--ks-border); border-radius: 10px; padding: 1.5rem; }
    aside.ks-inspector h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .ks-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .ks-field label { font-size: 0.85rem; font-weight: 600; }
    .ks-field input, .ks-field select, .ks-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--ks-border); border-radius: 6px; background: var(--ks-bg); color: var(--ks-text); font-size: 0.92rem; }
    .ks-btn { width: 100%; background: var(--ks-emerald); color: var(--ks-surface); border: none; border-radius: 6px; padding: 0.8rem; font-weight: 700; cursor: pointer; }
    footer.ks-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--ks-border); font-size: 0.82rem; color: var(--ks-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="ks-wrap">
    <header class="ks-header">
      <div class="ks-brand">Kestrel · Sprint 24: v3.4 Telemetry Release</div>
      <nav class="ks-nav" aria-label="Workspace Navigation">
        <a href="/" aria-current="page">Active Sprint (24)</a>
        <a href="/issues">Grouped Table</a>
        <a href="/issues">Triage Queue</a>
      </nav>
    </header>
    <main class="ks-main">
      <section class="ks-board">
        <h1>Hardware &amp; Firmware Release Board</h1>
        <p style="font-size:0.9rem;color:var(--ks-muted)">Filter by subsystem (PCB Layout, Firmware, Telemetry) or open Cmd+K command palette.</p>
        <article class="ks-issue-card">
          <strong>KES-218 · HIGH · FIRMWARE</strong>
          <h3 style="font-size:1.02rem;margin:0.25rem 0">Fix SPI bus contention during flash write</h3>
          <p style="font-size:0.86rem;color:var(--ks-muted)">Assigned to Elena Rostova · DMA ring buffer arbitration under 200Hz telemetry load.</p>
        </article>
        <article class="ks-issue-card">
          <strong>KES-224 · URGENT · TELEMETRY</strong>
          <h3 style="font-size:1.02rem;margin:0.25rem 0">Calibrate cold-junction thermocouple offset on Rev C board</h3>
          <p style="font-size:0.86rem;color:var(--ks-muted)">Assigned to Marcus Chen · Verified across −20°C environmental chamber sweep.</p>
        </article>
      </section>
      <aside class="ks-inspector">
        <h2>Quick-Create Sprint Issue</h2>
        <form id="kestrel-issue-form" method="post" action="/issues">
          <div class="ks-field">
            <label for="title">Issue title</label>
            <input type="text" id="title" name="title" required placeholder="Fix SPI bus contention during flash write">
          </div>
          <div class="ks-field">
            <label for="assignee">Assignee</label>
            <input type="text" id="assignee" name="assignee" required placeholder="Elena Rostova">
          </div>
          <div class="ks-field">
            <label for="priority">Priority</label>
            <select id="priority" name="priority" required>
              <option value="Normal">Normal</option>
              <option value="High" selected>High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          <div class="ks-field">
            <label for="component">Subsystem</label>
            <select id="component" name="component" required>
              <option value="PCB Layout">PCB Layout</option>
              <option value="Firmware" selected>Firmware</option>
              <option value="Telemetry">Telemetry</option>
            </select>
          </div>
          <div class="ks-field">
            <label for="repro_steps">Reproduction steps</label>
            <textarea id="repro_steps" name="repro_steps" rows="3" required placeholder="Reflash controller; stream telemetry at 200Hz; observe SPI lock."></textarea>
          </div>
          <button type="submit" class="ks-btn">Create Sprint Issue</button>
        </form>
      </aside>
    </main>
    <footer class="ks-footer">Kestrel Embedded Systems · Sprint 24 · Keyboard navigation enabled</footer>
  </div>
</body>
</html>`,
  },

  // tr-34: NorthSea Grid Dogger Bank Sector B offshore wind telemetry and alert rule log (realtime-telemetry-dashboard)
  {
    family_id: 'tr-34',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NorthSea Grid — Dogger Bank Sector B Offshore Wind Telemetry &amp; Alert Log</title>
  <style>
    :root {
      --ns-bg: #121316;
      --ns-surface: #1c1e24;
      --ns-card: #252830;
      --ns-border: #323640;
      --ns-emerald: #10b981;
      --ns-amber: #f59e0b;
      --ns-text: #f4f4f5;
      --ns-muted: #a1a1aa;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--ns-bg); color: var(--ns-text); line-height: 1.5; padding: 1.5rem; }
    .ns-wrap { max-width: 1200px; margin: 0 auto; }
    header.ns-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--ns-border); margin-bottom: 1.5rem; }
    .ns-brand { font-size: 1.3rem; font-weight: 800; }
    nav.ns-nav { display: flex; gap: 1rem; }
    nav.ns-nav a { color: var(--ns-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    nav.ns-nav a[aria-current="page"] { color: var(--ns-emerald); }
    main.ns-main { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem; align-items: start; }
    section.ns-telemetry { background: var(--ns-surface); border: 1px solid var(--ns-border); border-radius: 10px; padding: 1.5rem; }
    section.ns-telemetry h1 { font-size: 1.45rem; margin-bottom: 0.5rem; }
    .ns-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin: 1rem 0; }
    .ns-kpi { background: var(--ns-card); border: 1px solid var(--ns-border); border-radius: 8px; padding: 0.85rem; }
    .ns-kpi strong { display: block; font-size: 1.15rem; color: var(--ns-emerald); font-variant-numeric: tabular-nums; }
    .ns-kpi span { font-size: 0.8rem; color: var(--ns-muted); }
    aside.ns-alerts { background: var(--ns-surface); border: 1px solid var(--ns-border); border-radius: 10px; padding: 1.5rem; }
    aside.ns-alerts h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .ns-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .ns-field label { font-size: 0.85rem; font-weight: 600; }
    .ns-field input, .ns-field select, .ns-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--ns-border); border-radius: 6px; background: var(--ns-bg); color: var(--ns-text); font-size: 0.92rem; }
    .ns-btn { width: 100%; background: var(--ns-emerald); color: var(--ns-bg); border: none; border-radius: 6px; padding: 0.8rem; font-weight: 800; cursor: pointer; }
    footer.ns-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--ns-border); font-size: 0.82rem; color: var(--ns-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="ns-wrap">
    <header class="ns-header">
      <div class="ns-brand">NorthSea Grid · Dogger Bank Sector B (Simulation — Not Live)</div>
      <nav class="ns-nav" aria-label="Telemetry Navigation">
        <a href="/" aria-current="page">Sector Overview</a>
        <a href="/alerts">Alert Rules</a>
        <a href="/incidents">Incident Audit Log</a>
      </nav>
    </header>
    <main class="ns-main">
      <section class="ns-telemetry">
        <h1>Offshore Array Generation &amp; Gearbox Thermal Monitor</h1>
        <p style="font-size:0.9rem;color:var(--ns-muted)">14:00–15:30 UTC brushed window · Turbine B-07 showing 84.2°C oil temperature warning.</p>
        <div class="ns-kpis">
          <div class="ns-kpi"><strong>412.8 MW</strong><span>Net Generation</span></div>
          <div class="ns-kpi"><strong>50.02 Hz</strong><span>Grid Frequency</span></div>
          <div class="ns-kpi"><strong>78.4%</strong><span>Battery Reserve</span></div>
          <div class="ns-kpi"><strong style="color:var(--ns-amber)">1 Active</strong><span>B-07 Thermal Warning</span></div>
        </div>
      </section>
      <aside class="ns-alerts">
        <h2>Configure Thermal Alert Rule</h2>
        <form id="northsea-alert-form" method="post" action="/alerts">
          <div class="ns-field">
            <label for="turbine_id">Turbine unit</label>
            <select id="turbine_id" name="turbine_id" required>
              <option value="Turbine B-01">Turbine B-01</option>
              <option value="Turbine B-07" selected>Turbine B-07</option>
              <option value="Turbine B-12">Turbine B-12</option>
            </select>
          </div>
          <div class="ns-field">
            <label for="operator">Duty engineer</label>
            <input type="text" id="operator" name="operator" required placeholder="Soren Lindqvist">
          </div>
          <div class="ns-field">
            <label for="warning_temp">Warning threshold (°C)</label>
            <input type="number" id="warning_temp" name="warning_temp" required value="78">
          </div>
          <div class="ns-field">
            <label for="critical_temp">Critical threshold (°C)</label>
            <input type="number" id="critical_temp" name="critical_temp" required value="88">
          </div>
          <div class="ns-field">
            <label for="dispatch_note">Incident annotation</label>
            <textarea id="dispatch_note" name="dispatch_note" rows="2" required placeholder="Gearbox oil excursion observed during 14:00 UTC gust window."></textarea>
          </div>
          <button type="submit" class="ns-btn">Save Thermal Alert Rule</button>
        </form>
      </aside>
    </main>
    <footer class="ns-footer">NorthSea Grid Operations · UTC Telemetry Fixture · Accessible Data Table Available</footer>
  </div>
</body>
</html>`,
  },

  // tr-35: Atelier Velo Solstice Ti custom titanium gravel bike configurator and build reservation (interactive-product-configurator)
  {
    family_id: 'tr-35',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atelier Velo — Solstice Ti Custom Titanium Gravel Bike Configurator</title>
  <style>
    :root {
      --av-bg: #f5f2eb;
      --av-surface: #ffffff;
      --av-card: #ebe6dc;
      --av-border: #d6cfc2;
      --av-terracotta: #c2410c;
      --av-bronze: #9a3412;
      --av-text: #1c1917;
      --av-muted: #57534e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--av-bg); color: var(--av-text); line-height: 1.5; padding: 1.5rem; }
    .av-wrap { max-width: 1200px; margin: 0 auto; }
    header.av-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 2px solid var(--av-terracotta); margin-bottom: 1.5rem; }
    .av-brand { font-size: 1.35rem; font-weight: 800; }
    nav.av-nav { display: flex; gap: 1rem; }
    nav.av-nav a { color: var(--av-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    nav.av-nav a[aria-current="page"] { color: var(--av-terracotta); }
    main.av-main { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.75rem; align-items: start; }
    section.av-stage { background: var(--av-surface); border: 1px solid var(--av-border); border-radius: 10px; padding: 1.5rem; }
    section.av-stage h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .av-specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1rem; }
    .av-spec { background: var(--av-card); border: 1px solid var(--av-border); border-radius: 8px; padding: 0.8rem; }
    .av-spec strong { display: block; color: var(--av-terracotta); }
    aside.av-config { background: var(--av-surface); border: 1px solid var(--av-border); border-radius: 10px; padding: 1.5rem; }
    aside.av-config h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .av-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .av-field label { font-size: 0.85rem; font-weight: 600; }
    .av-field input, .av-field select, .av-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--av-border); border-radius: 6px; background: var(--av-bg); color: var(--av-text); font-size: 0.92rem; }
    .av-btn { width: 100%; background: var(--av-terracotta); color: var(--av-surface); border: none; border-radius: 6px; padding: 0.85rem; font-weight: 700; cursor: pointer; }
    footer.av-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--av-border); font-size: 0.82rem; color: var(--av-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="av-wrap">
    <header class="av-header">
      <div class="av-brand">Atelier Velo · Solstice Ti Bespoke Workshop</div>
      <nav class="av-nav" aria-label="Configurator Navigation">
        <a href="/" aria-current="page">1. Frame &amp; Drivetrain</a>
        <a href="/builds">2. Clearance Check</a>
        <a href="/builds">3. Saved Builds</a>
      </nav>
    </header>
    <main class="av-main">
      <section class="av-stage">
        <h1>Solstice Ti — Double-Butted 3Al-2.5V Titanium Gravel Frame</h1>
        <p style="font-size:0.9rem;color:var(--av-muted)">Live bill of materials and tyre-to-mudguard bridge clearance verification.</p>
        <div class="av-specs">
          <div class="av-spec"><strong>56cm Endurance</strong><span>Stack 578 mm · Reach 392 mm</span></div>
          <div class="av-spec"><strong>8.11 kg Est.</strong><span>With 40mm carbon gravel wheelset</span></div>
          <div class="av-spec"><strong>£4,550 Total</strong><span>3-week workshop build lead time</span></div>
        </div>
      </section>
      <aside class="av-config">
        <h2>Save &amp; Reserve Workshop Build Slot</h2>
        <form id="atelier-build-form" method="post" action="/builds">
          <div class="av-field">
            <label for="rider">Rider name</label>
            <input type="text" id="rider" name="rider" required placeholder="Jules Moreau">
          </div>
          <div class="av-field">
            <label for="frame_size">Frame geometry</label>
            <select id="frame_size" name="frame_size" required>
              <option value="52cm Compact">52cm Compact</option>
              <option value="56cm Endurance" selected>56cm Endurance</option>
              <option value="58cm Tall">58cm Tall</option>
            </select>
          </div>
          <div class="av-field">
            <label for="finish">Titanium finish</label>
            <select id="finish" name="finish" required>
              <option value="Raw Brushed Ti">Raw Brushed Ti</option>
              <option value="Anodised Bronze" selected>Anodised Bronze</option>
              <option value="Slate Cerakote">Slate Cerakote</option>
            </select>
          </div>
          <div class="av-field">
            <label for="wheelset">Wheelset &amp; tyres</label>
            <select id="wheelset" name="wheelset" required>
              <option value="Alloy All-Road 700x38c">Alloy All-Road 700x38c</option>
              <option value="40mm Deep Carbon Gravel" selected>40mm Deep Carbon Gravel</option>
              <option value="650b Expedition Dynamo">650b Expedition Dynamo</option>
            </select>
          </div>
          <div class="av-field">
            <label for="build_notes">Fit &amp; routing notes</label>
            <textarea id="build_notes" name="build_notes" rows="2" placeholder="Internal dynamo wire routing through fork crown; 90mm stem."></textarea>
          </div>
          <button type="submit" class="av-btn">Save Build &amp; Reserve Workshop Slot</button>
        </form>
      </aside>
    </main>
    <footer class="av-footer">Atelier Velo Framebuilders · Sheffield &amp; Savoy · Custom Titanium Gravel</footer>
  </div>
</body>
</html>`,
  },

  // tr-36: Resonance Lab WebAudio synth and shader patch playground (developer-media-playground)
  {
    family_id: 'tr-36',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Resonance Lab — WebAudio Synth &amp; Shader Patch Studio</title>
  <style>
    :root {
      --rl-bg: #141210;
      --rl-surface: #1e1b18;
      --rl-card: #282420;
      --rl-border: #3b352f;
      --rl-amber: #f59e0b;
      --rl-emerald: #10b981;
      --rl-text: #fafaf9;
      --rl-muted: #a8a29e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--rl-bg); color: var(--rl-text); line-height: 1.5; padding: 1.5rem; }
    .rl-wrap { max-width: 1200px; margin: 0 auto; }
    header.rl-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--rl-border); margin-bottom: 1.5rem; }
    .rl-brand { font-size: 1.3rem; font-weight: 800; color: var(--rl-amber); }
    nav.rl-nav { display: flex; gap: 1rem; }
    nav.rl-nav a { color: var(--rl-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    nav.rl-nav a[aria-current="page"] { color: var(--rl-emerald); }
    main.rl-main { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.5rem; align-items: start; }
    section.rl-editor { background: var(--rl-surface); border: 1px solid var(--rl-border); border-radius: 10px; padding: 1.5rem; }
    section.rl-editor h1 { font-size: 1.45rem; margin-bottom: 0.5rem; }
    .rl-code { background: var(--rl-card); border: 1px solid var(--rl-border); border-radius: 8px; padding: 1rem; font-family: ui-monospace, monospace; font-size: 0.86rem; color: var(--rl-amber); margin-top: 0.85rem; }
    aside.rl-export { background: var(--rl-surface); border: 1px solid var(--rl-border); border-radius: 10px; padding: 1.5rem; }
    aside.rl-export h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .rl-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .rl-field label { font-size: 0.85rem; font-weight: 600; }
    .rl-field input, .rl-field select, .rl-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--rl-border); border-radius: 6px; background: var(--rl-bg); color: var(--rl-text); font-size: 0.92rem; }
    .rl-btn { width: 100%; background: var(--rl-amber); color: var(--rl-bg); border: none; border-radius: 6px; padding: 0.8rem; font-weight: 800; cursor: pointer; }
    footer.rl-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--rl-border); font-size: 0.82rem; color: var(--rl-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="rl-wrap">
    <header class="rl-header">
      <div class="rl-brand">Resonance Lab · Modular WebAudio &amp; Shader Studio</div>
      <nav class="rl-nav" aria-label="Playground Navigation">
        <a href="/" aria-current="page">Patch Editor</a>
        <a href="/patches">Preset Gallery</a>
        <a href="/patches">Saved Permalinks</a>
      </nav>
    </header>
    <main class="rl-main">
      <section class="rl-editor">
        <h1>Chapter 3: Shaping Subtractive Filter Envelopes</h1>
        <p style="font-size:0.9rem;color:var(--rl-muted)">Playhead 00:42 / 02:15 · Cutoff 680 Hz · Resonance Q 4.2 · Attack 45 ms</p>
        <div class="rl-code">
          01 const osc = ctx.createOscillator();<br>
          02 const filter = ctx.createBiquadFilter();<br>
          03 filter.type = "lowpass";<br>
          04 filter.frequency.setValueAtTime(680, ctx.currentTime);
        </div>
      </section>
      <aside class="rl-export">
        <h2>Export &amp; Persist Synth Patch</h2>
        <form id="resonance-patch-form" method="post" action="/patches">
          <div class="rl-field">
            <label for="patch_name">Patch title</label>
            <input type="text" id="patch_name" name="patch_name" required placeholder="Warm Analog Filter Sweep">
          </div>
          <div class="rl-field">
            <label for="author">Creator handle</label>
            <input type="text" id="author" name="author" required placeholder="Devon Kestrel">
          </div>
          <div class="rl-field">
            <label for="synth_engine">Synth engine</label>
            <select id="synth_engine" name="synth_engine" required>
              <option value="Biquad Subtractive">Biquad Subtractive</option>
              <option value="FM Bell Operator" selected>FM Bell Operator</option>
              <option value="Karplus-Strong String">Karplus-Strong String</option>
            </select>
          </div>
          <div class="rl-field">
            <label for="cutoff_hz">Filter cutoff (Hz)</label>
            <input type="number" id="cutoff_hz" name="cutoff_hz" required value="680">
          </div>
          <div class="rl-field">
            <label for="patch_source">DSP patch expression</label>
            <textarea id="patch_source" name="patch_source" rows="2" required placeholder="filter.frequency.setValueAtTime(680, ctx.currentTime);"></textarea>
          </div>
          <button type="submit" class="rl-btn">Save Patch Permalink</button>
        </form>
      </aside>
    </main>
    <footer class="rl-footer">Resonance Lab Audio DSP · Audio off until Run · Schema-versioned JSON patch registry</footer>
  </div>
</body>
</html>`,
  },

  // tr-37: The Kiln Chronicle ceramics literary journal and article composer (editorial-blog)
  {
    family_id: 'tr-37',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Kiln Chronicle — Ceramics Literary Journal &amp; Article Composer</title>
  <style>
    :root {
      --kc-bg: #fbf9f4;
      --kc-surface: #ffffff;
      --kc-border: #d6d3d1;
      --kc-forest: #14532d;
      --kc-oxblood: #991b1b;
      --kc-text: #1c1917;
      --kc-muted: #57534e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Georgia", serif; background: var(--kc-bg); color: var(--kc-text); line-height: 1.6; padding: 1.5rem; }
    .kc-wrap { max-width: 1200px; margin: 0 auto; }
    header.kc-header { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 1rem; border-bottom: 2px solid var(--kc-oxblood); margin-bottom: 1.5rem; }
    .kc-brand { font-size: 1.6rem; font-weight: 700; color: var(--kc-text); }
    nav.kc-nav { display: flex; gap: 1.2rem; font-family: -apple-system, sans-serif; }
    nav.kc-nav a { color: var(--kc-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    nav.kc-nav a[aria-current="page"] { color: var(--kc-forest); }
    main.kc-main { display: grid; grid-template-columns: 1.35fr 1fr; gap: 2rem; align-items: start; }
    section.kc-issue { background: var(--kc-surface); border: 1px solid var(--kc-border); border-radius: 8px; padding: 1.75rem; }
    section.kc-issue h1 { font-size: 1.65rem; margin-bottom: 0.5rem; }
    .kc-pull { border-left: 3px solid var(--kc-oxblood); padding-left: 1rem; margin: 1rem 0; font-style: italic; color: var(--kc-muted); }
    aside.kc-composer { background: var(--kc-surface); border: 1px solid var(--kc-border); border-radius: 8px; padding: 1.5rem; font-family: -apple-system, sans-serif; }
    aside.kc-composer h2 { font-size: 1.2rem; margin-bottom: 0.75rem; color: var(--kc-forest); }
    .kc-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .kc-field label { font-size: 0.85rem; font-weight: 700; }
    .kc-field input, .kc-field select, .kc-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--kc-border); border-radius: 6px; background: var(--kc-bg); color: var(--kc-text); font-size: 0.92rem; }
    .kc-btn { width: 100%; background: var(--kc-forest); color: var(--kc-surface); border: none; border-radius: 6px; padding: 0.85rem; font-weight: 700; cursor: pointer; }
    footer.kc-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--kc-border); font-family: -apple-system, sans-serif; font-size: 0.82rem; color: var(--kc-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="kc-wrap">
    <header class="kc-header">
      <div class="kc-brand">The Kiln Chronicle · Issue No. 18</div>
      <nav class="kc-nav" aria-label="Editorial Navigation">
        <a href="/" aria-current="page">Issue Index</a>
        <a href="/articles">Glaze Chemistry</a>
        <a href="/articles">Publish Essay</a>
      </nav>
    </header>
    <main class="kc-main">
      <section class="kc-issue">
        <span style="font-family:-apple-system,sans-serif;font-size:0.78rem;font-weight:700;color:var(--kc-oxblood);text-transform:uppercase">Editor's Pick · Glaze Chemistry</span>
        <h1>What a Reduction Firing Does to a Copper Glaze</h1>
        <p style="font-size:0.9rem;color:var(--kc-muted);margin-bottom:0.75rem">By Marguerite Ash · 12 October 2026 · 7 min read</p>
        <blockquote class="kc-pull">“Starved of oxygen at cone 10, a half-percent addition of copper carbonate abandons alkaline turquoise and settles into deep oxblood red.”</blockquote>
        <p style="font-size:0.95rem">Across three decades of wood-and-gas firing in Leach-style downdraft kilns, studio potters have logged damper schedules that turn volatile metallic oxides into durable stoneware surfaces.</p>
      </section>
      <aside class="kc-composer">
        <h2>Compose &amp; Publish Journal Essay</h2>
        <form id="kiln-article-form" method="post" action="/articles">
          <div class="kc-field">
            <label for="headline">Article headline</label>
            <input type="text" id="headline" name="headline" required placeholder="What a reduction firing does to a copper glaze">
          </div>
          <div class="kc-field">
            <label for="byline">Author byline</label>
            <input type="text" id="byline" name="byline" required placeholder="Marguerite Ash">
          </div>
          <div class="kc-field">
            <label for="section">Journal section</label>
            <select id="section" name="section" required>
              <option value="Studio Notes">Studio Notes</option>
              <option value="Glaze Chemistry" selected>Glaze Chemistry</option>
              <option value="Kiln Firing">Kiln Firing</option>
              <option value="Workshops">Workshops</option>
            </select>
          </div>
          <div class="kc-field">
            <label for="body_markdown">Essay body (Markdown)</label>
            <textarea id="body_markdown" name="body_markdown" rows="3" required placeholder="At cone 10 in a heavy reduction atmosphere, copper carbonate shifts from celadon green to oxblood red."></textarea>
          </div>
          <button type="submit" class="kc-btn">Publish Article</button>
        </form>
      </aside>
    </main>
    <footer class="kc-footer">The Kiln Chronicle Quarterly · St Ives &amp; Leach Pottery Archive · ISSN 2049-8821</footer>
  </div>
</body>
</html>`,
  },

  // tr-38: Lantern Works stop-motion craft archive and moderated contribution registry (fan-community-site)
  {
    family_id: 'tr-38',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lantern Works Fan Registry — Stop-Motion Craft Archive &amp; Moderation Queue</title>
  <style>
    :root {
      --lw-bg: #18131a;
      --lw-surface: #261f29;
      --lw-card: #312736;
      --lw-border: #3d3142;
      --lw-brass: #d97706;
      --lw-cream: #faf5ff;
      --lw-muted: #c4b5fd;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--lw-bg); color: var(--lw-cream); line-height: 1.5; padding: 1.5rem; }
    .lw-wrap { max-width: 1200px; margin: 0 auto; }
    header.lw-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--lw-border); margin-bottom: 1.5rem; }
    .lw-brand { font-size: 1.35rem; font-weight: 800; color: var(--lw-cream); }
    nav.lw-nav { display: flex; gap: 1rem; }
    nav.lw-nav a { color: var(--lw-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    nav.lw-nav a[aria-current="page"] { color: var(--lw-brass); }
    main.lw-main { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.75rem; align-items: start; }
    section.lw-archive { background: var(--lw-surface); border: 1px solid var(--lw-border); border-radius: 10px; padding: 1.5rem; }
    section.lw-archive h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .lw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-top: 1rem; }
    .lw-artefact { background: var(--lw-card); border: 1px solid var(--lw-border); border-radius: 8px; padding: 1rem; }
    .lw-artefact strong { display: block; color: var(--lw-brass); margin-bottom: 0.25rem; }
    aside.lw-contribute { background: var(--lw-surface); border: 1px solid var(--lw-border); border-radius: 10px; padding: 1.5rem; }
    aside.lw-contribute h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .lw-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .lw-field label { font-size: 0.85rem; font-weight: 600; }
    .lw-field input, .lw-field select, .lw-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--lw-border); border-radius: 6px; background: var(--lw-bg); color: var(--lw-cream); font-size: 0.92rem; }
    .lw-btn { width: 100%; background: var(--lw-brass); color: var(--lw-bg); border: none; border-radius: 6px; padding: 0.85rem; font-weight: 800; cursor: pointer; }
    footer.lw-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--lw-border); font-size: 0.82rem; color: var(--lw-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="lw-wrap">
    <header class="lw-header">
      <div class="lw-brand">Lantern Works Fan Registry · Stop-Motion Craft Archive</div>
      <nav class="lw-nav" aria-label="Registry Navigation">
        <a href="/" aria-current="page">Canon Collection (128)</a>
        <a href="/contributions">Submit Artefact</a>
        <a href="/collection">Moderator Queue</a>
      </nav>
    </header>
    <main class="lw-main">
      <section class="lw-archive">
        <h1>Verified Puppet Armatures, Miniature Sets &amp; Ephemera</h1>
        <p style="font-size:0.9rem;color:var(--lw-muted)">Curated by community archivists · Every contribution is reviewed before publication.</p>
        <div class="lw-grid">
          <article class="lw-artefact">
            <strong>Sets and Props · Published</strong>
            <h3>Set 12 — Harbour Street Cobblestone Rig</h3>
            <p style="font-size:0.85rem;color:var(--lw-muted)">1:12 scale carved limewood slate roofs and forced-perspective harbour wall.</p>
          </article>
          <article class="lw-artefact">
            <strong>Characters · Published</strong>
            <h3>The Lamplighter's Waxed Wool Greatcoat</h3>
            <p style="font-size:0.85rem;color:var(--lw-muted)">Internal annealed aluminium wire hem for frame-by-frame wind ripple.</p>
          </article>
        </div>
      </section>
      <aside class="lw-contribute">
        <h2>Contribute to the Registry</h2>
        <form id="lantern-contribution-form" method="post" action="/contributions">
          <div class="lw-field">
            <label for="artefact_title">Artefact title</label>
            <input type="text" id="artefact_title" name="artefact_title" required placeholder="Harbour Street miniature sodium lamp rig">
          </div>
          <div class="lw-field">
            <label for="contributor">Contributor handle</label>
            <input type="text" id="contributor" name="contributor" required placeholder="brasslamp">
          </div>
          <div class="lw-field">
            <label for="canon_section">Canon section</label>
            <select id="canon_section" name="canon_section" required>
              <option value="Characters">Characters</option>
              <option value="Sets and Props" selected>Sets and Props</option>
              <option value="Ephemera">Ephemera</option>
              <option value="Interviews">Interviews</option>
            </select>
          </div>
          <div class="lw-field">
            <label for="provenance_notes">Archival &amp; lighting notes</label>
            <textarea id="provenance_notes" name="provenance_notes" rows="2" required placeholder="Wired with 3V grain-of-wheat bulbs beneath hand-soldered brass hoods for Scene 14."></textarea>
          </div>
          <button type="submit" class="lw-btn">Submit for Moderator Review</button>
        </form>
      </aside>
    </main>
    <footer class="lw-footer">Lantern Works Community Archive · Bristol &amp; Cardiff Miniature Stage Guild</footer>
  </div>
</body>
</html>`,
  },

  // tr-39: Rig Selection Board GPU benchmark comparison and build selection (product-card-comparison)
  {
    family_id: 'tr-39',
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rig Selection Board — GPU Benchmark Comparison &amp; Build Selection</title>
  <style>
    :root {
      --rs-bg: #f3f4f6;
      --rs-surface: #ffffff;
      --rs-card: #f9fafb;
      --rs-border: #d1d5db;
      --rs-cobalt: #0284c7;
      --rs-emerald: #15803d;
      --rs-text: #111827;
      --rs-muted: #4b5563;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--rs-bg); color: var(--rs-text); line-height: 1.5; padding: 1.5rem; }
    .rs-wrap { max-width: 1200px; margin: 0 auto; }
    header.rs-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 2px solid var(--rs-text); margin-bottom: 1.5rem; }
    .rs-brand { font-size: 1.35rem; font-weight: 800; }
    nav.rs-nav { display: flex; gap: 1rem; }
    nav.rs-nav a { color: var(--rs-muted); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
    nav.rs-nav a[aria-current="page"] { color: var(--rs-cobalt); }
    main.rs-main { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.75rem; align-items: start; }
    section.rs-matrix { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 8px; padding: 1.5rem; }
    section.rs-matrix h1 { font-size: 1.45rem; margin-bottom: 0.5rem; }
    table.rs-table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.88rem; font-variant-numeric: tabular-nums; }
    table.rs-table th, table.rs-table td { padding: 0.6rem; border-bottom: 1px solid var(--rs-border); text-align: left; }
    table.rs-table th { background: var(--rs-card); font-weight: 700; }
    aside.rs-select { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 8px; padding: 1.5rem; }
    aside.rs-select h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .rs-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
    .rs-field label { font-size: 0.85rem; font-weight: 700; }
    .rs-field input, .rs-field select, .rs-field textarea { padding: 0.55rem 0.7rem; border: 1px solid var(--rs-border); border-radius: 6px; background: var(--rs-bg); color: var(--rs-text); font-size: 0.92rem; }
    .rs-btn { width: 100%; background: var(--rs-cobalt); color: var(--rs-surface); border: none; border-radius: 6px; padding: 0.85rem; font-weight: 700; cursor: pointer; }
    footer.rs-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--rs-border); font-size: 0.82rem; color: var(--rs-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="rs-wrap">
    <header class="rs-header">
      <div class="rs-brand">Rig Selection Board · Workstation GPU Catalogue</div>
      <nav class="rs-nav" aria-label="Comparison Navigation">
        <a href="/" aria-current="page">Catalogue (24 Cards)</a>
        <a href="/compare">Side-by-Side Matrix</a>
        <a href="/selections">Saved Rig Builds</a>
      </nav>
    </header>
    <main class="rs-main">
      <section class="rs-matrix">
        <h1>Comparing 3 Workstation Graphics Cards</h1>
        <p style="font-size:0.9rem;color:var(--rs-muted)">Aligned row-by-row across VRAM capacity, board power draw, slot length, and warranty.</p>
        <table class="rs-table">
          <thead>
            <tr><th>Attribute</th><th>Vector VX-4070</th><th>Northwind Arc A770</th><th>Halcyon RX-7800</th></tr>
          </thead>
          <tbody>
            <tr><td>Price</td><td>£549</td><td>£629</td><td><strong>£479 ✓</strong></td></tr>
            <tr><td>VRAM Memory</td><td>12 GB GDDR6X</td><td><strong>16 GB GDDR6 ✓</strong></td><td><strong>16 GB GDDR6 ✓</strong></td></tr>
            <tr><td>Power Draw</td><td><strong>200 W ✓</strong></td><td>225 W</td><td>245 W</td></tr>
            <tr><td>Card Length</td><td>262 mm (2-slot)</td><td>280 mm (adapter incl.)</td><td>302 mm (3 slots needed)</td></tr>
          </tbody>
        </table>
      </section>
      <aside class="rs-select">
        <h2>Carry Selected Card Into Build</h2>
        <form id="rig-selection-form" method="post" action="/selections">
          <div class="rs-field">
            <label for="builder_name">Builder name</label>
            <input type="text" id="builder_name" name="builder_name" required placeholder="Gideon Park">
          </div>
          <div class="rs-field">
            <label for="card_model">Selected graphics card</label>
            <select id="card_model" name="card_model" required>
              <option value="Halcyon RX-7800 (16 GB)">Halcyon RX-7800 (16 GB)</option>
              <option value="Northwind Arc A770 (16 GB)" selected>Northwind Arc A770 (16 GB)</option>
              <option value="Vector VX-4070 (12 GB)">Vector VX-4070 (12 GB)</option>
            </select>
          </div>
          <div class="rs-field">
            <label for="psu_wattage">Power supply budget (W)</label>
            <input type="number" id="psu_wattage" name="psu_wattage" required value="750">
          </div>
          <div class="rs-field">
            <label for="rig_notes">Chassis &amp; thermal notes</label>
            <textarea id="rig_notes" name="rig_notes" rows="2" required placeholder="Paired with 280mm mesh workstation chassis; 225W TDP within quiet fan curve."></textarea>
          </div>
          <button type="submit" class="rs-btn">Continue With This Card</button>
        </form>
      </aside>
    </main>
    <footer class="rs-footer">Rig Selection Board · Hardware Benchmark Lab · All specifications verified at 22°C ambient</footer>
  </div>
</body>
</html>`,
  },
];

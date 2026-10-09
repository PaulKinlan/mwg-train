/**
 * HTML rendering for the viewer. Everything from a corpus record is escaped: the records describe
 * untrusted generated sites, and evidence text is attacker-controlled markup until proven
 * otherwise.
 *
 * The viewer's own chrome is deliberately plain raw-web-platform HTML with one inline stylesheet:
 * the viewer is not a demo of anything except the corpus.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASELINE_LABEL } from '../eval/ruleset.mjs';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const PAGE_CSS = `
  :root { color-scheme: light dark; --ground: #f5f7f8; --surface: #fff; --ink: #172b38; --muted: #4a606d; --line: #c8d5dc; --control-line: #687985; --action: #14577a; --focus: #087cbe; --success: #146238; --success-bg: #e3f4e9; --error: #9a2830; --error-bg: #fcebed; --warning: #795300; --warning-bg: #fff2d5; }
  @media (prefers-color-scheme: dark) { :root { --ground: #101b24; --surface: #192b36; --ink: #ecf4f7; --muted: #bbcad2; --line: #49606d; --control-line: #8aa4b2; --action: #9ed5fa; --focus: #8fd1ff; --success: #a8e9be; --success-bg: #173d2d; --error: #ffb9bc; --error-bg: #49252c; --warning: #f8d888; --warning-bg: #42361d; } }
  * { box-sizing: border-box; }
  html { background: var(--ground); }
  body { max-width: 88rem; margin: 0 auto; padding: clamp(1rem, 3vw, 2rem); color: var(--ink); background: var(--ground); font: 1rem/1.55 system-ui, sans-serif; }
  h1 { margin: 1.2rem 0 0.7rem; font-size: clamp(1.75rem, 1.35rem + 1.4vw, 2.4rem); line-height: 1.15; letter-spacing: -0.025em; overflow-wrap: anywhere; }
  h2 { margin: 2.3rem 0 0.8rem; font-size: 1.35rem; }
  h3 { font-size: 1.08rem; }
  p { max-width: 75ch; }
  a { color: var(--action); text-underline-offset: 0.2em; }
  a:hover { text-decoration-thickness: 0.13em; }
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
  ::selection { background: var(--action); color: var(--ground); }
  nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; padding-block: 0.55rem 1rem; border-bottom: 1px solid var(--line); }
  nav a { display: inline-flex; align-items: center; min-height: 2.75rem; padding-inline: 0.45rem; font-weight: 650; }
  .muted { color: var(--muted); }
  .notice, .danger { max-width: none; padding: 0.9rem 1rem; border-radius: 0.65rem; }
  .notice { background: var(--warning-bg); color: var(--ink); }
  .danger { background: var(--error-bg); color: var(--ink); }
  .badge { display: inline-block; max-width: 100%; padding: 0.14rem 0.55rem; border-radius: 0.45rem; font-size: 0.78rem; line-height: 1.45; font-weight: 700; vertical-align: middle; overflow-wrap: anywhere; }
  .badge.accepted, .badge.scan-pass { background: var(--success-bg); color: var(--success); }
  .badge.rejected, .badge.scan-fail, .badge.scan-error { background: var(--error-bg); color: var(--error); }
  .badge.warn { background: var(--warning-bg); color: var(--warning); }
  .badge.no-run { background: var(--surface); color: var(--muted); border: 1px solid var(--line); }
  .status-PASS { color: var(--success); font-weight: 700; }
  .status-FAIL { color: var(--error); font-weight: 700; }
  .status-ERROR { color: var(--warning); font-weight: 700; }
  .sha, code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
  .sha { font-size: 0.82rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { padding: 0.12rem 0.45rem; border-radius: 0.35rem; background: var(--ground); font-size: 0.8rem; }
  .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .panel { min-width: 0; padding: clamp(0.9rem, 2vw, 1.3rem); border: 1px solid var(--line); border-radius: 0.75rem; background: var(--surface); overflow-wrap: anywhere; }
  .panel h2, .panel h3 { margin-top: 0; }
  dl { display: grid; grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr); gap: 0.5rem 1rem; margin: 0; }
  dt { font-weight: 650; color: var(--muted); }
  dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .shots img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 0.4rem; margin: 0.5rem 0 1rem; }
  details { margin: 0.45rem 0; }
  summary { cursor: pointer; min-height: 2.75rem; padding: 0.5rem 0; }
  pre { max-width: 100%; padding: 0.8rem; border-radius: 0.45rem; background: var(--ground); overflow-x: auto; font-size: 0.85rem; }
  button, select { min-height: 2.75rem; padding: 0.45rem 0.75rem; border: 1px solid var(--control-line); border-radius: 0.45rem; background: var(--surface); color: var(--ink); font: inherit; }
  button { cursor: pointer; border-color: var(--action); background: var(--action); color: var(--ground); font-weight: 700; }
  button:disabled { cursor: not-allowed; border-color: var(--line); background: var(--ground); color: var(--muted); }
  form.filters { display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: end; margin: 1.3rem 0; padding: 1rem; border: 1px solid var(--line); border-radius: 0.75rem; background: var(--surface); }
  form.filters label { display: flex; flex: 1 1 9rem; flex-direction: column; gap: 0.25rem; min-width: 0; font-size: 0.88rem; font-weight: 650; }
  form.filters select { width: 100%; font-weight: 400; }
  .table-scroll { max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; border: 1px solid var(--line); border-radius: 0.65rem; background: var(--surface); }
  .table-hint { margin: 0.2rem 0 0.45rem; color: var(--muted); font-size: 0.9rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  table { width: 100%; min-width: 45rem; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; font-variant-numeric: tabular-nums; }
  .corpus-table { min-width: 76rem; }
  th, td { padding: 0.75rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  th { position: sticky; top: 0; z-index: 1; background: var(--ground); font-weight: 700; white-space: nowrap; }
  tbody tr:last-child > * { border-bottom: 0; }
  tbody tr:hover { background: var(--ground); }
  .corpus-table tbody tr:not(.empty-row) td:first-child, .corpus-table thead th:first-child { position: sticky; left: 0; z-index: 2; min-width: 10.5rem; background: var(--surface); border-right: 1px solid var(--line); }
  .corpus-table thead th:first-child { z-index: 3; background: var(--ground); }
  td form { display: inline-block; margin: 0 0.25rem 0.4rem 0; }
  .journey-steps { padding-inline-start: 1.4rem; font-size: 0.9rem; overflow-wrap: anywhere; }
  .pipeline-context { margin-block: 0.8rem 1rem; }
  .pipeline-context summary { font-weight: 650; color: var(--action); }
  .tuning-selector { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; align-items: end; gap: 0.4rem 0.8rem; margin: 1.3rem 0; padding: 1rem; border: 1px solid var(--line); border-radius: 0.75rem; background: var(--surface); }
  .tuning-selector label { grid-row: 1; color: var(--muted); font-size: 0.88rem; font-weight: 700; }
  .tuning-selector select { grid-row: 2; min-width: 0; width: 100%; }
  .tuning-selector button { grid-column: 4; grid-row: 2; }
  .tuning-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: start; }
  .tuning-grid > div { display: grid; gap: 1rem; min-width: 0; }
  .tuning-grid .panel h2 { margin: 0 0 0.5rem; }
  .tuning-grid .panel p { margin-block: 0.5rem 1rem; }
  .tuning-target { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 0.4rem; }
  .tuning-editor label { display: block; font-weight: 700; margin-block: 1rem 0.25rem; }
  .tuning-editor textarea, .tuning-editor input { width: 100%; min-height: 3rem; padding: 0.65rem 0.75rem; border: 1px solid var(--control-line); border-radius: 0.45rem; background: var(--surface); color: var(--ink); font: inherit; }
  .tuning-editor textarea { min-height: 8rem; resize: vertical; font-family: inherit; }
  .tuning-editor textarea[readonly] { background: var(--ground); font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .tuning-settings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
  .tuning-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-block: 1.2rem; }
  .tuning-actions button:not([type=submit]) { background: var(--surface); color: var(--action); }
  #draft-status { color: var(--muted); font-weight: 650; }
  @media (max-width: 55rem) { .tuning-grid { grid-template-columns: minmax(0, 1fr); } .tuning-selector { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tuning-selector label, .tuning-selector select, .tuning-selector button { grid-column: auto; grid-row: auto; } .tuning-selector button { grid-column: 1 / -1; } }
  @media (max-width: 35rem) { .tuning-selector, .tuning-settings { grid-template-columns: minmax(0, 1fr); } .tuning-selector button { grid-column: auto; } }
  @media (max-width: 48rem) {
    .pair { grid-template-columns: minmax(0, 1fr); }
    dl { grid-template-columns: minmax(0, 1fr); gap: 0.1rem; }
    dd { margin-bottom: 0.5rem; }
    form.filters > button { flex: 1 1 100%; }
    .table-hint { display: block; }
  }
`;

export function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — mwg-train corpus viewer</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<nav><a href="/">corpus index</a> · <a href="/tuning">prompt workbench</a> · <a href="/pipeline">pipeline</a></nav>
<main id="content">${body}</main>
</body>
</html>`;
}

/**
 * Minimal markdown renderer for docs/PIPELINE.md (the doc stays the source of truth; the viewer
 * renders it, so the pipeline page cannot drift from the doc). Handles headings, pipe tables,
 * lists, paragraphs, and inline bold/code formatting. Everything is escaped before formatting.
 */
export function renderMarkdown(md) {
  const inline = (text) =>
    escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  const out = [];
  let list = null;
  let table = null;
  const closeBlocks = () => {
    if (list) { out.push('</ul>'); list = null; }
    if (table) { out.push('</tbody></table></div>'); table = null; }
  };
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) { closeBlocks(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { closeBlocks(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue; // separator row
      if (!table) {
        out.push('<div class="table-scroll" role="region" aria-label="Pipeline table" tabindex="0"><table><tbody>');
        out.push(`<tr>${cells.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr>`);
        table = true;
      } else {
        out.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
      }
      continue;
    }
    if (line.startsWith('- ')) {
      if (table) { out.push('</tbody></table></div>'); table = null; }
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    closeBlocks();
    if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
  }
  closeBlocks();
  return out.join('\n');
}

/**
 * Legibility banners (Paul, 2026-10-08): every page says what it shows and why it matters - and
 * only claims what this checkout can actually show. Run evidence (journeys, rule measurements,
 * screenshots) exists only where a pilot run executed locally (pilot/out/ is gitignored); the
 * committed record (CORPUS.json) carries decisions and tree SHAs, and says so.
 */
export function indexBanner({ runEvidence, projectCount, archetypeCount, armCount }) {
  const evidenceLine = runEvidence
    ? 'acceptance is backed by browser-run evidence you can click through (journeys, rule measurements, screenshots)'
    : 'this checkout has the committed record (CORPUS.json: decisions, tree SHAs, improved rules) but no local run records - journey-level evidence appears here after a local `npm run pilot:run`';
  return `
<div class="notice"><strong>${num(projectCount)} generated sites</strong> · ${num(archetypeCount)} archetypes × ${num(armCount)} rendering arms. Compare each BASELINE with deterministic MWG repair (the TARGET floor). Accepted and rejected attempts remain visible together.
<details><summary>What evidence is available, and why it matters</summary><p>This viewer covers pipeline stages 3–5 (GENERATE → MEASURE → RECORD). In this checkout, ${evidenceLine}. Rejected attempts stay visible because acceptance bias is only inspectable when they do. This is the EVAL instrument; training data comes only from a separate, disjoint corpus. <a href="/pipeline">Read the full pipeline</a>.</p></details></div>`;
}

export function projectBanner({ runEvidence }) {
  const evidenceLine = runEvidence
    ? 'the measured BASELINE vs TARGET evidence (journeys, rule tables, screenshots)'
    : 'the committed decision and SHAs (journey-level evidence exists after a local `npm run pilot:run`)';
  return `
<div class="notice"><strong>One project's evidence:</strong> attribution, acceptance, ${evidenceLine}, owner-auth status and live sandboxed trees.
<details><summary>How to read the BASELINE and TARGET</summary><p>The TARGET is the deterministic mechanical-repair floor, not a model's work; the gap above it is what training exists to close. The served trees are hash-verified against the recorded corpus. Anything that cannot be reproduced to its recorded SHA is refused, not served.</p></details></div>`;
}
export const PIPELINE_STRIP = `
<p class="muted"><strong>Pipeline</strong> (<a href="/pipeline">full doc</a>):
1 BRIEFS → 2 RULES → 3 GENERATE → 4 MEASURE → 5 RECORD/VERIFY → 6 PRICE → <strong>7 TRAIN — queued behind disjoint training-set generation (mwg-train-0ov); the sealed eval set is never trained on</strong>.
Stages 1–6 are built, measured, and active. Roles: <strong>EVAL INSTRUMENT</strong> measures and is never trained on · <strong>BASELINE</strong> is what we improve FROM · <strong>TRAINING SOURCE</strong> is the disjoint corpus accepted pairs come from · <strong>COST INPUT</strong> prices each accepted pair.</p>`;

export function stateBadge(view) {
  if (!view.hasRun) return '<span class="badge no-run">NOT YET RUN</span>';
  if (view.accepted) {
    // The recorded measurement decision and the owner-auth gate are distinct things: a pair is
    // presented as gate-clean only when the scan is a full PASS on both trees and the records.
    const gate = view.scan?.status;
    if (gate === 'PASS') return '<span class="badge accepted" title="recorded acceptance, and the owner-auth gate PASSes both trees and the records">ACCEPTED PAIR — gate-clean</span>';
    if (gate === 'PARTIAL') {
      const baselinePending = view.scan?.original?.status === 'MISSING';
      const title = baselinePending
        ? 'recorded acceptance; the trees are not on disk in this checkout - materialized from the plan, hash-verified and scanned at serve time'
        : 'recorded acceptance; baseline and records clean, the target is hash-verified and scanned at serve time';
      return `<span class="badge accepted" title="${title}">ACCEPTED PAIR — recorded; ${baselinePending ? 'trees verified+scanned at serve' : 'target scanned at serve'}</span>`;
    }
    return `<span class="badge warn">recorded acceptance — owner-auth gate ${escapeHtml(gate ?? 'not run')}: NOT gate-approved</span>`;
  }
  return `<span class="badge rejected" title="${escapeHtml(view.category)}">REJECTED ATTEMPT · ${escapeHtml(view.category)}</span>`;
}

export function scanBadge(scan) {
  if (!scan) return '<span class="badge no-run">scan: not run</span>';
  if (scan.status === 'PASS') return '<span class="badge scan-pass">owner-auth scan: PASS</span>';
  if (scan.status === 'PARTIAL') {
    const originalPending = scan.original?.status === 'MISSING';
    const targetPending = scan.uplifted?.status === 'MISSING';
    const pending = [originalPending && 'BASELINE', targetPending && 'TARGET'].filter(Boolean).join(' + ');
    const title = pending
      ? `${pending} not on disk in this checkout - materialized from the plan, hash-verified and scanned at serve time; nothing is claimed clean until then`
      : 'baseline tree clean; target snapshot not kept, regenerated and scanned at serve time';
    return `<span class="badge warn" title="${title}">owner-auth scan: ${pending ? `${pending} pending (verified+scanned at serve)` : 'PASS (baseline; target scanned at serve)'}</span>`;
  }
  if (scan.status === 'ERROR') return `<span class="badge scan-error">owner-auth scan: ERROR (fail-closed)</span>`;
  return '<span class="badge scan-fail">owner-auth scan: FAIL</span>';
}

function verificationBadge(verification, version) {
  if (!verification) return '';
  const entry = verification[version];
  if (!entry) return '';
  if (entry.status === 'verified') return '<span class="badge scan-pass">tree matches recorded sha</span>';
  if (entry.status === 'drifted') return '<span class="badge warn" title="the tree on disk no longer matches the sha recorded at run time">tree DRIFTED from recorded sha</span>';
  if (entry.status === 'unrecorded') return '<span class="badge no-run">no sha recorded</span>';
  return `<span class="badge warn">${escapeHtml(entry.status)}</span>`;
}

const shortSha = (sha) => (sha ? sha.replace(/^sha256:/, '').slice(0, 12) : '—');

/** Record-derived numbers are untrusted data too: coerce, never interpolate raw. */
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '0';
};

/**
 * Attribution for the artefact (Paul, 2026-10-08): every project/run view shows who or what made
 * it - the generating model with exact provider/id (or an explicit non-model source), the brief,
 * the framework with its pinned version, the generator with its timestamp, and the acceptance
 * status. Historical or unrecorded fields say UNKNOWN rather than implying a value.
 */
function attributionBlock(view) {
  const a = view.attribution ?? {};
  const row = (label, value) => `<dt>${label}</dt><dd>${escapeHtml(value ?? 'UNKNOWN (unrecorded)')}</dd>`;
  return `<section class="panel">
  <h2>attribution</h2>
  <dl>
    ${row('generating model', a.model)}
    ${row('brief', a.brief)}
    ${row('framework', a.framework)}
    ${row('generator', a.generator)}
    ${row('acceptance', a.acceptance)}
  </dl>
</section>`;
}

function liveLinks(view, liveOrigin, runId) {
  const scan = view.scan;
  // The buttons mirror the serving gate: a pair-level FAIL (a dirty tree OR a dirty record)
  // means the request would be refused, so the button is disabled rather than offered. A MISSING
  // tree (not materialized on disk) is servable: the live route materializes it from the plan,
  // hash-verifies it against the record, and scans it before it is reachable.
  const pairOk = scan && (scan.status === 'PASS' || scan.status === 'PARTIAL');
  const treeOk = (result) => result?.status === 'PASS' || result?.status === 'MISSING';
  const originalOk = pairOk && treeOk(scan?.original);
  const upliftedOk = pairOk && treeOk(scan?.uplifted);
  const why = !scan
    ? 'owner-auth scan cannot run (fail-closed)'
    : !pairOk
      ? `owner-auth scan: ${escapeHtml(scan.status)} - the pair is refused, records included`
      : null;
  const runPath = runId ? `/run/${encodeURIComponent(runId)}` : '';
  const button = (version, label, ok) =>
    ok
      ? `<form method="post" action="${escapeHtml(liveOrigin)}/live/${escapeHtml(view.id)}/${version}${escapeHtml(runPath)}/start" style="display:inline"><button type="submit">serve ${label} live</button></form>`
      : `<button type="button" disabled title="${why ?? `owner-auth scan: ${escapeHtml(scan?.[version]?.status ?? 'ERROR')}`}">serve ${label} live</button>`;
  return `${button('original', 'BASELINE', originalOk)} ${button('uplifted', 'TARGET', upliftedOk)}`;
}

export function renderIndex({ views, allViews, filters, runId, runs, yieldReport, scanAvailable, liveOrigin }) {
  const runEvidence = allViews.some((view) => view.runDir);
  const archetypes = [...new Set(allViews.map((view) => view.archetype))].sort();
  const frameworks = [...new Set(allViews.map((view) => view.framework))].sort();
  const categories = [...new Set(allViews.filter((view) => view.hasRun && !view.accepted).map((view) => view.category))].sort();
  const rules = [...new Set(allViews.flatMap((view) => view.requiredRules))].sort();

  const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  const knownStates = new Set(['accepted', 'rejected', 'no-run', ...categories]);
  const unknownState = filters.state && !knownStates.has(filters.state)
    ? option(filters.state, `Unknown state filter: ${filters.state}`, filters.state)
    : '';
  const runSelector =
    runs.length > 0
      ? `<label>run <select name="run">${runs.map((run) => option(run, run, runId ?? runs[0])).join('')}</select></label>`
      : '<span class="muted">no pilot run recorded yet</span>';

  const counts = {
    accepted: allViews.filter((view) => view.accepted === true).length,
    rejected: allViews.filter((view) => view.hasRun && !view.accepted).length,
    noRun: allViews.filter((view) => !view.hasRun).length,
  };

  const rows = views
    .map((view) => {
      return `<tr>
  <td><a href="/project/${escapeHtml(view.id)}${runId ? `?run=${escapeHtml(runId)}` : ''}"><code>${escapeHtml(view.id)}</code></a></td>
  <td>${escapeHtml(view.archetype)}</td>
  <td>${escapeHtml(view.framework)}${view.frameworkVersion ? ` <span class="muted">${escapeHtml(view.frameworkVersion)}</span>` : ''}</td>
  <td>${stateBadge(view)}</td>
  <td>${scanBadge(view.scan)}</td>
  <td>${view.improvedRules.length > 0 ? `<span class="chips">${view.improvedRules.map((rule) => `<span class="chip">${escapeHtml(rule)}</span>`).join('')}</span>` : '<span class="muted">—</span>'}</td>
  <td class="sha" title="original ${escapeHtml(view.originalSha ?? 'unrecorded')}">o:${escapeHtml(shortSha(view.originalSha))}<br>u:${escapeHtml(shortSha(view.upliftedSha))}</td>
  <td>${liveLinks(view, liveOrigin, runId)}</td>
</tr>`;
    })
    .join('\n');

  const yieldLine = yieldReport?.summary
    ? `<p class="muted">run <code>${escapeHtml(runId)}</code>: ${num(yieldReport.summary.attempted)} attempted, ${num(yieldReport.summary.accepted)} accepted (${((Number(yieldReport.summary.yield) || 0) * 100).toFixed(1)}% yield). Rejects are shown below with their category - acceptance bias is only inspectable if they stay visible.</p>`
    : '';

  const scanNotice = scanAvailable
    ? ''
    : '<p class="danger">The owner-auth scan configuration is missing or invalid, so no pair can be treated as accepted and live serving is refused (fail-closed).</p>';

  const hasRunData = allViews.some((view) => view.hasRun);
  const activeFilters = ['archetype', 'framework', 'state', 'rule'].some((key) => filters[key]);
  const emptyMessage = allViews.length === 0
    ? 'No corpus projects are present in this checkout. Point the viewer at a populated corpus.'
    : !hasRunData
      ? `No pilot run data is present for this selection. ${activeFilters ? 'The current filters also exclude the unrun projects. ' : ''}Run the pilot locally to record decisions, or <a href="/">show all projects</a>.`
      : `No projects match these filters. <a href="/">Clear filters</a> to see the full corpus.`;

  return page('corpus index', `
<h1>mwg-train corpus</h1>
${indexBanner({ runEvidence, projectCount: allViews.length, archetypeCount: archetypes.length, armCount: frameworks.length })}
<details class="pipeline-context"><summary>Pipeline: stages 1–6 measured · training queued</summary>${PIPELINE_STRIP}</details>
${scanNotice}
<details class="pipeline-context"><summary>Corpus terminology: BASELINE, TARGET and acceptance</summary><p class="muted">Roles: <strong>BASELINE</strong> = raw model output, kept to measure improvement FROM · <strong>TARGET</strong> = the <strong>${BASELINE_LABEL}</strong> to build TOWARDS · <strong>ACCEPTED PAIR</strong> = passed eval acceptance (training data comes only from accepted pairs of the DISJOINT training corpus — the eval set is never trained on) · <strong>REJECTED ATTEMPT</strong> = kept as negative example &amp; repair material.</p></details>
<p>${counts.accepted} accepted pair(s) · ${counts.rejected} rejected attempt(s) · ${counts.noRun} not yet run — of ${allViews.length} project(s).</p>
${yieldLine}
<form class="filters" method="get" action="/">
  ${runSelector}
  <label>archetype <select name="archetype"><option value="">(all)</option>${archetypes.map((a) => option(a, a, filters.archetype)).join('')}</select></label>
  <label>framework <select name="framework"><option value="">(all)</option>${frameworks.map((f) => option(f, f, filters.framework)).join('')}</select></label>
  <label>state <select name="state">
    ${option('', '(all)', filters.state)}
    ${unknownState}
    ${option('accepted', 'ACCEPTED PAIR', filters.state)}
    ${option('rejected', 'REJECTED ATTEMPT (any category)', filters.state)}
    ${categories.map((c) => option(c, `REJECTED ATTEMPT · ${c}`, filters.state)).join('')}
    ${option('no-run', 'NOT YET RUN', filters.state)}
  </select></label>
  <label>rule <select name="rule"><option value="">(all)</option>${rules.map((r) => option(r, r, filters.rule)).join('')}</select></label>
  <button type="submit">filter</button>
</form>
<p class="table-hint" id="corpus-table-hint">Corpus records · On small screens, scroll this table sideways; the project column stays visible.</p>
<div class="table-scroll" role="region" aria-label="Corpus projects" aria-describedby="corpus-table-hint" tabindex="0">
<table class="corpus-table">
<caption class="sr-only">Project decisions and run evidence</caption>
<thead><tr><th scope="col">project</th><th scope="col">archetype</th><th scope="col">framework</th><th scope="col">state</th><th scope="col">owner-auth</th><th scope="col">rules improved</th><th scope="col">tree sha</th><th scope="col">live</th></tr></thead>
<tbody>
${rows || `<tr class="empty-row"><td colspan="8">${emptyMessage}</td></tr>`}
</tbody>
</table>
</div>`);
}

function renderRuleRows(view) {
  const before = new Map((view.original?.rules ?? []).map((entry) => [entry.rule, entry]));
  const after = new Map((view.uplifted?.rules ?? []).map((entry) => [entry.rule, entry]));
  const ruleIds = [...new Set([...before.keys(), ...after.keys()])].sort();
  if (ruleIds.length === 0) return '<p class="muted">no rule measurements recorded</p>';
  const rows = ruleIds
    .map((rule) => {
      const b = before.get(rule);
      const a = after.get(rule);
      const improved = b?.status === 'FAIL' && a?.status === 'PASS';
      const regressed = b?.status === 'PASS' && a?.status === 'FAIL';
      const mark = improved ? ' ↑ improved' : regressed ? ' ↓ REGRESSED' : '';
      return `<tr>
  <td><code>${escapeHtml(rule)}</code>${view.requiredRules.includes(rule) ? ' <span class="muted">(required)</span>' : ''}</td>
  <td class="status-${escapeHtml(b?.status ?? '')}">${escapeHtml(b?.status ?? '—')}</td>
  <td class="status-${escapeHtml(a?.status ?? '')}">${escapeHtml(a?.status ?? '—')}${mark}</td>
  <td>${escapeHtml(a?.detail ?? b?.detail ?? '')}</td>
</tr>`;
    })
    .join('\n');
  return `<p class="table-hint" id="rule-table-hint">Scroll sideways to compare every rule at narrow widths.</p><div class="table-scroll" role="region" aria-label="Rule measurements" aria-describedby="rule-table-hint" tabindex="0"><table><caption class="sr-only">Baseline and target rule measurements</caption><thead><tr><th scope="col">rule</th><th scope="col">BASELINE</th><th scope="col">TARGET</th><th scope="col">deciding detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderJourney(record, title) {
  if (!record) return '<p class="muted">not recorded</p>';
  const journeys = record.journeys ?? [];
  if (journeys.length === 0) return '<p class="muted">no journeys recorded</p>';
  return journeys
    .map((journey) => {
      const steps = (journey.steps ?? [])
        .map((step) => `<li><code>${escapeHtml(step.step)}</code> ${escapeHtml(step.url ?? '')} ${step.status ? `[${escapeHtml(step.status)}]` : ''}${step.echoed ? ` echoed: "${escapeHtml(step.echoed)}"` : ''}</li>`)
        .join('');
      const extras = Object.entries(journey)
        .filter(([key]) => !['name', 'steps'].includes(key))
        .map(([key, value]) => `<li><code>${escapeHtml(key)}</code>: ${escapeHtml(typeof value === 'string' ? value.slice(0, 300) : JSON.stringify(value)?.slice(0, 300))}</li>`)
        .join('');
      return `<details><summary><strong>${escapeHtml(journey.name)}</strong></summary><ul class="journey-steps">${steps}${extras}</ul></details>`;
    })
    .join('');
}

function renderSecurity(record) {
  const checks = record?.security ?? [];
  if (checks.length === 0) return '<p class="muted">no security checks recorded</p>';
  return `<ul>${checks
    .map((check) => `<li><span class="status-${escapeHtml(check.status)}">${escapeHtml(check.status)}</span> <code>${escapeHtml(check.check)}</code> <span class="muted">${escapeHtml(check.detail ?? '')}</span></li>`)
    .join('')}</ul>`;
}

function renderShots(view, version, runId) {
  const labels = [`${version}-desktop.png`, `${version}-mobile.png`];
  if (!view.evidenceDir) return '<p class="muted">no evidence directory recorded</p>';
  const existing = labels.filter((file) => existsSync(join(view.evidenceDir, file)));
  if (existing.length === 0) return '<p class="muted">no screenshots recorded for this version</p>';
  return `<div class="shots">${existing
    .map((file) => `<a href="/evidence/${escapeHtml(view.id)}/${escapeHtml(file)}${runId ? `?run=${escapeHtml(runId)}` : ''}"><img src="/evidence/${escapeHtml(view.id)}/${escapeHtml(file)}${runId ? `?run=${escapeHtml(runId)}` : ''}" alt="${escapeHtml(view.id)} ${escapeHtml(version)} ${escapeHtml(file)}" loading="lazy"></a>`)
    .join('')}</div>`;
}

export function renderProject({ view, runId, runs, liveOrigin }) {
  const decision = view;
  const runEvidence = !!view.runDir;
  const runSelector =
    runs.length > 0
      ? `<form method="get" action="/project/${escapeHtml(view.id)}"><label>run <select name="run" onchange="this.form.submit()">${runs.map((run) => `<option value="${escapeHtml(run)}"${run === runId ? ' selected' : ''}>${escapeHtml(run)}</option>`).join('')}</select></label></form>`
      : '';

  const decisionBlock = !view.hasRun
    ? '<p class="notice">No pilot run has recorded an acceptance decision for this project yet (UNKNOWN).</p>'
    : `<div class="panel">
  <h3>${decision.accepted ? 'ACCEPTED PAIR — recorded eval acceptance' : `REJECTED ATTEMPT (${escapeHtml(decision.category)}) — kept as negative example &amp; repair material`}</h3>
  ${decision.accepted ? '<p class="muted">This is the EVAL corpus: acceptance here is measurement, and the eval set is never trained on. Training-data eligibility applies only to accepted pairs of the disjoint training corpus (mwg-train-0ov).</p>' : ''}
  <ul>${decision.decisionDetail.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
  ${decision.improvedRules.length > 0 ? `<p>rules improved: <span class="chips">${decision.improvedRules.map((rule) => `<span class="chip">${escapeHtml(rule)}</span>`).join('')}</span></p>` : ''}
  ${decision.regressedRules.length > 0 ? `<p class="danger">rules regressed: ${escapeHtml(decision.regressedRules.join(', '))}</p>` : ''}
  ${decision.newSecurityFindings.length > 0 ? `<p class="danger">new security findings: ${escapeHtml(decision.newSecurityFindings.join('; '))}</p>` : ''}
  <p class="muted">seeded defects: ${decision.seededDefects.length > 0 ? escapeHtml(decision.seededDefects.join(', ')) : 'none (already-clean control)'}</p>
  ${
    decision.upliftEdits
      ? `<details><summary>Deterministic MWG Repair — <strong>${BASELINE_LABEL}</strong> / Repair Reference (NOT training data): ${decision.upliftApplied.length} applied, ${decision.upliftSkipped.length} skipped, ${decision.upliftFailed.length} failed</summary><p class="muted">This is the mechanical linting floor: deterministic repair of the baseline using the Modern Web Guidance rules, produced by this repository's own tooling and not an official <code>web-uplift</code> result. For generate families it is a control &amp; measurement, not the training target; for repair families it is the reference fix for the seeded defects. It covers mechanical rules only (labels, landmarks, contrast, autofill, sanitised HTML) — it cannot repair a broken data model or missing server persistence.</p><pre>${escapeHtml(JSON.stringify(decision.upliftEdits, null, 2))}</pre></details>`
      : ''
  }
</div>`;

  const scanBlock = !view.scan
    ? '<p class="muted">owner-auth scan not run</p>'
    : `<div class="panel">
  <h3>owner-auth scan: ${view.scan.status}</h3>
  ${view.scan.status !== 'PASS' ? renderScanFindings(view.scan) : '<p>No owner-identifying material found in either tree. Synthetic demo auth (fake users) is unaffected by this rule and remains a wanted feature.</p>'}
</div>`;

  return page(view.id, `
<h1><code>${escapeHtml(view.id)}</code> ${stateBadge(view)} ${scanBadge(view.scan)}</h1>
${projectBanner({ runEvidence })}
<p class="muted">${escapeHtml(view.archetype)}${view.archetypeTitle ? ` — ${escapeHtml(view.archetypeTitle)}` : ''} · ${escapeHtml(view.framework)}${view.frameworkVersion ? ` ${escapeHtml(view.frameworkVersion)}` : ''}${view.frameworkFamily ? ` (${escapeHtml(view.frameworkFamily)})` : ''}</p>
${runSelector}
${attributionBlock(view)}
<h2>live instances ${verificationBadge(view.verification, 'original')} ${verificationBadge(view.verification, 'uplifted')}</h2>
<p>${liveLinks(view, liveOrigin, runId)}</p>
<p class="muted">Live instances are the real servers, sandboxed (no network, no host filesystem, no environment beyond an allowlist), proxied with all owner auth material stripped. Tree SHAs: BASELINE <span class="sha">${escapeHtml(view.originalSha ?? 'unrecorded')}</span> · TARGET <span class="sha">${escapeHtml(view.upliftedSha ?? 'unrecorded')}</span></p>
<h2>acceptance</h2>
${decisionBlock}
<h2>MWG rule measurements (BASELINE vs TARGET)</h2>
${renderRuleRows(view)}
<h2>owner-auth scan</h2>
${scanBlock}
<div class="pair">
  <div class="panel">
    <h3>BASELINE — browser journeys</h3>
    ${renderJourney(view.original, 'baseline')}
    <h4>security checks</h4>
    ${renderSecurity(view.original)}
    <h4>console</h4>
    <p class="muted">${view.original ? `${num(view.original.console_errors ?? 0)} error(s) of ${num((view.original.console ?? []).length)} message(s)` : 'not recorded'}</p>
    <h4>screenshots</h4>
    ${renderShots(view, 'original', runId)}
    ${view.original?.errors?.length ? `<p class="danger">errors: ${escapeHtml(view.original.errors.join('; '))}</p>` : ''}
  </div>
  <div class="panel">
    <h3>TARGET — browser journeys</h3>
    <p class="muted">the <strong>${BASELINE_LABEL}</strong> — mechanical linting by our own rule specifications, not an official <code>web-uplift</code> result, and not the training target for generate families</p>
    ${renderJourney(view.uplifted, 'target')}
    <h4>security checks</h4>
    ${renderSecurity(view.uplifted)}
    <h4>console</h4>
    <p class="muted">${view.uplifted ? `${num(view.uplifted.console_errors ?? 0)} error(s) of ${num((view.uplifted.console ?? []).length)} message(s)` : 'not recorded'}</p>
    <h4>screenshots</h4>
    ${renderShots(view, 'uplifted', runId)}
    ${view.uplifted?.errors?.length ? `<p class="danger">errors: ${escapeHtml(view.uplifted.errors.join('; '))}</p>` : ''}
  </div>
</div>`);
}

function renderScanFindings(scan) {
  const side = (name, result) => {
    if (!result) return '';
    const findings = result.findings ?? [];
    if (findings.length === 0) return `<p>${name}: clean</p>`;
    return `<p>${name}: ${findings.length} finding(s)</p><ul>${findings
      .slice(0, 50)
      .map((finding) => `<li><code>${escapeHtml(finding.file ?? '?')}</code>${finding.line ? `:${finding.line}` : ''} — ${escapeHtml(finding.patternId)}</li>`)
      .join('')}</ul>`;
  };
  return `${scan.reason ? `<p class="danger">${escapeHtml(scan.reason)}</p>` : ''}${side('BASELINE', scan.original)}${side('TARGET', scan.uplifted)}`;
}

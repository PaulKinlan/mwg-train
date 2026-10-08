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

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const PAGE_CSS = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; max-width: 1400px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { border: 1px solid #9995; padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #8882; }
  .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 0.8rem; font-size: 0.78rem; font-weight: 600; }
  .badge.accepted { background: #2a7d3233; color: #2e7d32; border: 1px solid #2e7d3255; }
  .badge.rejected { background: #c6282833; color: #c62828; border: 1px solid #c6282855; }
  .badge.no-run { background: #8882; color: inherit; }
  .badge.scan-pass { background: #2a7d3233; color: #2e7d32; border: 1px solid #2e7d3255; }
  .badge.scan-fail, .badge.scan-error { background: #c6282833; color: #c62828; border: 1px solid #c6282855; }
  .badge.warn { background: #f9a82533; color: #b28704; border: 1px solid #f9a82555; }
  .status-PASS { color: #2e7d32; font-weight: 600; }
  .status-FAIL { color: #c62828; font-weight: 600; }
  .status-ERROR { color: #b28704; font-weight: 600; }
  .sha { font-family: ui-monospace, monospace; font-size: 0.78rem; word-break: break-all; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip { font-size: 0.75rem; background: #8882; border-radius: 0.6rem; padding: 0.05rem 0.45rem; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .panel { border: 1px solid #9995; border-radius: 0.5rem; padding: 1rem; }
  .panel h3 { margin-top: 0; }
  .shots img { max-width: 100%; border: 1px solid #9995; border-radius: 0.3rem; margin-bottom: 0.5rem; }
  details { margin: 0.3rem 0; }
  summary { cursor: pointer; }
  pre { background: #8881; padding: 0.6rem; border-radius: 0.4rem; overflow-x: auto; font-size: 0.8rem; }
  form.filters { display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: end; margin: 1rem 0; padding: 0.8rem; border: 1px solid #9995; border-radius: 0.5rem; }
  form.filters label { display: flex; flex-direction: column; font-size: 0.8rem; gap: 0.2rem; }
  .muted { opacity: 0.75; }
  .notice { border: 1px solid #f9a825; background: #f9a82522; padding: 0.7rem; border-radius: 0.5rem; }
  .danger { border: 1px solid #c62828; background: #c6282822; padding: 0.7rem; border-radius: 0.5rem; }
  .journey-steps { font-size: 0.82rem; }
  nav { margin-bottom: 1rem; font-size: 0.9rem; }
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
<nav><a href="/">corpus index</a> · <a href="/pipeline">pipeline</a></nav>
${body}
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
    if (table) { out.push('</tbody></table>'); table = null; }
  };
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) { closeBlocks(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { closeBlocks(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue; // separator row
      if (!table) {
        out.push('<table><tbody>');
        out.push(`<tr>${cells.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr>`);
        table = true;
      } else {
        out.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
      }
      continue;
    }
    if (line.startsWith('- ')) {
      if (table) { out.push('</tbody></table>'); table = null; }
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

/** The strip the index shows above the table: the whole pipeline at a glance, with its position. */
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
    if (gate === 'PARTIAL') return '<span class="badge accepted" title="recorded acceptance; baseline and records clean, the target is hash-verified and scanned at serve time">ACCEPTED PAIR — recorded; target scanned at serve</span>';
    return `<span class="badge warn">recorded acceptance — owner-auth gate ${escapeHtml(gate ?? 'not run')}: NOT gate-approved</span>`;
  }
  return `<span class="badge rejected" title="${escapeHtml(view.category)}">REJECTED ATTEMPT · ${escapeHtml(view.category)}</span>`;
}

export function scanBadge(scan) {
  if (!scan) return '<span class="badge no-run">scan: not run</span>';
  if (scan.status === 'PASS') return '<span class="badge scan-pass">owner-auth scan: PASS</span>';
  if (scan.status === 'PARTIAL') return '<span class="badge warn" title="original tree clean; uplifted snapshot not kept, regenerated and scanned at serve time">owner-auth scan: PASS (original; uplifted scanned at serve)</span>';
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
  const originalOk = scan?.original?.status === 'PASS';
  const upliftedOk = scan?.uplifted?.status === 'PASS' || scan?.uplifted?.status === 'MISSING';
  const scanBroken = !scan || scan.status === 'ERROR';
  const runPath = runId ? `/run/${encodeURIComponent(runId)}` : '';
  const button = (version, label, ok) =>
    ok
      ? `<form method="post" action="${escapeHtml(liveOrigin)}/live/${escapeHtml(view.id)}/${version}${escapeHtml(runPath)}/start" style="display:inline"><button type="submit">serve ${label} live</button></form>`
      : `<button type="button" disabled title="${scanBroken ? 'owner-auth scan cannot run (fail-closed)' : `owner-auth scan: ${escapeHtml(scan?.[version]?.status ?? 'ERROR')}`}">serve ${label} live</button>`;
  return `${button('original', 'BASELINE', !scanBroken && originalOk)} ${button('uplifted', 'TARGET', !scanBroken && upliftedOk)}`;
}

export function renderIndex({ views, allViews, filters, runId, runs, yieldReport, scanAvailable, liveOrigin }) {
  const archetypes = [...new Set(allViews.map((view) => view.archetype))].sort();
  const frameworks = [...new Set(allViews.map((view) => view.framework))].sort();
  const categories = [...new Set(allViews.filter((view) => view.hasRun && !view.accepted).map((view) => view.category))].sort();
  const rules = [...new Set(allViews.flatMap((view) => view.requiredRules))].sort();

  const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
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

  return page('corpus index', `
<h1>mwg-train corpus</h1>
${PIPELINE_STRIP}
${scanNotice}
<p class="muted">Roles: <strong>BASELINE</strong> = raw model output, kept to measure improvement FROM · <strong>TARGET</strong> = the deterministic MWG repair floor to build TOWARDS · <strong>ACCEPTED PAIR</strong> = passed eval acceptance (training data comes only from accepted pairs of the DISJOINT training corpus — the eval set is never trained on) · <strong>REJECTED ATTEMPT</strong> = kept as negative example &amp; repair material.</p>
<p>${counts.accepted} accepted pair(s) · ${counts.rejected} rejected attempt(s) · ${counts.noRun} not yet run — of ${allViews.length} project(s).</p>
${yieldLine}
<form class="filters" method="get" action="/">
  ${runSelector}
  <label>archetype <select name="archetype"><option value="">(all)</option>${archetypes.map((a) => option(a, a, filters.archetype)).join('')}</select></label>
  <label>framework <select name="framework"><option value="">(all)</option>${frameworks.map((f) => option(f, f, filters.framework)).join('')}</select></label>
  <label>state <select name="state">
    ${option('', '(all)', filters.state)}
    ${option('accepted', 'ACCEPTED PAIR', filters.state)}
    ${option('rejected', 'REJECTED ATTEMPT (any category)', filters.state)}
    ${categories.map((c) => option(c, `REJECTED ATTEMPT · ${c}`, filters.state)).join('')}
    ${option('no-run', 'NOT YET RUN', filters.state)}
  </select></label>
  <label>rule <select name="rule"><option value="">(all)</option>${rules.map((r) => option(r, r, filters.rule)).join('')}</select></label>
  <button type="submit">filter</button>
</form>
<table>
<thead><tr><th>project</th><th>archetype</th><th>framework</th><th>state</th><th>owner-auth</th><th>rules improved</th><th>tree sha</th><th>live</th></tr></thead>
<tbody>
${rows || '<tr><td colspan="8" class="muted">no projects match these filters</td></tr>'}
</tbody>
</table>`);
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
  return `<table><thead><tr><th>rule</th><th>BASELINE</th><th>TARGET</th><th>deciding detail</th></tr></thead><tbody>${rows}</tbody></table>`;
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
      ? `<details><summary>Deterministic MWG Repair — Baseline Floor / Repair Reference (NOT training data): ${decision.upliftApplied.length} applied, ${decision.upliftSkipped.length} skipped, ${decision.upliftFailed.length} failed</summary><p class="muted">This is the mechanical linting floor: deterministic repair of the baseline using the Modern Web Guidance rules. For generate families it is a control &amp; measurement, not the training target; for repair families it is the reference fix for the seeded defects. It covers mechanical rules only (labels, landmarks, contrast, autofill, sanitised HTML) — it cannot repair a broken data model or missing server persistence.</p><pre>${escapeHtml(JSON.stringify(decision.upliftEdits, null, 2))}</pre></details>`
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
    <p class="muted">the deterministic MWG repair floor — mechanical linting, not the training target for generate families</p>
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

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
<nav><a href="/">corpus index</a></nav>
${body}
</body>
</html>`;
}

export function stateBadge(view) {
  if (!view.hasRun) return '<span class="badge no-run">no run recorded</span>';
  if (view.accepted) return '<span class="badge accepted">ACCEPTED</span>';
  return `<span class="badge rejected" title="${escapeHtml(view.category)}">rejected: ${escapeHtml(view.category)}</span>`;
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

function liveLinks(view) {
  const scan = view.scan;
  const originalOk = scan?.original?.status === 'PASS';
  const upliftedOk = scan?.uplifted?.status === 'PASS' || scan?.uplifted?.status === 'MISSING';
  const scanBroken = !scan || scan.status === 'ERROR';
  const button = (version, ok) =>
    ok
      ? `<form method="post" action="/live/${escapeHtml(view.id)}/${version}/start" style="display:inline"><button type="submit">serve ${version} live</button></form>`
      : `<button type="button" disabled title="${scanBroken ? 'owner-auth scan cannot run (fail-closed)' : `owner-auth scan: ${escapeHtml(scan?.[version]?.status ?? 'ERROR')}`}">serve ${version} live</button>`;
  return `${button('original', !scanBroken && originalOk)} ${button('uplifted', !scanBroken && upliftedOk)}`;
}

export function renderIndex({ views, allViews, filters, runId, runs, yieldReport, scanAvailable }) {
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
  <td>${liveLinks(view)}</td>
</tr>`;
    })
    .join('\n');

  const yieldLine = yieldReport?.summary
    ? `<p class="muted">run <code>${escapeHtml(runId)}</code>: ${yieldReport.summary.attempted} attempted, ${yieldReport.summary.accepted} accepted (${((yieldReport.summary.yield ?? 0) * 100).toFixed(1)}% yield). Rejects are shown below with their category - acceptance bias is only inspectable if they stay visible.</p>`
    : '';

  const scanNotice = scanAvailable
    ? ''
    : '<p class="danger">The owner-auth scan configuration is missing or invalid, so no pair can be treated as accepted and live serving is refused (fail-closed).</p>';

  return page('corpus index', `
<h1>mwg-train corpus</h1>
${scanNotice}
<p>${counts.accepted} accepted · ${counts.rejected} rejected · ${counts.noRun} without a run — of ${allViews.length} project(s).</p>
${yieldLine}
<form class="filters" method="get" action="/">
  ${runSelector}
  <label>archetype <select name="archetype"><option value="">(all)</option>${archetypes.map((a) => option(a, a, filters.archetype)).join('')}</select></label>
  <label>framework <select name="framework"><option value="">(all)</option>${frameworks.map((f) => option(f, f, filters.framework)).join('')}</select></label>
  <label>state <select name="state">
    ${option('', '(all)', filters.state)}
    ${option('accepted', 'accepted', filters.state)}
    ${option('rejected', 'rejected (any category)', filters.state)}
    ${categories.map((c) => option(c, `rejected: ${c}`, filters.state)).join('')}
    ${option('no-run', 'no run recorded', filters.state)}
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
  return `<table><thead><tr><th>rule</th><th>original</th><th>uplifted</th><th>deciding detail</th></tr></thead><tbody>${rows}</tbody></table>`;
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

export function renderProject({ view, runId, runs }) {
  const decision = view;
  const runSelector =
    runs.length > 0
      ? `<form method="get" action="/project/${escapeHtml(view.id)}"><label>run <select name="run" onchange="this.form.submit()">${runs.map((run) => `<option value="${escapeHtml(run)}"${run === runId ? ' selected' : ''}>${escapeHtml(run)}</option>`).join('')}</select></label></form>`
      : '';

  const decisionBlock = !view.hasRun
    ? '<p class="notice">No pilot run has recorded a decision for this project yet.</p>'
    : `<div class="panel">
  <h3>decision: ${decision.accepted ? 'ACCEPTED' : `rejected (${decision.category})`}</h3>
  <ul>${decision.decisionDetail.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
  ${decision.improvedRules.length > 0 ? `<p>rules improved: <span class="chips">${decision.improvedRules.map((rule) => `<span class="chip">${escapeHtml(rule)}</span>`).join('')}</span></p>` : ''}
  ${decision.regressedRules.length > 0 ? `<p class="danger">rules regressed: ${escapeHtml(decision.regressedRules.join(', '))}</p>` : ''}
  ${decision.newSecurityFindings.length > 0 ? `<p class="danger">new security findings: ${escapeHtml(decision.newSecurityFindings.join('; '))}</p>` : ''}
  <p class="muted">seeded defects: ${decision.seededDefects.length > 0 ? escapeHtml(decision.seededDefects.join(', ')) : 'none (already-clean control)'}</p>
  ${
    decision.upliftEdits
      ? `<details><summary>uplift edits (${decision.upliftApplied.length} applied, ${decision.upliftSkipped.length} skipped, ${decision.upliftFailed.length} failed)</summary><pre>${escapeHtml(JSON.stringify(decision.upliftEdits, null, 2))}</pre></details>`
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
<h2>live instances ${verificationBadge(view.verification, 'original')} ${verificationBadge(view.verification, 'uplifted')}</h2>
<p>${liveLinks(view)}</p>
<p class="muted">Live instances are the real servers, sandboxed (no network, no host filesystem, no environment beyond an allowlist), proxied with all owner auth material stripped. Tree SHAs: original <span class="sha">${escapeHtml(view.originalSha ?? 'unrecorded')}</span> · uplifted <span class="sha">${escapeHtml(view.upliftedSha ?? 'unrecorded')}</span></p>
<h2>pair decision</h2>
${decisionBlock}
<h2>MWG rule measurements (original vs uplifted)</h2>
${renderRuleRows(view)}
<h2>owner-auth scan</h2>
${scanBlock}
<div class="pair">
  <div class="panel">
    <h3>original — browser journeys</h3>
    ${renderJourney(view.original, 'original')}
    <h4>security checks</h4>
    ${renderSecurity(view.original)}
    <h4>console</h4>
    <p class="muted">${view.original ? `${view.original.console_errors ?? 0} error(s) of ${(view.original.console ?? []).length} message(s)` : 'not recorded'}</p>
    <h4>screenshots</h4>
    ${renderShots(view, 'original', runId)}
    ${view.original?.errors?.length ? `<p class="danger">errors: ${escapeHtml(view.original.errors.join('; '))}</p>` : ''}
  </div>
  <div class="panel">
    <h3>uplifted — browser journeys</h3>
    ${renderJourney(view.uplifted, 'uplifted')}
    <h4>security checks</h4>
    ${renderSecurity(view.uplifted)}
    <h4>console</h4>
    <p class="muted">${view.uplifted ? `${view.uplifted.console_errors ?? 0} error(s) of ${(view.uplifted.console ?? []).length} message(s)` : 'not recorded'}</p>
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
  return `${scan.reason ? `<p class="danger">${escapeHtml(scan.reason)}</p>` : ''}${side('original', scan.original)}${side('uplifted', scan.uplifted)}`;
}

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { escapeHtml, page } from './pages.mjs';
import { BASELINE_LABEL } from '../eval/ruleset.mjs';

const FAMILY_RE = /^tr-\d{2}$/;
const sha = (value) => value ? escapeHtml(String(value)) : 'not recorded';
const text = (value) => escapeHtml(value ?? 'not recorded');

/** This surface reads only training-side, committed evidence. It never opens the sealed eval set. */
export function loadTuningData(repoRoot) {
  const missing = [];
  const readCommitted = (path) => {
    try { return readFileSync(join(repoRoot, path), 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.push(path);
      return null;
    }
  };
  const briefText = readCommitted('docs/train/briefs/manifest.jsonl');
  const manifest = briefText ? briefText.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line)) : [];
  const projectText = readCommitted('pilot/TRAINING_CORPUS.json');
  const projects = projectText ? JSON.parse(projectText).projects : [];
  const measuredText = readCommitted('docs/train/corpus/records.json');
  const measured = measuredText ? JSON.parse(measuredText).projects : [];
  const families = new Map();
  for (const row of manifest) {
    if (!FAMILY_RE.test(row.family_id) || !/^tr-\d{2}-v[12]$/.test(row.brief_id)) continue;
    if (!families.has(row.family_id)) families.set(row.family_id, []);
    families.get(row.family_id).push(row);
  }
  return { families, projects, measured, missing };
}

const list = (items) => `<ul>${(items ?? []).map((item) => `<li>${text(item)}</li>`).join('')}</ul>`;
const option = (value, label, selected) => `<option value="${text(value)}"${value === selected ? ' selected' : ''}>${text(label)}</option>`;

export function renderTuning({ data, familyId, variant = 'v1', framework = 'raw', repoRoot }) {
  const ids = [...data.families.keys()].sort();
  const selectedFamily = data.families.has(familyId) ? familyId : ids[0];
  const variants = data.families.get(selectedFamily) ?? [];
  const selectedVariant = variants.find((row) => row.brief_id.endsWith(`-${variant}`)) ?? variants[0];
  const artifacts = data.projects.filter((project) => project.family_id === selectedFamily);
  const frameworks = artifacts.map((project) => project.framework);
  const selectedFramework = frameworks.includes(framework) ? framework : frameworks[0];
  const artifact = artifacts.find((project) => project.framework === selectedFramework);
  const record = data.measured.find((project) => project.project_id === artifact?.project_id);
  const targetPath = selectedFamily && join(repoRoot, 'data/A1_self_generated/targets', selectedFamily, 'target.png');
  const targetAvailable = !!targetPath && existsSync(targetPath);
  const image = targetAvailable ? readFileSync(targetPath) : null;
  const png = image?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const imageSize = png && image.length >= 24 ? ` width="${image.readUInt32BE(16)}" height="${image.readUInt32BE(20)}"` : '';
  if (!selectedVariant) return page('prompt workbench', `<h1>No authored training briefs are available</h1><p>${data.missing?.length ? `Missing committed training input: ${data.missing.map(text).join(', ')}.` : 'There is nothing to tune in this checkout.'}</p>`);

  const selector = `<form method="get" action="/tuning" class="tuning-selector" aria-label="Choose training brief">
    <label for="family">Training family</label><select id="family" name="family">${ids.map((id) => option(id, `${id} · ${data.families.get(id)[0].topic}`, selectedFamily)).join('')}</select>
    <label for="variant">Prompt voice</label><select id="variant" name="variant">${variants.map((row) => option(row.brief_id.slice(-2), row.brief_id.slice(-2), selectedVariant.brief_id.slice(-2))).join('')}</select>
    <label for="framework">Template arm</label><select id="framework" name="framework">${frameworks.map((name) => option(name, name, selectedFramework)).join('')}</select>
    <button type="submit">Inspect brief</button>
  </form>`;

  const detail = `<section class="panel" aria-labelledby="contract-heading">
    <h2 id="contract-heading">Authored brief contract</h2>
    <p><strong>${text(selectedVariant.brief_id)}</strong> · ${text(selectedVariant.archetype)} · ${text(selectedVariant.task)} · ${text(selectedVariant.locale)}</p>
    <p class="muted">The two variants of this family share these requirements; the prompt wording is the only editable part in this workbench. A draft does not revise this contract.</p>
    <details><summary>Compare the original authored prompts (${variants.length} voices)</summary>${variants.map((row) => `<div class="tuning-source"><h3>${text(row.brief_id)}</h3><p>${text(row.prompt)}</p></div>`).join('')}</details>
    <details><summary>Routes (${selectedVariant.routes.length})</summary>${list(selectedVariant.routes)}</details>
    <details><summary>Journeys (${selectedVariant.journeys.length})</summary>${list(selectedVariant.journeys)}</details>
    <details><summary>Assertions (${selectedVariant.assertions.length})</summary>${list(selectedVariant.assertions)}</details>
    <details><summary>Required guidance (${selectedVariant.required_rules.length})</summary>${list(selectedVariant.required_rules)}</details>
    <details><summary>Non-goals (${selectedVariant.non_goals.length})</summary>${list(selectedVariant.non_goals)}</details>
  </section>`;

  const target = `<section class="panel" aria-labelledby="target-heading">
    <h2 id="target-heading">Authored target design</h2>
    <p class="muted">Independent visual reference for ${text(selectedFamily)}, not generated by this editor and not a model output. Source: <code>docs/train/targets/${text(selectedFamily)}/index.html</code>.</p>
    ${targetAvailable ? `<img class="tuning-target" src="/tuning/target/${text(selectedFamily)}.png" alt="Authored target design for ${text(selectedVariant.topic)}" loading="lazy"${imageSize}>` : '<p>No target image is available in this checkout.</p>'}
  </section>`;

  const evidence = `<section class="panel" aria-labelledby="output-heading">
    <h2 id="output-heading">Deterministic template output</h2>
    <p>${artifact ? `<strong>${text(artifact.project_id)}</strong> · scaffolded from ${text(artifact.brief_id)} · tree ${sha(artifact.tree_sha)}` : 'No scaffold record for this framework.'}</p>
    <p class="muted">The scaffold is a recorded template, not a model-generated site. Editing the prompt or settings below does not regenerate it. A rendered template screenshot is not retained in this checkout; do not confuse the authored target above with generated output.</p>
    ${artifact ? `<p>Form schema: ${text(artifact.schema_source ?? 'unrecorded')} · route conformance: ${artifact.route_conformed ? 'recorded as conformant' : 'not recorded as conformant'}</p>` : ''}
    ${record ? `<p>Measured sample from ${text(record.brief_id)} — <strong>${text(BASELINE_LABEL)}</strong> (our deterministic repair, not an official web-uplift result): ${record.decision.accepted ? 'accepted' : 'rejected'} · ${text(record.decision.category)}. Original ${sha(record.original_sha)} · target-floor uplift ${sha(record.uplifted_sha)}.</p><details><summary>Measurement details</summary>${list(record.decision.detail)}</details>` : '<p class="muted">No measured run for this family/framework in the 40-project sample; a missing record is not a failure or a pass.</p>'}
  </section>`;

  const draft = `<section class="panel tuning-editor" aria-labelledby="draft-heading">
    <h2 id="draft-heading">Tune a local draft</h2>
    <p class="muted">No model is run. These settings are hypotheses for a future generation pipeline; they do not affect the committed template, target or training data. Drafts stay in this browser until exported.</p>
    <noscript><p class="danger">Editing and exporting local drafts requires JavaScript; the authored brief and target above remain readable.</p></noscript>
    <form id="tuning-draft" method="post" action="/tuning" data-brief-id="${text(selectedVariant.brief_id)}" data-framework="${text(selectedFramework)}">
      <label for="prompt">Prompt wording</label><textarea id="prompt" name="prompt" rows="8" required minlength="80" aria-describedby="prompt-help">${text(selectedVariant.prompt)}</textarea>
      <p id="prompt-help" class="muted">The original brief remains unchanged. Keep routes, journeys and assertions consistent with the contract.</p>
      <label for="guidance">System guidance (draft only)</label><textarea id="guidance" name="system_guidance" rows="4" aria-describedby="guidance-help"></textarea>
      <p id="guidance-help" class="muted">No system prompt or model runner exists in this repository yet.</p>
      <div class="tuning-settings">
        <div><label for="temperature">Temperature</label><input id="temperature" name="temperature" type="number" min="0" max="2" step="0.1" value="0.7" required></div>
        <div><label for="max-tokens">Max tokens</label><input id="max-tokens" name="max_tokens" type="number" min="256" max="8192" step="1" value="2048" required></div>
        <div><label for="seed">Seed</label><input id="seed" name="seed" type="number" min="0" max="2147483647" step="1" value="42" required></div>
      </div>
      <div class="tuning-actions"><button type="submit">Export draft JSON</button><button type="button" id="copy-draft">Copy draft JSON</button><button type="button" id="reset-draft">Reset local draft</button></div>
      <p id="draft-status" role="status" aria-live="polite">Changes are saved only in this browser.</p>
      <label for="draft-json">Export preview</label><textarea id="draft-json" rows="8" readonly aria-describedby="export-help"></textarea>
      <p id="export-help" class="muted">Exporting a file does not approve a training pair or change a manifest. Apply and validate any proposed changes separately.</p>
    </form>
  </section>`;

  return page('prompt workbench', `
    <h1>Prompt workbench</h1>
    <p class="muted">Inspect authored training briefs, their design references and recorded template evidence. Work on one local, unapproved draft at a time. No hosted model calls or training jobs run here.</p>
    ${data.missing?.length ? `<p class="notice">Committed training input unavailable in this checkout: ${data.missing.map(text).join(', ')}. Missing evidence is not a pass or failure.</p>` : ''}
    ${selector}
    <div class="tuning-grid"><div>${draft}${detail}</div><div>${target}${evidence}</div></div>
    <script src="/tuning/client.js" defer></script>
  `);
}

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { escapeHtml, page } from './pages.mjs';
import { BASELINE_LABEL } from '../eval/ruleset.mjs';
import { IMAGE_MODEL } from './generate.mjs';

const FAMILY_RE = /^tr-\d{2}$/;
const sha = (value) => (value ? escapeHtml(String(value)) : '<span class="muted">absent</span>');
const text = (value) => escapeHtml(value ?? 'not recorded');

/**
 * Computes a word-level difference highlighting between two prompts.
 * Shared words are kept plain; words unique to promptA are wrapped with .diff-v1;
 * words unique to promptB are wrapped with .diff-v2.
 */
export function computeWordDiff(promptA, promptB) {
  const tokensA = promptA.match(/\S+|\s+/g) || [];
  const tokensB = promptB.match(/\S+|\s+/g) || [];

  const isWord = (t) => /\S/.test(t);
  const cleanA = tokensA.filter(isWord).map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, ''));
  const cleanB = tokensB.filter(isWord).map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, ''));

  const n = cleanA.length;
  const m = cleanB.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      dp[i + 1][j + 1] = cleanA[i] === cleanB[j] ? dp[i][j] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matchedA = new Set();
  const matchedB = new Set();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (cleanA[i - 1] === cleanB[j - 1]) {
      matchedA.add(i - 1);
      matchedB.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  let wordIdxA = 0;
  const htmlA = tokensA.map((t) => {
    if (!isWord(t)) return escapeHtml(t);
    const matched = matchedA.has(wordIdxA++);
    const safe = escapeHtml(t);
    return matched ? safe : `<mark class="diff-chip diff-v1">${safe}</mark>`;
  }).join('');

  let wordIdxB = 0;
  const htmlB = tokensB.map((t) => {
    if (!isWord(t)) return escapeHtml(t);
    const matched = matchedB.has(wordIdxB++);
    const safe = escapeHtml(t);
    return matched ? safe : `<mark class="diff-chip diff-v2">${safe}</mark>`;
  }).join('');

  const matchedWords = matchedA.size;
  const overlapPercent = n + m > 0 ? Math.round(((2 * matchedWords) / (n + m)) * 100) : 0;

  return { htmlA, htmlB, stats: { matchedWords, totalA: n, totalB: m, overlapPercent } };
}

export function readJpegDimensions(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    while (buffer[offset] === 0xff && offset < buffer.length) offset++;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset++;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + 7 > buffer.length) break;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return { width, height };
    }
    if (offset + 2 > buffer.length) break;
    const len = buffer.readUInt16BE(offset);
    offset += len;
  }
  return null;
}

function formatGenerator(gen) {
  if (!gen) return '<span class="muted">absent</span>';
  if (typeof gen === 'string') return `<code>${escapeHtml(gen)}</code>`;
  const parts = [];
  if (gen.type) parts.push(`type: ${escapeHtml(gen.type)}`);
  if (gen.tool) parts.push(`tool: ${escapeHtml(gen.tool)}`);
  if (gen.browser) parts.push(`browser: ${escapeHtml(gen.browser)}`);
  return parts.length ? `<code>${parts.join(' · ')}</code>` : '<span class="muted">absent</span>';
}

/** This surface reads only training-side, committed evidence. It never opens the sealed eval set. */
export function loadTuningData(repoRoot) {
  const missing = [];
  const readCommitted = (path) => {
    try {
      return readFileSync(join(repoRoot, path), 'utf8');
    } catch (error) {
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
  const targetManifestText = readCommitted('data/A1_self_generated/targets/manifest.jsonl');
  const targetManifest = targetManifestText ? targetManifestText.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line)) : [];
  const families = new Map();
  for (const row of manifest) {
    if (!FAMILY_RE.test(row.family_id) || !/^tr-\d{2}-v[12]$/.test(row.brief_id)) continue;
    if (!families.has(row.family_id)) families.set(row.family_id, []);
    families.get(row.family_id).push(row);
  }
  const targetRecords = new Map();
  for (const row of targetManifest) {
    const fam = row.family_id ?? row.family;
    if (fam) targetRecords.set(fam, row);
  }
  return { families, projects, measured, targetRecords, missing };
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
  const targetRecord = data.targetRecords?.get(selectedFamily) ?? null;

  const targetRel = selectedFamily ? `data/A1_self_generated/targets/${selectedFamily}/target.png` : null;
  const targetPath = targetRel ? join(repoRoot, targetRel) : null;
  const targetAvailable = !!targetPath && existsSync(targetPath);
  const image = targetAvailable ? readFileSync(targetPath) : null;
  const png = image?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = png && image.length >= 24 ? image.readUInt32BE(16) : null;
  const height = png && image.length >= 24 ? image.readUInt32BE(20) : null;
  const imageSize = width && height ? ` width="${width}" height="${height}"` : '';
  const dimensionsText = targetAvailable && width && height ? `${width} × ${height} px` : '<span class="muted">absent</span>';

  const refRel = selectedFamily ? `docs/design/training/${selectedFamily}/reference.jpg` : null;
  const refPath = refRel ? join(repoRoot, refRel) : null;
  const refAvailable = !!refPath && existsSync(refPath);
  const refBuffer = refAvailable ? readFileSync(refPath) : null;
  const refDims = refBuffer ? readJpegDimensions(refBuffer) : null;
  const refWidth = refDims?.width ?? null;
  const refHeight = refDims?.height ?? null;
  const refImageSize = refWidth && refHeight ? ` width="${refWidth}" height="${refHeight}"` : '';
  const refDimensionsText = refAvailable && refWidth && refHeight ? `${refWidth} × ${refHeight} px` : '<span class="muted">absent</span>';

  // Which families actually have a board is a FACT ABOUT THE TREE, not a list to restate. Deriving it here means the
  // empty-state copy cannot go stale as boards are authored - it was a hardcoded sentence naming three families, which
  // would have become false the moment a fourth board landed, in the one panel whose job is honesty about what is
  // missing. Symlinks are refused here for the same reason the /tuning/reference/ route refuses them: a symlinked
  // directory is not an authored board.
  const referenceFamilies = (() => {
    const dir = join(repoRoot, 'docs/design/training');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => /^tr-\d{2}$/.test(name))
      .filter((name) => {
        const familyPath = join(dir, name);
        const boardPath = join(familyPath, 'reference.jpg');
        try {
          return lstatSync(familyPath).isDirectory() && !lstatSync(familyPath).isSymbolicLink()
            && lstatSync(boardPath).isFile() && !lstatSync(boardPath).isSymbolicLink();
        } catch { return false; }
      })
      .sort();
  })();

  if (!selectedVariant) return page('prompt workbench', `<h1>No authored training briefs are available</h1><p>${data.missing?.length ? `Missing committed training input: ${data.missing.map(text).join(', ')}.` : 'There is nothing to tune in this checkout.'}</p>`);

  const selector = `<form method="get" action="/tuning" class="tuning-selector" aria-label="Choose training brief">
    <label for="family">Training family</label><select id="family" name="family">${ids.map((id) => option(id, `${id} · ${data.families.get(id)[0].topic}`, selectedFamily)).join('')}</select>
    <label for="variant">Prompt voice</label><select id="variant" name="variant">${variants.map((row) => option(row.brief_id.slice(-2), row.brief_id.slice(-2), selectedVariant.brief_id.slice(-2))).join('')}</select>
    <label for="framework">Template arm</label><select id="framework" name="framework">${frameworks.map((name) => option(name, name, selectedFramework)).join('')}</select>
    <button type="submit">Inspect brief</button>
  </form>`;

  // 1. Side-by-side prompt comparison
  let diffA = null;
  let diffB = null;
  let diffStats = null;
  if (variants.length === 2) {
    const res = computeWordDiff(variants[0].prompt, variants[1].prompt);
    diffA = res.htmlA;
    diffB = res.htmlB;
    diffStats = res.stats;
  }

  const voiceCards = variants.map((v, idx) => {
    const isSelected = v.brief_id === selectedVariant.brief_id;
    const wordCount = v.prompt.split(/\s+/).filter(Boolean).length;
    const charCount = v.prompt.length;
    const diffHtml = idx === 0 && diffA ? diffA : idx === 1 && diffB ? diffB : escapeHtml(v.prompt);

    return `<div class="prompt-voice-card${isSelected ? ' active' : ''}">
      <div class="prompt-voice-header">
        <div>
          <h3><code>${text(v.brief_id)}</code></h3>
          <span class="muted">${wordCount} words · ${charCount} chars</span>
        </div>
        <div>
          ${isSelected
            ? '<span class="badge accepted">Active in editor</span>'
            : `<a href="/tuning?family=${text(selectedFamily)}&variant=${text(v.brief_id.slice(-2))}&framework=${text(selectedFramework)}" class="button-link small">Switch editor to ${text(v.brief_id.slice(-2))}</a>`}
        </div>
      </div>
      <div class="prompt-voice-body">
        <p class="prompt-voice-text">${diffHtml}</p>
      </div>
    </div>`;
  }).join('');

  const diffLegend = diffStats ? `
    <div class="diff-legend" aria-label="Wording difference legend">
      <span><mark class="diff-chip diff-v1">Highlighted</mark> unique to ${text(variants[0].brief_id)}</span>
      <span><mark class="diff-chip diff-v2">Highlighted</mark> unique to ${text(variants[1].brief_id)}</span>
      <span>Plain text: shared vocabulary (${diffStats.matchedWords} words, ${diffStats.overlapPercent}% overlap)</span>
    </div>` : '';

  const promptComparison = `<section class="panel prompt-comparison-panel" aria-labelledby="comparison-heading">
    <div class="comparison-panel-header">
      <h2 id="comparison-heading">Compare the original authored prompts (${variants.length} voices)</h2>
      <p class="muted">The two variants of ${text(selectedFamily)} share the identical brief contract (routes, journeys, assertions); only the prompt voice differs. Read both voices side by side to compare phrasing hypotheses.</p>
    </div>
    <div class="prompt-comparison-grid">${voiceCards}</div>
    ${diffLegend}
  </section>`;

  // 2. Draft convergence preview
  const previewTargetCard = `<div class="convergence-target-col">
    <div class="convergence-col-header">
      <h3>Reference target design</h3>
      <span class="muted">${text(selectedFamily)} · ${targetAvailable ? `Actual dimensions: <strong>${dimensionsText}</strong>` : 'Target image absent'}</span>
    </div>
    ${targetAvailable ? `
      <div class="target-preview-frame">
        <a href="/tuning/target/${text(selectedFamily)}.png" target="_blank" rel="noopener" title="Open full size reference target">
          <img class="tuning-target" src="/tuning/target/${text(selectedFamily)}.png" alt="Reference target for ${text(selectedVariant.topic)}" loading="lazy"${imageSize}>
        </a>
      </div>
      <div class="target-actions">
        <a class="button-link small" href="/tuning/target/${text(selectedFamily)}.png" target="_blank" rel="noopener">Open full size (${dimensionsText})</a>
      </div>` : `
      <p class="notice">Target image absent: no target image found at <code>${text(targetRel)}</code>.</p>`}
  </div>`;

  const draftWordCount = selectedVariant.prompt.split(/\s+/).filter(Boolean).length;
  const previewDraftCard = `<div class="convergence-draft-col">
    <div class="convergence-col-header">
      <h3>Tuned draft prompt</h3>
      <span class="muted">Derived from <code>${text(selectedVariant.brief_id)}</code></span>
    </div>
    <div id="live-draft-text" class="draft-prompt-live">${text(selectedVariant.prompt)}</div>
    <div class="draft-meta-pills chips">
      <span class="chip" id="draft-word-count">${draftWordCount} words</span>
      <span class="chip" id="draft-delta-pill">Identical to authored voice</span>
      <span class="chip" id="draft-temp-pill">Temp: 0.7</span>
      <span class="chip" id="draft-tokens-pill">Max tokens: 2048</span>
      <span class="chip" id="draft-seed-pill">Seed: 42</span>
    </div>
    <p class="muted" style="margin-top: 0.5rem; font-size: 0.85rem;">Edit the draft in the form below. As you type, this preview updates live so you can judge convergence against the reference target on the left.</p>
  </div>`;

  const convergencePreview = `<section class="panel convergence-preview-panel" aria-labelledby="convergence-heading">
    <div class="preview-panel-header">
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;">
        <h2 id="convergence-heading">Draft convergence preview</h2>
        <span class="badge warn" id="draft-badge">LOCAL DRAFT · UNAPPROVED</span>
      </div>
      <p class="muted">Compare the draft prompt you are currently editing directly against the reference target design to judge convergence before exporting.</p>
      <div class="draft-callout">
        <strong>Draft is not saved over the brief:</strong> This tuned prompt is an isolated in-browser hypothesis. It does not overwrite the authored brief contract (<code>${text(selectedVariant.brief_id)}</code>), recorded templates, or corpus files.
      </div>
    </div>
    <div class="convergence-grid">${previewTargetCard}${previewDraftCard}</div>
  </section>`;

  // 3. Authored brief contract
  const detail = `<section class="panel" aria-labelledby="contract-heading">
    <h2 id="contract-heading">Authored brief contract</h2>
    <p><strong>${text(selectedVariant.brief_id)}</strong> · ${text(selectedVariant.archetype)} · ${text(selectedVariant.task)} · ${text(selectedVariant.locale)}</p>
    <p class="muted">The two variants of this family share these requirements; the prompt wording is the only editable part in this workbench. A draft does not revise this contract.</p>
    <details><summary>Routes (${selectedVariant.routes.length})</summary>${list(selectedVariant.routes)}</details>
    <details><summary>Journeys (${selectedVariant.journeys.length})</summary>${list(selectedVariant.journeys)}</details>
    <details><summary>Assertions (${selectedVariant.assertions.length})</summary>${list(selectedVariant.assertions)}</details>
    <details><summary>Required guidance (${selectedVariant.required_rules.length})</summary>${list(selectedVariant.required_rules)}</details>
    <details><summary>Non-goals (${selectedVariant.non_goals.length})</summary>${list(selectedVariant.non_goals)}</details>
  </section>`;

  // 4. Live target inspection
  const generatorHtml = formatGenerator(targetRecord?.generator);
  const trainingStatus = targetRecord
    ? `<code>excluded_from_training: ${escapeHtml(String(targetRecord.excluded_from_training ?? 'absent'))}</code> · <code>approved_for_training: ${escapeHtml(String(targetRecord.approved_for_training ?? 'absent'))}</code>`
    : '<span class="muted">absent</span>';

  const target = `<section class="panel target-inspection-panel" aria-labelledby="target-heading">
    <h2 id="target-heading">Live target inspection</h2>
    <p class="muted">Independent visual reference and provenance record for ${text(selectedFamily)}, not generated by this editor and not a model output. Source: <code>${text(targetRecord?.origin ?? `docs/train/targets/${selectedFamily}/index.html`)}</code>.</p>
    <div class="target-boards-pair">
      <div class="target-board-card">
        <div class="convergence-col-header">
          <h3>Authored target design</h3>
          <span class="muted">${dimensionsText}</span>
        </div>
        ${targetAvailable ? `
          <div class="target-inspection-frame">
            <a href="/tuning/target/${text(selectedFamily)}.png" target="_blank" rel="noopener" title="Open full size target design">
              <img class="tuning-target" src="/tuning/target/${text(selectedFamily)}.png" alt="Authored target design for ${text(selectedVariant.topic)}" loading="lazy"${imageSize}>
            </a>
          </div>
          <div class="target-actions">
            <a class="button-link small" href="/tuning/target/${text(selectedFamily)}.png" target="_blank" rel="noopener">Open full size (${dimensionsText})</a>
          </div>` : `
          <p class="notice">Target image absent: no target image found at <code>${text(targetRel)}</code>.</p>`}
      </div>

      <div class="target-board-card">
        <div class="convergence-col-header">
          <h3>High-fidelity reference board</h3>
          <span class="muted">${refDimensionsText}</span>
        </div>
        ${refAvailable && refDims ? `
          <div class="target-inspection-frame">
            <a href="/tuning/reference/${text(selectedFamily)}.jpg" target="_blank" rel="noopener" title="Open full size reference board">
              <img class="tuning-target" src="/tuning/reference/${text(selectedFamily)}.jpg" alt="Production reference board for ${text(selectedVariant.topic)}" loading="lazy"${refImageSize}>
            </a>
          </div>
          <div class="target-actions">
            <a class="button-link small" href="/tuning/reference/${text(selectedFamily)}.jpg" target="_blank" rel="noopener">Open full size (${refDimensionsText})</a>
          </div>` : `
          <div class="reference-missing-card">
            <p class="muted">No reference board yet for this family.</p>
            <p class="muted" style="font-size: 0.85rem;">${referenceFamilies.length
              ? `High-fidelity reference boards currently exist for ${referenceFamilies.map((f) => `<code>${escapeHtml(f)}</code>`).join(', ')}.`
              : 'No high-fidelity reference boards have been authored yet.'} Other families are pending visual standard authoring.</p>
          </div>`}
      </div>
    </div>

    <h3 style="margin-top: 1.5rem;">Target manifest metadata</h3>
    <p class="muted">Committed record from <code>data/A1_self_generated/targets/manifest.jsonl</code>. Fields not in this family's record are reported honestly as absent.</p>
    <dl class="tuning-target-meta">
      <dt>Manifest ID</dt><dd><code>${targetRecord?.id ? escapeHtml(targetRecord.id) : '<span class="muted">absent</span>'}</code></dd>
      <dt>Family</dt><dd><code>${targetRecord?.family_id || targetRecord?.family ? escapeHtml(targetRecord.family_id || targetRecord.family) : (selectedFamily ? escapeHtml(selectedFamily) : '<span class="muted">absent</span>')}</code></dd>
      <dt>Actual dimensions</dt><dd>${dimensionsText}</dd>
      <dt>Reference board</dt><dd>${refAvailable && refDims ? `<code>docs/design/training/${escapeHtml(selectedFamily)}/reference.jpg</code> (${refDimensionsText})` : '<span class="muted">no reference board yet for this family</span>'}</dd>
      <dt>Storage path</dt><dd><code>${targetRecord?.storage_path ? escapeHtml(targetRecord.storage_path) : '<span class="muted">absent</span>'}</code></dd>
      <dt>Rights reference</dt><dd>${targetRecord?.rights_ref ? `<code>${escapeHtml(targetRecord.rights_ref)}</code>` : '<span class="muted">absent</span>'}</dd>
      <dt>Generator</dt><dd>${generatorHtml}</dd>
      <dt>Origin source</dt><dd>${targetRecord?.origin ? `<code>${escapeHtml(targetRecord.origin)}</code>` : '<span class="muted">absent</span>'}</dd>
      <dt>License</dt><dd>${targetRecord?.license ? escapeHtml(targetRecord.license) : '<span class="muted">absent</span>'}</dd>
      <dt>Target image SHA-256</dt><dd>${targetRecord?.image_sha256 ? sha(targetRecord.image_sha256) : '<span class="muted">absent</span>'}</dd>
      <dt>Training status</dt><dd>${trainingStatus}</dd>
    </dl>
  </section>`;

  // 5. Deterministic template output evidence
  const evidence = `<section class="panel" aria-labelledby="output-heading">
    <h2 id="output-heading">Deterministic template output</h2>
    <p>${artifact ? `<strong>${text(artifact.project_id)}</strong> · scaffolded from ${text(artifact.brief_id)} · tree ${sha(artifact.tree_sha)}` : 'No scaffold record for this framework.'}</p>
    <p class="muted">The scaffold is a recorded template, not a model-generated site. Editing the prompt or settings below does not regenerate it. A rendered template screenshot is not retained in this checkout; do not confuse the authored target above with generated output.</p>
    ${artifact ? `<p>Form schema: ${text(artifact.schema_source ?? 'unrecorded')} · route conformance: ${artifact.route_conformed ? 'recorded as conformant' : 'not recorded as conformant'}</p>` : ''}
    ${record ? `<p>Measured sample from ${text(record.brief_id)} — <strong>${text(BASELINE_LABEL)}</strong> (our deterministic repair, not an official web-uplift result): ${record.decision.accepted ? 'accepted' : 'rejected'} · ${text(record.decision.category)}. Original ${sha(record.original_sha)} · target-floor uplift ${sha(record.uplifted_sha)}.</p><details><summary>Measurement details</summary>${list(record.decision.detail)}</details>` : '<p class="muted">No measured run for this family/framework in the 40-project sample; a missing record is not a failure or a pass.</p>'}
  </section>`;

  // 6. Generate a board from the draft: the one interactive, hosted call in this surface
  const generation = `<section class="panel board-generation-panel" aria-labelledby="generation-heading">
    <div class="preview-panel-header">
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;">
        <h2 id="generation-heading">Generate a board from this draft</h2>
        <span class="badge warn">HOSTED MODEL - ONE BILLED CALL PER PRESS</span>
      </div>
      <p class="muted">This is the one button in the workbench that calls a model. It sends the prompt and settings you are editing to <code>${escapeHtml(IMAGE_MODEL)}</code> and puts the board it returns into this page. The compute happens on the provider's side - no model runs on this machine - and this process holds no credential of its own: the endpoint in front of the model injects the signed-in account's credentials. Every press is a real, billed generation, and it takes roughly 15 seconds.</p>
      <div class="draft-callout">
        <strong>The board comes back to your browser and nowhere else.</strong> No file is written by a generation: not the brief, not <code>docs/design/training/</code>, not a manifest, not a cache. Output from a hosted model is <code>hosted-api</code> material, which the provenance rules in this repository place in arm <code>A3_teacher_generated</code> with <code>excluded_from_training: true</code> and <code>approved_for_training: false</code>. Keeping a board you like is a separate promote step that records the provider, model, account reference, terms reference and the SHA of the exact bytes - a download from this page is a copy, not an approved corpus asset.
      </div>
    </div>
    <div class="board-generation-grid">
      <div class="convergence-target-col">
        <div class="convergence-col-header"><h3>Controls</h3><span class="muted">uses the draft below</span></div>
        <div class="board-generation-actions">
          <button type="button" id="generate-board">Generate board from draft</button>
        </div>
        <p id="board-status" role="status" aria-live="polite" class="muted">Nothing generated in this browser yet.</p>
        <ul id="board-notes" class="board-notes" hidden></ul>
      </div>
      <div class="convergence-target-col">
        <div class="convergence-col-header">
          <h3>Generated board</h3>
          <span class="muted" id="board-summary">nothing generated yet</span>
        </div>
        <div id="board-result" class="board-frame board-empty">
          <p class="muted">Edit the draft below, then press <strong>Generate board from draft</strong>. A board appears here with its model, dimensions and byte SHA - or an explicit failure, never a placeholder standing in for one.</p>
        </div>
        <ul id="board-meta" class="board-meta" hidden></ul>
        <div class="target-actions" id="board-result-actions" hidden>
          <a class="button-link small" id="board-download" download="board.jpg">Download board</a>
        </div>
      </div>
    </div>
  </section>`;

  // 7. Tune a local draft
  const draft = `<section class="panel tuning-editor" aria-labelledby="draft-heading">
    <h2 id="draft-heading">Tune a local draft</h2>
    <p class="muted">These settings are the hypothesis a generation is run with. They still do not affect the committed template, target or training data by themselves: a generation returns a board to this page, and a draft stays in this browser until it is exported. Generating a board from this model needs at least 4096 output tokens - below that the whole budget goes on thinking and no image comes back - so a smaller number is raised to 4096 for the request and the effective value is reported in the result.</p>
    <noscript><p class="danger">Editing and exporting local drafts requires JavaScript; the authored brief and target above remain readable.</p></noscript>
    <form id="tuning-draft" method="post" action="/tuning" data-brief-id="${text(selectedVariant.brief_id)}" data-framework="${text(selectedFramework)}">
      <label for="prompt">Prompt wording</label><textarea id="prompt" name="prompt" rows="8" required minlength="80" aria-describedby="prompt-help">${text(selectedVariant.prompt)}</textarea>
      <p id="prompt-help" class="muted">The original brief remains unchanged. Keep routes, journeys and assertions consistent with the contract.</p>
      <label for="guidance">System guidance (sent as the model's system instruction)</label><textarea id="guidance" name="system_guidance" rows="4" aria-describedby="guidance-help"></textarea>
      <p id="guidance-help" class="muted">Optional. When set, this is sent as the generation's system instruction; when empty, nothing is sent in that field.</p>
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
    <p class="muted">Inspect authored training briefs, their design references and recorded template evidence. Work on one local, unapproved draft at a time, and generate a design board from it against the hosted ${escapeHtml(IMAGE_MODEL)} model when you want to see one. No training job runs here and no generation writes to this checkout.</p>
    ${data.missing?.length ? `<p class="notice">Committed training input unavailable in this checkout: ${data.missing.map(text).join(', ')}. Missing evidence is not a pass or failure.</p>` : ''}
    ${selector}
    ${promptComparison}
    ${convergencePreview}
    ${generation}
    <div class="tuning-grid"><div>${draft}${detail}</div><div>${target}${evidence}</div></div>
    <script src="/tuning/client.js" defer></script>
  `);
}

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, realpathSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertDisjointTrainingCorpus } from './disjoint.mjs';
import { isTrainable } from '../provenance/arms.mjs';

export const LORA_SHAPE_CONTEXT = 262_144;
// The same provider catalogue advertises trainCtx=65,536 for V4.1 despite a 262,144 LoRA shape.
// Refuse >65,536 until that discrepancy is resolved; still report both thresholds.
export const CONSERVATIVE_TRAIN_CONTEXT = 65_536;
const SHA = /^sha256:[a-f0-9]{64}$/;
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const deny = (code, message) => { throw new Error(`${code}: ${message}`); };
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const within = (root, path) => { const rel = relative(root, path); return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
const pathIn = (root, name) => {
  if (typeof name !== 'string' || !name || name.includes('\\') || isAbsolute(name)) deny('UNSAFE_PATH', String(name));
  const path = resolve(root, name);
  if (!within(root, path)) deny('UNSAFE_PATH', name);
  return path;
};
const BUILD_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '_site', 'target']);
const excluded = (name) => name.split('/').some((part) => BUILD_DIRS.has(part)) ||
  name === 'spec.json' || // the root-level corpus harness spec, not an app's nested source file
  /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|README\.md|\.DS_Store)$/.test(name) ||
  /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|pdf|zip|wasm|map|lock)$/i.test(name);

/** Deterministic application source selection. Reject symlinks and binary bytes rather than leaking them. */
export function projectSources(root) {
  const base = realpathSync(root);
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const path = join(dir, entry.name);
      const name = relative(base, path).split(sep).join('/');
      if (/(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|p12|crt))$/i.test(name)) deny('SECRET_SOURCE', name);
      if (excluded(name)) continue;
      if (entry.isSymbolicLink()) deny('SYMLINK_SOURCE', name);
      if (entry.isDirectory()) { visit(path); continue; }
      if (!entry.isFile()) deny('NONFILE_SOURCE', name);
      const bytes = readFileSync(path);
      if (bytes.includes(0) || Buffer.from(bytes.toString('utf8'), 'utf8').compare(bytes) !== 0) deny('BINARY_SOURCE', name);
      files.push({ name, content: bytes.toString('utf8') });
    }
  }
  visit(base);
  if (!files.length) deny('EMPTY_SOURCE', base);
  return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Canonical files are length-delimited: arbitrary source text cannot impersonate a next-file header. */
export function serializeFiles(files) {
  return files.map(({ name, content }) => `FILE ${JSON.stringify(name)} BYTES ${Buffer.byteLength(content, 'utf8')}\n${content}\nEND FILE\n`).join('');
}

export function distribution(counts) {
  const sorted = [...counts].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  return { count: sorted.length, min: sorted[0], p50: percentile(.5), p95: percentile(.95), max: sorted.at(-1), total: sorted.reduce((a, b) => a + b, 0) };
}

/** No output is written until every approval, source digest, token count and split check succeeds. */
export function serializeSft({ manifestPath, root, outputPath, tokenizer }) {
  if (!tokenizer || typeof tokenizer.countBatch !== 'function' || tokenizer.pinned !== true) deny('TOKENIZER_UNVERIFIED', 'pinned tokenizer and chat template are required');
  const rootReal = realpathSync(root);
  const manifestReal = realpathSync(manifestPath);
  if (!within(rootReal, manifestReal) || lstatSync(manifestPath).isSymbolicLink()) deny('UNSAFE_MANIFEST', manifestPath);
  const gate = assertDisjointTrainingCorpus({ trainManifestPath: manifestReal });
  if (!gate.ok) deny('NOT_DISJOINT', gate.findings.map((f) => f.code).join(', '));
  const bytes = readFileSync(manifestReal);
  const rows = bytes.toString('utf8').trim().split('\n').map((line) => JSON.parse(line));
  const jsonl = [], messagesByRow = [], char4ByRow = [], measured = [], seen = new Set();
  for (const row of rows) {
    if (!row || row.split !== 'train' || !isTrainable(row) || !nonEmpty(row.rights_ref) ||
      !nonEmpty(row.approved_by) || !nonEmpty(row.approved_at) ||
      !/^tr-\d{2}-[a-z0-9-]+$/.test(row.project_id ?? '') || !nonEmpty(row.brief_id) || seen.has(row.project_id)) {
      deny('NOT_APPROVED', `row ${row?.project_id ?? '?'} lacks unique, explicitly approved project provenance`);
    }
    seen.add(row.project_id);
    const rightsPath = pathIn(rootReal, row.rights_ref);
    if (!existsSync(rightsPath) || lstatSync(rightsPath).isSymbolicLink() || !lstatSync(rightsPath).isFile() ||
      !within(rootReal, realpathSync(rightsPath))) deny('NOT_APPROVED', `missing or unsafe rights_ref for ${row.project_id}`);
    const promptPath = pathIn(rootReal, row.prompt_path);
    const sourcePath = pathIn(rootReal, row.project_dir);
    if (lstatSync(promptPath).isSymbolicLink() || lstatSync(sourcePath).isSymbolicLink() || !within(rootReal, realpathSync(promptPath)) || !within(rootReal, realpathSync(sourcePath))) deny('SYMLINK_SOURCE', row.project_id);
    const promptBytes = readFileSync(promptPath);
    const prompt = promptBytes.toString('utf8');
    if (Buffer.from(prompt, 'utf8').compare(promptBytes) !== 0 || !prompt.trim() || !SHA.test(row.prompt_sha256) || sha(promptBytes) !== row.prompt_sha256) deny('PROMPT_DIGEST', row.project_id);
    const files = projectSources(sourcePath);
    const target = serializeFiles(files);
    if (!SHA.test(row.target_sha256) || sha(Buffer.from(target)) !== row.target_sha256) deny('TARGET_DIGEST', row.project_id);
    const messages = [{ role: 'user', content: prompt }, { role: 'assistant', content: target }];
    messagesByRow.push(messages);
    char4ByRow.push(Math.round((prompt.length + target.length) / 4));
    jsonl.push(`${JSON.stringify({ messages })}\n`);
  }
  const counts = tokenizer.countBatch(messagesByRow);
  if (!Array.isArray(counts) || counts.length !== rows.length) deny('TOKEN_COUNT', 'one exact count per approved pair is required');
  counts.forEach((count, index) => {
    const projectId = rows[index].project_id;
    if (!Number.isSafeInteger(count?.prompt) || count.prompt <= 0 || !Number.isSafeInteger(count?.total) || count.total < count.prompt) deny('TOKEN_COUNT', projectId);
    measured.push({ project_id: projectId, prompt_tokens: count.prompt, target_tokens: count.total - count.prompt, total_tokens: count.total,
      char4_estimate: char4ByRow[index],
      over_262k: count.total > LORA_SHAPE_CONTEXT, over_conservative_train_ctx: count.total > CONSERVATIVE_TRAIN_CONTEXT });
  });
  if (measured.some((row) => row.over_262k || row.over_conservative_train_ctx)) {
    deny('OVER_CONTEXT', JSON.stringify(measured.filter((row) => row.over_262k || row.over_conservative_train_ctx)));
  }
  const dataset = jsonl.join('');
  const report = { dataset_sha256: sha(Buffer.from(dataset)), manifest_sha256: sha(bytes), tokenizer: tokenizer.metadata,
    limits: { lora_shape: LORA_SHAPE_CONTEXT, conservative_train_ctx: CONSERVATIVE_TRAIN_CONTEXT },
    prompt: distribution(measured.map((r) => r.prompt_tokens)), target: distribution(measured.map((r) => r.target_tokens)),
    pair: distribution(measured.map((r) => r.total_tokens)), pairs: measured,
    matched_row_char4: { estimated_total: char4ByRow.reduce((a, b) => a + b, 0),
      error_pct_vs_measured: +((char4ByRow.reduce((a, b) => a + b, 0) / measured.reduce((a, r) => a + r.total_tokens, 0) - 1) * 100).toFixed(2) },
    historical_headline_error: 'UNVERIFIED: old chars/4 headline counts different deterministic source pairs and omits prompt' };
  if (outputPath) {
    const out = resolve(outputPath);
    if (!within(rootReal, out) || existsSync(out)) deny('UNSAFE_OUTPUT', 'output must be new and beneath the selected root');
    for (const row of rows) if (within(realpathSync(pathIn(rootReal, row.project_dir)), out)) deny('UNSAFE_OUTPUT', 'output cannot be inside a training source tree');
    const temporary = `${out}.${process.pid}.tmp`;
    try { writeFileSync(temporary, dataset, { flag: 'wx' }); renameSync(temporary, out); }
    catch (error) { try { rmSync(temporary, { force: true }); } catch {} throw error; }
  }
  return { dataset, report };
}

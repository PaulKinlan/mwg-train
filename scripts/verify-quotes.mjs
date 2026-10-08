#!/usr/bin/env node
/**
 * Verify a quote file against the raw pages it claims to come from.
 *
 *   node scripts/verify-quotes.mjs --quotes docs/eval/quotes.jsonl --raw-dir docs/eval/quotes.raw
 *
 * Every priced row in this project has to be a number somebody saw on a provider's own page. This
 * checks that claim instead of trusting it:
 *
 *   1. the raw body exists and its sha256 and byte count match the row;
 *   2. the row's verbatim snippet actually occurs in that body;
 *   3. the row's value occurs in the body (as written, or with the currency and unit removed);
 *   4. the row is complete: provider, unit, currency, retrieval time, https source, HTTP 200.
 *
 * It fails closed: one unverifiable row exits non-zero, so a fabricated or stale number cannot sit
 * quietly in the priced table. Raw bodies are gitignored (we do not redistribute other people's
 * pricing pages), so with no --raw-dir present the script reports rows as unverifiable rather than
 * passing them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { labelAppearsInVerbatim, normaliseText, parseJsonl, valueAtColumn, valueNearVerbatim } from '../src/eval/quotes.mjs';

const UNITS = new Set(['usd_per_gpu_hour', 'usd_per_million_training_tokens', 'usd_per_gb_month', 'usd_per_gb']);

/** Locate the raw body for a quote: the file the row names first, then the row's own id. */
function findRaw(rawDir, row) {
  if (!rawDir || !existsSync(rawDir)) return null;
  const named = row.raw_file ? join(rawDir, row.raw_file) : null;
  if (named && existsSync(named)) return named;
  const candidates = [
    join(rawDir, row.quote_id),
    ...readdirSync(rawDir)
      .filter((name) => name.replace(/\.(html?|txt|json)$/i, '') === row.quote_id)
      .map((name) => join(rawDir, name)),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

export function verifyQuote(row, { rawDir } = {}) {
  const problems = [];
  const require = (condition, message) => {
    if (!condition) problems.push({ quote_id: row.quote_id, code: 'INCOMPLETE', message });
  };

  require(typeof row.quote_id === 'string' && row.quote_id !== '', 'quote_id is missing');
  require(typeof row.provider === 'string' && row.provider !== '', 'provider is missing');
  require(UNITS.has(row.unit), `unit '${row.unit}' is not a recognised unit`);
  require(row.currency === 'USD', 'currency must be recorded (USD)');
  require(row.http_status === 200, `http_status is ${row.http_status}, not 200`);
  require(/^https:\/\//.test(String(row.source_url)), 'source_url must be https');
  require(typeof row.value === 'number' && Number.isFinite(row.value) && row.value > 0, 'value must be a positive number');
  require(typeof row.retrieved_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(row.retrieved_at), 'retrieved_at must be an ISO timestamp');
  require(typeof row.verbatim === 'string' && row.verbatim.trim().length >= 8, 'a verbatim snippet is required');
  // The hash and size are what bind a row to the bytes it came from, so they are required rather
  // than checked only when present: a row without them is a price with a story attached.
  require(typeof row.sha256 === 'string' && /^[0-9a-f]{64}$/.test(row.sha256), 'the body sha256 is required');
  require(Number.isInteger(row.bytes) && row.bytes > 0, 'the body byte count is required');
  // The snippet must name the product, or a cross-card transplant (another card's price *and* its
  // snippet) would pass the proximity test while pricing something else.
  const label = labelAppearsInVerbatim(row.verbatim ?? '', row);
  if (!label.found) {
    problems.push({
      quote_id: row.quote_id,
      code: label.reason,
      message:
        label.reason === 'NO_LABEL'
          ? 'the row names neither a GPU nor a size band, so the price cannot be attributed'
          : `the row's label '${label.label}' does not appear in its verbatim snippet; the number and the snippet must describe the same product`,
    });
  }
  if (row.unit === 'usd_per_gpu_hour') require(typeof row.vram_gb === 'number' && row.vram_gb > 0, 'a per-GPU-hour quote must record VRAM');
  if (row.unit === 'usd_per_million_training_tokens') require(typeof row.model_size_band === 'string' && row.model_size_band !== '', 'a per-token quote must record the size band');

  const rawPath = findRaw(rawDir, row);
  if (!rawPath) {
    problems.push({
      quote_id: row.quote_id,
      code: 'NO_RAW_BODY',
      message: `no raw page for '${row.quote_id}' under ${rawDir ?? '(no --raw-dir given)'}; the number cannot be re-derived`,
    });
    return { quote_id: row.quote_id, raw: null, problems };
  }

  const body = readFileSync(rawPath);
  const sha = createHash('sha256').update(body).digest('hex');
  if (sha !== row.sha256) {
    problems.push({ quote_id: row.quote_id, code: 'SHA_MISMATCH', message: `body hashes to ${sha}, row says ${row.sha256}` });
  }
  if (body.length !== row.bytes) {
    problems.push({ quote_id: row.quote_id, code: 'BYTES_MISMATCH', message: `body is ${body.length} bytes, row says ${row.bytes}` });
  }

  const text = body.toString('utf8');
  // The value must sit next to the snippet it was read from, not merely exist somewhere on a page
  // that lists many prices.
  const proximity = valueNearVerbatim(text, row.verbatim, row.value);
  if (!proximity.found) {
    problems.push({
      quote_id: row.quote_id,
      code: proximity.reason,
      message:
        proximity.reason === 'VERBATIM_NOT_FOUND'
          ? 'the verbatim snippet does not occur in the raw body'
          : `the value ${row.value} does not occur within 240 characters of the verbatim snippet`, // eslint-disable-line
    });
  }
  // The row must price the column it says it does. Without this, a Fireworks per-model row could
  // claim the prefill rate as its training rate: all four columns sit in the same snippet.
  if (Number.isInteger(row.verbatim_column)) {
    const column = valueAtColumn(row.verbatim, row.value, row.verbatim_column);
    if (!column.found) {
      problems.push({
        quote_id: row.quote_id,
        code: column.reason,
        message:
          column.reason === 'COLUMN_MISSING'
            ? `the snippet states only ${column.values.length} price(s), so column ${row.verbatim_column} does not exist`
            : `column ${row.verbatim_column} of the snippet is $${column.column_value}, not $${row.value}; the row is pricing a different column`,
      });
    }
  }
  // ...and the snippet must occur in the body it claims to come from, which is what stops a real
  // price being paired with a snippet invented for a different page.
  if (!normaliseText(text).includes(normaliseText(row.verbatim ?? '\u0000'))) {
    problems.push({ quote_id: row.quote_id, code: 'VERBATIM_NOT_IN_BODY', message: 'the snippet does not occur in this page' });
  }
  return { quote_id: row.quote_id, raw: rawPath, problems };
}

function main() {
  const argv = process.argv.slice(2);
  let quotesPath = 'docs/eval/quotes.jsonl';
  let rawDir = 'docs/eval/quotes.raw';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--quotes') quotesPath = argv[++i];
    else if (argv[i] === '--raw-dir') rawDir = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('usage: node scripts/verify-quotes.mjs [--quotes <file>] [--raw-dir <dir>]');
      process.exit(0);
    }
  }

  const rows = parseJsonl(readFileSync(resolve(quotesPath), 'utf8'));
  const results = rows.map((row) => verifyQuote(row, { rawDir: resolve(rawDir) }));
  const problems = results.flatMap((r) => r.problems);
  const verified = results.filter((r) => r.problems.length === 0).length;
  const priced = new Set(rows.map((r) => r.provider)).size;

  console.log(`verify-quotes: ${verified}/${rows.length} quotes re-derived from their raw bodies (${priced} providers) in ${quotesPath}`);
  for (const problem of problems) console.log(`ERROR ${problem.code} ${problem.quote_id} ${problem.message}`);
  if (problems.length > 0) {
    console.error('verify-quotes: FAIL - a priced number could not be re-derived from the page it claims to come from');
    process.exit(1);
  }
  console.log('verify-quotes: PASS');
}

if (import.meta.url === `file://${process.argv[1]}`) main();

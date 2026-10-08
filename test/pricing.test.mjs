/**
 * The priced sheets are generated from fetched pages, so the tests are about provenance rather than
 * formatting: a number may not exist without a body it came from, the generated documentation must
 * match the generator, and the verifier must actually reject a quote that cannot be re-derived.
 *
 * The raw bodies are gitignored (we do not redistribute other people's pricing pages), so the tests
 * that need them run only in a checkout that has fetched them, and say so instead of silently
 * passing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeHtml, dollarValues, labelAppearsInVerbatim, normaliseText, parseJsonl, valueAtColumn, valueNearVerbatim } from '../src/eval/quotes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUOTES = resolve(ROOT, 'docs/eval/quotes.jsonl');
const UNVERIFIED = resolve(ROOT, 'docs/eval/quotes.unverified.jsonl');
const RAW_DIR = resolve(ROOT, 'docs/eval/quotes.raw');
const SHEETS = resolve(ROOT, 'docs/eval/pricing.sheets.md');
// `fetched.json` is committed, so RAW_DIR exists in every checkout; the fetched bodies are what may be
// absent, and a test that keys off the directory alone runs and then fails with ENOENT.
const hasRawBodies = existsSync(RAW_DIR) && readdirSync(RAW_DIR).some((name) => name !== 'fetched.json' && !name.startsWith('.'));

const quotes = parseJsonl(readFileSync(QUOTES, 'utf8'));
const unverified = parseJsonl(readFileSync(UNVERIFIED, 'utf8'));

test('decoding is shared between extraction and verification', () => {
  assert.equal(decodeHtml('<p>Hello&nbsp;<b>world</b></p>'), 'Hello world');
  assert.equal(decodeHtml('Models &gt;300B &#160;parameters'), 'Models >300B parameters');
  assert.equal(normaliseText('  $  0.50  '), '$0.50');
  assert.equal(normaliseText('L4 $ 0.49 /hr'), 'l4 $0.49 /hr');
});

test('a value must sit next to the snippet it is claimed to come from', () => {
  const page = 'L40S 48 GB VRAM 94 GB RAM 16 vCPUs $ 1.09 /hr Deploy ' + 'x'.repeat(600) + ' A100 $ 1.59 /hr';
  // the L40S price is next to its snippet
  assert.equal(valueNearVerbatim(page, 'L40S 48 GB VRAM 94 GB RAM 16 vCPUs $ 1.09 /hr', 1.09).found, true);
  // ...but the A100 price is not: it is 600 characters away, so it cannot back an L40S row
  const distant = valueNearVerbatim(page, 'L40S 48 GB VRAM 94 GB RAM 16 vCPUs $ 1.09 /hr', 1.59);
  assert.equal(distant.found, false);
  assert.equal(distant.reason, 'VALUE_NOT_NEAR_VERBATIM');
  assert.equal(valueNearVerbatim(page, 'RTX 9090 $ 9.99 /hr', 9.99).reason, 'VERBATIM_NOT_FOUND');
});

test('every priced quote is complete and carries its provenance', () => {
  assert.ok(quotes.length >= 20, `expected a priced sheet, found ${quotes.length} rows`);
  for (const row of quotes) {
    assert.match(row.quote_id, /^[a-z0-9][a-z0-9.-]*$/, `${row.quote_id} is not a usable id`);
    assert.ok(row.provider && row.provider.length > 1, `${row.quote_id} has no provider`);
    assert.ok(
      ['usd_per_gpu_hour', 'usd_per_million_training_tokens'].includes(row.unit),
      `${row.quote_id} has an unexpected unit ${row.unit}`,
    );
    assert.equal(row.currency, 'USD');
    assert.equal(row.http_status, 200, `${row.quote_id} is not a 200`);
    assert.match(row.source_url, /^https:\/\//, `${row.quote_id} has no https source`);
    assert.match(row.retrieved_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${row.quote_id} has no retrieval time`);
    assert.ok(row.value > 0, `${row.quote_id} has a non-positive value`);
    assert.match(row.sha256, /^[0-9a-f]{64}$/, `${row.quote_id} has no body hash`);
    assert.ok(row.bytes > 1000, `${row.quote_id} does not record its body size`);
    assert.ok(row.verbatim.length >= 12, `${row.quote_id} has no verbatim snippet`);
    assert.ok(row.raw_file, `${row.quote_id} does not name the body it came from`);
    if (row.unit === 'usd_per_gpu_hour') assert.ok(row.vram_gb > 0, `${row.quote_id} has no VRAM`);
    if (row.unit === 'usd_per_million_training_tokens') assert.ok(row.model_size_band, `${row.quote_id} has no size band`);
  }
});

test('a provider we could not pin down is never priced', () => {
  // Together publishes two fine-tuning tables that differ by ~11% with a client-side toggle; the
  // provider must appear in the unverified file and NOT in the priced one.
  const pricedProviders = new Set(quotes.map((row) => row.provider));
  const unpriced = ['Together AI', 'Vast.ai', 'Predibase'];
  for (const provider of unpriced) {
    assert.ok(!pricedProviders.has(provider), `${provider} must not be priced while its rate is ambiguous or unfetched`);
    assert.ok(
      unverified.some((row) => row.provider === provider),
      `${provider} must be listed as unverified rather than dropped silently`,
    );
  }
  for (const row of unverified) {
    assert.ok(row.why_unverified && row.why_unverified.length > 20, `${row.provider} does not say why it is unverified`);
  }
});

test('the committed sheets match the generator', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-pricing-'));
  try {
    const out = join(dir, 'sheets.md');
    execFileSync(process.execPath, [resolve(ROOT, 'scripts/price-dry-run.mjs'), '--out', out], { encoding: 'utf8' });
    assert.equal(
      readFileSync(out, 'utf8'),
      readFileSync(SHEETS, 'utf8'),
      'docs/eval/pricing.sheets.md is stale: re-run scripts/price-dry-run.mjs',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('raw bodies, when present, re-derive the priced rows exactly', { skip: hasRawBodies ? false : 'raw pages not fetched in this checkout' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-quotes-'));
  try {
    const extracted = join(dir, 'quotes.jsonl');
    const extractedUnverified = join(dir, 'unverified.jsonl');
    execFileSync(
      process.execPath,
      [resolve(ROOT, 'scripts/extract-quotes.mjs'), '--raw-dir', RAW_DIR, '--out', extracted, '--unverified-out', extractedUnverified],
      { encoding: 'utf8' },
    );
    assert.equal(
      readFileSync(extracted, 'utf8'),
      readFileSync(QUOTES, 'utf8'),
      'docs/eval/quotes.jsonl does not match what the raw pages produce',
    );
    // and the verification of those rows passes against the same bodies
    const verified = execFileSync(process.execPath, [resolve(ROOT, 'scripts/verify-quotes.mjs'), '--quotes', extracted, '--raw-dir', RAW_DIR], {
      encoding: 'utf8',
    });
    assert.match(verified, /verify-quotes: PASS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the verifier rejects a quote whose body does not contain the number', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-verify-'));
  try {
    const raw = join(dir, 'raw');
    execFileSync('mkdir', ['-p', raw]);
    writeFileSync(join(raw, 'fake.pricing.html'), '<p>Some GPU $ 9.99 /hr</p>');
    const rows = [
      {
        quote_id: 'fake',
        provider: 'Fake',
        gpu: 'Fake',
        vram_gb: 24,
        mode: 'on-demand',
        unit: 'usd_per_gpu_hour',
        value: 1.23,
        currency: 'USD',
        billing_unit: 'per hour',
        retrieved_at: '2026-10-08T09:00:00Z',
        source_url: 'https://example.invalid/pricing',
        http_status: 200,
        verbatim: 'Fake 24 GB VRAM $ 1.23 /hr',
        sha256: 'a'.repeat(64),
        bytes: 31,
        raw_file: 'fake.pricing.html',
      },
    ];
    const file = join(dir, 'quotes.jsonl');
    writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    let failed = false;
    try {
      execFileSync(process.execPath, [resolve(ROOT, 'scripts/verify-quotes.mjs'), '--quotes', file, '--raw-dir', raw], { encoding: 'utf8' });
    } catch (error) {
      failed = true;
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      assert.match(output, /VERBATIM_NOT_FOUND|SHA_MISMATCH/);
    }
    assert.equal(failed, true, 'a fabricated quote must fail verification');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the verifier attributes a price to a product, not just to a page', () => {
  // A cross-card transplant - another card's price *and* its snippet in this row - passed the first
  // version of the proximity check, which only asked whether a number sat near a snippet.
  const a10 = quotes.find((row) => row.quote_id === 'lambda-nvidia-a10-1-29');
  const a100 = quotes.find((row) => row.gpu === 'NVIDIA A100 SXM' && row.value === 2.79);
  assert.ok(a10 && a100, 'expected the Lambda A10 and A100 SXM rows to be priced');

  const transplant = { ...a10, value: a100.value, verbatim: a100.verbatim };
  const label = labelAppearsInVerbatim(transplant.verbatim, transplant);
  assert.equal(label.found, false, 'another card\'s snippet must not satisfy this row\'s label');
  assert.equal(label.reason, 'LABEL_NOT_IN_VERBATIM');

  // A prefix must not match either: 'NVIDIA A10' is a prefix of 'NVIDIA A100'.
  assert.equal(labelAppearsInVerbatim('NVIDIA A100 SXM 80 GB $2.79', { gpu: 'NVIDIA A10' }).found, false);
  assert.equal(labelAppearsInVerbatim('NVIDIA A10 24 GB 226 GiB $1.29', { gpu: 'NVIDIA A10' }).found, true);
  // Size bands compare on the page's own wording, without our parenthetical.
  assert.equal(labelAppearsInVerbatim('Models up to 16B parameters $0.50 $1.00 $1.00 $2.00', { model_size_band: 'up to 16B parameters (LoRA SFT)' }).found, true);
});

test('a value must be a whole numeric token, not a prefix of a longer price', () => {
  // $0.2 occurs inside $0.27; a substring test would accept a rate that is not on the page.
  const page = 'RTX A5000 24 GB VRAM 25 GB RAM 9 vCPUs $ 0.27 /hr Deploy RTX A5000';
  assert.equal(valueNearVerbatim(page, 'RTX A5000 24 GB VRAM 25 GB RAM 9 vCPUs $ 0.27 /hr', 0.2).found, false);
  assert.equal(valueNearVerbatim(page, 'RTX A5000 24 GB VRAM 25 GB RAM 9 vCPUs $ 0.27 /hr', 0.27).found, true);
});

test('every disclosure is printed in full, and quote precision is preserved', () => {
  const sheets = readFileSync(SHEETS, 'utf8');
  // The Lambda rows carry an inference; a 110-character truncation used to cut the disclaimer off.
  assert.match(sheets, /treat the plan as unverified, the price as fetched/, 'the inferred-plan disclaimer must survive into the sheets');
  assert.ok(!/the plan toggle is client-side so the label is not in the\s*\|/.test(sheets), 'no disclosure may be truncated inside a table cell');
  // $4.103 is the quoted rate; it was displayed rounded to $4.10.
  const quoted = quotes.find((row) => /Qwen 3\.8 27B/.test(row.model_size_band ?? '') && String(row.value).includes('4.103'));
  if (quoted) assert.match(sheets, /\$4\.103/, 'the quoted precision must be preserved in the sheets');
});

test('the generator refuses to price a row that does not verify', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-price-verify-'));
  try {
    const broken = quotes.map((row) => (row.quote_id === 'lambda-nvidia-a10-1-29' ? { ...row, gpu: 'NVIDIA H100 Fake Edition' } : row));
    const file = join(dir, 'quotes.jsonl');
    writeFileSync(file, `${broken.map((row) => JSON.stringify(row)).join('\n')}\n`);
    let output = '';
    let failed = false;
    try {
      execFileSync(process.execPath, [resolve(ROOT, 'scripts/price-dry-run.mjs'), '--quotes', file, '--out', join(dir, 'x.md')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      failed = true;
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    assert.equal(failed, true, 'a mislabelled row must stop the generator');
    assert.match(output, /LABEL_NOT_IN_VERBATIM|refusing to price/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a row must price the column it names, not a neighbouring one', () => {
  // The Fireworks per-model snippet lists prefill, cached prefill, sample and train; only the fourth
  // is a training rate. Claiming the first used to verify, because all four are in the same snippet.
  const row = quotes.find((quote) => Number.isInteger(quote.verbatim_column) && quote.verbatim_column > 1);
  assert.ok(row, 'expected at least one multi-column row to be priced');
  assert.equal(valueAtColumn(row.verbatim, row.value, row.verbatim_column).found, true);
  const other = dollarValues(row.verbatim).find((price) => Number(price) !== Number(row.value));
  assert.ok(other, 'expected another price in the snippet');
  assert.equal(valueAtColumn(row.verbatim, other, row.verbatim_column).found, false, 'a different column must not satisfy the row');
  // ...and a size is not a price: 1.3 appears in "1.3 TiB SSD".
  assert.equal(valueNearVerbatim('NVIDIA A10 24 GB 30 226 GiB 1.3 TiB SSD $1.29', 'NVIDIA A10 24 GB 30 226 GiB 1.3 TiB SSD $1.29', 1.3).found, false);
  assert.equal(valueNearVerbatim('NVIDIA A10 24 GB 30 226 GiB 1.3 TiB SSD $1.29', 'NVIDIA A10 24 GB 30 226 GiB 1.3 TiB SSD $1.29', 1.29).found, true);
});

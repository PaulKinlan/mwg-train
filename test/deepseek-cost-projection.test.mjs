import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateTokensFromCharacters } from '../src/eval/cost.mjs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const doc = read('docs/eval/deepseek-cost-projection.md');
const corpus = JSON.parse(read('docs/train/corpus/tokens.json')).training;
const quotes = read('docs/eval/quotes.jsonl').trim().split('\n').map(JSON.parse);
const evalBriefs = read('docs/eval/briefs/manifest.jsonl').trim().split('\n').map(JSON.parse);
const pretty = (n) => n.toLocaleString('en-US');
const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const bandText = (amount) => `${pretty(amount.tokens)} [${amount.band.map(pretty).join(', ')}]`;
const scaled = (estimate, epochs) => ({ tokens: estimate.tokens * epochs, band: estimate.band.map((n) => n * epochs) });
const costText = (estimate, epochs, rate) => {
  const totals = scaled(estimate, epochs);
  const usd = (tokens) => money(tokens * rate / 1_000_000);
  return `**${usd(totals.tokens)}** [${totals.band.map(usd).join(', ')}]`;
};
const millions = (n) => `${+(n / 1_000_000).toFixed(3)}M`;
const quote = (id) => {
  const row = quotes.find((entry) => entry.quote_id === id);
  assert.equal(row?.unit, 'usd_per_million_training_tokens', `training quote ${id} must exist`);
  return row.value;
};

/** A document mapping is not coverage unless this test actually reads and re-derives its numbers. */
test('published DeepSeek training projection matches checked corpus, canonical rounding and dated managed quotes', () => {
  const rateV4 = quote('fireworks-lora-sft-80b-300b-e-g-qwen3-235b-gpt-oss-120b-');
  const rateV41 = quote('fireworks-lora-sft--300b-e-g-deepseek-v3-kimi-k2-');
  const fullChars = corpus.scopes.app_sources.characters.total;
  const full = estimateTokensFromCharacters(fullChars);
  assert.equal(corpus.counts.pairs_measured, corpus.projects.length);
  assert.deepEqual({ derived: full.tokens, band: full.band },
    { derived: corpus.scopes.app_sources.tokens.derived, band: corpus.scopes.app_sources.tokens.band },
    'the checked corpus record and canonical chars/4 estimator must agree');
  const trialProjects = corpus.projects.filter((p) => ['tr-01', 'tr-26'].includes(p.family_id));
  const trialChars = trialProjects.reduce((sum, p) => sum + p.characters.scopes.app_sources.total, 0);
  const trial = estimateTokensFromCharacters(trialChars);
  assert.equal(trialProjects.length, corpus.counts.frameworks * 2, 'trial covers both complete unsealed families');
  assert.ok(doc.includes(`**${pretty(fullChars)} serialized source characters**`));
  assert.ok(doc.includes(`**${pretty(full.tokens)} derived tokens/epoch**`));
  assert.ok(doc.includes(`**[${full.band.map(pretty).join(', ')}]**`));
  assert.ok(doc.includes(`**${pretty(trialChars)} chars**`));
  assert.ok(doc.includes(`**${pretty(trial.tokens)} derived tokens/epoch**`));
  assert.ok(doc.includes(`**[${trial.band.map(pretty).join(', ')}]**`));
  assert.ok(doc.includes(`Three epochs = **${pretty(trial.tokens * 3)}** [${trial.band.map((n) => pretty(n * 3)).join(', ')}]`));

  for (const [label, estimate, epochs] of [
    [`\`tr-01\` + \`tr-26\` (${trialProjects.length} pairs), 1 epoch`, trial, 1],
    [`\`tr-01\` + \`tr-26\` (${trialProjects.length} pairs), 3 epochs`, trial, 3],
    [`${corpus.counts.pairs_measured} pairs, 1 epoch`, full, 1],
    [`${corpus.counts.pairs_measured} pairs, 3 epochs`, full, 3],
  ]) {
    const expected = `| ${label} | ${bandText(scaled(estimate, epochs))} | ${costText(estimate, epochs, rateV4)} | ${costText(estimate, epochs, rateV41)} |`;
    assert.ok(doc.includes(expected), `cost table drifted from corpus/quotes: ${expected}`);
  }
  assert.ok(doc.includes(`V4 **${money(full.tokens * 3 * 2 * rateV4 / 1_000_000)}** ` +
    `[${full.band.map((n) => money(n * 3 * 2 * rateV4 / 1_000_000)).join(', ')}]`));
  assert.ok(doc.includes(`V4.1 **${money(full.tokens * 3 * 2 * rateV41 / 1_000_000)}** ` +
    `[${full.band.map((n) => money(n * 3 * 2 * rateV41 / 1_000_000)).join(', ')}]`));
});

test('conditional generation counts and token volumes remain tied to training and eval manifest sizes', () => {
  const training = corpus.counts.pairs_measured;
  const sealed = evalBriefs.length;
  const reasoningPerCall = 32_000;
  const firstPass = training + 2 * training + 4 * sealed;
  const twoSeeds = firstPass + sealed;
  assert.ok(doc.includes(`${pretty(training)} step-2 training-demo generations = **${millions(training * reasoningPerCall)} reasoning tokens**`));
  assert.ok(doc.includes(`step 8a two arms × ${pretty(training)} rebuilt demos = **${millions(2 * training * reasoningPerCall)}**`));
  assert.ok(doc.includes(`step 8b four arms × ${pretty(sealed)} sealed briefs = **${millions(4 * sealed * reasoningPerCall)}**`));
  assert.ok(doc.includes(`**${pretty(sealed)} T calls** (${millions(sealed * reasoningPerCall)} hypothetical reasoning tokens)`));
  assert.ok(doc.includes(`combined **${pretty(firstPass)} calls / ${millions(firstPass * reasoningPerCall)} reasoning tokens**`));
  assert.ok(doc.includes(`conditional **${pretty(twoSeeds)} calls / ${millions(twoSeeds * reasoningPerCall)} reasoning tokens**`));
  assert.ok(doc.includes(`**${millions(firstPass * 65_536)} output tokens for ${pretty(firstPass)} calls**`));
  assert.ok(doc.includes(`**${millions(twoSeeds * 65_536)} for ${pretty(twoSeeds)} calls**`));
});

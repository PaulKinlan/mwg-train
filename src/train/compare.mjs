/**
 * Cost per accepted pair, on both backends, on the same checkpoint.
 *
 * The headline number the project needs is what one accepted training pair costs on each backend, and
 * the way that number goes wrong is quiet: a rate whose product is unknown quietly becomes zero, or two
 * adapters trained on different base checkpoints get compared as if the backend were the only
 * difference. Both are refused here rather than corrected for.
 *
 *   cost_per_accepted_pair = (training + serving) / accepted_pairs
 *
 * `usd_per_accepted_pair` is null unless every line is priced. A comparison names a cheaper backend only
 * when both sides are priced AND comparable; otherwise it says which of the two conditions failed.
 */
import { CostError, costPerAccepted } from '../eval/cost.mjs';
import { assertComparable, costLines, totalCost, TrainingSeamError } from './seam.mjs';

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * One backend's cost per accepted pair.
 *
 * `serving` is required, not defaulted: an idle deployment is billed per GPU-second on the managed
 * backend and the cluster's GPU is billed whether or not it is generating, so a comparison that only
 * prices training charges one side for time the other side also pays for.
 */
export function backendCostPerAccepted({ name, manifest, rates, serving, measured = {}, variantsPerFamily = 1 }) {
  if (!isFiniteNumber(measured.attempted_pairs) || !isFiniteNumber(measured.accepted_pairs)) {
    throw new TrainingSeamError('NO_YIELD', `"${name}": attempted_pairs and accepted_pairs are needed; cost per accepted pair is a ratio of two measurements`);
  }
  if (measured.attempted_pairs <= 0) {
    throw new TrainingSeamError('NO_YIELD', `"${name}": attempted_pairs must be positive; a ratio with a zero denominator is not a yield`);
  }
  if (measured.accepted_pairs <= 0) {
    throw new TrainingSeamError('NO_ACCEPTED', `"${name}": no pair was accepted, so there is no denominator and no per-accepted cost to report`);
  }
  if (measured.accepted_pairs > measured.attempted_pairs) {
    // More accepted than attempted is an acceptance rate above 1, which is a counter error rather than
    // an especially good run. It used to be divided happily and printed as 2.0.
    throw new TrainingSeamError('IMPOSSIBLE_YIELD', `"${name}": ${measured.accepted_pairs} accepted of ${measured.attempted_pairs} attempted is not a yield; an acceptance rate above 1 means the counters are wrong`);
  }

  const lines = costLines({ manifest, rates, serving });
  const total = totalCost(lines);
  const perAccepted = total.complete
    ? costPerAccepted({
        totalUsd: total.total,
        attemptedPairs: measured.attempted_pairs,
        acceptedPairs: measured.accepted_pairs,
        variantsPerFamily,
      })
    : null;

  return {
    backend: name,
    cost_lines: lines,
    total_usd: total.complete ? total.total : null,
    partial_total_usd: total.total,
    unverified_items: total.unverified_items,
    estimated_items: total.estimated_items,
    // The label a reader has to see before quoting the number.
    status: total.status,
    usd_per_accepted_pair: perAccepted?.usd_per_accepted_pair ?? null,
    acceptance_rate: perAccepted?.acceptance_rate ?? Math.round((measured.accepted_pairs / measured.attempted_pairs) * 1000) / 1000,
    note: total.complete
      ? 'Complete: every line priced. Status PINNED means every quantity was measured; ESTIMATE means at least one was not.'
      : `Not priceable: no cost per accepted pair, because ${total.unverified_items.join(' and ')} could not be priced. An unpriced line is not a zero.`,
  };
}

/**
 * The two-backend comparison. Fireworks is priced per training token by parameter band; the cluster is
 * priced per GPU-hour including setup and idle. Same job, same corpus, same checkpoint, or no verdict.
 */
export function compareBackends({ yield: measured, backends, variantsPerFamily = 1 }) {
  const results = backends.map((backend) =>
    backendCostPerAccepted({ ...backend, measured, variantsPerFamily }),
  );

  const comparable = backends.length === 2 ? assertComparable(backends[0].manifest, backends[1].manifest) : { comparable: false, problems: ['a comparison needs exactly two backends'] };
  const priced = results.filter((result) => result.status !== 'UNVERIFIED');

  let verdict = 'COMPARABLE';
  let cheaper = null;
  let tie = false;
  if (!comparable.comparable) {
    verdict = 'NOT_COMPARABLE';
  } else if (results.some((result) => result.status === 'UNVERIFIED')) {
    // Refusing here is the whole point: with one side's serving cost unknown, "the other side is cheaper"
    // is a statement about which costs we happened to find, not about the backends.
    verdict = 'INCOMPLETE';
  } else {
    const [best, next] = priced.slice().sort((left, right) => left.usd_per_accepted_pair - right.usd_per_accepted_pair);
    // Two backends that price the same are a tie, not a win for whichever happened to be first in the
    // array. The old code took `[0]` of a stable sort and crowned it.
    const sameToTheCent = next !== undefined && Math.abs(best.usd_per_accepted_pair - next.usd_per_accepted_pair) <= 1e-9 * Math.max(1, Math.abs(best.usd_per_accepted_pair), Math.abs(next.usd_per_accepted_pair));
    if (sameToTheCent) tie = true;
    else cheaper = best.backend;
  }

  const estimated = results.some((result) => result.status === 'ESTIMATE');
  return {
    verdict,
    // ESTIMATE propagates to the comparison: a cheaper backend chosen on estimated token counts is a
    // hypothesis with a number attached, not a finding.
    confidence: verdict === 'COMPARABLE' ? (estimated ? 'ESTIMATE' : 'PINNED') : verdict,
    cheaper_backend: cheaper,
    tie,
    problems: comparable.problems,
    acceptance_rate: results[0]?.acceptance_rate ?? null,
    attempted_pairs: measured?.attempted_pairs ?? null,
    accepted_pairs: measured?.accepted_pairs ?? null,
    results,
    note:
      verdict === 'COMPARABLE'
        ? tie
          ? 'Same checkpoint, same corpus, same tokenizer, and the two backends price within a rounding error of each other: a tie, so no cheaper backend is named.'
          : 'Same checkpoint, same corpus, same tokenizer: the difference is the backend.'
        : verdict === 'NOT_COMPARABLE'
          ? `The two sides differ in more than their backend: ${comparable.problems.join('; ')}.`
          : 'At least one side has an unpriced line, so no cheaper backend is named.',
  };
}

/** Render the comparison as the table the pricing document carries. */
export function renderComparison(comparison) {
  const rows = comparison.results.map((result) => {
    const cost = result.usd_per_accepted_pair === null ? 'UNVERIFIED' : `$${result.usd_per_accepted_pair.toFixed(2)}`;
    const lines = result.cost_lines
      .map((line) => (line.cost === null ? `${line.item}: UNVERIFIED (${line.reason})` : `${line.item}: $${line.cost.toFixed(2)} ${line.status}`))
      .join('; ');
    return `| \`${result.backend}\` | ${cost} | ${result.acceptance_rate} | ${lines} |`;
  });
  const heading = comparison.tie ? '| Backend | USD per accepted pair (tied) | Acceptance rate | Lines |' : '| Backend | USD per accepted pair | Acceptance rate | Lines |';
  return [
    heading,
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export { CostError };

#!/usr/bin/env node
/** Render an overview from a measured pilot/out/<run>/ directory; no remeasurement. */
import { readBenchmarkRun, benchmarkOverview, renderBenchmarkMarkdown } from '../src/eval/benchmark-report.mjs';

function main(argv) {
  if (argv.length < 2 || argv[0] !== '--run' || !argv[1] || (argv.length !== 2 && !(argv.length === 3 && argv[2] === '--json'))) {
    throw new Error('usage: node scripts/benchmark-report.mjs --run pilot/out/<run> [--json]');
  }
  const report = benchmarkOverview(readBenchmarkRun(argv[1]));
  process.stdout.write(`${argv[2] === '--json' ? JSON.stringify(report, null, 2) : renderBenchmarkMarkdown(report)}\n`);
}

try { main(process.argv.slice(2)); }
catch (error) { console.error(`benchmark: ${error.message}`); process.exitCode = 1; }

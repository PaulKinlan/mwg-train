#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import process from 'node:process';

import { recordFlow } from '../src/capture/flow.mjs';
import { validateFlow, resolveCaptureOutputPath } from '../src/capture/schema.mjs';
import { launchChrome } from '../src/corpus/cdp.mjs';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = argv[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  const rightsRef = flags['rights-ref'];
  if (!rightsRef || typeof rightsRef !== 'string' || !rightsRef.trim()) {
    console.error('Error: --rights-ref is required and must name the rights record authorising this recording');
    process.exit(1);
  }

  const url = flags['url'];
  if (!url || typeof url !== 'string' || !url.trim()) {
    console.error('Error: --url is required (must be an http(s) URL)');
    process.exit(1);
  }

  const stepsArg = flags['steps'];
  if (!stepsArg || typeof stepsArg !== 'string' || !stepsArg.trim()) {
    console.error('Error: --steps is required (must provide path to JSON steps file)');
    process.exit(1);
  }

  const absStepsPath = isAbsolute(stepsArg) ? stepsArg : resolve(process.cwd(), stepsArg);
  let steps;
  try {
    const raw = readFileSync(absStepsPath, 'utf8');
    steps = JSON.parse(raw);
  } catch (err) {
    console.error(`Error: failed to read steps file '${absStepsPath}': ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    console.error('Error: steps must be a non-empty array of intents');
    process.exit(1);
  }

  const outArg = flags['out'];
  let absOutPath = null;
  if (outArg !== undefined) {
    try {
      absOutPath = resolveCaptureOutputPath(outArg);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  let chrome = null;
  let exitCode = 0;

  try {
    chrome = await launchChrome();
    const page = await chrome.newPage();
    const flow = await recordFlow({ url, rightsRef, steps, page });

    const problems = validateFlow(flow);
    if (problems.length > 0) {
      console.error(`Error: validateFlow refused recording:\n  ${problems.join('\n  ')}`);
      exitCode = 1;
    } else {
      const formatted = JSON.stringify(flow, null, 2);
      for (const step of flow.steps) {
        if (step.unobserved_expectText) {
          console.error(`Unobserved expectText at step ${step.index}: ${JSON.stringify(step.unobserved_expectText.requested)}: ${step.unobserved_expectText.reason}; not verified`);
        }
      }
      if (absOutPath) {
        writeFileSync(absOutPath, formatted, 'utf8');
      } else {
        console.log(formatted);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    exitCode = 1;
  } finally {
    if (chrome) {
      try {
        await chrome.close();
      } catch {
        /* browser may already be closed */
      }
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main();

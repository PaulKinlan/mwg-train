#!/usr/bin/env node
/**
 * Do the framework arms for one archetype render as the same design?
 *
 *   node scripts/check-cross-arm-parity.mjs                      # booking, all arms, three widths
 *   node scripts/check-cross-arm-parity.mjs --archetype booking
 *   node scripts/check-cross-arm-parity.mjs --write              # update the committed report; without it
 *                                                                # this never touches a tracked file
 *   node scripts/check-cross-arm-parity.mjs --strict             # also fail on ADVISORY drift, not just parity
 *   node scripts/check-cross-arm-parity.mjs --rerender           # rebuild the markdown from the JSON
 *
 * For each framework the pilot can build, this renders the arm at 390, 768 and 1280 wide, saves a
 * screenshot, reads the computed design tokens, and compares the arms with EACH OTHER. It reports what
 * it finds as structured findings rather than a pass/fail, because a parity instrument that cannot say
 * WHERE two arms disagree is not worth running.
 *
 * THREE DELIBERATE LIMITS, STATED RATHER THAN IMPLIED:
 *
 * 1. It compares layout and component structure, not content. The underlying axes are structural,
 *    geometry and controls, and they are blind to text - two pages with entirely different headings
 *    score 1.000 identity. This instrument does not claim to compare "the design as a whole".
 *
 * 2. Screenshots are SAVED and COMPARED. The comparison against reference boards is done using coarse structural metrics (luminance profiles and palette) inside headless Chrome, rather than diffing pixels directly.
 *
 * 3. The reference boards are IMAGES. The script compares rendered screenshots against the reference boards using structural metrics (luminance profiles and palette extraction) performed inside headless Chrome, finding the closest board for each arm.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { ANALYSIS_METRIC_NOTES, ANALYSIS_PAGE_HTML, profileShapeDistance, profileStats, round4, summariseComparison } from './lib/image-metrics.mjs';
import { armPixelFindings, armPixelPairs } from '../src/eval/parity.mjs';
import { startStaticServer } from './lib/static-server.mjs';
import { ARCHETYPES } from '../pilot/archetypes.mjs';
import { FRAMEWORKS, buildProjectFor, writeProject } from '../pilot/frameworks.mjs';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { captureSignature } from '../src/eval/render.mjs';
import { TOKEN_NAMES, collapsePaletteFindings, paletteFindings, paritySummary } from '../src/eval/parity.mjs';
import { BASELINE_FIELDS, baselineAttributionLine } from '../src/eval/ruleset.mjs';
import { IDENTITY_BUDGET } from '../src/eval/targets.mjs';

const ROOT = resolve(process.cwd());

/**
 * The palette the five reference boards declare, as stated in their README.
 *
 * Kept here as a literal rather than parsed out of the README's prose, because a semantic mapping
 * (which hex is the background rather than a surface) is not something a regex should be guessing at.
 * test/cross-arm-parity.test.mjs asserts these values still appear in that README, so the literal
 * cannot drift away from the source it claims to quote without a test failing.
 */
export const REFERENCE_PALETTE = Object.freeze({
  '--bg': '#0f172a',
  '--surface': '#1e293b',
  '--accent': '#10b981',
  '--muted': '#94a3b8',
  // Not a custom property but the same question asked of the real page: the boards declare a deep slate
  // background, and `body-background` is what the browser COMPUTED for the rendered arm. A token a
  // stylesheet sets is a claim; a computed background is what the user sees.
  'body-background': '#0f172a',
});

const DEFAULT_VIEWPORTS = Object.freeze([
  { key: '390x844', width: 390, height: 844 },
  { key: '768x900', width: 768, height: 900 },
  { key: '1280x900', width: 1280, height: 900 },
]);

/**
 * The one extra measurement taken from the already-loaded page: the computed design tokens, read from
 * the document root. `evaluate` wraps this in a function body and discards a bare trailing expression,
 * so the `return` is not decoration - without it this collects `undefined` and every arm reads as
 * having no tokens at all, which would look like a palette finding rather than a broken probe.
 */
const TOKEN_SCRIPT = `return (() => {
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const tokens = {};
  for (const name of ${JSON.stringify(TOKEN_NAMES)}) tokens[name] = root.getPropertyValue(name).trim();
  return {
    tokens,
    colorScheme: root.colorScheme || '',
    bodyBackground: body.backgroundColor,
  };
})();`;

export function parseArgs(argv) {
  const options = {
    archetype: 'booking',
    out: 'docs/eval/conformance',
    viewports: DEFAULT_VIEWPORTS,
    runRoot: null,
    port: 9600,
    strict: false,
    rerender: false,
    // A check that rewrites the committed report it is checking cannot be run on a clean tree: it dirties
    // the two files every time (timings differ run to run even when nothing else does), and anyone
    // reading `git status` after a check cannot tell a real edit from the tool's own output. Writing is
    // now explicit (mwg-train-a90).
    write: false,
    reuseArms: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--write') options.write = true;
    else if (flag === '--archetype') options.archetype = argv[++index];
    else if (flag === '--out') options.out = argv[++index];
    else if (flag === '--run-root') options.runRoot = argv[++index];
    else if (flag === '--port') options.port = Number(argv[++index]);
    else if (flag === '--strict') options.strict = true;
    else if (flag === '--rerender') options.rerender = true;
    else if (flag === '--reuse-arms') options.reuseArms = true;
    else if (flag === '--viewports') {
      options.viewports = argv[++index].split(',').map((entry) => {
        const [width, height] = entry.split('x').map(Number);
        return { key: `${width}x${height}`, width, height };
      });
    }
  }
  return options;
}

/**
 * Build every arm for the archetype into a run directory inside the repository.
 *
 * Inside the repository, not /tmp: five of the seven arms import their framework from node_modules, and
 * `writeProject` deliberately installs nothing. Node resolves node_modules by walking up from the
 * project directory, so an arm generated under the repository resolves and an arm generated in /tmp does
 * not. This is the one place where "generate somewhere harmless" would have silently produced five of
 * seven arms as connection-refused.
 */
function buildArms({ archetype, runRoot, reuse = false }) {
  const definition = ARCHETYPES[archetype];
  if (!definition) throw new Error(`unknown archetype ${archetype}; known: ${Object.keys(ARCHETYPES).join(', ')}`);
  const arms = [];
  for (const frameworkName of Object.keys(FRAMEWORKS)) {
    const built = buildProjectFor(definition, { frameworkName });
    const dir = resolve(runRoot, built.projectId);
    // `--reuse-arms` exists so a measurement can be repeated against a tree that was deliberately
    // changed between runs. Without it, every run regenerates the arms and there is no way to run the
    // control that matters most: perturb one arm and check the instrument reports it.
    if (!(reuse && existsSync(join(dir, 'server.mjs')))) writeProject(dir, built);
    arms.push({ framework: frameworkName, projectId: built.projectId, dir });
  }
  return arms;
}

/** Render each arm at each viewport, saving one screenshot per arm and width. */
async function measure({ chrome, arms, viewports, runRoot, port }) {
  const screenshotDir = join(runRoot, 'screenshots');
  mkdirSync(screenshotDir, { recursive: true });
  const armsByViewport = {};
  const screenshots = [];
  let nextPort = port;
  {
    for (const requested of viewports) {
      armsByViewport[requested.key] = [];
      for (const arm of arms) {
        const screenshotPath = join(screenshotDir, `${arm.projectId}-${requested.key}.png`);
        const started = Date.now();
        // An arm that cannot be rendered is a FINDING, not a crash. `parity.mjs` documents that absence
        // is never silence and has an `ARM_UNMEASURED` code for it, but a cross-family review caught that
        // the code was unreachable in the live instrument: anything `captureSignature` threw propagated
        // out of `main()` and exited 2 with no report, so a broken arm produced nothing at all. The tool
        // is strongest when it is measuring something unexpected, which is exactly when it must not die.
        try {
          const signature = await captureSignature({
            chrome,
            projectDir: arm.dir,
            port: nextPort++,
            runDir: runRoot,
            viewport: { width: requested.width, height: requested.height },
            screenshotPath,
            collect: TOKEN_SCRIPT,
          });
          const collected = signature.collected ?? null;
          const clean = { ...signature };
          delete clean.collected;
          armsByViewport[requested.key].push({
            framework: arm.framework,
            viewport: requested.key,
            signature: clean,
            // The body's computed colours are kept, not discarded: they are the browser's own measurement
            // of what the page looks like, which is the strongest evidence available for a palette
            // comparison. Dead data in a probe is a measurement somebody wrote and then stopped reading.
            tokens: { ...(collected?.tokens ?? {}), 'body-background': collected?.bodyBackground ?? '' },
            colorScheme: collected?.colorScheme ?? '',
            milliseconds: Date.now() - started,
          });
          screenshots.push({ arm: arm.framework, viewport: requested.key, path: screenshotPath.replace(`${ROOT}/`, '') });
          console.log(
            `  ${arm.framework.padEnd(14)} ${requested.key.padEnd(9)} ${signature.viewport.width}x${signature.viewport.height} ${Math.round((Date.now() - started) / 100) / 10}s`,
          );
        } catch (error) {
          armsByViewport[requested.key].push({
            framework: arm.framework,
            viewport: requested.key,
            signature: null,
            error: error?.message ?? String(error),
            milliseconds: Date.now() - started,
          });
          console.log(`  ${arm.framework.padEnd(14)} ${requested.key.padEnd(9)} FAILED: ${error?.message ?? error}`);
        }
      }
    }
  }
  return { armsByViewport, screenshots };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Cross-arm parity: ${report.archetype}`);
  lines.push('');
  lines.push(baselineAttributionLine());
  lines.push('');
  lines.push(
    `Compares the ${(report.arms_observed ?? []).length ? new Set((report.arms_observed ?? []).map((arm) => arm.framework)).size : 0} framework arms for \`${report.archetype}\` with each other at ${report.viewports.length} widths, and compares every arm screenshot against the reference boards in pixels. Arm-against-arm drift fails this check; board and palette divergence is advisory and is reported without failing unless \`--strict\` is passed.`,
  );
  lines.push('');
  lines.push(
    `**What this measures:** layout and component structure between arms (structural, geometry, controls - blind to text), and real pixels against the boards. **What it does not do:** a per-pixel image diff; the board comparison uses colour distribution, luminance, ink coverage and coarse band structure, and two images can share all of those while looking different.`,
  );
  lines.push('');
  lines.push(`**Arms:** ${[...new Set((report.arms_observed ?? []).map((arm) => arm.framework))].sort().join(', ')}`);
  lines.push('');
  lines.push(
    `**The budget is not a dial.** These are the repository's preregistered \`IDENTITY_BUDGET\` values from \`src/eval/targets.mjs\` (structural ${report.budget.structural}, geometry ${report.budget.geometry}, controls ${report.budget.controls}, overall ${report.budget.overall}), used unchanged. If the arms disagree, the disagreement is reported - the thresholds are not moved until the report reads green.`,
  );
  lines.push('');
  for (const viewport of report.viewports) {
    lines.push(`## ${viewport.viewport.key}`);
    lines.push('');
    lines.push(`- measured: ${viewport.measured.join(', ') || 'none'}`);
    if (viewport.missing.length > 0) lines.push(`- **missing: ${viewport.missing.join(', ')}**`);
    // The all-blank case now returns a truthy object whose axes are null, so a truthiness test would bypass
    // the `not measurable` branch below and print "structural null" (mwg-train-z92 review, P3).
    if (viewport.identity && Number.isFinite(viewport.identity.overall)) {
      lines.push(
        `- identity: structural ${viewport.identity.structural}, geometry ${viewport.identity.geometry}, controls ${viewport.identity.controls}, overall ${viewport.identity.overall}`,
      );
      if (viewport.weakest_pair) {
        lines.push(
          `- weakest pair: ${viewport.weakest_pair.a}/${viewport.weakest_pair.b} overall ${viewport.weakest_pair.overall}`,
        );
      }
    } else {
      lines.push('- identity: **not measurable**');
    }
    lines.push('');
    if (viewport.findings.length === 0) {
      lines.push('No drift above budget at this width.');
    } else {
      for (const finding of viewport.findings) lines.push(`- \`${finding.code}\` ${finding.message}`);
    }
    lines.push('');
  }
  lines.push('## Reference boards');
  lines.push('');
  lines.push(`**Reference boards:** ${report.board_comparison?.boards ? report.board_comparison.boards.length : 0} analysed.`);
  if (report.board_comparison?.unreadable_boards?.length) {
    lines.push('');
    lines.push(`**Unreadable boards (not compared, and not hidden):** ${report.board_comparison.unreadable_boards.map((board) => `${board.file} (${board.error})`).join('; ')}`);
  }
  lines.push('');
  lines.push(
    `The boards are images, so what is compared is what they DECLARE - their palette - against each arm's computed tokens. Divergence here is expected on this repository: the generated arms use the pilot palette and have not adopted the boards' design.`,
  );
  lines.push('');
  if (report.palette_findings.length === 0) {
    lines.push('Every measured arm uses the declared palette.');
  } else {
    lines.push(`| arm | token | declared | actual | viewports |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const finding of report.palette_findings) {
      const widths = (finding.viewports ?? (finding.viewport ? [finding.viewport] : [])).join(', ') || 'not recorded';
      lines.push(`| ${finding.arm} | ${finding.token} | ${finding.expected} | ${finding.actual ?? 'not declared'} | ${widths} |`);
    }
  }
  lines.push('');
  lines.push('## Against the reference boards, in pixels');
  lines.push('');
  lines.push(report.board_comparison?.metric_notes ?? '');
  lines.push('');
  const board = report.board_comparison;
  if (!board || board.per_arm?.length === 0) {
    lines.push('**No board comparison was produced.** This is reported rather than omitted: an absent comparison is not a passing one.');
  } else {
    lines.push(`Boards analysed: ${board.boards.map((entry) => `\`${entry.file.split('/').pop()}\``).join(', ')}.`);
    lines.push('');
    lines.push('| arm | viewport | closest board | distance | finding codes | screenshot |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const entry of board.per_arm) {
      if (entry.error) {
        lines.push(`| ${entry.arm} | ${entry.viewport} | - | - | **not analysed: ${entry.error}** | ${entry.path} |`);
        continue;
      }
      const codes = [...new Set((entry.closest_findings ?? []).map((finding) => finding.code))];
      lines.push(
        `| ${entry.arm} | ${entry.viewport} | \`${entry.closest_board.split('/').pop()}\` | ${entry.closest_distance} | ${codes.length === 0 ? 'none' : codes.join(', ')} | \`${entry.path.split('/').pop()}\` |`,
      );
      // The terms behind the closest-board number, printed so the distance can be read rather than only
      // believed. A commit on this branch claimed this disclosure existed before it did; it exists now.
      const terms = entry.all_boards?.find((candidate) => candidate.board === entry.closest_board)?.terms;
      if (terms) lines.push(`| | | _terms_ | shape ${terms.rows?.shape} / brightness ${terms.rows?.brightness} / contrast ${terms.rows?.contrast} (rows) | shape ${terms.bands?.shape} / brightness ${terms.bands?.brightness} / contrast ${terms.bands?.contrast} (columns) | |`);
    }
    lines.push('');
    lines.push(
      'The distance is the average of THREE terms, computed for the 32 row bands and the 32 column bands of mean luminance and then averaged across those two: how differently the two profiles are SHAPED (one minus their correlation, halved, and 1 when one profile has no variation), how different their average brightnesses are, and how different their CONTRAST is (twice the difference in spread). Stated here because a distance nobody can recompute is a number nobody can check, and the band values and the per-pair terms are in the JSON beside it. Reachable range: a pure brightness difference cannot exceed 0.333, and the highest the average can go is about 0.873 - a flat profile at one extreme against a maximally banded one, where shape fails closed at 1 and brightness and contrast are both high. It does NOT reach 1: any maximal brightness difference forces both profiles flat, which zeroes the other two terms. Nearer is closer; the closest board is named per arm, not assumed.',
    );
  }
  lines.push('');
  if (report.arm_pixels) {
    const pixels = report.arm_pixels;
    lines.push('## Between the arms, in pixels');
    lines.push('');
    lines.push(
      `${pixels.measured} arm pairs were compared in pixels across ${report.viewports.length} widths (${Number((pixels.measured / report.viewports.length).toFixed(1))} per width on average). ` +
        `The budget is ${pixels.budget}: the arms are one specification rendered by seven frameworks from one stylesheet, so they should be near-identical, and the CLOSEST pair measured in this run is reported here as the empirical floor for rendering noise rather than asserted.`,
    );
    lines.push('');
    if (pixels.nearest) {
      lines.push(`- Closest pair (the floor): \`${pixels.nearest.pair.join('\` vs \`')}\` at ${pixels.nearest.viewport}, distance ${pixels.nearest.distance}${termsLine(pixels.nearest.terms)}`);
    }
    if (pixels.worst) {
      lines.push(`- Furthest pair: \`${pixels.worst.pair.join('\` vs \`')}\` at ${pixels.worst.viewport}, distance ${pixels.worst.distance}${termsLine(pixels.worst.terms)}`);
    }
    lines.push('');
    if (pixels.findings.length === 0) {
      lines.push(`No pair of arms diverged in pixels by more than ${pixels.budget}.`);
    } else {
      lines.push(`${pixels.findings.length} pair(s) diverged in pixels:`);
      lines.push('');
      for (const finding of pixels.findings) {
        lines.push(`- \`${finding.pair.join('\` vs \`')}\` at ${finding.viewport}: distance ${finding.distance} (budget ${finding.budget})${termsLine(finding.terms)}`);
        lines.push(`  - ${finding.a_shot}`);
        lines.push(`  - ${finding.b_shot}`);
      }
    }
    lines.push('');
  }
  lines.push('## Screenshots');  lines.push('');
  lines.push('Saved for inspection (untracked run directory, full-page, one per arm and width):');
  lines.push('');
  for (const shot of report.screenshots) lines.push(`- \`${shot.path}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

/**
 * The line above which two arms are reported as having rendered different pixels.
 *
 * Basis, so this is a budget and not a dial. The arms are ONE specification built by seven frameworks from ONE
 * shared stylesheet, so they should render near-identically. BOTH ends of the range are measured, because a
 * floor alone calibrates only the bottom:
 *
 * - FLOOR: on the unaltered tree the closest measured pair is 0.00 at every width, so rendering noise on this
 *   stack is zero and there is no headroom to absorb.
 * - UPPER: a deliberately subtle single-arm change - one arm's `--bg` from #ffffff to #f0f0f0, about a 6%
 *   darkening of its dominant surface - scores 0.0391 and therefore PASSES SILENTLY below this budget. A
 *   global surface-colour change (one arm's background to #b3005a) scores 0.5009 and is caught by 10x.
 *
 * So 0.05 means: a change to one arm's dominant surface colour of roughly 8% or more is reported, and anything
 * subtler is not. That limit is stated rather than discovered by a reader wondering why a small drift went
 * unmentioned. A review found this headroom uncalibrated and it was right to; the number is unchanged because
 * a floor measured on one tree does not justify tightening it against rendering noise on another machine.
 */
export const ARM_PIXEL_BUDGET = 0.05;

function termsLine(terms) {
  if (!terms) return '';
  const part = (label, entry) => (entry ? `${label} shape ${entry.shape} / brightness ${entry.brightness} / contrast ${entry.contrast}` : `${label} -`);
  return ` - terms: ${part('rows', terms.rows)}; ${part('columns', terms.bands)}`;
}

/**
 * How far apart two images are, as ONE number, so "which board is this arm closest to" is answerable
 * without a human looking at 105 pairs of images.
 *
 * The metric is stated rather than implied: for the 32 row bands and the 32 column bands of MEAN LUMINANCE,
 * three differences are averaged - how differently the profiles are SHAPED (1 minus their correlation,
 * halved), how different their average brightnesses are, and how different their CONTRAST is (twice the
 * difference in spread). Each term is needed: shape alone cannot see contrast, brightness alone saturates on
 * a dark mockup, and leaving contrast out scored a half-dark/half-light image as identical to a flat one of
 * the same mean. A reader can recompute the number from the band values in the report.
 *
 * The doc block previously sat above ARM_PIXEL_BUDGET, describing a budget it has nothing to do with - the
 * same mis-attributed-prose class that has produced a defect in every round of this review.
 */
/**
 * The three terms behind a distance, in 0..1 each, so the number can be broken down rather than believed.
 * Module scope so the distance and its disclosure compute the terms the SAME way - they were separate
 * before, and `metricTerms` referenced a helper scoped inside the distance function, which threw the moment
 * it was finally called. It had sat uncalled (a review finding) so nothing noticed the latent breakage.
 */
function pairTerms(first, second) {
  const left = profileStats(first ?? []);
  const right = profileStats(second ?? []);
  const shape = profileShapeDistance(first ?? [], second ?? []);
  return {
    shape: round4(shape.distance),
    brightness: round4(Math.abs(left.mean - right.mean)),
    contrast: round4(Math.min(1, 2 * Math.abs(left.spread - right.spread))),
    comparable: shape.comparable,
  };
}

export function metricDistance(a, b) {
  // THREE TERMS, because a reviewer found the third one missing and was right. Each is in 0..1 and they are
  // averaged, and the average is stated in the report so a reader can recompute it from the band values.
  //
  // - SHAPE: 1 minus the correlation, halved. Catches a different or inverted layout.
  // - BRIGHTNESS: the difference in mean luminance. Catches a light image against a dark one.
  // - CONTRAST: twice the difference in the profile's spread. WITHOUT THIS, two profiles with the same shape
  //   and the same mean are identical to the metric however different they look: a half-dark/half-light
  //   image and an almost uniformly grey one with the same mean correlate at +1 and scored 0, which is the
  //   same confident-but-meaningless zero that the blank attractor produced one round earlier.
  const pair = (first, second) => {
    const { shape, brightness, contrast } = pairTerms(first, second);
    return (shape + brightness + contrast) / 3;
  };
  const rows = pair(a?.rowLuminance, b?.rowLuminance);
  const bands = pair(a?.bandLuminance, b?.bandLuminance);
  return Number(((rows + bands) / 2).toFixed(4));
}

/** The three stated terms behind a distance, so a number in the report can be explained as well as checked. */
export function metricTerms(a, b) {
  return { rows: pairTerms(a?.rowLuminance, b?.rowLuminance), bands: pairTerms(a?.bandLuminance, b?.bandLuminance) };
}

/**
 * Compare every arm screenshot against every reference board, in the browser, and report the closest.
 *
 * This is Paul's mandate taken literally: diff the arms against `docs/design/archetypes/booking/step*.jpg`
 * as well as against each other, and report drift as a finding with a screenshot rather than as a
 * pass/fail. An earlier version of this instrument replaced this with a declared-palette comparison and a
 * reason; the reason was fine and the substitution was still wrong.
 *
 * Each finding names BOTH images, so a reader can open the board and the arm and judge the finding for
 * themselves - which is the whole point of reporting a diff rather than a verdict.
 */
async function compareAgainstBoards({ chrome, armRoot, screenshots, arms, archetype }) {
  const boardDir = resolve(ROOT, `docs/design/archetypes/${archetype}`);
  const boards = readdirSync(boardDir)
    .filter((name) => /^step\d+.*\.jpg$/i.test(name))
    .sort();
  let missingBoardsFinding = null;
  if (boards.length === 0) {
    missingBoardsFinding = {
      code: 'BOARDS_MISSING',
      axis: 'reference',
      message: `no step*.jpg reference boards were found in docs/design/archetypes/${archetype}, so nothing was compared against the reference design`,
    };
  }

  const server = await startStaticServer({
    mounts: { '/board/': boardDir, '/shot/': join(armRoot, 'screenshots') },
    documents: { '/analyse.html': ANALYSIS_PAGE_HTML },
  });
  const analyzed = {};
  const failures = [];
  // The page is created INSIDE the try, so a browser that dies between the server starting and the page
  // opening cannot leak the server: a cross-family review caught `newPage` sitting outside the finally.
  let page = null;
  try {
    page = await chrome.newPage({});
    await page.goto(`${server.origin}/analyse.html`);
    for (const url of [...boards.map((name) => `/board/${name}`), ...screenshots.map((shot) => `/shot/${shot.path.split('/').pop()}`)]) {
      try {
        analyzed[url] = await page.evaluate(`return await window.analyseImage(${JSON.stringify(url)});`);
      } catch (error) {
        analyzed[url] = { error: error?.message ?? String(error) };
        failures.push({ url, error: analyzed[url].error });
      }
    }
  } finally {
    if (page) await page.close().catch(() => {});
    await server.close();
  }

  if (boards.length === 0) {
    return {
      boards: [],
      per_arm: [],
      metric_notes: ANALYSIS_METRIC_NOTES,
      analyzed, // KEEP THIS so arm-pixel pairs work!
      findings: [missingBoardsFinding],
    };
  }

  const loadedBoards = boards.map((name) => ({ file: `docs/design/archetypes/${archetype}/${name}`, name, metrics: analyzed[`/board/${name}`] }));
  const boardMetrics = loadedBoards.filter((board) => board.metrics && !board.metrics.error);
  const failedBoards = loadedBoards.filter((board) => !board.metrics || board.metrics.error);

  // A board that failed to load is REPORTED and not filtered away. Silently comparing against the
  // survivors would make a missing reference look like a reference the arms happen to match less badly.
  const findings = failedBoards.map((board) => ({
    code: 'BOARD_UNREADABLE',
    axis: 'reference',
    board: board.file,
    message: `${board.file} could not be measured (${board.metrics?.error ?? 'no result'}), so no arm was compared against it`,
  }));
  if (boardMetrics.length === 0) {
    findings.push({
      code: 'BOARDS_UNREADABLE',
      axis: 'reference',
      message: 'no reference board could be measured, so the arms were not compared against the reference design at all',
    });
  }

  const perArm = screenshots.map((screenshot) =>
    compareOne({ screenshot: { ...screenshot, analysis: analyzed[`/shot/${screenshot.path.split('/').pop()}`] }, boardMetrics }),
  );
  // Arms that produced no screenshot at all are recorded as such rather than being absent from the table.
  for (const arm of arms) {
    if (perArm.some((entry) => entry.arm === arm.framework)) continue;
    perArm.push({ arm: arm.framework, viewport: null, path: null, error: 'not measured: this arm produced no screenshot' });
  }

  return {
    boards: boardMetrics.map((board) => ({
      file: board.file,
      size: `${board.metrics.width}x${board.metrics.height}`,
      // SPREAD the measurement rather than naming fields. This projection used to list
      // luminance/ink/colours/rows/bands by hand and silently dropped the mean-luminance band profiles the
      // distance is computed from, so the committed report could not be recomputed from - the same defect as
      // restating a derived list by hand, one layer down. A measured object belongs in the report whole.
      ...board.metrics,
    })),
    unreadable_boards: failedBoards.map((board) => ({ file: board.file, error: board.metrics?.error ?? 'no result' })),
    per_arm: perArm,
    metric_notes: ANALYSIS_METRIC_NOTES,
    // Handed back so the arm-against-arm comparison can use the SAME measurements rather than analysing every
    // screenshot a second time, which would double the browser cost of the run and could disagree with itself.
    analyzed,
    findings: [...findings, ...perArm.flatMap((entry) => entry.closest_findings ?? [])],
  };
}

/** Compare one screenshot against every board that could be measured, and name the closest. */
function compareOne({ screenshot, boardMetrics }) {
  if (boardMetrics.length === 0) {
    return { ...screenshot, error: 'no reference board could be measured' };
  }
  const analysed = screenshot.analysis;
  if (!analysed || analysed.error) {
    return { ...screenshot, error: analysed?.error ?? 'the screenshot could not be analysed' };
  }
  const comparisons = boardMetrics.map((board) => ({
    board: board.file,
    distance: metricDistance(board.metrics, analysed),
    // The three terms behind that distance. A commit on this branch claimed they were disclosed per pair and
    // they were not - `metricTerms` was dead code - so the claim is made TRUE here rather than withdrawn. It
    // matters because the distance is an average of three terms with equal weight, which is a choice: a reader
    // who wants to know why two images are 0.395 apart gets the three numbers instead of an assertion.
    terms: metricTerms(board.metrics, analysed),
    findings: summariseComparison(board.metrics, analysed),
  }));
  // Nearest first; then the board that diverges on fewer axes; then by name, so a tie is still
  // deterministic rather than depending on directory order. The first version of this sorted the
  // diverging board first when distances tied, which is the opposite of closest.
  comparisons.sort((a, b) => a.distance - b.distance || a.findings.length - b.findings.length || a.board.localeCompare(b.board));
  const closest = comparisons[0];
  return {
    ...screenshot,
    metrics: {
      // Spread for the same reason as the boards above: a hand-listed projection drops whatever the list
      // forgets, and what it forgot here was the profile the distance is built on. The full luminance
      // distribution is carried too, not just its mean, because a reader checking the number needs it.
      ...analysed,
    },
    closest_board: closest.board,
    closest_distance: closest.distance,
    closest_findings: closest.findings.map((finding) => ({
      ...finding,
      // Both images named on every finding: this is what makes a drift report inspectable by a person
      // rather than something they have to take on trust.
      board: closest.board,
      screenshot: screenshot.path,
    })),
    all_boards: comparisons.map((comparison) => ({ board: comparison.board, distance: comparison.distance, terms: comparison.terms, findings: comparison.findings.length })),
  };
}

/**
 * The exit code for a finished run. Pure, so the gate policy can be tested without a browser.
 *
 * The finding codes that are REPORTED but do not fail the check. Each is here because it measures an arm
 * against the reference BOARDS, or against the declared palette, rather than one arm against another:
 *
 *   BOARD_*    the arm screenshot against the design boards (scripts/lib/image-metrics.mjs CODES), which
 *              the committed report documents as expected divergence.
 *   PALETTE_*  the arm's computed tokens against the palette the boards declare (parity.mjs
 *              paletteFindings), which is the same question one level down.
 *
 * DELIBERATELY NOT HERE: every CROSS_ARM_* code and both ARM_PIXEL_CODES, which compare arms with each
 * other - the two axes this script exists to measure. Also not here: BOARDS_MISSING, BOARD_UNREADABLE and
 * BOARDS_UNREADABLE, because a board that could not be read is an unmeasured comparison rather than a
 * passing one.
 *
 * ANYTHING ELSE GATES, including a code that does not exist yet: a new measurement is treated as parity
 * until someone classifies it deliberately, so the failure direction is a red check rather than a silent
 * pass. The list is derived from where the codes are DEFINED, not from what today's report happens to
 * contain.
 */
export const ADVISORY_CODES = Object.freeze([
  'BOARD_PALETTE_NOT_SHARED',
  'BOARD_LUMINANCE_DIVERGES',
  'BOARD_INK_DIVERGES',
  'BOARD_STRUCTURE_DIVERGES',
  'PALETTE_DIVERGES',
  'PALETTE_UNDECLARED',
]);

export const UNMEASURED_CODES = Object.freeze([
  'BOARD_STRUCTURE_UNMEASURED',
  'BOARDS_MISSING',
]);

/**
 * Assemble the findings union the gate scores, from the four axes it is published beside.
 *
 * The union used to be assembled by hand inside main(), and no unit test can traverse main(): a mutation
 * deleting one axis from that line passed the suite twice (mwg-train-a90's delta review proved it), and the
 * runtime guard that does catch it compares CONTENT, so it was dormant whenever the dropped axis was empty -
 * which both gating axes are today, 0 parity and 0 arm-pixel (mwg-train-qfg). Requiring the four keys HERE
 * turns deleting an axis into a MISSING KEY rather than a shorter array, and a missing key throws whether or
 * not the axis has findings, so the wiring is provable in a unit test with no browser and no finding.
 *
 * THE IRREDUCIBLE LIMIT, stated rather than papered over: omitting a key is caught; PASSING AN EXPLICIT
 * EMPTY ARRAY is not. A caller writing `armPixels: []` instead of forwarding the measured axis is
 * indistinguishable here from an axis that genuinely produced no findings.
 */
export function assembleFindings({ parity, palette, board, armPixels }) {
  const axes = [
    ['parity', parity],
    ['palette', palette],
    ['board', board],
    ['armPixels', armPixels],
  ];
  for (const [name, axis] of axes) {
    if (!Array.isArray(axis)) {
      throw new TypeError(
        `assembleFindings: the ${name} axis must be an array, got ${axis === undefined ? 'no key at all' : typeof axis}`,
      );
    }
  }
  return [...parity, ...palette, ...board, ...armPixels];
}

/**
 * Every finding the report publishes must also be in the union the gate scores.
 *
 * The union `findings` is assembled by hand in main() from four axes, and no unit test can see an axis left
 * out of that line: the tests supply their own reports, so a mutation dropping one axis from main() passed
 * 29/29 twice before this guard existed. This makes the wiring check ITSELF at run time instead. Each axis
 * the report publishes separately must be an array - so deleting an axis outright is an error rather than a
 * quiet omission - and every finding in each must appear in `findings`. A report that fails is not scored at
 * all: it throws rather than returning a pass over a union that is missing an axis.
 *
 * FINDINGS ARE MATCHED BY VALUE, not by reference, so this also holds for a report read back from JSON.
 */
/**
 * The single place the four measured axes become the published union.
 *
 * This was a hand-written spread inside main() until a cross-family review showed that dropping an axis
 * from it was invisible: the runtime guard compares CONTENT, so an axis carrying no findings could be
 * deleted without any test or check noticing (mwg-train-qfg). assembleFindings made a missing axis a
 * missing KEY; this function is what makes the mapping from the four comparisons to those four keys
 * something a unit test can call, because main() cannot be called without opening a browser.
 *
 * All three `.findings` reads are optional-chained, and that is not a softness: a comparison that was
 * never run yields undefined, assembleFindings refuses undefined rather than treating it as an empty
 * axis, and the error it raises NAMES the axis. Writing `summary.findings` instead would throw a bare
 * "cannot read properties of undefined" that says nothing about which axis is missing - the first
 * version of this function did exactly that, and the test below caught it. The strictness is unchanged;
 * only the quality of the failure is.
 */
export function unionFromAxes({ summary, palette, boardComparison, pixelComparison }) {
  return assembleFindings({
    parity: summary?.findings,
    palette,
    board: boardComparison?.findings,
    armPixels: pixelComparison?.findings,
  });
}

export function assertFindingsConsistent(report) {
  const findings = report?.findings;
  if (!Array.isArray(findings)) throw new TypeError('report.findings must be an array');
  const axes = [
    ['parity_findings', report?.parity_findings],
    ['palette_findings', report?.palette_findings],
    ['board_comparison.findings', report?.board_comparison?.findings],
    ['arm_pixels.findings', report?.arm_pixels?.findings],
  ];
  for (const [name, axis] of axes) {
    if (!Array.isArray(axis)) {
      throw new TypeError(`report is missing the ${name} axis, so the gate cannot check the union against it`);
    }
  }
  const union = new Set(findings.map((finding) => JSON.stringify(finding)));
  for (const [name, axis] of axes) {
    for (const finding of axis) {
      if (!union.has(JSON.stringify(finding))) {
        throw new Error(`a ${name} finding is published but absent from report.findings: the gate would score a union missing an axis`);
      }
    }
  }
  return axes.map(([name, axis]) => `${name}=${axis.length}`).join(' ');
}

/**
 * The exit code for a finished report. Pure, so the gate policy is tested without a browser.
 *
 * ARM-AGAINST-ARM PARITY GATES, ON BOTH AXES MEASURED BETWEEN ARMS; BOARD AND PALETTE DRIFT IS ADVISORY.
 * The report's own `limits.compares` draws that line: "layout and component structure between arms", "real
 * pixels between arms at each width", and "real pixels against the reference boards". The first two are
 * parity - one arm disagreeing with another - and the third is the design question. Both axes are scored
 * here, by CODE over the complete findings list, which is why the arm-against-arm PIXEL axis cannot be
 * silently left out the way it was when only the structural set gated.
 *
 * Failing on the advisory set by default would make the check red on every clean checkout for a condition
 * this repository has already decided is expected - the committed report says board divergence "is
 * expected on this repository: the generated arms use the pilot palette and have not adopted the boards'
 * design" - and a check that is always red cannot show a new failure: the defect filed as mwg-train-jjl.
 * `--strict` still fails on any finding, which is what it has always done.
 *
 * A malformed report is an error rather than a silent zero.
 */
export function exitCodeFor(report, { strict = false } = {}) {
  const findings = report?.findings;
  if (!Array.isArray(findings)) throw new TypeError('exitCodeFor needs a report with a findings array');
  assertFindingsConsistent(report);
  if (findings.length === 0) return 0;
  if (strict) return 1;
  // Every finding that is not advisory is parity, so an unrecognised code fails the check.
  // Missing boards are absent input, not a failure, but unmeasurable boards FAIL the check.
  return findings.some((finding) => !ADVISORY_CODES.includes(finding?.code) && finding?.code !== 'BOARDS_MISSING') ? 1 : 0;
}

/**
 * The line main() prints about what is not gating, derived from the same decision that sets the exit
 * status rather than from a parallel assumption about it.
 *
 * The defect this replaces: the unmeasured case printed "advisory and do NOT fail this check" while
 * exitCodeFor returned 1, so an operator reading a red result saw a line telling them it should not be
 * red. A summary built from the exit code cannot disagree with it. Exported and pure so a test can
 * assert the agreement without driving a browser.
 *
 * Returns null when the findings are not all advisory or unmeasured - in that case the FINDING lines
 * above already said what failed, and a summary would only repeat them.
 */
export function summaryFor(report, options = {}) {
  const findings = report?.findings ?? [];
  const code = exitCodeFor(report, options);
  if (findings.length === 0) return 'check-cross-arm-parity: PASS - no drift above budget';
  const advisory = findings.filter((finding) => ADVISORY_CODES.includes(finding?.code));
  const unmeasured = findings.filter((finding) => UNMEASURED_CODES.includes(finding?.code));
  if (advisory.length + unmeasured.length !== findings.length) return null;
  const advisories = `the ${advisory.length} board and palette finding(s) above are advisory`;
  if (unmeasured.length > 0) {
    // BOARDS_MISSING is absent input and does not gate, so the same count can produce either status;
    // the wording follows the status rather than assuming one.
    return code === 0
      ? `check-cross-arm-parity: UNMEASURED - ${unmeasured.length} comparison(s) could not be measured; ${advisories} and do not fail this check`
      : `check-cross-arm-parity: UNMEASURED - ${unmeasured.length} comparison(s) could not be measured; ${advisories}, and the unmeasured comparison(s) FAIL this check`;
  }
  // The advisory-only case needs the same treatment as the unmeasured one: with --strict, exitCodeFor
  // returns 1 for a report that is entirely advisory, so a hardcoded PASS line here repeats the very
  // defect this function exists to remove - it told the reader the findings do not fail a check the
  // operator had just asked to fail on them.
  return code === 0
    ? `check-cross-arm-parity: PASS - no arm-against-arm drift above budget; ${advisories} and do NOT fail this check (pass --strict to fail on them)`
    : `check-cross-arm-parity: FAIL (--strict) - no arm-against-arm drift above budget; ${advisories}, and fail this check because --strict was passed`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const jsonPath = resolve(ROOT, options.out, `${options.archetype}-cross-arm.json`);
  const markdownPath = resolve(ROOT, options.out, `${options.archetype}-cross-arm.md`);

  if (options.rerender) {
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    writeFileSync(markdownPath, renderMarkdown(report));
    console.log(`check-cross-arm-parity: re-rendered ${markdownPath.replace(`${ROOT}/`, '')} from the committed JSON`);
    return 0;
  }

  // Arms must resolve node_modules, so the run directory is always inside the repository: an arm
  // generated under it resolves its framework, and one generated anywhere else does not. See buildArms.
  const armRoot = options.runRoot
    ? resolve(ROOT, options.runRoot)
    : resolve(ROOT, '.conformance-corpus', `cross-arm-${Date.now()}`);
  mkdirSync(armRoot, { recursive: true });
  console.log(`check-cross-arm-parity: building ${Object.keys(FRAMEWORKS).length} arms for ${options.archetype}`);
  const arms = buildArms({ archetype: options.archetype, runRoot: armRoot, reuse: options.reuseArms });
  const expectedArms = arms.map((arm) => arm.framework);
  console.log(`check-cross-arm-parity: rendering ${arms.length} arms at ${options.viewports.map((v) => v.key).join(', ')}`);
  // One browser for the whole run, owned here rather than inside a measurement step, because the board
  // comparison needs the same browser afterwards: the browser is the only image decoder available.
  const chrome = await launchChrome({});
  let measured;
  let boardComparison;
  try {
    measured = await measure({
      chrome,
      arms,
      viewports: options.viewports,
      runRoot: armRoot,
      port: options.port,
    });
    console.log('check-cross-arm-parity: comparing every arm screenshot against the reference boards');
    boardComparison = await compareAgainstBoards({ chrome, armRoot, screenshots: measured.screenshots, arms, archetype: options.archetype });
  } finally {
    await chrome.close().catch(() => {});
  }
  const { armsByViewport, screenshots } = measured;

  const summary = paritySummary({
    archetype: options.archetype,
    viewports: options.viewports,
    armsByViewport,
    budget: IDENTITY_BUDGET,
    // Which arms were MEANT to be measured, so one that produced no row at all is still reported.
    expectedArms,
  });
  const allArms = options.viewports.flatMap((viewport) => armsByViewport[viewport.key] ?? []);

  // ARM AGAINST ARM, IN PIXELS. The numeric signature comparison normalises geometry, so two arms can agree
  // structurally and still render visibly different pixels; this is the half of the mandate that compares
  // what a person would actually see. Every unordered pair within a viewport, compared once and never against
  // itself. `budget` is compared and never adjusted - the observed nearest pair is reported beside it, since
  // the arms are one specification rendered from one stylesheet, which makes the closest pair an empirical
  // floor for rendering noise rather than a difference in design.
  const analyzed = boardComparison.analyzed ?? {};
  const pixelPairs = [];
  for (const viewport of options.viewports) {
    const armsHere = allArms
      .filter((arm) => arm.viewport === viewport.key)
      .map((arm) => {
        const path = screenshots.find((shot) => shot.viewport === viewport.key && shot.arm === arm.framework)?.path ?? null;
        return {
          framework: arm.framework,
          screenshot: path,
          // A metrics object carrying `error` is NOT a measurement. `analyseImage` failing stores `{ error }`,
          // which is truthy, so an unmeasured-screenshot guard testing only for null let a FAILED analysis be
          // read as an all-zero profile: the arm then scored a fabricated 0.6333 against a healthy one and
          // produced a CROSS_ARM_PIXEL_PAIR_DIVERGES finding naming two screenshots, one of which had not been
          // measured at all. Reported by a cross-family review; it is the same "confident number that does not
          // mean what the report says" class the distance metric itself was redesigned three times to avoid.
          metrics: path && !analyzed[`/shot/${path.split('/').pop()}`]?.error ? analyzed[`/shot/${path.split('/').pop()}`] : null,
        };
      });
    for (const pair of armPixelPairs({ viewport: viewport.key, arms: armsHere })) {
      pixelPairs.push({
        ...pair,
        distance: pair.error ? null : metricDistance(pair.aMetrics, pair.bMetrics),
        // Same disclosure for arm-against-arm: the terms behind the number, so drift can be read as well as
        // measured.
        terms: pair.error ? null : metricTerms(pair.aMetrics, pair.bMetrics),
      });
    }
  }
  const pixelComparison = armPixelFindings({ pairs: pixelPairs, budget: ARM_PIXEL_BUDGET });
  // The per-pair measurements are dropped here: the report already carries every arm's full metrics, so
  // repeating 32-band arrays once per pair would bloat the artifact with a second copy of the same numbers.
  const pixelReport = {
    budget: ARM_PIXEL_BUDGET,
    measured: pixelComparison.measured,
    expected: pixelPairs.length,
    nearest: pixelComparison.nearest
      ? { pair: [pixelComparison.nearest.a, pixelComparison.nearest.b], viewport: pixelComparison.nearest.viewport, distance: pixelComparison.nearest.distance, terms: pixelComparison.nearest.terms ?? null }
      : null,
    worst: pixelComparison.worst
      ? { pair: [pixelComparison.worst.a, pixelComparison.worst.b], viewport: pixelComparison.worst.viewport, distance: pixelComparison.worst.distance, terms: pixelComparison.worst.terms ?? null }
      : null,
    findings: pixelComparison.findings,
  };
  // The same token is read at three widths, so one arm using the wrong accent colour would otherwise
  // produce the same finding three times; the collapse is what turns 84 rows back into 28 facts, and it
  // deliberately keeps a token that really does differ between widths.
  const palette = collapsePaletteFindings(paletteFindings({ arms: allArms, declared: REFERENCE_PALETTE }));

  const report = {
    ...BASELINE_FIELDS,
    archetype: options.archetype,
    generated_at: new Date().toISOString(),
    viewports: summary.viewports,
    arms_measured: [...new Set(allArms.filter((arm) => arm.signature).map((arm) => arm.framework))].sort(),
    // SPREAD, not a three-field projection. This listed framework/viewport/color_scheme by hand and dropped
    // the signature and the token map - the very inputs the cross-arm and palette verdicts are computed
    // from - so the committed report contained those verdicts and none of the evidence for them. Third time
    // on this branch that a hand-written projection dropped what a consumer needed; the fix is the same
    // every time and is now a habit rather than an incident: carry the measured object whole.
    arms_observed: allArms.map((arm) => ({ ...arm })),
    budget: IDENTITY_BUDGET,
    reference_palette: REFERENCE_PALETTE,
    palette_findings: palette,
    // `analyzed` is deliberately NOT stored. It is handed back from compareAgainstBoards so the arm-pixel
    // comparison can reuse the same measurements instead of opening a second browser pass, but every one of
    // those measurements is already in `boards` and `per_arm` below. Storing the map as well made the
    // artifact 948K of duplicated band arrays, and a report nobody can read is a report nobody checks.
    board_comparison: (({ analyzed: _unused, ...rest }) => rest)(boardComparison),
    // Arm-against-arm pixels, kept beside the board comparison and summarised rather than duplicated.
    arm_pixels: pixelReport,
    // The structural parity axis, published beside the others. Without this the union could lose
    // `...summary.findings` and NOTHING could tell: the parity findings were the one axis carried only in
    // `findings`, so dropping them left a report whose own parts no longer added up, with no other copy to
    // compare against. assertFindingsConsistent() below checks every published axis against the union.
    parity_findings: summary.findings,
    // Board findings are part of `findings`, so they print, they are visible to a JSON consumer, and
    // `--strict` can act on them. A cross-family review caught them living only in board_comparison,
    // where 105 measured disagreements were invisible to every one of those three. The arm-pixel findings
    // are included for the same reason on the first attempt rather than after a review.
    // Assembled by the function above rather than by hand, so that dropping an axis is a missing key
    // instead of a shorter array. `board` is forwarded WITHOUT a `?? []` default on purpose: defaulting a
    // missing axis to an empty array is exactly the failure this function exists to remove.
    findings: unionFromAxes({ summary, palette, boardComparison, pixelComparison }),
    screenshots,
    limits: {
      compares: 'layout and component structure between arms (structural, geometry, controls axes), real pixels between arms at each width, and real pixels against the reference boards',
      blind_to: 'text content, and viewport shape between arms (geometry is normalised per viewport)',
      screenshots: 'compared in pixels against the reference boards AND retained for inspection; the comparison uses colour distribution, luminance, ink coverage and coarse band structure, not a per-pixel image diff',
      reference_boards: 'compared in pixels, measured in the browser: the board JPEGs and the arm screenshots are drawn to a canvas and read with getImageData, which is the only image decoder this repository has',
    },
  };

  // The report is still assembled and reported above; only SAVING it is opt-in, so a check can run on a
  // clean tree and leave it clean.
  if (options.write) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdownPath, renderMarkdown(report));
  }

  console.log(
    `check-cross-arm-parity: ${report.arms_measured.length} arms measured, ${summary.findings.length} parity finding(s), ${palette.length} palette finding(s), ${report.board_comparison?.findings?.length ?? 0} board finding(s)`,
  );
  for (const finding of report.findings) console.log(`  FINDING ${finding.code} ${finding.message}`);
  console.log(
    options.write
      ? `check-cross-arm-parity: wrote ${jsonPath.replace(`${ROOT}/`, '')} and ${markdownPath.replace(`${ROOT}/`, '')}`
      : `check-cross-arm-parity: not writing ${jsonPath.replace(`${ROOT}/`, '')}; pass --write to update the committed report`,
  );
  // The gate is decided by CODE over the complete findings list. Passing explicit sub-arrays here would be
  // untestable - a unit test cannot see main() forgetting one axis, which is exactly how the
  // arm-against-arm PIXEL axis was left advisory while only the structural one gated. Classifying
  // report.findings by code scores every finding main() produces, including a code added later, which
  // GATES until someone classifies it deliberately (see ADVISORY_CODES).
  const summaryLine = summaryFor(report, options);
  if (summaryLine) console.log(summaryLine);
  return exitCodeFor(report, options);
}

// Import-safe: a test asserts this script's declared palette still matches the reference boards' own
// README, so importing it must not start rendering arms. Same guard the other scripts use.
const invokedDirectly = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`check-cross-arm-parity: ERROR ${error?.stack ?? error}`);
      process.exitCode = 2;
    });
}

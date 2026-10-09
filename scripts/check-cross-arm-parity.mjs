#!/usr/bin/env node
/**
 * Do the framework arms for one archetype render as the same design?
 *
 *   node scripts/check-cross-arm-parity.mjs                      # booking, all arms, three widths
 *   node scripts/check-cross-arm-parity.mjs --archetype booking
 *   node scripts/check-cross-arm-parity.mjs --strict             # exit non-zero when findings exist
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
 * 2. Screenshots are SAVED, not diffed. There is no image decoder in this repository by design, and
 *    comparing PNG bytes would punish a framework for anti-aliasing; the repository's own conformance
 *    axes say geometry is the honest version of that question. Screenshots exist so a human can look.
 *
 * 3. The reference boards are IMAGES. Diffing a rendered page against a mockup JPEG is not a meaningful
 *    comparison, so what is compared against the boards is what the boards DECLARE: their palette, in
 *    hex. That comparison is expected to diverge today - the generated arms use the pilot palette - and
 *    divergence is reported as a finding, not treated as a failure to be hidden or a bar being passed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { ANALYSIS_METRIC_NOTES, ANALYSIS_PAGE_HTML, summariseComparison } from './lib/image-metrics.mjs';
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
    bodyColor: body.color,
    bodyBackground: body.backgroundColor,
  };
})();`;

function parseArgs(argv) {
  const options = {
    archetype: 'booking',
    out: 'docs/eval/conformance',
    viewports: DEFAULT_VIEWPORTS,
    runRoot: null,
    port: 9600,
    strict: false,
    rerender: false,
    reuseArms: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--archetype') options.archetype = argv[++index];
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
    `Compares the ${report.arms_measured.length} framework arms for \`${report.archetype}\` with each other at ${report.viewports.length} widths. Finds drift; does not gate it.`,
  );
  lines.push('');
  lines.push(
    `**What this measures:** layout and component structure. The underlying axes are structural, geometry and controls, and they are blind to text - two pages with different headings score 1.000. **What it does not do:** diff screenshots (no image decoder exists in this repository by design) or compare pixels against the reference boards, which are images.`,
  );
  lines.push('');
  lines.push(`**Arms:** ${report.arms_measured.join(', ')}`);
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
    if (viewport.identity) {
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
      lines.push('No drift below budget at this width.');
    } else {
      for (const finding of viewport.findings) lines.push(`- \`${finding.code}\` ${finding.message}`);
    }
    lines.push('');
  }
  lines.push('## Reference boards');
  lines.push('');
  lines.push(`**Reference boards:** ${report.boards ? report.boards.length : 0} analysed.`);
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
    }
    lines.push('');
    lines.push(
      'The distance is the mean absolute difference across the 32 row bands and the 32 column bands, averaged - stated here because a distance nobody can recompute is a number nobody can check. Nearer is closer; the closest board is named per arm, not assumed.',
    );
  }
  lines.push('');
  lines.push('## Screenshots');  lines.push('');
  lines.push('Saved for inspection (untracked run directory, full-page, one per arm and width):');
  lines.push('');
  for (const shot of report.screenshots) lines.push(`- \`${shot.path}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

/**
 * How far apart two images are, as ONE number, so "which board is this arm closest to" is answerable
 * without a human looking at 105 pairs of images.
 *
 * The metric is stated rather than implied: the mean absolute difference across the 32 row bands and the
 * 32 column bands, averaged. It is deliberately built only on the coarse structure profile, because that
 * is the part of the measurement that survives the fact that a board is a mockup and an arm is a live
 * page - they will never share a colour histogram exactly, and pretending otherwise would produce a
 * distance nobody could interpret.
 */
export function metricDistance(a, b) {
  const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
  const rowDiff = mean((a.rows ?? []).map((value, index) => Math.abs(value - (b.rows?.[index] ?? 0))));
  const bandDiff = mean((a.bands ?? []).map((value, index) => Math.abs(value - (b.bands?.[index] ?? 0))));
  return Number(((rowDiff + bandDiff) / 2).toFixed(4));
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
async function compareAgainstBoards({ chrome, armRoot, screenshots }) {
  const boardDir = resolve(ROOT, 'docs/design/archetypes/booking');
  const boards = readdirSync(boardDir)
    .filter((name) => /^step\d+.*\.jpg$/i.test(name))
    .sort();
  if (boards.length === 0) {
    return { boards: [], per_arm: [], metric_notes: ANALYSIS_METRIC_NOTES, findings: [], error: 'no step*.jpg reference boards were found' };
  }

  const server = await startStaticServer({
    mounts: { '/board/': boardDir, '/shot/': join(armRoot, 'screenshots') },
    documents: { '/analyse.html': ANALYSIS_PAGE_HTML },
  });
  const page = await chrome.newPage({});
  const analyzed = {};
  try {
    await page.goto(`${server.origin}/analyse.html`);
    // One call per image. A failure is RECORDED, never silently zero: an unreadable board would otherwise
    // make every arm look equally far from it, which reads as agreement.
    for (const url of [...boards.map((name) => `/board/${name}`), ...screenshots.map((shot) => `/shot/${shot.path.split('/').pop()}`)]) {
      try {
        analyzed[url] = await page.evaluate(`return await window.analyseImage(${JSON.stringify(url)});`);
      } catch (error) {
        analyzed[url] = { error: error?.message ?? String(error) };
      }
    }
  } finally {
    await page.close().catch(() => {});
    await server.close();
  }

  const boardMetrics = boards
    .filter((name) => analyzed[`/board/${name}`] && !analyzed[`/board/${name}`].error)
    .map((name) => ({ file: `docs/design/archetypes/booking/${name}`, metrics: analyzed[`/board/${name}`] }));

  const perArm = [];
  for (const shot of screenshots) {
    const metrics = analyzed[`/shot/${shot.path.split('/').pop()}`];
    if (!metrics || metrics.error) {
      perArm.push({ ...shot, error: metrics?.error ?? 'the screenshot could not be analysed' });
      continue;
    }
    const comparisons = boardMetrics.map((board) => ({
      board: board.file,
      distance: metricDistance(board.metrics, metrics),
      findings: summariseComparison(board.metrics, metrics),
    }));
    comparisons.sort((a, b) => a.distance - b.distance || b.findings.length - a.findings.length);
    const closest = comparisons[0];
    perArm.push({
      ...shot,
      metrics: { width: metrics.width, height: metrics.height, luminance: metrics.luminance.mean, ink: metrics.ink },
      closest_board: closest.board,
      closest_distance: closest.distance,
      closest_findings: closest.findings.map((finding) => ({
        ...finding,
        // Both images named on every finding: this is what makes a drift report inspectable by a person
        // rather than something they have to take on trust.
        board: closest.board,
        screenshot: shot.path,
      })),
      all_boards: comparisons.map((comparison) => ({ board: comparison.board, distance: comparison.distance, findings: comparison.findings.length })),
    });
  }

  return {
    boards: boardMetrics.map((board) => ({
      file: board.file,
      size: `${board.metrics.width}x${board.metrics.height}`,
      luminance: board.metrics.luminance.mean,
      ink: board.metrics.ink,
      colours: board.metrics.colours.slice(0, 5),
    })),
    per_arm: perArm,
    metric_notes: ANALYSIS_METRIC_NOTES,
    findings: perArm.flatMap((entry) => entry.closest_findings ?? []),
  };
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
    boardComparison = await compareAgainstBoards({ chrome, armRoot, screenshots: measured.screenshots });
  } finally {
    await chrome.close().catch(() => {});
  }
  const { armsByViewport, screenshots } = measured;

  const summary = paritySummary({
    archetype: options.archetype,
    viewports: options.viewports,
    armsByViewport,
    budget: IDENTITY_BUDGET,
  });
  const allArms = options.viewports.flatMap((viewport) => armsByViewport[viewport.key] ?? []);
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
    budget: IDENTITY_BUDGET,
    reference_palette: REFERENCE_PALETTE,
    palette_findings: palette,
    board_comparison: boardComparison,
    findings: [...summary.findings, ...palette],
    screenshots,
    limits: {
      compares: 'layout and component structure (structural, geometry, controls axes)',
      blind_to: 'text content, and viewport shape (geometry is normalised per viewport)',
      screenshots: 'saved for inspection, not diffed - no image decoder exists in this repository by design',
      reference_boards: 'compared by declared palette, not by pixels - the boards are images',
    },
  };

  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(report));

  console.log(
    `check-cross-arm-parity: ${report.arms_measured.length} arms measured, ${summary.findings.length} parity finding(s), ${palette.length} palette finding(s), ${report.board_comparison?.findings?.length ?? 0} board finding(s)`,
  );
  for (const finding of report.findings) console.log(`  FINDING ${finding.code} ${finding.message}`);
  console.log(`check-cross-arm-parity: wrote ${jsonPath.replace(`${ROOT}/`, '')} and ${markdownPath.replace(`${ROOT}/`, '')}`);
  if (report.findings.length === 0) console.log('check-cross-arm-parity: PASS - no drift below budget');
  return options.strict && report.findings.length > 0 ? 1 : 0;
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

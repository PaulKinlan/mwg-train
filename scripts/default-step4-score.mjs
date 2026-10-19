#!/usr/bin/env node
/** Private Step 4 functional pilot. Browser/server are bounded and never execute outside containment. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { startServer, driveJourney, driveValidationFailure, driveSearchJourney, driveUpdateJourney } from '../src/corpus/harness.mjs';
import { requireCorpusSandbox } from '../src/corpus/sandbox.mjs';
import { RULES } from '../src/corpus/rules.mjs';
import { assertPrivateArchiveRoot } from '../src/eval/default-cordon.mjs';
import { prepareDefaultStep4, step4RatificationRow, assertStep4Ratification } from '../src/eval/default-step4-preflight.mjs';
import { journeyComponentVerdicts, requiredRuleVerdicts, headroom } from '../src/eval/default-step4-verdict.mjs';
import { step4InstrumentDigest } from '../src/eval/step4-instrument.mjs';
import { availablePort, verifyArchiveFamily } from './default-step4-smoke.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function scoreDefaultFamily({ family, archiveRoot, evidenceRoot }) {
  if (process.platform !== 'linux' || process.env.MWG_ALLOW_UNSANDBOXED_CHROME === '1')
    throw Error('CHROME_UNCONTAINED: refuse non-default browser containment');
  const ratificationRow = step4RatificationRow(readFileSync(join(root, 'docs/eval/PREREGISTRATION.md'), 'utf8'));
  assertStep4Ratification(ratificationRow);
  const tranche = JSON.parse(readFileSync(join(root, 'docs/eval/default-set-hono-tranche-2026-10-19.json'), 'utf8'));
  const briefs = readFileSync(join(root, 'docs/train/briefs/manifest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const prepared = prepareDefaultStep4({ tranche, briefs, ratificationRow });
  const selected = prepared.families.find((row) => row.family === family);
  if (!selected || selected.eligibility !== 'ELIGIBLE') throw Error('GENERATION_QUARANTINE: no runnable default for family');
  const archived = tranche.run_records.find((row) => row.family === family);
  const source = verifyArchiveFamily({ archiveRoot, row: archived });
  requireCorpusSandbox();
  const instrumentSha256 = step4InstrumentDigest(root);
  const evidence = assertPrivateArchiveRoot(evidenceRoot, { sourceRoot: resolve(archiveRoot) });
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const destination = join(evidence, `${family}-${archived.request_id}`);
  mkdirSync(destination, { mode: 0o700 }); // A retry is not an invisible overwrite.
  const attempts = {};
  let chrome, server, page;
  try {
    const port = await availablePort();
    server = await startServer(source.project, { port });
    if (server.mechanism !== 'bubblewrap') throw Error('SANDBOX_UNAVAILABLE: generated server has no bubblewrap receipt');
    chrome = await launchChrome();
    page = await chrome.newPage({ viewport: { width: 1376, height: 768 } });
    const base = `http://127.0.0.1:${port}`;
    const { journey, echoedField, primaryField } = selected.adapter;
    const capture = async (name, drive) => {
      try { const value = await drive(); attempts[name] = { status: 'OBSERVED', value }; return value; }
      catch (error) { attempts[name] = { status: 'NOT_CHECKABLE', detail: String(error.message) }; return null; }
    };
    const persistence = await capture('server-persistence', async () => {
      const driven = await driveJourney(page, base, journey);
      // Fetch from the evaluator host, not generated client JS: page-local storage or fetch monkeypatches
      // cannot masquerade as a persisted server record. Cookies preserve authenticated profile reads.
      const cookies = await page.cookies();
      const response = await fetch(`${base}/api/records`, { headers: {
        Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
      }, signal: AbortSignal.timeout(5000) });
      let rows = null;
      try {
        const body = JSON.parse(await response.text());
        rows = Array.isArray(body) ? body : Array.isArray(body?.records) ? body.records : null;
      } catch { /* An unparseable API cannot prove server persistence. */ }
      driven.serverWitness = { status: response.status, shape: rows ? 'records' : 'unknown',
        expectedRecordPresent: rows?.some((record) => record?.[echoedField] === journey.expectText) ?? false };
      return driven;
    });
    const validation = await capture('empty-form-validation', () => driveValidationFailure(page, base, journey));
    // A same-record update precedes search, whose matching and decoy seeds intentionally create more rows.
    const update = journey.update && persistence ? await capture('update-existing', () => driveUpdateJourney(page, base, journey, journey.update, {
      recordUrl: persistence.afterSubmit, interfaceContract: { records: '/api/records', record: '/api/record/{ref}', current: '/api/me' },
    })) : null;
    const search = journey.search ? await capture('search', () => driveSearchJourney(page, base, journey, journey.search, { seedField: echoedField })) : null;
    const requiredChecks = [];
    const diagnosticChecks = [];
    const ruleContext = {
      primaryField, base, startPath: journey.startPath,
      usernameField: Object.keys(journey.fill).find((selector) => /\[name=['"]?email['"]?\]/.test(selector)),
      passwordField: Object.keys(journey.fill).find((selector) => /\[name=['"]?password['"]?\]/.test(selector)),
    };
    const observedRuleIds = new Set([...selected.required_rules, ...selected.applicable_diagnostics]
      .filter((entry) => entry.checkability === 'CHECKABLE').map((entry) => entry.rule_id));
    for (const id of observedRuleIds) {
      const observation = await capture(`rule:${id}`, async () => {
        await page.goto(`${base}${journey.startPath}`);
        return RULES[id].check(page, ruleContext);
      });
      if (observation) (selected.required_rules.some((rule) => rule.rule_id === id) ? requiredChecks : diagnosticChecks).push(observation);
    }
    const journeyParts = journeyComponentVerdicts({ journey, persistence, validation, search, update });
    const rules = requiredRuleVerdicts(selected.required_rules, requiredChecks);
    const diagnostics = requiredRuleVerdicts(selected.applicable_diagnostics, [...requiredChecks, ...diagnosticChecks]);
    const ceiling = headroom(journeyParts, rules);
    if (step4InstrumentDigest(root) !== instrumentSha256) throw Error('INSTRUMENT_MUTATED_DURING_RUN');
    const receipt = { kind: 'step4-functional-pilot', family, project_id: archived.project_id, request_id: archived.request_id,
      ratification_row_sha256: sha256(ratificationRow), archive_manifest_sha256: source.archive_manifest_sha256,
      brief_sha256: selected.brief_sha256, journey_sha256: selected.journey_sha256,
      instrument_sha256: instrumentSha256, excluded_from_training: true, sandbox: server.mechanism,
      journey_parts: journeyParts, required_rules: rules, applicable_diagnostics: diagnostics, headroom: ceiling,
      coverage_incomplete: ceiling.coverage_incomplete,
      attempts, visual_verdict: 'NOT_MEASURED', limitations: [
        'Two or more required-rule umbrellas have no exact checker; headroom is over checkable components only and incomplete coverage is not proof of full MWG conformance.',
        'Only the structured canonical brief journey and exact implemented rules were driven; prose login/authorization assertions remain NOT_CHECKABLE.',
        'The generated server ran in bubblewrap; client JavaScript ran in contained, egress-blocked Chrome.',
        'Local archive is read-only but not WORM/off-VM; served checkpoint and macOS sample remain unverified.',
      ] };
    verifyArchiveFamily({ archiveRoot, row: archived }); // Any changed byte invalidates the run.
    writeFileSync(join(destination, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { kind: receipt.kind, family, sandbox: receipt.sandbox, headroom: ceiling,
      coverage_incomplete: ceiling.coverage_incomplete,
      required_not_checkable: rules.filter((entry) => entry.status === 'NOT_CHECKABLE').length,
      diagnostic_checkable: diagnostics.filter((entry) => entry.status === 'PASS' || entry.status === 'FAIL').length,
      visual_verdict: receipt.visual_verdict };
  } catch (error) {
    writeFileSync(join(destination, 'error.json'), `${JSON.stringify({ family, status: 'UNEVALUABLE', reason: error.message, attempts }, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 });
    throw error;
  } finally {
    await page?.close().catch(() => {});
    await chrome?.close().catch(() => {});
    await server?.stop().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [family, archiveRoot, evidenceRoot] = process.argv.slice(2);
  if (!family || !archiveRoot || !evidenceRoot) throw Error('usage: default-step4-score.mjs <tr-NN> <private-archive-root> <private-evidence-root>');
  process.stdout.write(`${JSON.stringify(await scoreDefaultFamily({ family, archiveRoot, evidenceRoot }))}\n`);
}

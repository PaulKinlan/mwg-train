/**
 * Functional local-browser check for the survey capability (mwg-train-s0q).
 *
 * The acceptance bar is a driven journey, not a rendered page: answer the first questions in a browser,
 * see a question that depends on an earlier answer NOT be asked, change that earlier answer and see it
 * asked again, review the answers, go back and change one, submit, and read the derived outcome - and,
 * separately, drive the case that makes branching more than a routing trick: answer the questions an
 * English household is asked, then change the answer so those questions are hidden, and check the outcome
 * no longer reflects the answer that was hidden.
 *
 * Usage: node scripts/verify-survey.mjs   (SURVEY_ARM=vue to check another arm)
 * Evidence (screenshots + a JSON report) is written to /tmp/survey-shots.
 */
import { startGeneratedServer } from '../src/eval/generated-server.mjs';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { surveySpec } from './lib/survey-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.SURVEY_SHOTS ?? '/tmp/survey-shots';
const PORT = Number(process.env.SURVEY_PORT ?? 7931);
const ARM = process.env.SURVEY_ARM ?? 'raw';
mkdirSync(SHOTS, { recursive: true });

const checks = [];
function check(name, truth, detail) {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const LABEL = {
  applicant: 'Your name',
  residency: 'Where do you live?',
  course: 'How will you study?',
  household_income: 'Household income',
  notes: 'Anything else',
};
const textOf = (html, id) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1]?.trim();
const questionOn = (html) => Object.entries(LABEL).find(([, label]) => html.includes(label))?.[0] ?? null;

const spec = surveySpec();
const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: ARM });
const dir = mkdtempSync(join(tmpdir(), `survey-verify-${ARM}-`));
writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
const base = `http://127.0.0.1:${PORT}`;
const server = startGeneratedServer({
  projectDir: dir,
  port: PORT,
  dbPath: join(dir, 'verify.sqlite'),
  stdio: ['ignore', 'ignore', 'pipe'],
  // Not detached: this script kills the sandbox by pid, and the kernel tears the whole PID
  // namespace down with it, so nothing is left behind either way.
  detached: false,
});
let chrome;
try {
  let up = false;
  for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
    await sleep(250);
    up = await fetch(`${base}/__health`).then((response) => response.ok, () => false);
  }
  check('the generated server is ready', up, `${ARM} on ${base}`);
  chrome = await launchChrome({});
  const page = await chrome.newPage({ viewport: { width: 1280, height: 1000 } });

  // One question at a time, answered the way a visitor would: type or select, then submit the form.
  const answerQuestion = async (field, value) => {
    const html = await page.content();
    const on = questionOn(html);
    check(`the browser is on the ${field} question`, on === field, `saw ${on}`);
    if (field === 'residency' || field === 'course') {
      await page.selectOption('#answer', value);
    } else {
      await page.type('#answer', value);
    }
    const submitted = await page.submit('form[action="/survey/answer"]');
    check(`the answer form accepts ${field}`, submitted?.valid !== false, `valid=${submitted?.valid}`);
    return page.url();
  };

  await page.goto(`${base}/survey`);
  const first = await page.content();
  check('the survey asks its first question', questionOn(first) === 'applicant', textOf(first, 'survey-progress'));
  const firstShot = join(SHOTS, `survey-first-${ARM}.png`);
  await page.screenshot(firstShot);

  await answerQuestion('applicant', 'A household in Leeds');
  const secondUrl = await page.url();
  check('answering moves to the next question', secondUrl.endsWith('/survey'), secondUrl);
  await answerQuestion('residency', 'Scotland');

  // THE BRANCH: a household outside England is not asked about study or income at all.
  const skipped = await page.content();
  check('the branch skips the questions that depend on the answer', questionOn(skipped) === 'notes', `saw ${questionOn(skipped)}`);
  check('the study question was not asked', skipped.includes(LABEL.course) === false, 'no course question');
  check('the income question was not asked', skipped.includes(LABEL.household_income) === false, 'no income question');
  const skippedShot = join(SHOTS, `survey-branch-skipped-${ARM}.png`);
  await page.screenshot(skippedShot);

  await answerQuestion('notes', 'Nothing else to add');
  await page.goto(`${base}/survey/review`);
  const review = await page.content();
  check('the review lists the answers given', (review.match(/data-field="/g) ?? []).length === 3, `${(review.match(/data-field="/g) ?? []).length} answers`);
  check('the review names the questions it did not ask', /survey-skipped/.test(review) && /course/.test(review), 'skipped questions listed');
  check('each answer can be changed', /href="\/survey\?question=residency"/.test(review), 'change link present');
  const reviewShot = join(SHOTS, `survey-review-${ARM}.png`);
  await page.screenshot(reviewShot);

  // Going back to change an answer brings the conditional questions back into the flow.
  await page.goto(`${base}/survey?question=residency&from=review`);
  const changing = await page.content();
  check('changing an answer prefills what was answered', /<option value="Scotland" selected/.test(changing), 'Scotland preselected');
  await page.selectOption('#answer', 'England');
  await page.submit('form[action="/survey/answer"]');
  await page.goto(`${base}/survey`);
  check('the conditional question is asked again after the change', questionOn(await page.content()) === 'course', 'course is asked');

  await answerQuestion('course', 'Part-time');
  await answerQuestion('household_income', '20000');
  await page.goto(`${base}/survey/review`);
  const fullReview = await page.content();
  check('the review is complete once every asked question is answered', /survey-answers/.test(fullReview), 'review rendered');
  await page.submit('form[action="/survey/submit"]');
  const resultUrl = await page.url();
  check('submitting lands on a result', /\/survey\/result\/[^/]+$/.test(resultUrl), resultUrl);
  const result = await page.content();
  check('the outcome follows the answers', textOf(result, 'survey-outcome') === 'Eligible for the full grant', textOf(result, 'survey-outcome'));
  check('the result is readable by reference', textOf(result, 'survey-reference') === resultUrl.split('/').pop(), resultUrl.split('/').pop());
  const resultShot = join(SHOTS, `survey-result-${ARM}.png`);
  await page.screenshot(resultShot);

  // THE STALE ANSWER: answer as an English household, then change that answer so the questions it
  // answered are hidden, and check the outcome no longer reflects the hidden answer.
  await page.goto(`${base}/survey`);
  await answerQuestion('applicant', 'A household in Aberdeen');
  await answerQuestion('residency', 'England');
  await answerQuestion('course', 'Full-time');
  await answerQuestion('household_income', '20000');
  await page.goto(`${base}/survey?question=residency&from=review`);
  await page.selectOption('#answer', 'Scotland');
  await page.submit('form[action="/survey/answer"]');
  await page.goto(`${base}/survey`);
  const afterChange = await page.content();
  check('hiding the questions leaves only the unconditioned one', questionOn(afterChange) === 'notes', `saw ${questionOn(afterChange)}`);
  await answerQuestion('notes', 'Please call before 5pm');
  await page.goto(`${base}/survey/review`);
  const changedReview = await page.content();
  check('the hidden answer is off the review', changedReview.includes('20000') === false, 'income answer is gone');
  check('the review says income was not asked', /survey-skipped/.test(changedReview) && /household_income/.test(changedReview), 'income listed as not asked');
  const changedReviewShot = join(SHOTS, `survey-after-change-${ARM}.png`);
  await page.screenshot(changedReviewShot);
  await page.submit('form[action="/survey/submit"]');
  const changedResult = await page.content();
  check(
    'the outcome is derived only from the questions that were asked',
    textOf(changedResult, 'survey-outcome') === 'We cannot assess this application yet',
    textOf(changedResult, 'survey-outcome'),
  );
  const staleShot = join(SHOTS, `survey-stale-answer-${ARM}.png`);
  await page.screenshot(staleShot);

  writeFileSync(
    join(SHOTS, `report-${ARM}.json`),
    `${JSON.stringify({ arm: ARM, base, checks, shots: [firstShot, skippedShot, reviewShot, resultShot, changedReviewShot, staleShot] }, null, 2)}\n`,
  );
} catch (error) {
  check('the browser journey ran to completion', false, error.stack ?? String(error));
} finally {
  if (chrome) await chrome.close();
  server.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
}
const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed (evidence in ${SHOTS})`);
if (failed.length > 0) process.exitCode = 1;

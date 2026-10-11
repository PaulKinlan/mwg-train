/**
 * The survey/eligibility capability (mwg-train-s0q): branching questions, a review step, and an outcome
 * derived from the answers that were actually asked.
 *
 * Three halves, like the 37a/11d/4lk/le6 capability tests: the spec gate (a closed set that fails closed
 * and a condition rule that cannot be unsatisfiable or self-referential), the wiring guard (a block that
 * validates but is dropped never reaches the builder), and the functional half - all seven arms built,
 * started and driven over HTTP, including the two behaviours that make this a survey rather than a long
 * form: changing an earlier answer changes which questions are asked, and a hidden question's stale
 * answer does not reach the outcome.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { archetypeFromSpec, buildProjectFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { surveySpec } from '../scripts/lib/survey-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

/** The label text the question page shows, so an assertion can tell which question is on screen. */
const QUESTION_LABEL = {
  applicant: 'Your name',
  residency: 'Where do you live?',
  course: 'How will you study?',
  household_income: 'Household income',
  notes: 'Anything else',
};
const textOf = (html, id) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1]?.trim();

async function availablePort() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
    return socket.address().port;
  } finally {
    await new Promise((resolve) => socket.close(resolve));
  }
}

test('spec gate: the survey capability validates as a closed set, and a condition cannot be dead or circular', () => {
  assert.deepEqual(validateSpec(surveySpec()), [], 'a legitimate survey specification validates');
  // The set stays closed now that it has a sixth member.
  assert.ok(validateSpec(surveySpec({ capabilities: { form: true } })).some((p) => p.includes('unknown capability')));
  // On without a block, a block without the capability, and the sid cookie it shares with three others.
  const noBlock = surveySpec();
  delete noBlock.survey;
  assert.ok(validateSpec(noBlock).some((p) => p.includes('no survey block states the questions')));
  const blockWithoutCapability = surveySpec({ capabilities: { list_pages: true } });
  assert.ok(validateSpec(blockWithoutCapability).some((p) => p.includes('only meaningful with capabilities.survey')));
  assert.ok(validateSpec(surveySpec({ session: true })).some((p) => p.includes('cannot combine with session')));
  assert.ok(validateSpec(surveySpec({ capabilities: { survey: true, auth: true } })).some((p) => p.includes('cannot combine with auth')));
  assert.ok(validateSpec(surveySpec({ capabilities: { survey: true, cart: true } })).some((p) => p.includes('cannot combine with cart')));
  // Unknown keys and a question that is not a question.
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, mode: 'quiz' } })).some((p) => p.includes('survey.mode: unknown key')));
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: [] } })).some((p) => p.includes('at least one question')));
  const unknownQuestion = surveySpec().survey.questions.map((question) => ({ ...question }));
  unknownQuestion[1].field = 'postcode';
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: unknownQuestion } })).some((p) => p.includes('which this specification does not declare')));
  const twice = surveySpec().survey.questions.map((question) => ({ ...question }));
  twice[2].field = 'residency';
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: twice } })).some((p) => p.includes('asks residency twice')));
  // A condition that looks FORWARD, or at itself, could never be reached; a condition that no answer can
  // satisfy would leave the question dead. Both are refused at the gate rather than discovered later.
  const forward = surveySpec().survey.questions.map((question) => ({ ...question }));
  forward[1].when = { field: 'household_income', at_most: 25000 };
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: forward } })).some((p) => p.includes('only asks later')));
  const selfReferring = surveySpec().survey.questions.map((question) => ({ ...question }));
  selfReferring[2].when = { field: 'course', equals: 'Full-time' };
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: selfReferring } })).some((p) => p.includes('only asks later')));
  const impossible = surveySpec().survey.questions.map((question) => ({ ...question }));
  impossible[2].when = { field: 'residency', equals: 'France' };
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: impossible } })).some((p) => p.includes('not one of the options')));
  const twoOperators = surveySpec().survey.questions.map((question) => ({ ...question }));
  twoOperators[2].when = { field: 'residency', equals: 'England', at_least: 2 };
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: twoOperators } })).some((p) => p.includes('exactly one of equals')));
  const wrongComparison = surveySpec().survey.questions.map((question) => ({ ...question }));
  wrongComparison[2].when = { field: 'residency', at_most: 2 };
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, questions: wrongComparison } })).some((p) => p.includes('not a number field')));
  // The outcome bands: a fallback that is not last hides every band after it, and no fallback at all can
  // leave a visitor with no outcome.
  const fallbackFirst = [{ name: 'Always' }, ...surveySpec().survey.bands.slice(0, 2)];
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, bands: fallbackFirst } })).some((p) => p.includes('could never be reached')));
  const noFallback = surveySpec().survey.bands.slice(0, 2);
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, bands: noFallback } })).some((p) => p.includes('no outcome at all')));
  assert.ok(validateSpec(surveySpec({ survey: { ...surveySpec().survey, bands: [] } })).some((p) => p.includes('at least one outcome band')));
  // The capability's own routes are served before the declared ones, so declaring one is refused.
  const colliding = surveySpec({ routes: [...surveySpec().routes, { method: 'GET', path: '/survey', kind: 'page' }] });
  assert.ok(validateSpec(colliding).some((p) => p.includes("the survey capability's own route")));
});

test('wiring guard: the survey block reaches the builder archetype, and byte-invariance holds without it', () => {
  // The same trap that mwg-train-le6 found: `archetypeFromSpec` is an explicit list, so a block that is
  // not named there validates and is then silently dropped while the capability flag still arrives.
  const spec = surveySpec();
  assert.deepEqual(archetypeFromSpec(spec).survey, spec.survey);
  for (const frameworkName of ARMS) {
    const { files } = buildProjectFromSpec({ spec: specForFamily('booking', ROOT), frameworkName });
    assert.equal(
      /SURVEY|survey_answers|surveyAnswer|surveyOutcome/.test(files['server.mjs']),
      false,
      `${frameworkName} emitted survey code for a specification that did not opt in`,
    );
  }
});

test('functional: the branch decides which questions are asked, and the outcome follows the answers', async (t) => {
  const spec = surveySpec();
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `survey-${arm}-`));
      const port = await availablePort();
      const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
      writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
      symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
      const child = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'test.sqlite')], {
        cwd: dir,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);
        const post = (path, body, headers = {}) =>
          fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
            body: new URLSearchParams(body).toString(),
            redirect: 'manual',
          });
        // A visitor answers one question at a time; the flow hands out the cookies.
        let cookie = '';
        const answer = async (field, value, extra = {}) => {
          const response = await post('/survey/answer', { field, answer: value, ...extra }, cookie ? { cookie } : {});
          assert.equal(response.status, 303, `${arm} answering ${field} is accepted`);
          const set = (response.headers.get('set-cookie') ?? '').split(';')[0];
          if (set) cookie = set;
          return response;
        };
        const page = async (path) => (await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} })).text();
        const asked = async () => {
          const html = await page('/survey');
          return Object.entries(QUESTION_LABEL).find(([, label]) => html.includes(label))?.[0] ?? null;
        };

        // The survey starts at its first question, and it is a form the visitor can submit.
        const first = await page('/survey');
        assert.equal(asked ? await asked() : null, 'applicant', `${arm} asks the first question`);
        assert.match(first, /<form[^>]*action="\/survey\/answer"/, `${arm} the question posts to the survey`);

        await answer('applicant', 'A household in Leeds');
        assert.equal(await asked(), 'residency', `${arm} moves to the second question once the first is answered`);

        // A household outside England is never asked about study or income: this is the branch.
        await answer('residency', 'Scotland');
        const afterScotland = await asked();
        assert.equal(afterScotland, 'notes', `${arm} skipped both conditional questions`);
        const scotlandPage = await page('/survey');
        assert.equal(scotlandPage.includes(QUESTION_LABEL.course), false, `${arm} did not ask about study`);
        assert.equal(scotlandPage.includes(QUESTION_LABEL.household_income), false, `${arm} did not ask about income`);

        // The review says which questions were not asked, and offers a way back to change an answer.
        // It is only reachable once every ASKED question is answered - `notes` is asked on this path, so
        // the conditional questions being skipped does not make the survey shorter than it is.
        await answer('notes', 'Nothing else to add');
        const review = await page('/survey/review');
        assert.match(review, /id="survey-answers"/, `${arm} the review lists the answers`);
        assert.match(review, /data-field="applicant"/, `${arm} the review carries the answers given`);
        assert.match(review, /href="\/survey\?question=residency"/, `${arm} each answer can be changed`);
        assert.match(review, /id="survey-skipped"[^>]*>[^<]*course/i, `${arm} the review names the questions it skipped`);

        // Changing the answer to England brings the conditional questions back into the flow.
        await answer('residency', 'England', { from: 'review' });
        const reviewNow = await fetch(`${base}/survey/review`, { headers: { cookie }, redirect: 'manual' });
        assert.equal(reviewNow.status, 303, `${arm} the review is no longer complete`);
        assert.equal(await asked(), 'course', `${arm} the conditional question is asked again`);

        // An unanswered question cannot be submitted, and a question the survey does not ask is refused.
        const earlySubmit = await post('/survey/submit', {}, { cookie });
        assert.equal(earlySubmit.status, 422, `${arm} refuses to submit an incomplete survey`);
        const notAQuestion = await post('/survey/answer', { field: 'postcode', answer: 'AB1' }, { cookie });
        assert.equal(notAQuestion.status, 422, `${arm} refuses an answer to a question it does not ask`);
        const blank = await post('/survey/answer', { field: 'course', answer: '   ' }, { cookie });
        assert.equal(blank.status, 422, `${arm} refuses a blank answer`);

        await answer('course', 'Part-time');
        await answer('household_income', '20000');
        await answer('notes', 'Nothing else to add');
        const completeReview = await fetch(`${base}/survey/review`, { headers: { cookie }, redirect: 'manual' });
        assert.equal(completeReview.status, 200, `${arm} the review renders once every asked question is answered`);

        // Submit: the outcome is derived from the answers and recorded, and it can be read back later.
        const submitted = await post('/survey/submit', {}, { cookie });
        assert.equal(submitted.status, 303, `${arm} submitting redirects to the result`);
        const resultPath = submitted.headers.get('location') ?? '';
        assert.match(resultPath, /^\/survey\/result\/[^/]+$/, `${arm} the result has a reference`);
        for (const attempt of [1, 2]) {
          const result = await (await fetch(`${base}${resultPath}`)).text();
          assert.equal(textOf(result, 'survey-outcome'), 'Eligible for the full grant', `${arm} read ${attempt}: the outcome follows the answers`);
          assert.match(result, /<dt>household_income<\/dt><dd>20000<\/dd>/, `${arm} read ${attempt}: the recap carries the answers`);
          assert.equal(textOf(result, 'survey-reference'), resultPath.split('/').pop(), `${arm} read ${attempt}: the reference`);
        }
        const missing = await fetch(`${base}/survey/result/nope`);
        assert.equal(missing.status, 404, `${arm} an unknown result is a 404`);

        // THE STALE ANSWER: answer the conditional questions as an English household, then change the
        // answer they depended on. The income answer is now hidden, so it must not reach the outcome -
        // otherwise a household outside England would be told it had been assessed on income it was
        // never asked for.
        cookie = '';
        await answer('applicant', 'A household in Aberdeen');
        await answer('residency', 'England');
        await answer('course', 'Full-time');
        await answer('household_income', '20000');
        await answer('residency', 'Scotland', { from: 'review' });
        const afterChange = await fetch(`${base}/survey/review`, { headers: { cookie }, redirect: 'manual' });
        assert.equal(afterChange.status, 303, `${arm} a visible question is unanswered again`);
        await answer('notes', 'Please call before 5pm');
        const changedReview = await page('/survey/review');
        assert.equal(changedReview.includes('20000'), false, `${arm} the hidden answer is not in the review`);
        assert.match(changedReview, /id="survey-skipped"[^>]*>[^<]*household_income/i, `${arm} the review says income was not asked`);
        const changedSubmit = await post('/survey/submit', {}, { cookie });
        assert.equal(changedSubmit.status, 303, `${arm} the changed survey submits`);
        const changedResult = await (await fetch(`${base}${changedSubmit.headers.get('location')}`)).text();
        assert.equal(
          textOf(changedResult, 'survey-outcome'),
          'We cannot assess this application yet',
          `${arm} the outcome is derived only from the questions that were asked`,
        );

        // Another visitor is asked the first question again: answers belong to the visitor, not the server.
        assert.equal(await (await fetch(`${base}/survey`)).text().then((html) => html.includes(QUESTION_LABEL.applicant)), true, `${arm} a new visitor starts at the first question`);
      } finally {
        child.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('the survey capability is registered, not silently dead', () => {
  const frameworks = readFileSync(join(ROOT, 'pilot/frameworks.mjs'), 'utf8');
  assert.match(frameworks, /const capabilitiesOf = \(archetype\) => \(\{ list_pages: false, detail_page: false, auth: false, cart: false, pricing_tiers: false, checkout: false, survey: false/);
  const spec = readFileSync(join(ROOT, 'src/eval/spec.mjs'), 'utf8');
  assert.match(spec, /CAPABILITY_KEYS = new Set\(\['list_pages', 'detail_page', 'auth', 'cart', 'pricing_tiers', 'checkout', 'survey'\]\)/);
});

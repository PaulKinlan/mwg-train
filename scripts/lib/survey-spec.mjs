/**
 * The survey specification used by both the capability's test suite and its browser check, so the two
 * cannot drift: `test/survey-capability.test.mjs` proves the spec gate and the seven arms over HTTP, and
 * `scripts/verify-survey.mjs` drives the same project in a real browser (mwg-train-s0q).
 *
 * The scenario is an eligibility check, and it is deliberately shaped so that the branch MATTERS: a
 * household outside England is never asked how much it earns, so the income question's answer can be
 * stale or absent, and the outcome has to say so rather than pretend it assessed something it never
 * asked. The vocabulary is the corpus's own - `tr-23` is an energy-grant calculator with selects feeding
 * a derived report re-read at `/reports/:id`.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export function surveySpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'eligibility-survey',
    title: 'Grant eligibility check',
    story: 'A household checks whether it can apply for a home energy grant before filling in the full form.',
    routes: [
      { method: 'GET', path: '/', kind: 'page', effect: 'explain the grant and link to the check' },
      { method: 'POST', path: '/applications', kind: 'write', redirect: '/applications/:ref', effect: 'record an application' },
      { method: 'GET', path: '/applications/:ref', kind: 'read-by-reference', effect: 'render one application' },
    ],
    echo: { field: 'applicant', container: '#application-echo', route: 'read-by-reference' },
    session: false,
    capabilities: { survey: true },
    journey: {
      startPath: '/',
      formSelector: 'form#grant-form',
      fill: { 'input[name=applicant]': 'A household in Leeds' },
      expectText: 'A household in Leeds',
    },
    fields: [
      { name: 'applicant', slug: 'applicant', type: 'text', label: 'Your name', required: true },
      {
        name: 'residency',
        slug: 'residency',
        type: 'select',
        label: 'Where do you live?',
        required: true,
        options: ['England', 'Scotland', 'Wales', 'Elsewhere'],
      },
      {
        name: 'course',
        slug: 'course',
        type: 'select',
        label: 'How will you study?',
        required: true,
        options: ['Full-time', 'Part-time'],
      },
      { name: 'household_income', slug: 'household_income', type: 'number', label: 'Household income', required: true },
      // `required` is stated rather than implied: the schema refuses an absent one.
      { name: 'notes', slug: 'notes', type: 'textarea', label: 'Anything else', required: false, optional: true },
    ],
    survey: {
      title: 'Check whether you can apply',
      questions: [
        { field: 'applicant' },
        { field: 'residency' },
        // The two conditional questions come after the answer they depend on, which is the only order a
        // survey can ask them in.
        { field: 'course', when: { field: 'residency', equals: 'England' } },
        { field: 'household_income', when: { field: 'residency', equals: 'England' } },
        { field: 'notes' },
      ],
      bands: [
        { name: 'Eligible for the full grant', when: { field: 'household_income', at_most: 25000 } },
        { name: 'Eligible for the partial grant', when: { field: 'household_income', at_least: 25001 } },
        // The fallback is what a household outside England reaches: it was never asked about income, so
        // the survey cannot claim to have assessed it.
        { name: 'We cannot assess this application yet' },
      ],
    },
    state: {
      ...base.state,
      tables: [
        ...base.state.tables,
        {
          name: 'survey_answers',
          purpose: "one row per ANSWER the visitor has given, keyed by the visitor's sid and the question",
          columns: [
            { name: 'sid', type: 'TEXT', constraints: 'NOT NULL' },
            { name: 'name', type: 'TEXT', constraints: 'NOT NULL' },
            { name: 'value', type: 'TEXT', constraints: 'NOT NULL' },
          ],
        },
      ],
    },
    persistence: {
      ...base.persistence,
      write_route: '/survey/submit',
      read_route: '/survey/result/:ref',
      reference: 'server-issued reference, returned in the Location header of a 303',
      reload_assertion: 'reloading /survey/result/<ref> shows the same outcome and the same answers',
    },
    validation: {
      ...base.validation,
      // A select is exempt from the server's required set; the survey asks every one of its questions
      // anyway, and refuses to move on without an answer.
      required_fields: ['applicant', 'household_income'],
    },
    acceptance: [
      'a question that depends on an earlier answer is asked only when that answer is given',
      'changing the earlier answer changes which questions are asked',
      'the review lists the answers with a way back to change any one of them',
      'the outcome is derived from the answers that were actually asked, and recorded',
      'a hidden question\u2019s earlier answer does not reach the outcome',
    ],
    ...overrides,
  };
}

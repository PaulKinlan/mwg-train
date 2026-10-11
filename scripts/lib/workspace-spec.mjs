/**
 * The workspace specification used by both the capability's test suite and its browser check, so the two
 * cannot drift: `test/workspace-capability.test.mjs` proves the spec gate, the seven arms and the
 * permission boundary over HTTP, and `scripts/verify-workspace.mjs` drives the same people through it in a
 * real browser (mwg-train-ksn).
 *
 * Two credentials, declared here so the tests are an independent statement of the acceptance bar rather
 * than a reading of the page: an owner who creates the workspace, and a colleague who is invited and can
 * read it but not administer it.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export const OWNER = { email: 'owner@example.test', password: 'correct horse battery' };
export const MEMBER = { email: 'member@example.test', password: 'another good passphrase' };
export const USE_CASE = 'Release planning';
export const PLAN = 'Business';
export const SETTING = { first: 'Invited people only', second: 'Anyone with the link' };

export function workspaceSpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'workspace',
    title: 'Acme tools',
    story: 'A company creates a workspace, invites a colleague, and one setting is the owner’s alone.',
    capabilities: { auth: true, workspace: true },
    workspace: {
      name: 'Acme tools',
      use_cases: ['Design reviews', USE_CASE],
      plans: ['Team', PLAN],
      setting: { label: 'Who can join', options: [SETTING.first, SETTING.second] },
    },
    ...overrides,
  };
}

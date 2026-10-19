import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { familyInterfaceContract } from '../src/eval/family-interface.mjs';
import { generateProject } from '../src/eval/generator.mjs';
import { interfaceContractText, interfaceContractSha256 } from '../src/eval/interface-contract.mjs';
import pins from '../docs/eval/family-interface-v1.hashes.json' with { type: 'json' };

const root = fileURLToPath(new URL('..', import.meta.url));
const revision = '2cba9e42aa026125f3ed06c6d98c1db82f7ca027';
const planOf = (family) => readFileSync(join(root, 'docs/train/design', family, 'plan.md'), 'utf8');

test('every family has its own pinned, plan-derived Option A interface, without cross-domain routes', () => {
  assert.equal(Object.keys(pins.sha256).length, 38);
  assert.equal(interfaceContractSha256, '0faed7563e5e0b6df307f714b4e526fcd38ef719a4933d19d3f7ae5f967286e9');
  assert.match(interfaceContractText, /POST \/book/); // paid tr-01 stays byte-for-byte pinned
  for (let i = 2; i <= 39; i++) {
    const family = `tr-${String(i).padStart(2, '0')}`;
    const { text, sha256 } = familyInterfaceContract(family, planOf(family));
    assert.equal(sha256, pins.sha256[family], family);
    assert.match(text, new RegExp(`^BEGIN ${family.toUpperCase()} EVALUATOR INTERFACE V1`));
    assert.doesNotMatch(text, /POST \/book(?:\s|$)|Ada Lovelace|VeloFix/, family);
  }
  const cider = familyInterfaceContract('tr-02', planOf('tr-02')).text;
  assert.match(cider, /\/checkout/);
  assert.match(cider, /\/orders\/:id/);
  assert.match(cider, /`variety`/);
  assert.match(cider, /`collection`/);
  assert.match(cider, /6 bottles Kingston Black Reserve/);
  const cleanup = familyInterfaceContract('tr-30', planOf('tr-30')).text;
  assert.match(cleanup, /\/cleanups\/:id\/register/);
  assert.match(cleanup, /\/passes\/:id/);
  assert.match(cleanup, /`volunteer`/);
  const credit = familyInterfaceContract('tr-04', planOf('tr-04')).text;
  assert.match(credit, /:\s?account.*stable create-time reference, NOT the mutable `account` field value/);
  assert.match(credit, /do not re-key the route or the \/api\/record\/\{ref\} lookup/);
  const profile = familyInterfaceContract('tr-05', planOf('tr-05')).text;
  assert.match(profile, /\/volunteer\/profile/);
  assert.match(profile, /never return plaintext or hash through the read-back page/);
  assert.match(profile, /named non-credential fields/);
  assert.doesNotMatch(profile, /No update flow is declared.*Update: edit/s);
});

test('plan extraction rejects ambiguous read-back and reworded update instead of weakening a pin', () => {
  assert.throws(() => familyInterfaceContract('tr-05', planOf('tr-05').replace(
    'redirects to /volunteer/profile', 'redirects to /not-a-declared-route')),
  /FAMILY_INTERFACE_INVALID/);
  assert.throws(() => familyInterfaceContract('tr-02', planOf('tr-02').replace(
    'And an update flow:', 'An update flow:')),
  /FAMILY_INTERFACE_INVALID/);
});

test('tr-02..tr-30 dry-runs pin each family contract across all arms without spending or writes', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-family-dryrun-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const outRoot = join(dir, 'never-created');
  for (let i = 2; i <= 30; i++) {
    const family = `tr-${String(i).padStart(2, '0')}`;
    const base = await generateProject({ family, framework: 'hono', revision,
      backend: 'live', dryRun: true, sourceRoot: root, outRoot });
    assert.equal(base.status, 'DRY_RUN', family);
    assert.equal(base.interface_contract_sha256, pins.sha256[family]);
    const suffix = base.prompt.slice(base.prompt.indexOf('Evaluator interface contract (identical for every arm):'));
    for (const arm of ['c1', 'c2', 'c3', 't']) {
      const result = await generateProject({ family, framework: 'hono', revision,
        arm, guidance: arm === 'c2' ? 'Only C2 guidance' : '', backend: 'live', dryRun: true, sourceRoot: root, outRoot });
      assert.equal(result.status, 'DRY_RUN');
      assert.equal(result.interface_contract_sha256, pins.sha256[family]);
      assert.equal(result.prompt.slice(result.prompt.indexOf('Evaluator interface contract (identical for every arm):')), suffix);
      assert.equal(result.prompt.includes('Only C2 guidance'), arm === 'c2');
    }
  }
  assert.equal(existsSync(outRoot), false);
});

test('unreviewed plan mutation fails the live pin before any provider call or output', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-family-offpin-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const familyDir = join(dir, 'docs/train/design/tr-02');
  mkdirSync(familyDir, { recursive: true });
  writeFileSync(join(familyDir, 'plan.md'), planOf('tr-02').replace('| `/checkout` | write route', '| `/surprise-checkout` | write route'));
  writeFileSync(join(familyDir, 'design.md'), readFileSync(join(root, 'docs/train/design/tr-02/design.md'), 'utf8'));
  let calls = 0;
  const outRoot = join(dir, 'never-created');
  const result = await generateProject({ family: 'tr-02', framework: 'hono', revision, backend: 'live',
    sourceRoot: dir, outRoot, apiKey: 'fake-key', fetchImpl: async () => { calls++; throw new Error('must not call'); } });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.error.code, 'UNRATIFIED_INTERFACE');
  assert.equal(calls, 0);
  assert.equal(existsSync(outRoot), false);
});

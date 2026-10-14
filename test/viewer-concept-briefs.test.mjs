import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { archetypeBrief, stepImagePrompt, trainingBrief, trainingBriefs } from '../src/viewer/concept-briefs.mjs';
import { listConcepts, renderConcepts } from '../src/viewer/concepts.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('all current prompt and state claims come from real authored sources', () => {
  const gallery = listConcepts(ROOT);
  assert.equal(gallery.patterns.length, 21);
  assert.equal(gallery.patterns.flatMap((pattern) => pattern.steps).filter((step) => step.available).length, 37);
  for (const pattern of gallery.patterns) {
    const { brief, steps } = pattern;
    assert.ok(brief?.sitePrompt.includes('Use case:'), `${pattern.id} has a complete source-backed site prompt`);
    assert.ok(brief.sitePrompt.includes('Layout and components:'));
    assert.ok(brief.sitePrompt.includes('Step-by-step behaviour:'));
    if (!steps.length) assert.ok(brief.fallbackImagePrompt, `${pattern.id} names its inherited, non-step training prompt`);
    for (const step of steps) {
      assert.ok(step.available && step.state && step.imagePrompt, `${pattern.id}/${step.id} has actual bytes, mapping and its own authored image prompt`);
      assert.ok(step.imagePrompt.length > 100);
    }
  }
  assert.equal(gallery.trainingTargets.length, 30, '12 target expansion families are not fabricated');
  for (const target of gallery.trainingTargets) {
    assert.ok(target.brief?.sitePrompt.includes('Required assertions:'));
    assert.ok(target.brief.imagePrompt?.length > 100);
  }
  assert.match(gallery.trainingTargets[0].brief.sitePrompt, /Palette values from the authored design:[\s\S]*#0f172a/,
    'the full site prompt includes exact UI tokens, not only their names');
  assert.doesNotMatch(gallery.trainingTargets[0].brief.sitePrompt, /no media queries|one fixed composition|browser chrome runs/i,
    'a functional site brief must not inherit instructions for the static conformance render');
  const html = renderConcepts(gallery);
  assert.equal((html.match(/class="concept-pattern-index"/g) ?? []).length, 1);
  assert.equal((html.match(/href="#pattern-[a-z-]+"/g) ?? []).length, 26, '21 index links plus 5 held-out cross-links');
  assert.equal((html.match(/Image Generation Prompt for this state/g) ?? []).length, 37);
  assert.equal((html.match(/<summary>Site Generation Prompt/g) ?? []).length, 51);
  assert.doesNotMatch(html, /<script[^>]*>/, 'reading prompts requires no client JS');
});

test('site prompts omit wrapped reference-viewport framing while retaining site layout instructions', () => {
  const gallery = listConcepts(ROOT);
  const prompts = [...gallery.patterns.map((pattern) => pattern.brief.sitePrompt),
    ...gallery.trainingTargets.map((target) => target.brief.sitePrompt)];
  assert.equal(prompts.length, 51);
  for (const prompt of prompts) {
    assert.doesNotMatch(prompt, /browser viewports?|browser chrome runs|conformance viewport/i);
  }
  for (const id of ['dashboard', 'support-helpdesk']) {
    const prompt = gallery.patterns.find((pattern) => pattern.id === id).brief.sitePrompt;
    assert.doesNotMatch(prompt, /a single tab and an address bar|visible in both rasters|depict a tab, a URL/i,
      `${id} must not retain continuation lines from a reference-frame bullet`);
    assert.match(prompt, /Page structure top to bottom|Step 2 and step 3 are where the multi-step flow earns its name/,
      `${id} retains the next real site-layout bullet`);
  }
  assert.match(gallery.trainingTargets.find((target) => target.id === 'tr-04').brief.sitePrompt, /summary region/i);
});

test('training site prompts use family palette and identity, not the archetype target colours', () => {
  const gallery = listConcepts(ROOT);
  const tr17 = gallery.trainingTargets.find((target) => target.id === 'tr-17').brief.sitePrompt;
  assert.match(tr17, /Family visual direction and tokens:[\s\S]*Valley & Moor Livestock Veterinary[\s\S]*light palette/);
  assert.match(tr17, /--vm-bg: "#f8fafc"/);
  assert.match(tr17, /booking workbench[\s\S]*two-column grid/, 'the functional archetype layout must remain available');
  assert.doesNotMatch(tr17, /ground is deep slate|accent is emerald|#10b981/i,
    'the Evening Class Studio visual thesis and token table cannot override tr-17 light family palette');
  assert.doesNotMatch(tr17, /The board's job is to be a target|student model's output is measured/i,
    'static conformance-board goals are not site-building requirements');
  for (const target of gallery.trainingTargets) {
    const familyDesign = readFileSync(join(ROOT, `docs/train/design/${target.id}/design.md`), 'utf8');
    const identity = familyDesign.match(/^# `tr-\d{2}` target design — (.+?) — /m)?.[1];
    assert.ok(identity, `${target.id} design declares a family identity`);
    const visualDirection = target.brief.sitePrompt.split('Family visual direction and tokens:')[1]
      ?.split('Palette values from the authored design:')[0] ?? '';
    assert.ok(visualDirection.includes(identity), `${target.id} retains its authored family identity before the palette`);
    assert.match(target.brief.sitePrompt, /Palette values from the authored design:/,
      `${target.id} has an exact family palette`);
    assert.doesNotMatch(target.brief.sitePrompt, /\| Token \| Light \| Dark \|/,
      `${target.id} must not inherit an unrelated archetype colour table`);
  }
});

test('training site prompts keep functional components without inheriting demo-only files or verification controls', () => {
  const targets = listConcepts(ROOT).trainingTargets;
  assert.equal(targets.length, 30);
  for (const target of targets) {
    assert.doesNotMatch(target.brief.sitePrompt, /Read from\s+demo\/|\bdemo\/[a-z0-9-]+\.html|demo state switcher|Demo State Switcher|#btn-state-(?:default|error|fill)/i,
      `${target.id} must not cite a demo file or ship its verification switcher`);
  }
  const componentsOf = (target) => target.brief.sitePrompt.match(/Expected components:\n([\s\S]*?)(?=\nStep-by-step interactions:)/)?.[1] ?? '';
  const bookingFamilies = targets.filter((target) => /^Build a functional booking website/.test(target.brief.sitePrompt));
  assert.equal(bookingFamilies.length, 7);
  for (const target of bookingFamilies) {
    const components = componentsOf(target);
    assert.match(components, /persistent header[\s\S]*progress stepper[\s\S]*labelled summary region[\s\S]*form card[\s\S]*confirmation ticket/,
      `${target.id} retains the structural booking components`);
    assert.doesNotMatch(components, /Evening Class Summary|1\. Select Class|Details & Registration|\binstructor\b|Full name|Delivery address|Postcode|#form-heading|#form-error-banner/i,
      `${target.id} must use its own journey and field labels, never the Evening Class demo values`);
  }
  const tr17 = targets.find((target) => target.id === 'tr-17').brief.sitePrompt;
  assert.match(tr17, /select\[name=species\][\s\S]*form#visit-booking-form/,
    'the veterinary family plan still supplies its own functional field and form selectors');
  assert.doesNotMatch(tr17, /the student|Evening Class Summary|1\. Select Class/,
    'a farm visit site must not inherit a class-booking audience or step labels');
  for (const id of ['tr-02', 'tr-18', 'tr-26']) {
    const components = componentsOf(targets.find((target) => target.id === id));
    assert.doesNotMatch(components, /^Read from\b/m, `${id} must not point at an internal archetype document`);
    assert.match(components, /product grid[\s\S]*cart drawer or page[\s\S]*receipt page/i,
      `${id} retains real storefront components after removing the internal pointer`);
  }
  const tr07 = targets.find((target) => target.id === 'tr-07').brief.sitePrompt;
  assert.match(tr07, /Expected components:[\s\S]*event hero/i,
    'wrapped event-registration demo path removal must leave its real event components intact');
});

test('early inline and later fenced image prompts are returned intact, never inferred from filenames', () => {
  const early = readFileSync(join(ROOT, 'docs/design/archetypes/booking/README.md'), 'utf8');
  const late = readFileSync(join(ROOT, 'docs/design/archetypes/community-forum/README.md'), 'utf8');
  assert.match(stepImagePrompt(early, 'step1-browse.jpg'), /Evening Class Studio/);
  assert.match(stepImagePrompt(late, 'step3-refusal.jpg'), /Your note was not posted/);
  assert.equal(stepImagePrompt(late, 'step99-private.jpg'), null);
  assert.equal(stepImagePrompt(late, '../private.jpg'), null);
});

test('unavailable or symlinked prompt inputs fail closed and injected text stays escaped', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'concept-prompts-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const dir = join(repo, 'docs/design/archetypes/booking');
  mkdirSync(dir, { recursive: true });
  const plan = '## Use case\nA <script>alert(1)</script> shop.\n## Journey\n1. Browse.\n## Acceptance criteria\n- Saved records reload.\n';
  const design = '## Visual thesis\nA calm page.\n## Grammar and layout\nA labelled form.\n## Token usage\nUse one accent.\n## Component hierarchy\nHeader, form, confirmation.\n';
  writeFileSync(join(dir, 'plan.md'), plan);
  writeFileSync(join(dir, 'design.md'), design);
  const brief = archetypeBrief(repo, 'booking');
  assert.match(brief.sitePrompt, /A <script>alert\(1\)<\/script> shop/);
  assert.match(brief.sitePrompt, /Saved records reload/);
  const rendered = renderConcepts({ patterns: [{ id: 'booking', brief, steps: [] }] });
  assert.doesNotMatch(rendered, /<script>alert\(1\)<\/script>/);
  assert.match(rendered, /A &lt;script&gt;alert\(1\)&lt;\/script&gt; shop/);
  assert.equal(archetypeBrief(repo, '../private'), null);
  rmSync(join(dir, 'plan.md'));
  const outside = join(repo, 'outside-plan.md');
  writeFileSync(outside, plan);
  symlinkSync(outside, join(dir, 'plan.md'));
  assert.equal(archetypeBrief(repo, 'booking'), null, 'a symlink does not become a site prompt');
});

test('training prompts require an exact v1 declaration and reject malformed or uncommitted briefs', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'training-prompt-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const dir = join(repo, 'docs/train/briefs');
  mkdirSync(dir, { recursive: true });
  const row = { family_id: 'tr-01', brief_id: 'tr-01-v1', archetype: 'booking', prompt: 'A real test scenario.', assertions: ['A record persists.'] };
  writeFileSync(join(dir, 'manifest.jsonl'), [JSON.stringify({ ...row, brief_id: 'tr-01-v2' }), JSON.stringify(row), '{ malformed'].join('\n'));
  const declared = trainingBriefs(repo);
  assert.deepEqual([...declared.keys()], ['tr-01']);
  assert.match(trainingBrief(repo, 'tr-01', declared.get('tr-01')).sitePrompt, /A real test scenario/);
  assert.equal(trainingBrief(repo, 'tr-02', declared.get('tr-01')), null);
  rmSync(dir, { recursive: true });
  symlinkSync(join(repo, 'outside'), dir);
  assert.equal(trainingBriefs(repo).size, 0, 'symlinked brief directories cannot supply a prompt');
});

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
  assert.equal(gallery.patterns.length, 27);
  assert.equal(gallery.patterns.flatMap((pattern) => pattern.steps).filter((step) => step.available).length, 85);
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
  assert.equal(gallery.trainingTargets.length, 39, '3 remaining target expansion families are not fabricated');
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
  assert.equal((html.match(/href="#pattern-[a-z-]+"/g) ?? []).length, 32, '27 index links plus 5 held-out cross-links');
  assert.equal((html.match(/Image Generation Prompt for this state/g) ?? []).length, 85);
  assert.equal((html.match(/<summary>Site Generation Prompt/g) ?? []).length, 66);
  assert.doesNotMatch(html, /<script[^>]*>/, 'reading prompts requires no client JS');
});

test('event-registration pattern prompt describes a functional event site without demo CSS or form IDs', () => {
  const gallery = listConcepts(ROOT);
  const pattern = gallery.patterns.find((item) => item.id === 'event-registration');
  assert.ok(pattern?.brief?.sitePrompt);
  const prompt = pattern.brief.sitePrompt;
  assert.doesNotMatch(prompt, /see the first anti-pattern below/i,
    'the pattern brief cannot point below to an Anti-patterns section it does not project');
  assert.match(prompt, /sixteen hex colours are written outside :root/i,
    'dropping the dangling reference must keep its inline colour-system observation');
  assert.doesNotMatch(prompt, /\.(?:ticket-grid|ticket-row|event-hero|event-pass|capacity-note|pass-status|capacity-dot)\b|#registration-form\b/i,
    'no demo stylesheet selectors or fixed demo form ID should become build instructions');
  assert.doesNotMatch(prompt, /(?:^|\n)Read from demo\/|demo\/compare\.html|the two training boards each declare|tr-07 puts|tr-30 puts/i,
    'a site brief does not need demo-file or unrelated family-board observations');
  assert.match(prompt, /Layout and components:[\s\S]*Tickets are a two-column grid[\s\S]*registration form[\s\S]*confirmation/i,
    'retain responsive ticket layout, labelled registration and a confirmation view');
  const design = readFileSync(join(ROOT, 'docs/design/archetypes/event-registration/design.md'), 'utf8');
  const authoredTokens = [...design.matchAll(/^\| `(--[a-z-]+)` \| `(#[0-9a-f]{6})` \|/gmi)];
  assert.equal(authoredTokens.length, 10, 'the authored pattern palette declares ten source-backed colour tokens');
  const tokenSection = prompt.split('Visual tokens:\n')[1]?.split('\n\nStep-by-step behaviour:')[0] ?? '';
  for (const [, name, value] of authoredTokens) assert.ok(tokenSection.includes(`- ${name}: ${value}`),
    `${name} retains its exact authored value without demo selector counts`);
  for (const id of ['tr-07', 'tr-30']) {
    const family = gallery.trainingTargets.find((item) => item.id === id);
    assert.ok(family?.brief?.sitePrompt.includes('Build a functional event registration website'));
    assert.match(family.brief.sitePrompt, /UI layout:[\s\S]*#(?:observatory-registration-form|registration-form)\b/i,
      `${id} keeps its plan-owned form ID in the training brief`);
  }
});

test('event families inherit structural layout but not the archetype demo cap or undeclared estimate', () => {
  const gallery = listConcepts(ROOT);
  const pattern = gallery.patterns.find((item) => item.id === 'event-registration').brief.sitePrompt;
  assert.match(pattern, /Layout and components:[\s\S]*capped at 52rem[\s\S]*live estimate/i,
    'the pattern remains an account of its authored archetype');
  for (const id of ['tr-07', 'tr-30']) {
    const family = gallery.trainingTargets.find((item) => item.id === id).brief.sitePrompt;
    const layout = family.match(/UI layout:\n([\s\S]*?)(?=\n\nFamily visual direction and tokens:)/)?.[1] ?? '';
    assert.doesNotMatch(layout, /\bcapped at \d+(?:\.\d+)?rem\b|\blive estimate\b|\b52rem\b|\bticket rows\b|\bquantity controls\b|\battendee\b/i,
      `${id} does not inherit demo dimensions or undeclared ticket/attendee/estimate controls`);
    assert.match(layout, /responsive selection region[\s\S]*only choices and controls the site’s journey declares/i,
      `${id} gets responsive structure but defers control types to its journey`);
    assert.match(layout, /a pass or QR only when the site’s journey defines one/i,
      `${id} must not infer issued credentials from an archetype illustration`);
    const plan = readFileSync(join(ROOT, 'docs/train/design', id, 'plan.md'), 'utf8');
    const design = readFileSync(join(ROOT, 'docs/train/design', id, 'design.md'), 'utf8');
    assert.doesNotMatch(plan + design, /\b(?:estimate|charge|price|cost|paid)\b/i,
      `${id} authors no price or live-estimate requirement`);
  }
});

test('event pattern and training layouts read one authored functional source as design facts change', () => {
  const sourceFile = join(ROOT, 'docs/design/archetypes/event-registration/design.md');
  const design = readFileSync(sourceFile, 'utf8');
  const source = design.match(/^### Functional site projection\n([\s\S]*?)(?=^## )/m)?.[1]?.trim();
  assert.ok(source?.includes('52rem') && source.includes('two-column grid'),
    'the design document declares the shared functional layout instead of code duplicating it');
  const rawGrammar = design.match(/^## Grammar and layout\n([\s\S]*?)(?=^### Functional site projection)/m)?.[1] ?? '';
  const measuredCap = rawGrammar.match(/width: min\(100% - 2rem, (\d+rem)\)/)?.[1];
  assert.ok(measuredCap && source.includes(`capped at \`${measuredCap}\``),
    'the functional cap must agree with the same design document’s measured shell');
  const pattern = archetypeBrief(ROOT, 'event-registration').sitePrompt;
  const training = listConcepts(ROOT).trainingTargets.find((target) => target.id === 'tr-07').brief.sitePrompt;
  assert.match(pattern, /Layout and components:[\s\S]*52rem[\s\S]*two-column grid/i);
  const trainingLayout = training.split('UI layout:\n')[1]?.split('Family visual direction and tokens:')[0] ?? '';
  assert.match(trainingLayout, /responsive selection region/i,
    'the family keeps the shared responsive structural fact without presuming tickets');
  assert.doesNotMatch(trainingLayout, /52rem|live estimate/i,
    'the demo-only numeric cap and estimate are not shared family facts');

  const scratch = mkdtempSync(join(tmpdir(), 'event-layout-source-'));
  try {
    const archetype = join(scratch, 'docs/design/archetypes/event-registration');
    mkdirSync(archetype, { recursive: true });
    for (const id of ['tr-07', 'tr-30']) mkdirSync(join(scratch, 'docs/train/design', id), { recursive: true });
    for (const name of ['plan.md', 'README.md']) writeFileSync(join(archetype, name),
      readFileSync(join(ROOT, 'docs/design/archetypes/event-registration', name)));
    writeFileSync(join(archetype, 'design.md'), design
      .replace('capped at `52rem`', 'capped at `54rem`')
      .replace('A responsive selection region adapts to available space and includes',
        'An adaptive selection region adapts to available space\n  and includes')
      .replace('#### Pattern-specific details',
        '  - A capacity note reads 142 / 200 seats filled\n    beside the event hero.\n* A visitor roster appears only in the pattern\nwhen its plan specifies it.\n+ A plus-marked guide note belongs only in the pattern.\n\n#### Pattern-specific details'));
    for (const id of ['tr-07', 'tr-30']) for (const name of ['plan.md', 'design.md']) {
      writeFileSync(join(scratch, 'docs/train/design', id, name),
        readFileSync(join(ROOT, 'docs/train/design', id, name)));
    }
    const rows = trainingBriefs(ROOT);
    const projectedPattern = archetypeBrief(scratch, 'event-registration').sitePrompt;
    assert.match(projectedPattern, /Layout and components:[\s\S]*54rem/i,
      'changing the authored cap updates the pattern without a code change');
    assert.match(projectedPattern, /An adaptive selection region adapts to available space and includes/i,
      'a wrapped classified role keeps its continuation in the pattern');
    assert.match(projectedPattern, /142 \/ 200 seats filled beside the event hero/i,
      'indented and wrapped Shared-structure bullets remain complete in the pattern');
    assert.match(projectedPattern, /A visitor roster appears only in the pattern when its plan specifies it/i,
      'asterisk-marked Shared bullets retain even lazy unindented continuations in the pattern');
    assert.match(projectedPattern, /(?:^|\n)- A plus-marked guide note belongs only in the pattern\./i,
      'plus-marked Shared bullets remain distinct pattern guidance after a blank line');
    assert.doesNotMatch(projectedPattern, /52rem/);
    for (const id of ['tr-07', 'tr-30']) {
      const row = rows.get(id);
      assert.ok(row, `the family manifest declares ${id}`);
      const projectedFamily = trainingBrief(scratch, id, row).sitePrompt;
      const layout = projectedFamily.split('UI layout:\n')[1]?.split('Family visual direction and tokens:')[0] ?? '';
      assert.doesNotMatch(layout, /\b(?:52|54)rem\b|\blive estimate\b/i,
        `${id}: the archetype demo cap and estimate do not become family requirements`);
      assert.match(layout, /An adaptive selection region adapts to available space and includes/i,
        `${id}: wrapped classified role remains complete in the family`);
      assert.doesNotMatch(layout, /142 \/ 200 seats filled|visitor roster|plus-marked guide note/i,
        `${id}: new indented, asterisk and plus unclassified bullets cannot enter the family prompt`);
    }
    const adjacentBlocks = [
      ['ordered list', '1. Beside the event hero.'],
      ['thematic break', '---\nBeside the event hero.'],
      ['blockquote', '> Beside the event hero.'],
      ['table row', '| Beside the event hero. | Pattern only |'],
      ['heading', '# Beside the event hero.'],
      ['HTML comment', '<!--\n- **Capacity:** Beside the event hero.\n-->'],
      ['HTML block', '<aside>Beside the event hero.</aside>'],
      ['fenced block', '```text\n- **Capacity:** Beside the event hero.\n```'],
      ['setext h1', 'Beside the event hero.\n==='],
      ['setext h2', 'Beside the event hero.\n---'],
      ['HTML declaration', '<!DOCTYPE html> Beside the event hero.'],
      ['CDATA block', '<![CDATA[ Beside the event hero. ]]>'],
      ['processing instruction', '<?xml version=1.0?> Beside the event hero.'],
      ['footnote-like prose', '[^1]: Beside the event hero.'],
      ['bare dash and prose', '-\nBeside the event hero.'],
      ['digit-first prose', '142 Beside the event hero.'],
      ['unrecognized line', 'Novel block boundary: Beside the event hero.'],
    ];
    for (const [kind, block] of adjacentBlocks) {
      writeFileSync(join(archetype, 'design.md'), design.replace('\n\n#### Pattern-specific details\n',
        `\n${block}\n#### Pattern-specific details\n`));
      const patternPrompt = archetypeBrief(scratch, 'event-registration').sitePrompt;
      assert.match(patternPrompt, /confirmation\/read-back view/i,
        `${kind}: the genuine Outcome role remains in the pattern`);
      assert.doesNotMatch(patternPrompt, /Beside the event hero/i,
        `${kind}: unclassified non-bullet content must not extend a classified role in the pattern`);
      for (const id of ['tr-07', 'tr-30']) {
        const familyPrompt = trainingBrief(scratch, id, rows.get(id)).sitePrompt;
        assert.match(familyPrompt, /confirmation\/read-back view/i,
          `${id}: the genuine Outcome role remains after ${kind}`);
        assert.doesNotMatch(familyPrompt, /Beside the event hero/i,
          `${id}: an adjacent ${kind} must not become family Outcome guidance`);
      }
    }
    writeFileSync(join(archetype, 'design.md'), design.replace('\n\n#### Pattern-specific details\n',
      '\n+ A plus-marked capacity note reads 142 / 200 seats filled.\n#### Pattern-specific details\n'));
    const adjacentPattern = archetypeBrief(scratch, 'event-registration').sitePrompt;
    assert.match(adjacentPattern, /(?:^|\n)- A plus-marked capacity note reads 142 \/ 200 seats filled\./i,
      'a plus bullet immediately after Outcome is a separate pattern-only item');
    for (const id of ['tr-07', 'tr-30']) {
      assert.doesNotMatch(trainingBrief(scratch, id, rows.get(id)).sitePrompt, /plus-marked capacity note/i,
        `${id}: adjacent plus bullet must not merge into the classified Outcome role`);
    }
    writeFileSync(join(archetype, 'design.md'), design.replace('#### Pattern-specific details',
      '  + **Capacity:** A capacity note reads 142 / 200 seats filled.\n\n#### Pattern-specific details'));
    assert.match(archetypeBrief(scratch, 'event-registration').sitePrompt,
      /Layout and components: Not yet documented in this checkout\./,
      'a new classified shared role also fails the pattern contract closed');
    for (const id of ['tr-07', 'tr-30']) {
      assert.match(trainingBrief(scratch, id, rows.get(id)).sitePrompt, /UI layout: Not yet documented in this checkout\./,
        `${id}: a new classified source role changes the contract and fails closed`);
    }
    writeFileSync(join(archetype, 'design.md'), design.replace(
      '- A live estimate is clearly marked as illustrative rather than a charge.',
      '- A live estimate is clearly marked as illustrative rather than a charge.\n+ A plus-marked pattern detail remains separate.'));
    const plusDetail = archetypeBrief(scratch, 'event-registration').sitePrompt;
    assert.match(plusDetail, /(?:^|\n)- A plus-marked pattern detail remains separate\./i,
      'a plus bullet under Pattern-specific details is its own item');
    for (const id of ['tr-07', 'tr-30']) {
      assert.doesNotMatch(trainingBrief(scratch, id, rows.get(id)).sitePrompt, /plus-marked pattern detail/i,
        `${id}: pattern detail never becomes family structure`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('site prompts omit wrapped reference-viewport framing while retaining site layout instructions', () => {
  const gallery = listConcepts(ROOT);
  const prompts = [...gallery.patterns.map((pattern) => pattern.brief.sitePrompt),
    ...gallery.trainingTargets.map((target) => target.brief.sitePrompt)];
  assert.equal(prompts.length, 66);
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
  assert.equal(targets.length, 39);
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
    const prompt = targets.find((target) => target.id === id).brief.sitePrompt;
    const components = componentsOf(targets.find((target) => target.id === id));
    assert.doesNotMatch(components, /^Read from\b/m, `${id} must not point at an internal archetype document`);
    assert.match(components, /product or plan grid[\s\S]*order, cart or subscription summary[\s\S]*receipt or confirmation view/i,
      `${id} retains real storefront components after removing the internal pointer`);
    assert.doesNotMatch(components, /cart badge|shipping\/payment|#form-error-banner|\btr-26\b|\.subscription-card/i,
      `${id} must use its own order or subscription fields rather than the demo's`);
    assert.doesNotMatch(prompt, /configuration selects \(quantity, variant, grind\)/i,
      `${id} must not inherit another family's grind field`);
  }
  assert.match(targets.find((target) => target.id === 'tr-26').brief.sitePrompt, /select\[name=grind\]/,
    'the coffee subscription still gets grind selection from its own plan');
  const jobBoard = targets.find((target) => target.id === 'tr-12').brief.sitePrompt;
  assert.match(jobBoard, /UI layout:[\s\S]*application form[\s\S]*empty state/i,
    'removing raster notes must retain the job-board site structure');
  assert.doesNotMatch(jobBoard, /Oliver Bennett|CTT-2026-9842|the raster fills the form/i,
    'a visual reference’s invented applicant and receipt are not functional site requirements');
  for (const id of ['tr-07', 'tr-30']) {
    const prompt = targets.find((target) => target.id === id).brief.sitePrompt;
    const components = componentsOf(targets.find((target) => target.id === id));
    assert.match(components, /event hero[\s\S]*registration form[\s\S]*confirmation\/read-back view/i,
      `${id} keeps the reusable event registration structure`);
    assert.doesNotMatch(components, /Future Web 2026|General Admission|Workshop Pass|142\s*\/\s*200|£120|Attendee name|Dietary preferences|#registration-form|#estimate|#tier-error|#attendee-name/i,
      `${id} must not inherit event-demo names, counts, prices, fields or DOM IDs`);
    const layout = prompt.match(/UI layout:\n([\s\S]*?)(?=\nFamily visual direction and tokens:)/)?.[1] ?? '';
    const journey = prompt.match(/Step-by-step interactions:\n([\s\S]*?)(?=\nValidation and server state:)/)?.[1] ?? '';
    const familyFormId = journey.match(/\bform#([a-z][a-z0-9-]*)\b/)?.[1];
    assert.equal(familyFormId, id === 'tr-07' ? 'observatory-registration-form' : 'registration-form');
    assert.ok(layout.includes(`#${familyFormId}`), `${id} layout must use the form ID declared by its own journey`);
    assert.match(layout, /fluid, narrow page shell[\s\S]*labelled registration form/i,
      `${id} keeps the responsive shell and registration structure`);
    assert.match(layout, /responsive selection region[\s\S]*announced validation/i,
      `${id} keeps a responsive family-defined selection region and accessible form errors`);
    if (id === 'tr-07') assert.doesNotMatch(layout, /#registration-form\b/,
      'the observatory layout must not contradict its journey with the demo form ID');
  }
});

test('every training family receives functional layout and components without shared-board prose', () => {
  const targets = listConcepts(ROOT).trainingTargets;
  assert.equal(targets.length, 39);
  for (const target of targets) {
    const prompt = target.brief.sitePrompt;
    const layout = prompt.match(/UI layout:\n([\s\S]*?)(?=\n\nFamily visual direction and tokens:)/)?.[1] ?? '';
    const components = prompt.match(/Expected components:\n([\s\S]*?)(?=\n\nStep-by-step interactions:)/)?.[1] ?? '';
    const projected = `${layout}\n${components}`;
    assert.ok(layout.length > 100 && /\b(?:header|navigation|grid|column|form|sidebar|region)\b/i.test(layout),
      `${target.id} keeps a real spatial hierarchy, not a heading-only sketch`);
    assert.ok((components.match(/(?:^|\n)\s*(?:\d+\.|[-*])\s/g) ?? []).length >= 3,
      `${target.id} keeps at least three functional component details`);
    assert.match(projected, /\b(?:labelled|label|aria|announced|status|keyboard|focus|validation)\b/i,
      `${target.id} keeps an accessibility or state instruction`);
    assert.doesNotMatch(projected, /\b(?:tr|fam)-\d{2}\b/i,
      `${target.id} cannot cite siblings or static family board IDs in build layout`);
    assert.doesNotMatch(projected, /\b(?:rasters?|the corpus|both families|both references|both boards|training boards?|reference boards?|demo stylesheet|browser viewports?)\b/i,
      `${target.id} cannot treat raster/source comparisons as site requirements`);
    const proseOnly = projected.replace(/```[\s\S]*?```/g, '');
    assert.doesNotMatch(proseOnly, /\.(?:ticket-grid|ticket-row|event-hero|event-pass|capacity-note|pass-status|capacity-dot)\b/i,
      `${target.id} cannot inherit event-registration demo stylesheet classes as build instructions`);
    assert.doesNotMatch(projected, /The five boards are laid out on this grammar|as declared and as rendered|date the board was read/i,
      `${target.id} cannot inherit source-board comparisons or observation dates`);
  }
  for (const [id, structure] of [
    ['tr-04', /summary region[\s\S]*subject region[\s\S]*inline log form/i],
    ['tr-08', /responsive columns[\s\S]*receipt\/status view/i],
    ['tr-10', /questionnaire card[\s\S]*announced/i],
    ['tr-13', /table-of-contents sidebar[\s\S]*hierarchical headings/i],
    ['tr-16', /catalogue grid[\s\S]*separate detail view/i],
    ['tr-38', /collection grid[\s\S]*moderation notice/i],
  ]) {
    const prompt = targets.find((target) => target.id === id).brief.sitePrompt;
    const layout = prompt.match(/UI layout:\n([\s\S]*?)(?=\n\nFamily visual direction and tokens:)/)?.[1] ?? '';
    assert.match(layout, structure, `${id} retains its archetype's usable spatial or multi-screen structure`);
  }
  for (const [id, formId] of [['tr-07', 'observatory-registration-form'], ['tr-30', 'registration-form']]) {
    const prompt = targets.find((target) => target.id === id).brief.sitePrompt;
    const layout = prompt.match(/UI layout:\n([\s\S]*?)(?=\n\nFamily visual direction and tokens:)/)?.[1] ?? '';
    assert.ok(layout.includes(`#${formId}`), `${id} keeps its family plan form ID in layout`);
  }
});

test('demo-only selectors are kept out while authored inline class references remain possible', () => {
  const design = readFileSync(join(ROOT, 'docs/design/archetypes/event-registration/design.md'), 'utf8');
  assert.match(design, /`\.ticket-grid`|`\.event-pass`/,
    'the rejected class tokens really occur in the shared static-demo source');
  const targets = listConcepts(ROOT).trainingTargets.filter((target) => target.archetype === 'event-registration');
  assert.ok(targets.length > 0);
  for (const target of targets) {
    const layout = target.brief.sitePrompt.match(/UI layout:\n([\s\S]*?)(?=\n\nFamily visual direction and tokens:)/)?.[1] ?? '';
    assert.doesNotMatch(layout, /\.(?:ticket-grid|ticket-row|event-hero|event-pass|capacity-note|pass-status|capacity-dot)\b/i,
      `${target.id} uses projected site structure, not the static demo stylesheet`);
  }
});

test('booking training layouts keep the authored inline .container class reference across all seven families', () => {
  const source = readFileSync(join(ROOT, 'docs/design/archetypes/booking/design.md'), 'utf8');
  assert.match(source, /content sits in a `\.container` no wider than `68rem`/,
    'the selector is authored functional layout guidance, not a demo stylesheet inventory');
  const bookings = listConcepts(ROOT).trainingTargets.filter((target) => target.archetype === 'booking');
  assert.equal(bookings.length, 7);
  for (const target of bookings) {
    const layout = target.brief.sitePrompt.match(/UI layout:\n([\s\S]*?)(?=\n\nFamily visual direction and tokens:)/)?.[1] ?? '';
    assert.match(layout, /content sits in a \.container no wider than 68rem/,
      `${target.id} retains the authored class selector and its width constraint`);
  }
});

test('training prompts retain runnable fenced progressive-enhancement CSS for tr-31 and tr-33', () => {
  const targets = listConcepts(ROOT).trainingTargets;
  const componentsOf = (id) => targets.find((target) => target.id === id).brief.sitePrompt
    .match(/Expected components:\n([\s\S]*?)(?=\n\nStep-by-step interactions:)/)?.[1] ?? '';
  assert.match(componentsOf('tr-31'), /```css[\s\S]*\.anatomy-steps\s*\{[\s\S]*\.driver-label\s*\{[\s\S]*```/,
    'tr-31 retains runnable progressive-enhancement selectors and their fenced CSS contract');
  assert.match(componentsOf('tr-33'), /```css[\s\S]*\.issue-table:has\(input\[type="checkbox"\]:checked\) \.bulk-actions\s*\{[\s\S]*\.issue-title:user-invalid\s*\{[\s\S]*```/,
    'tr-33 retains runnable advanced CSS selectors inside its authored contract');
  for (const [id, archetype] of [['tr-31', 'scroll-storytelling-launch'], ['tr-33', 'saas-workspace-board']]) {
    const authored = readFileSync(join(ROOT, 'docs/design/archetypes', archetype, 'design.md'), 'utf8')
      .match(/^```css\n[\s\S]*?\n```/m)?.[0];
    assert.ok(authored && componentsOf(id).includes(authored),
      `${id} copies the authored CSS fence byte-for-byte, including its selector syntax and fallback comments`);
  }
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

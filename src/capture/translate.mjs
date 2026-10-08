/**
 * Clean-room translator from captured evidence to durable functional specification.
 *
 * CRITICAL BOUNDARY:
 * Raw DOM snapshots and screenshots captured from third-party sites live in the
 * quarantine store (under arm A5_black_box_reproduction) and are NEVER read or
 * opened by this file or anything it calls.
 *
 * The only inputs to this clean-room seam are the structured, derived records:
 * capture.json (validated by validateCapture) and flow.json (validated by validateFlow).
 *
 * From those abstract behavioral facts alone, this module synthesizes a durable
 * specification (validated by validateSpec) that clean-room reproduces the site's
 * functional behavior across the seven framework generators without copying raw
 * markup, styles, or assets. That structural boundary is the whole point of the bead.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { validateCapture, validateFlow, resolveCaptureOutputPath } from './schema.mjs';
import { validateSpec, buildProjectFromSpec, SPEC_VERSION } from '../eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../../pilot/frameworks.mjs';
import { assetStoragePath, REPO_ROOT } from '../provenance/store.mjs';

export class TranslationError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'TranslationError';
    this.reason = reason;
  }
}

/** Control types the seven framework generators can render as interactive form controls. */
export const MAPPABLE_CONTROL_TYPES = new Set([
  'text',
  'email',
  'tel',
  'url',
  'search',
  'password',
  'number',
  'date',
  'time',
  'textarea',
  'select',
]);

/**
 * Translate a validated capture and validated flow into a durable functional specification.
 *
 * Strict clean-room mapping: derives only what the capture and flow actually establish.
 * Where the records do not establish something, refuses with a specific reason rather than
 * inventing or guessing.
 */
// A flow records ACTIONS ({action, target, value}). A journey step - and the driver that replays it in
// src/corpus/harness.mjs, which reads step.fill / step.select / step.submit / step.expectText - describes a PLACE
// plus the controls set there. Carrying the flow's steps through verbatim produces a journey whose fills and
// submits the driver never performs: it navigates, asserts nothing, and no gate notices, because validateSpec
// does not inspect step structure. So convert, and convert faithfully.
export function stepsForJourney(flowSteps) {
  const out = [];
  let current = null;
  const ensure = (path) => {
    if (!current || current.path !== path) { current = { path }; out.push(current); }
    return current;
  };
  for (const step of flowSteps) {
    if (step.action === 'goto') {
      // After a submit, the driver is already on the generated /read/<ref> page. A recorded
      // confirmation path lacks that server-issued ref; navigating there again loses the echo.
      if (step.expectText !== undefined && out.at(-1)?.submit) {
        out.at(-1).expectText = step.expectText;
      } else {
        const at = ensure(step.path);
        if (step.expectText !== undefined) at.expectText = step.expectText;
      }
      current = null; // the next action belongs to a step of its own
      continue;
    }
    if (step.action === 'fill' || step.action === 'select') {
      const at = ensure(step.path);
      const key = step.action === 'fill' ? 'fill' : 'select';
      at[key] = { ...(at[key] ?? {}), [step.target]: step.value };
      if (step.expectText !== undefined) at.expectText = step.expectText;
      continue;
    }
    if (step.action === 'submit') {
      const at = ensure(step.path);
      at.submit = step.target;
      if (step.expectText !== undefined) at.expectText = step.expectText;
      current = null;
      continue;
    }
    if (step.action === 'click') {
      const at = ensure(step.path);
      if (step.expectText !== undefined) at.expectText = step.expectText;
    }
  }
  return out;
}

// Synthetic values depend only on a field's position and type, never on recorded input.
// Keep each value valid for its HTML control so a replay exercises the same interaction.
function syntheticValue(control, position, optionIndex = null) {
  const ordinal = position + 1;
  switch (control.type) {
    case 'email': return `sample${ordinal}@example.test`;
    case 'tel': return '2025550100';
    case 'url': return `https://example.test/sample-${ordinal}`;
    case 'number': return String(ordinal);
    case 'date': return '2020-01-01';
    case 'time': return '12:00';
    case 'password': return `SamplePass${ordinal}!`;
    case 'select': return `Option ${optionIndex + 1} for field ${ordinal}`;
    case 'text':
    case 'search':
    case 'textarea': return `Sample field ${ordinal}`;
    default: throw new TranslationError(`cannot synthesize value for control '${control.name}' of type '${control.type}'`);
  }
}

export function translateCapture({ capture, flow }) {
  // Validate input schemas fail-closed before any extraction
  const captureProblems = validateCapture(capture);
  if (captureProblems.length > 0) {
    throw new TranslationError(`invalid capture:\n  ${captureProblems.join('\n  ')}`);
  }
  const flowProblems = validateFlow(flow);
  if (flowProblems.length > 0) {
    throw new TranslationError(`invalid flow:\n  ${flowProblems.join('\n  ')}`);
  }

  // 1. POST form: find captured forms with method === 'post'
  const postForms = [];
  for (const page of capture.pages) {
    for (const form of page.forms ?? []) {
      if (String(form.method).toLowerCase() === 'post') {
        postForms.push({ page, form });
      }
    }
  }

  if (postForms.length === 0) {
    throw new TranslationError('no POST form found in capture: nothing to clean-room reconstruct');
  }

  // A specified submit must identify a captured POST form, never silently choose another.
  const submitStep = flow.steps.find((s) => s.action === 'submit');
  let chosen = postForms[0];
  if (submitStep) {
    if (postForms.length === 1 && !postForms[0].form.id) {
      const form = postForms[0].form;
      throw new TranslationError(`captured POST form (action: ${form.action}, method: ${form.method}, controls: ${form.controls.map((control) => control.name).join(', ')}) has no id: generator requires form selector in the form form#id; submit target '${submitStep.target}' cannot match it`);
    }
    const targetIdMatch = submitStep.target.match(/^form#([A-Za-z][A-Za-z0-9_-]*)$/);
    const match = targetIdMatch && postForms.find(({ form }) => form.id === targetIdMatch[1]);
    if (!match) throw new TranslationError(`submit target '${submitStep.target}' does not match a captured POST form#id`);
    chosen = match;
  }
  const { form: postForm } = chosen;

  // Form ID: generator requires selector in the form 'form#id'
  if (!postForm.id || typeof postForm.id !== 'string' || postForm.id.trim() === '') {
    throw new TranslationError(`captured POST form (action: ${postForm.action}, method: ${postForm.method}, controls: ${postForm.controls.map((control) => control.name).join(', ')}) has no id: generator requires form selector in the form form#id`);
  }
  const formId = postForm.id.trim();

  // 2. Submit buttons trigger the form action; they are not data fields in the generated form.
  const dataControls = postForm.controls.filter((control) => control.type !== 'submit');
  const recordedNames = new Set();
  for (const control of dataControls) {
    if (!MAPPABLE_CONTROL_TYPES.has(control.type)) {
      throw new TranslationError(`control '${control.name}' has unmappable type '${control.type}': generator cannot render this control type`);
    }
    if (control.type === 'select') {
      if (!Array.isArray(control.options) || control.options.length === 0) {
        throw new TranslationError(`select control '${control.name}' must have a non-empty array of options`);
      }
    }
    recordedNames.add(control.name);
  }

  // 3. Flow control verification: flow must not touch unrecorded controls
  for (const step of flow.steps) {
    if (step.action === 'fill' || step.action === 'select') {
      const match = step.target.match(/^(?:input|select|textarea)\[name=([A-Za-z][A-Za-z0-9_-]*)\]$/);
      if (!match) throw new TranslationError(`flow ${step.action} target '${step.target}' does not name a captured field with [name=...]`);
      const targetName = match[1];
      if (!recordedNames.has(targetName)) {
        throw new TranslationError(`flow touches control '${targetName}' which was never recorded in capture (target '${step.target}')`);
      }
    }
  }

  // 4. Replace recorded values before building either the top-level journey or replay steps.
  // The observed text is bound to the first earlier supplying action, as in the carried-state rule.
  const syntheticSteps = [];
  const supplied = new Map();
  for (const step of flow.steps) {
    const sanitized = { ...step };
    if (step.action === 'fill' || step.action === 'select') {
      const name = step.target.match(/\[name=([A-Za-z][A-Za-z0-9_-]*)\]$/)[1];
      const position = dataControls.findIndex((control) => control.name === name);
      const control = dataControls[position];
      if ((step.action === 'select') !== (control.type === 'select')) {
        throw new TranslationError(`flow ${step.action} target '${step.target}' does not match control type '${control.type}'`);
      }
      if (step.action === 'select') {
        const optionIndex = control.options.indexOf(step.value);
        if (optionIndex < 0) throw new TranslationError(`selected value for '${name}' was not recorded among its options: cannot synthesize selection`);
        sanitized.value = syntheticValue(control, position, optionIndex);
      } else {
        sanitized.value = syntheticValue(control, position);
      }
      if (!supplied.has(step.value)) supplied.set(step.value, sanitized.value);
    }
    if (step.expectText !== undefined) {
      if (!supplied.has(step.expectText)) throw new TranslationError('observed text was not supplied by an earlier step: cannot synthesize assertion');
      sanitized.expectText = supplied.get(step.expectText);
    }
    syntheticSteps.push(sanitized);
  }
  const journeyFill = {};
  const journeySelect = {};
  for (const step of syntheticSteps) {
    if (step.action === 'fill') journeyFill[step.target] = step.value;
    if (step.action === 'select') journeySelect[step.target] = step.value;
  }
  if (Object.keys(journeyFill).length === 0) {
    throw new TranslationError('flow contains no fill steps: cannot construct journey.fill');
  }

  // 5. Observed value and echo: find step with expectText
  const expectStep = flow.steps.find((s) => s.expectText !== undefined && s.expectText !== '');
  if (!expectStep) {
    throw new TranslationError('no step observed a supplied value: cannot establish persistence without an observed reload assertion');
  }

  // Match which earlier step supplied this observed value
  const supplyingStep = flow.steps
    .slice(0, expectStep.index)
    .find((s) => (s.action === 'fill' || s.action === 'select') && s.value === expectStep.expectText);
  if (!supplyingStep) {
    throw new TranslationError(`no step observed a supplied value: expectText '${expectStep.expectText}' was not supplied by any earlier step`);
  }

  const echoNameMatch = supplyingStep.target.match(/\[name=([A-Za-z0-9_-]+)\]/);
  const echoControlName = echoNameMatch ? echoNameMatch[1] : null;
  const echoControl = postForm.controls.find((c) => c.name === echoControlName);
  if (!echoControl) {
    throw new TranslationError(`observed expectText value came from control '${echoControlName}', which was not found in captured form`);
  }

  // 6. Routes: read-by-reference path ends with /:ref, constructed from confirmation path
  const confirmationPath = expectStep.path;
  const readPath = confirmationPath.endsWith('/:ref')
    ? confirmationPath
    : `${confirmationPath.replace(/\/+$/, '')}/:ref`;

  const routes = [];
  const routeKeys = new Set();
  const addRoute = (route) => {
    const key = `${route.method} ${route.path}`;
    if (!routeKeys.has(key)) {
      routeKeys.add(key);
      routes.push(route);
    }
  };

  // One 'page' route per captured page path (excluding read-by-reference path)
  for (const page of capture.pages) {
    if (page.path !== readPath) {
      addRoute({
        method: 'GET',
        path: page.path,
        kind: 'page',
        effect: 'render generated page',
      });
    }
  }

  // The write route comes from the captured POST form, redirecting to the read-by-reference path
  addRoute({
    method: 'POST',
    path: postForm.action,
    kind: 'write',
    effect: `process ${formId} submission, persist record, and redirect`,
    redirect: readPath,
  });

  // Read-by-reference route where the flow observed the value
  addRoute({
    method: 'GET',
    path: readPath,
    kind: 'read-by-reference',
    effect: `read stored submission by reference and echo ${echoControl.name}`,
  });

  // 7. Fields: map captured form controls
  const fields = dataControls.map((control, position) => {
    const slug = control.slug ?? control.name;
    const name = control.name;
    const type = control.type;
    const label = `Field ${position + 1} (${type})`;
    const required = Boolean(control.required);
    const field = {
      slug,
      name,
      type,
      label,
      required,
    };
    if (!required) {
      field.optional = true;
    }
    if (type === 'select') {
      field.options = control.options.map((_, index) => syntheticValue(control, position, index));
    }
    if (name === echoControl.name) {
      field.echoed = true;
    }
    if (control.autocomplete) {
      field.autocomplete = control.autocomplete;
    }
    return field;
  });

  // 8. Validation: required fields exactly from captured required non-select controls
  const requiredFields = fields
    .filter((f) => f.required && f.type !== 'select')
    .map((f) => f.name);

  const validation = {
    required_fields: requiredFields,
    on_missing: 'the generated server refuses missing required fields and re-renders the form; nothing is stored',
    on_success: `insert one row into records and answer 303 with Location: ${readPath.replace(':ref', '<ref>')}`,
  };

  // 9. Family ID: deterministic kebab slug from host and start path
  let host = 'captured-site';
  try {
    const parsed = new URL(capture.source.url);
    host = parsed.hostname;
  } catch {
    // fallback if unparseable
  }
  const hostSlug = host.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
  const startPathSlug = flow.start_path.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
  const family_id = startPathSlug ? `${hostSlug}-${startPathSlug}` : hostSlug;

  const title = `Generated form flow (${fields.length} fields)`;
  const story = `${title}: a clean-room server-backed flow with ${routes.length} routes.`;

  // 10. Spec assembly
  const spec = {
    spec_version: SPEC_VERSION,
    family_id,
    title,
    story,
    durability: {
      version: 1,
      authored: '1970-01-01',
      basis: 'clean-room reconstruction translated from capture and flow evidence',
      rebuild: `node scripts/capture-to-projects.mjs --capture capture.json --flow flow.json`,
    },
    state: {
      engine: 'sqlite',
      lifetime: 'per process, in a file named on the command line - not a durable store',
      tables: [
        {
          name: 'records',
          purpose: 'the value a write stores, read back by the reference the server issued',
          columns: [
            { name: 'ref', type: 'TEXT', constraints: 'PRIMARY KEY' },
            { name: 'created_at', type: 'TEXT', constraints: 'NOT NULL' },
            { name: 'payload', type: 'TEXT', constraints: 'NOT NULL' },
          ],
        },
      ],
    },
    persistence: {
      write_route: postForm.action,
      read_route: readPath,
      reference: 'server-issued reference, returned in the Location header of a 303',
      reload_assertion: `reloading ${readPath.replace(':ref', '<ref>')} still shows the stored ${echoControl.name} value; the value is read from SQLite, not from the form`,
    },
    routes,
    fields,
    validation,
    journey: {
      startPath: flow.start_path,
      formSelector: `form#${formId}`,
      fill: journeyFill,
      ...(Object.keys(journeySelect).length > 0 ? { select: journeySelect } : {}),
      expectText: syntheticSteps[expectStep.index].expectText,
      steps: stepsForJourney(syntheticSteps),
    },
    echo: {
      field: echoControl.slug ?? echoControl.name,
    },
    capabilities: {
      list_pages: false,
      detail_page: false,
      auth: false,
    },
    session: false,
    acceptance: [
      `after a successful submit the browser lands on ${readPath.replace(':ref', '<ref>')} and the echoed ${echoControl.name} text is present`,
      'reloading that URL still shows it, which is only possible if the server stored it',
      'the reference in the URL was issued by this submission, not read from a row that already existed',
    ],
  };

  // A coincidental equality is still a recorded value in public output. Refuse rather than
  // publishing it; never use the recorded words as a salt to generate replacements.
  const recordedCopy = new Set([
    ...capture.pages.flatMap((page) => [page.title, ...page.headings,
      ...page.forms.flatMap((form) => form.controls.flatMap((control) => [control.label, ...(control.options ?? [])]))]),
    ...flow.steps.flatMap((step) => [step.value, step.expectText]),
  ].filter((value) => typeof value === 'string' && value.length > 0));
  const syntheticCopy = [title, story, ...routes.map((route) => route.effect),
    ...fields.flatMap((field) => [field.label, ...(field.options ?? [])]),
    ...Object.values(journeyFill), ...Object.values(journeySelect), spec.journey.expectText];
  if (syntheticCopy.some((value) => recordedCopy.has(value))) {
    throw new TranslationError('synthetic text coincides with recorded site text or a typed value: refusing public translation');
  }

  const specProblems = validateSpec(spec);
  if (specProblems.length > 0) {
    throw new TranslationError(`translated spec is invalid:\n  ${specProblems.join('\n  ')}`);
  }

  return spec;
}

/**
 * Build clean-room projects for all seven framework arms from the translated spec.
 *
 * Generated projects belong to public, non-trainable arm A4_clean_room_reproduction.
 * The arm-derived default writes under the public repo's data/A4_clean_room_reproduction.
 * An explicit --out remains constrained to a verified quarantine store or a test temp root;
 * it cannot arbitrarily write elsewhere in the repository.
 */
export function buildCapturedProjects({ spec, outDir = null, framework = null, quarantineRoot = null, repoRoot = null, testTempDir = null } = {}) {
  const problems = validateSpec(spec);
  if (problems.length > 0) {
    throw new TranslationError(`spec is invalid:\n  ${problems.join('\n  ')}`);
  }

  const effectiveRepo = repoRoot ?? REPO_ROOT;

  // Explicit destinations may only name a verified store location or a caller-supplied temp directory.
  const outputOptions = {
    repoRoot: effectiveRepo,
    env: {
      ...process.env,
      ...(quarantineRoot ? { MWG_TRAIN_QUARANTINE: quarantineRoot } : {}),
      ...(testTempDir ? { MWG_TRAIN_CAPTURE_TEST_TEMP: testTempDir } : {}),
    },
  };
  const outputDir = outDir !== null ? resolveCaptureOutputPath(outDir, outputOptions) : null;

  const options = { quarantineRoot, repoRoot: effectiveRepo };

  // Write spec
  const specRelPath = `specs/${spec.family_id}.json`;
  const specPath = outputDir !== null
    ? resolveCaptureOutputPath(join(outputDir, `${spec.family_id}.json`), outputOptions)
    : assetStoragePath('A4_clean_room_reproduction', specRelPath, options);

  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  // Build and write projects
  const frameworksToBuild = framework ? [framework] : Object.keys(FRAMEWORKS);
  const projects = {};
  const builtProjects = {};

  for (const fw of frameworksToBuild) {
    if (!FRAMEWORKS[fw]) {
      throw new Error(`unknown framework '${fw}' (known: ${Object.keys(FRAMEWORKS).join(', ')})`);
    }
    const built = buildProjectFromSpec({ spec, frameworkName: fw });
    const projectRelPath = `projects/${built.projectId}`;
    const projectDir = outputDir !== null
      ? resolveCaptureOutputPath(join(outputDir, built.projectId), outputOptions)
      : assetStoragePath('A4_clean_room_reproduction', projectRelPath, options);

    writeProject(projectDir, built);
    projects[fw] = projectDir;
    builtProjects[fw] = built;
  }

  return { specPath, projects, builtProjects };
}

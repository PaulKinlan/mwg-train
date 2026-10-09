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

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
      // A click that navigated is part of the journey. Dropping its destination silently produced a replay
      // that never reached the page the recording reached. The driver cannot re-perform a click (the target
      // is synthesized away), so the faithful thing is to reproduce the NAVIGATION the click caused: emit
      // the destination as its own step. ensure() collapses it when the next action already goes there, so
      // a click that did not move the page adds nothing.
      if (step.expected_path !== undefined) ensure(step.expected_path);
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
  // Identifiers are evidence too: an id/name/slug may contain a person's name even when
  // it is selector-safe. Reserve generic identifiers against the recorded ones.
  const recordedIdentifiers = new Set(capture.pages.flatMap((page) => page.forms.flatMap((form) =>
    [form.id, ...form.controls.flatMap((control) => [control.name, control.slug])])));
  const generatedIdentifiers = new Set();
  const genericIdentifier = (prefix, position) => {
    let candidate = `${prefix}-${position}`;
    while (recordedIdentifiers.has(candidate) || generatedIdentifiers.has(candidate)) candidate = `${prefix}-${++position}`;
    generatedIdentifiers.add(candidate);
    return candidate;
  };
  const formId = genericIdentifier('generated-form', 1);

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
    if (recordedNames.has(control.name)) {
      throw new TranslationError(`duplicate control name '${control.name}': cannot map selectors unambiguously`);
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

  const fieldNames = new Map(dataControls.map((control, index) =>
    [control.name, genericIdentifier('field', index + 1)]));
  const selectorFor = (target) => target.replace(/\[name=([A-Za-z][A-Za-z0-9_-]*)\]$/, (_, name) =>
    `[name=${fieldNames.get(name)}]`);

  // Paths are identifiers too. Use one map for pages, actions, and flow locations so
  // identical captured paths always refer to the same generated route. Never derive a
  // published slug from the recorded bytes (including a URL query or hostname).
  const recordedPaths = new Set([
    ...capture.pages.map((page) => page.path),
    ...capture.pages.flatMap((page) => page.forms.map((form) => form.action)),
    flow.start_path,
    ...flow.steps.flatMap((step) => [step.path, step.expected_path]),
  ]);
  const paths = new Map([['/', '/']]);
  let nextPath = 1;
  const pathFor = (path) => {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
        path.includes('?') || path.includes('#') || path.includes('..')) {
      throw new TranslationError(`cannot synthesize route for non-path or query-bearing location '${path}'`);
    }
    if (!paths.has(path)) {
      let candidate;
      do { candidate = `/page-${nextPath++}`; } while (recordedPaths.has(candidate));
      paths.set(path, candidate);
    }
    return paths.get(path);
  };
  // Allocate in capture/flow order, not according to the spelling of the paths.
  for (const page of capture.pages) pathFor(page.path);
  pathFor(flow.start_path);
  for (const step of flow.steps) {
    pathFor(step.path);
    if (step.expected_path !== undefined) pathFor(step.expected_path);
  }
  const writePath = pathFor(postForm.action);

  // 4. Replace recorded values before building either the top-level journey or replay steps.
  // The observed text is bound to the first earlier supplying action, as in the carried-state rule.
  const syntheticSteps = [];
  const supplied = new Map();
  for (const step of flow.steps) {
    const sanitized = { ...step, path: pathFor(step.path) };
    if (step.expected_path !== undefined) sanitized.expected_path = pathFor(step.expected_path);
    if (step.action === 'submit') sanitized.target = `form#${formId}`;
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
      sanitized.target = selectorFor(step.target);
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
  const confirmationPath = pathFor(expectStep.path);
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
    if (pathFor(page.path) !== readPath) {
      addRoute({
        method: 'GET',
        path: pathFor(page.path),
        kind: 'page',
        effect: 'render generated page',
      });
    }
  }

  // The write route comes from the captured POST form, redirecting to the read-by-reference path
  addRoute({
    method: 'POST',
    path: writePath,
    kind: 'write',
    effect: `process ${formId} submission, persist record, and redirect`,
    redirect: readPath,
  });

  // Read-by-reference route where the flow observed the value
  addRoute({
    method: 'GET',
    path: readPath,
    kind: 'read-by-reference',
    effect: `read stored submission by reference and echo ${fieldNames.get(echoControl.name)}`,
  });

  // 7. Fields: map captured form controls
  const fields = dataControls.map((control, position) => {
    const slug = fieldNames.get(control.name);
    const name = slug;
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
    if (control.name === echoControl.name) {
      field.echoed = true;
    }
    // Arbitrary captured autocomplete attributes are evidence, not publication material.
    // The capture producer does not record one; do not infer autofill semantics.
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

  // 9. Stable project/file identity uses only structural form facts, never URL, copy or time.
  const shape = dataControls.map((control) => [control.type, control.required, control.options?.length ?? 0]);
  const family_id = `form-flow-${createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16)}`;

  const title = `Generated form flow (${fields.length} fields)`;
  const story = `${title}: a clean-room server-backed flow with ${routes.length} routes.`;

  const journeySteps = stepsForJourney(syntheticSteps);
  const servedPages = new Set(routes.filter((route) => route.method === 'GET' && route.kind === 'page')
    .map((route) => route.path));
  for (const step of journeySteps) {
    if (!servedPages.has(step.path)) {
      throw new TranslationError(`journey page '${step.path}' has no captured page route: cannot build a drivable journey`);
    }
  }
  // The harness navigates journey.startPath before replaying the steps, so a start path with no served page
  // is a 404 the moment a generated project runs - a spec validateSpec accepts and no arm can drive.
  const startPath = pathFor(flow.start_path);
  if (!servedPages.has(startPath)) {
    throw new TranslationError(`journey start path '${startPath}' has no captured page route: cannot build a drivable journey`);
  }

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
      write_route: writePath,
      read_route: readPath,
      reference: 'server-issued reference, returned in the Location header of a 303',
      reload_assertion: `reloading ${readPath.replace(':ref', '<ref>')} still shows the stored ${fieldNames.get(echoControl.name)} value; the value is read from SQLite, not from the form`,
    },
    routes,
    fields,
    validation,
    journey: {
      startPath,
      formSelector: `form#${formId}`,
      fill: journeyFill,
      ...(Object.keys(journeySelect).length > 0 ? { select: journeySelect } : {}),
      expectText: syntheticSteps[expectStep.index].expectText,
      steps: journeySteps,
    },
    echo: {
      field: fieldNames.get(echoControl.name),
    },
    capabilities: {
      list_pages: false,
      detail_page: false,
      auth: false,
    },
    session: false,
    acceptance: [
      `after a successful submit the browser lands on ${readPath.replace(':ref', '<ref>')} and the echoed ${fieldNames.get(echoControl.name)} text is present`,
      'reloading that URL still shows it, which is only possible if the server stored it',
      'the reference in the URL was issued by this submission, not read from a row that already existed',
    ],
  };

  // A coincidental equality is still a recorded value in public output. Refuse rather than
  // publishing it; never use the recorded words as a salt to generate replacements.
  const recordedCopy = new Set();
  const collectEvidence = (value) => {
    if (typeof value === 'string' && value.length > 0) recordedCopy.add(value);
    else if (Array.isArray(value)) value.forEach(collectEvidence);
    else if (value && typeof value === 'object') Object.values(value).forEach(collectEvidence);
  };
  collectEvidence(capture);
  collectEvidence(flow);
  const syntheticCopy = [family_id, title, story, formId, ...fieldNames.values(),
    ...paths.values(), readPath, ...routes.flatMap((route) => [route.effect, route.redirect]),
    ...fields.flatMap((field) => [field.label, ...(field.options ?? [])]),
    ...Object.values(journeyFill), ...Object.values(journeySelect), spec.journey.expectText,
    spec.persistence.reload_assertion, spec.validation.on_success, ...spec.acceptance];
  if (syntheticCopy.some((value) => value !== '/' && recordedCopy.has(value))) {
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

// Output names derive from the capture's published structure, so two captures with the same form shape
// resolve to the same family_id and therefore the same spec and project paths. Writing over that silently
// destroys the earlier output. The default is to refuse; overwrite must be asked for explicitly.
function readTree(dir) {
  const files = new Map();
  const walk = (rel) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else files.set(child, readFileSync(join(dir, child)));
    }
  };
  walk('');
  return files;
}

function treesDiffer(existing, expected) {
  if (existing.size !== expected.size) return true;
  for (const [name, content] of existing) {
    const other = expected.get(name);
    if (other === undefined || !other.equals(content)) return true;
  }
  return false;
}

function refuseCollision(target, context) {
  throw new TranslationError(
    `destination already holds different output: ${target}${context} - refusing to overwrite it, pass overwrite to replace it`,
  );
}

// Compare against what we are about to write rather than against a recorded corpus: re-running the same
// capture is then a no-op, and any real difference is refused. The comparison renders the project with the
// real generator into a scratch directory, so no manifest or file-layout rule is duplicated here.
function assertProjectDestinationFree(dir, built, frameworkName, overwrite) {
  if (overwrite || !existsSync(dir)) return;
  const scratch = mkdtempSync(join(tmpdir(), 'capture-project-check-'));
  try {
    writeProject(scratch, { ...built, includeDependencies: true });
    if (treesDiffer(readTree(dir), readTree(scratch))) {
      refuseCollision(dir, ` (framework ${frameworkName})`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function buildCapturedProjects({ spec, outDir = null, framework = null, quarantineRoot = null, repoRoot = null, testTempDir = null, overwrite = false } = {}) {
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

  const specRelPath = `specs/${spec.family_id}.json`;
  const specPath = outputDir !== null
    ? resolveCaptureOutputPath(join(outputDir, `${spec.family_id}.json`), outputOptions)
    : assetStoragePath('A4_clean_room_reproduction', specRelPath, options);
  const specContents = `${JSON.stringify(spec, null, 2)}\n`;

  // Decide on EVERY destination before writing anything, so a refusal cannot leave a half-written spec or a
  // mixture of old and new projects behind.
  if (!overwrite && existsSync(specPath) && readFileSync(specPath, 'utf8') !== specContents) {
    refuseCollision(specPath, ` (family ${spec.family_id})`);
  }

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

    assertProjectDestinationFree(projectDir, built, fw, overwrite);
    projects[fw] = projectDir;
    builtProjects[fw] = built;
  }

  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, specContents);

  for (const [fw, projectDir] of Object.entries(projects)) {
    // A replacement has to start clean: leaving the previous project's files in place would produce a
    // mixture of two captures rather than the output of one.
    if (overwrite && existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true });
    writeProject(projectDir, { ...builtProjects[fw], includeDependencies: true });
  }

  return { specPath, projects, builtProjects };
}

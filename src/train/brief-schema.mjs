/**
 * Brief-authored form schema for the tr-* training corpus.
 *
 * The tr-* briefs originally described their flows only in prose (`journeys`), while
 * the generated projects took their `fields` and `journey` from a shared archetype.
 * That made every project in a family render the archetype's form - a coffee
 * subscription brief produced a bakery form - so a brief could not be told apart from
 * its project.
 *
 * This module lets a brief carry its OWN structured schema, so the project's form and
 * journey come from the brief that describes them. It is deliberately small and
 * fail-closed: a brief whose schema cannot be built into a working form is refused
 * rather than scaffolded into something that merely renders.
 *
 * The field vocabulary matches `src/eval/spec.mjs` (FIELD_KEYS) and the renderer in
 * `pilot/frameworks.mjs`, so an authored field is expressed in the same terms as every
 * other field in the project.
 */

/**
 * Field types the framework builders can render. `pilot/frameworks.mjs` has explicit
 * branches for textarea and select and an `input type=` fallback, so these are the
 * types that produce a real control rather than an unknown one.
 */
export const BRIEF_FIELD_TYPES = new Set([
  'text',
  'tel',
  'email',
  'date',
  'time',
  'number',
  'select',
  'search',
  'textarea',
  // A brief whose flow includes a login needs a real password control: the builders
  // engage their password/session machinery off `type="password"`
  // (`pilot/frameworks.mjs`), so typing one as `text` would render the credential in
  // clear and silently skip the login path the brief describes.
  'password',
]);

/** Properties an authored field may carry, mirroring the spec's closed field set. */
export const BRIEF_FIELD_KEYS = new Set([
  'slug',
  'name',
  'type',
  'label',
  'autocomplete',
  'required',
  'optional',
  'options',
  'echoed',
]);

const isString = (v) => typeof v === 'string' && v.length > 0;
const isBool = (v) => typeof v === 'boolean';

/**
 * The field the project echoes its record back through.
 *
 * The builder needs `echo.field` to name a slug that exists in `fields`, then looks up
 * that field's control to read the value back (`pilot/frameworks.mjs`). Deriving it
 * here - rather than asking 30 briefs to each name one - removes a whole class of
 * hand-authored mistake, and the choice is deterministic: the first textarea, else the
 * first text field. A family with no such field is refused, because the harness has
 * nothing to read the record back through.
 */
export function echoFieldFor(fields) {
  const echoable =
    fields.find((field) => field.echoed === true) ??
    fields.find((field) => field.type === 'textarea') ??
    fields.find((field) => field.type === 'text');
  return echoable ? echoable.slug : null;
}

/** Field names a journey's fill selectors type into: `[name=x]`, `[name="x"]`, `[name='x']`. */
export function selectorFieldName(selector) {
  const match = String(selector).match(/\[name=["']?([^\]"']+)["']?\]/);
  return match ? match[1] : null;
}

// A complete selector is `<tag>[name=<value>]` and nothing else. The name is read as CSS reads it, so
// escapes are refused outright: the validator reports the literal characters it sees, while
// `querySelector` resolves `\67 rind` to `grind`, and a selector is only usable here when those two
// readings cannot differ. A quoted value may hold the opposite quote (a field named `o'brien` is
// reachable as "o'brien") and anything else except a backslash or a raw newline, and an unquoted value
// must be a valid CSS identifier - so a name outside the unquoted charset is reached by quoting it,
// which is how a legitimate name like `contact.email` is addressed. Compound, comma-joined and
// descendant selectors still match nothing.

/**
 * The builders emit `name="${field.name}"` with the name interpolated RAW (`pilot/frameworks.mjs`),
 * so the HTML parser gets to reinterpret it: a field named `a&#32;b` reaches the DOM as `a b`, and
 * `a&amp;b` reaches it as `a&b`. A selector quoting either literal name then misses that element -
 * measured in Chrome, `select[name="a&#32;b"]` matches the element named `a&#32;b` and not the one
 * named `a b` - so a journey can leave a required select on its default while the schema reports it
 * driven. The same decode breaks the server, whose required-field list is built from these names while
 * the submitted key is the DOM's.
 *
 * The characters refused here are the ones MEASURED to be unsafe, and nothing else, because a rule
 * broader than the problem rejects legitimate briefs: in the same probes, `a b`, `o'brien`, `a<b`,
 * `a=b`, `a.b`, `a$b`, TAB, VT, DEL, NBSP, U+2028 and U+0085 all reached the DOM unchanged and
 * matched a quoted selector naming that same element, so they are allowed. Each refusal is one
 * measured case: `"` ends the attribute early (the DOM name becomes `a` and the selector raises a
 * syntax error); `&` can form an entity reference, including without a semicolon (`&copy`), so no
 * name containing one is read back reliably; `\` is a CSS escape, and escapes are refused in
 * selectors, so such a field could not be addressed at all; a raw newline is outside what a CSS value
 * may contain; NUL is replaced by U+FFFD by the HTML parser, so a NUL-named field and a U+FFFD-named
 * field become the SAME DOM name and a selector for the required one drives the other (measured: it
 * matched the optional field); and form feed is a CSS newline, so a selector containing one is a
 * SyntaxError in the browser while this validator would have accepted it.
 *
 * All 121 names across the 30 families already satisfy this.
 */
export const UNSAFE_FIELD_NAME = /["&\\\u0000\u000C\n\r]/;

/**
 * Whether a name contains an unpaired UTF-16 surrogate.
 *
 * A lone surrogate is legal in a JS string, so a brief can declare one, but it is not a valid Unicode
 * scalar and Node writes it out as U+FFFD when the generated HTML is encoded as UTF-8. Measured on the
 * builder's own path: a name of lone U+D800 and a name of U+FFFD both came back from the written file
 * as `[65533]`, so two declared fields collapse into one in the document, while the server's required
 * list is built from the declared names. The selector for the surrogate then matched NOTHING rather
 * than the wrong field, so this fails loudly rather than silently - but the name that ships is not the
 * name that was declared, which is reason enough to refuse it. Valid pairs are fine and measured safe:
 * an emoji, U+10000 and U+FFFD names all round-tripped and matched their own element.
 *
 * `for...of` iterates code points, so a valid pair yields one code point above the surrogate range and
 * only an unpaired unit lands inside it.
 */
export function hasUnpairedSurrogate(value) {
  for (const character of String(value)) {
    const code = character.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) return true;
  }
  return false;
}

const COMPLETE_SELECTOR =
  /^(input|textarea|select)\[\s*name\s*=\s*(?:"([^"\\\n\r]+)"|'([^'\\\n\r]+)'|((?:[A-Za-z_]|-[A-Za-z_-])[A-Za-z0-9_-]*))\s*\]$/i;

/**
 * The field a selector addresses, but only when it is a complete single-form selector.
 *
 * `selectorFieldName` reads the first `[name=...]` out of whatever it is given, while the browser
 * resolves the WHOLE string with `querySelector`. Those disagree on a compound or comma-joined
 * selector: `select[name=grind]:not(*), select[name=other]` reads as `grind` here (`:not(*)` matches
 * nothing) and drives `other` in the browser, so validation would count a required select as driven
 * while the page left it on its first option. This returns the name only when reading and driving
 * cannot differ, and the validators reject anything else rather than guessing which one is meant.
 *
 * Which forms are accepted here was measured in Chrome, not reasoned about: `[name=x]`,
 * `[name = x]` and `[ name = x ]` all match; `INPUT[name=x]` matches, because HTML tag names are
 * case-insensitive; a quoted value may hold the opposite quote; `[name=x][type=text]` matches
 * nothing when the element has no such attribute; and `select[name="\\67 rind"]` matches the
 * element named `grind`, which is why escapes are refused here rather than decoded.
 */
export function completeSelectorFieldName(selector) {
  const match = COMPLETE_SELECTOR.exec(String(selector ?? ''));
  return match ? match[2] ?? match[3] ?? match[4] : null;
}

/**
 * The fields as the framework builders need them.
 *
 * A brief states requiredness as `required`; the builders' servers decide their required
 * set as `fields.filter(f => f.type !== 'select' && !f.optional)` (`pilot/frameworks.mjs`),
 * so they read `optional` instead. Passing a brief's fields through unchanged makes every
 * non-select field server-required whatever the brief says, and a brief that marks a field
 * optional then renders a form that agrees with it while the server rejects the same POST
 * with 422 - tr-27 was measured failing exactly that way.
 */
export function builderFields(fields) {
  return fields.map((field) => ({ ...field, optional: field.required === false }));
}

/** The field names a server will demand: every non-select field the brief does not mark optional. */
export function serverRequiredFieldNames(fields) {
  return fields.filter((field) => field.type !== 'select' && field.required === true).map((field) => field.name);
}

/**
 * Validate one brief's authored schema. Returns findings rather than throwing, so a
 * caller can report every problem at once; `[]` means the brief is authorable.
 *
 * These are the checks that matter for the schema to be truthful rather than merely
 * well-formed:
 *   - a field must be renderable and nameable;
 *   - the journey must type into fields the brief actually declares, which is what
 *     makes it brief-faithful rather than the archetype's journey relabelled;
 *   - the journey must have an echoed field to assert on, or a project could pass its
 *     journey while showing nothing back.
 */
export function validateBriefSchema(row) {
  const findings = [];
  const at = (path, problem) => findings.push({ brief_id: row.brief_id, at: path, problem });

  const fields = row.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    at('fields', 'must be a non-empty array - a brief without fields cannot be rendered brief-faithfully');
    return findings;
  }

  const seen = new Set();
  fields.forEach((field, index) => {
    const where = `fields[${index}]`;
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      at(where, 'must be an object');
      return;
    }
    for (const key of Object.keys(field)) {
      if (!BRIEF_FIELD_KEYS.has(key)) at(`${where}.${key}`, 'is not a field property this format defines');
    }
    for (const key of ['slug', 'name', 'type', 'label']) {
      if (!isString(field[key])) at(`${where}.${key}`, 'must be a non-empty string');
    }
    if (!isBool(field.required)) at(`${where}.required`, 'must be true or false, stated rather than implied by absence');
    // `optional` is a second way to say the same thing, and the server reads it
    // (`fields.filter(f => !f.optional)`), so a field that says required:true and optional:true
    // would put the form and the server's validation in direct disagreement.
    if (field.optional !== undefined && field.optional !== (field.required === false)) {
      at(`${where}.optional`, `contradicts required:${field.required}; state one of them`);
    }
    if (isString(field.type) && !BRIEF_FIELD_TYPES.has(field.type)) {
      at(`${where}.type`, `'${field.type}' has no renderer; use one of ${[...BRIEF_FIELD_TYPES].join(', ')}`);
    }
    if (isString(field.name) && seen.has(field.name)) at(`${where}.name`, `'${field.name}' is declared twice`);
    if (isString(field.name)) seen.add(field.name);
    if (isString(field.name) && field.name !== '' && (UNSAFE_FIELD_NAME.test(field.name) || hasUnpairedSurrogate(field.name))) {
      at(
        `${where}.name`,
        `'${field.name}' cannot be written into the form and read back unchanged - the builders interpolate the name into the HTML raw, so a name containing " & \\ a control character (NUL, form feed, newline) or an unpaired surrogate resolves to a different field than the journey names, or to none at all, and the server's required list disagrees with the key the browser submits. Measured in Chrome: spaces, apostrophes, <, =, ., $, DEL and valid non-ASCII names (including emoji) are all safe and remain allowed`,
      );
    }
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || field.options.length < 2) {
        at(`${where}.options`, 'a select must offer at least two options');
      } else if (field.options.some((option) => !isString(option))) {
        at(`${where}.options`, 'every option must be a non-empty string');
      }
    } else if (field.options !== undefined) {
      at(`${where}.options`, 'options are only meaningful on a select');
    }
  });

  const journey = row.journey;
  if (!journey || typeof journey !== 'object' || Array.isArray(journey)) {
    at('journey', 'must be an object - the brief must state the journey its user takes');
    return findings;
  }
  for (const key of Object.keys(journey)) {
    if (!['startPath', 'formSelector', 'fill', 'select', 'steps', 'expectText'].includes(key)) {
      at(`journey.${key}`, 'is not a journey property this format defines');
    }
  }

  // Pages visited before the form page, for a flow that spans more than one page. Validated with the
  // same rules as the main page: a step that types into or chooses a control the brief does not
  // declare is the same defect as the main journey doing it, and would produce a flow that looks
  // like the brief's while exercising another page's form.
  if (journey.steps !== undefined) {
    if (!Array.isArray(journey.steps)) {
      at('journey.steps', 'must be an array of steps');
    } else {
      journey.steps.forEach((step, index) => {
        const where = `journey.steps[${index}]`;
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
          at(where, 'must be an object');
          return;
        }
        for (const key of Object.keys(step)) {
          if (!['path', 'fill', 'select', 'submit'].includes(key)) at(`${where}.${key}`, 'is not a step property this format defines');
        }
        if (!isString(step.path) || !step.path.startsWith('/')) at(`${where}.path`, 'must be an absolute path starting with /');
        if (step.submit !== undefined && !isString(step.submit)) at(`${where}.submit`, 'must be a selector string');
        const names = new Set(fields.filter((f) => isString(f.name)).map((f) => f.name));
        for (const [selector, value] of Object.entries(step.fill ?? {})) {
          const name = completeSelectorFieldName(selector);
          if (!name) at(`${where}.fill['${selector}']`, "must be one complete selector of the form 'input[name=q]'");
          else if (!names.has(name)) at(`${where}.fill['${selector}']`, `types into '${name}', which this brief does not declare`);
          if (!isString(String(value))) at(`${where}.fill['${selector}']`, 'must be a non-empty value');
        }
        for (const [selector, option] of Object.entries(step.select ?? {})) {
          const name = completeSelectorFieldName(selector);
          const field = name ? fields.find((candidate) => candidate.name === name && candidate.type === 'select') : undefined;
          if (!field) at(`${where}.select['${selector}']`, "does not address a select this brief declares with one complete selector");
          else if (!(field.options ?? []).includes(option)) {
            at(`${where}.select['${selector}']`, `option '${option}' is not one of ${JSON.stringify(field.options)}`);
          }
        }
      });
    }
  }
  if (!isString(journey.startPath) || !journey.startPath.startsWith('/')) {
    at('journey.startPath', 'must be an absolute path starting with /');
  }
  if (!isString(journey.formSelector) || !journey.formSelector.startsWith('form#')) {
    at('journey.formSelector', "must be a 'form#<id>' selector; the builder derives the form id from it");
  }
  if (!isString(journey.expectText)) {
    at('journey.expectText', 'must be a non-empty string - the journey must assert what it sees');
  }
  const fill = journey.fill;
  if (!fill || typeof fill !== 'object' || Array.isArray(fill) || Object.keys(fill).length === 0) {
    at('journey.fill', 'must be a non-empty map of selector -> value');
  } else {
    const names = new Set(fields.filter((f) => isString(f.name)).map((f) => f.name));
    for (const [selector, value] of Object.entries(fill)) {
      const name = completeSelectorFieldName(selector);
      if (!name) {
        at(
          `journey.fill['${selector}']`,
          "must be one complete selector of the form 'input[name=email]' - the browser resolves the whole string, so a compound selector could name one field to this check and drive another",
        );
      } else if (!names.has(name)) {
        at(`journey.fill['${selector}']`, `types into '${name}', which this brief does not declare - the journey is not this brief's`);
      }
      if (!isString(String(value))) at(`journey.fill['${selector}']`, 'must be a non-empty value');
    }
  }

  const echoed = echoFieldFor(fields);
  if (!echoed) {
    at('fields', 'no field can echo the record back (need a text or textarea field, or one marked echoed)');
  } else if (isString(journey.expectText)) {
    // The harness waits for the echoed value to appear on the read page, so the value
    // the journey types into the echoed field is what it will look for.
    const echoedName = fields.find((f) => f.slug === echoed)?.name;
    const typed = Object.entries(fill ?? {})
      .filter(([selector]) => completeSelectorFieldName(selector) === echoedName)
      .map(([, value]) => value);
    if (typed.length === 0) {
      at('journey.fill', `must type into the echoed field '${echoedName}' (echo.source defaults to the record page)`);
    } else if (!typed.some((value) => String(value) === journey.expectText)) {
      at('journey.expectText', `must be the value typed into the echoed field ('${typed[0]}'), which is what the read page shows`);
    }
  }

  // Every field the server will demand must be one the journey fills. This is the check that
  // would have caught tr-27 before a browser run: the brief marked `phone` optional, the journey
  // did not fill it, and the server demanded it anyway - the pair was then rejected as
  // `original-not-runnable` with nothing to say the brief was self-contradictory.
  if (fill && typeof fill === 'object' && !Array.isArray(fill)) {
    const filled = new Set(Object.keys(fill).map(completeSelectorFieldName).filter(Boolean));
    for (const name of serverRequiredFieldNames(fields)) {
      if (!filled.has(name)) {
        at('journey.fill', `does not fill '${name}', which its own fields mark required - the server will reject the submission`);
      }
    }
  }

  // A select cannot be typed into, so it needs its own instruction. Requiring every required select
  // to be driven is what lets the corpus say the journey exercises the form rather than only that the
  // control renders: leaving one alone leaves it on its default option, so the value that reaches the
  // server is the markup's, not the brief's.
  const selects = fields.filter((field) => isString(field.name) && field.type === 'select');
  const chosen = journey.select;
  if (chosen !== undefined && (typeof chosen !== 'object' || chosen === null || Array.isArray(chosen))) {
    at('journey.select', 'must be a map of selector -> option');
  } else {
    for (const [selector, option] of Object.entries(chosen ?? {})) {
      const name = completeSelectorFieldName(selector);
      const field = name ? selects.find((candidate) => candidate.name === name) : undefined;
      if (!field) {
        at(`journey.select['${selector}']`, `does not address a select this brief declares (${selects.map((s) => s.name).join(', ') || 'none'})`);
        continue;
      }
      if (!Array.isArray(field.options) || !field.options.includes(option)) {
        at(`journey.select['${selector}']`, `option '${option}' is not one of ${JSON.stringify(field.options)}`);
      } else if (field.options[0] === option) {
        at(`journey.select['${selector}']`, `selects '${option}', the first option, which is what an untouched select already submits - choose one that moves it`);
      }
    }
    for (const field of selects.filter((candidate) => candidate.required === true)) {
      const driven = Object.keys(chosen ?? {}).some((selector) => completeSelectorFieldName(selector) === field.name);
      if (!driven) {
        at('journey.select', `does not choose '${field.name}', which its own fields mark required - the select would submit its first option`);
      }
    }
  }

  return findings;
}

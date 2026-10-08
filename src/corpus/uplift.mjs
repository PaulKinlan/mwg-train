/**
 * The pilot's deterministic MWG uplift tool.
 *
 * This is the A2/C3 control implementation: the same rule bundle applied the same way every time, so
 * a pair's improvement is attributable to the rule rather than to a model's mood. It is a *patching*
 * tool with a narrow contract (design brief section 5): it may add attributes and markup, add CSS,
 * and replace unsafe insertion patterns — it must not restructure the project, rewrite the routes, or
 * change the product's copy.
 *
 * Two properties matter more than breadth here:
 *
 *  1. Every transform is declared with the MWG guide id it implements, and the browser check for
 *     that id is in rules.mjs. A transform that cannot be observed to work is not evidence.
 *  2. Edits are dialect-aware. `autocomplete` is `autoComplete` in JSX; a transform that emitted the
 *     HTML spelling into React would render an attribute React ignores, and the check would fail
 *     for a reason that has nothing to do with the rule. Scoring the observed property is what makes
 *     the comparison across frameworks fair (and it is how the tool finds that out).
 *
 * The tool reports the rules it applied and the exact edits it made; anything it could not do is
 * reported as `skipped` with a reason, so a rejected pair can be inspected rather than guessed at.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const DIALECT_ATTRS = {
  html: { autocomplete: 'autocomplete', required: 'required', ariaErrorMessage: 'aria-errormessage', ariaDescribedBy: 'aria-describedby', ariaInvalid: 'aria-invalid', fetchpriority: 'fetchpriority' },
  jsx: { autocomplete: 'autoComplete', required: 'required', ariaErrorMessage: 'aria-errormessage', ariaDescribedBy: 'aria-describedby', ariaInvalid: 'aria-invalid', fetchpriority: 'fetchPriority' },
  vue: { autocomplete: 'autocomplete', required: 'required', ariaErrorMessage: 'aria-errormessage', ariaDescribedBy: 'aria-describedby', ariaInvalid: 'aria-invalid', fetchpriority: 'fetchpriority' },
  preact: { autocomplete: 'autocomplete', required: 'required', ariaErrorMessage: 'aria-errormessage', ariaDescribedBy: 'aria-describedby', ariaInvalid: 'aria-invalid', fetchpriority: 'fetchpriority' },
};

/** An in-memory view of a project directory: every edit is textual and recorded. */
export class ProjectFiles {
  constructor(root) {
    this.root = root;
    this.files = new Map();
    this.edits = [];
    for (const path of walk(root)) this.files.set(relative(root, path), readFileSync(path, 'utf8'));
  }

  get(path) {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`uplift: ${path} does not exist in ${this.root}`);
    return value;
  }

  has(path) {
    return this.files.has(path);
  }

  /** Replace text in a file and record the edit as a rule attribution. */
  replace(path, rule, pattern, replacement, { required = true } = {}) {
    const before = this.files.get(path);
    if (before === undefined) {
      if (required) throw new Error(`uplift: cannot apply ${rule}: ${path} is missing`);
      return false;
    }
    const after = before.replace(pattern, replacement);
    if (after === before) {
      if (required) throw new Error(`uplift: ${rule} made no change in ${path}`);
      return false;
    }
    this.files.set(path, after);
    this.edits.push({ rule, file: path, kind: 'replace' });
    return true;
  }

  /** Add an attribute to every element matching a tag+name pattern, if not already present. */
  addAttribute(path, rule, { match, attr, value = null, dialect = 'html' }) {
    const attrs = DIALECT_ATTRS[dialect] ?? DIALECT_ATTRS.html;
    const attributeName = attrs[attr] ?? attr;
    const before = this.files.get(path) ?? '';
    let changed = 0;
    const pattern = new RegExp(match, 'g');
    const after = before.replace(pattern, (element) => {
      if (new RegExp(`\\s${attributeName}(=|\\s|>)`).test(element)) return element;
      changed += 1;
      const close = element.endsWith('/>') ? '/>' : '>';
      const body = element.slice(0, element.length - close.length);
      return `${body}${body.endsWith(' ') ? '' : ' '}${attributeName}${value === null ? '' : `="${value}"`}${close}`;
    });
    if (changed === 0) return false;
    this.files.set(path, after);
    this.edits.push({ rule, file: path, kind: 'attribute', attribute: attributeName, elements: changed });
    return true;
  }

  write(path, content) {
    this.files.set(path, content);
  }

  writeAll(outDir) {
    for (const [path, content] of this.files) {
      const target = join(outDir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
}

function walk(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (statSync(path).isFile()) out.push(path);
    }
  };
  visit(root);
  return out.sort();
}

/** The error-message block: a non-colour indicator plus text, in the markup dialect being edited. */
const errorMarkup = (slug, dialect) => {
  const cls = dialect === 'react' ? 'className' : 'class';
  return `      <p id="${slug}-error" ${cls}="error-msg" hidden><span aria-hidden="true">✕</span> This field is required.</p>
`;
};

const errorStyles = `
/* MWG forms/required-field-feedback: a required field reports only after interaction, and never by
   colour alone. :user-invalid is what separates "empty" from "the user left it empty". */
.field { display: grid; gap: 0.25rem; }
.error-msg { display: none; color: #b3261e; font-size: 0.875rem; margin: 0; }
input:user-invalid { border-color: #b3261e; background-color: #fdecea; }
input:user-invalid + .error-msg, input:user-invalid ~ .error-msg { display: block; }
input:user-invalid ~ .error-msg[hidden] { display: block; }
`;

const a11yScript = `
/* MWG accessibility/accessible-error-announcement: an assertive live region that carries the error
   text while the field is invalid, and aria-invalid kept in step so the state is not colour-only. */
function messages(form) {
  return [...form.querySelectorAll('input, select, textarea')]
    .filter((field) => field.matches(':user-invalid') && field.getAttribute('aria-errormessage'))
    .map((field) => document.getElementById(field.getAttribute('aria-errormessage'))?.textContent?.trim() ?? '')
    .filter(Boolean);
}
function announce() {
  const region = document.querySelector('[data-form-status]');
  if (!region) return;
  region.textContent = messages(region.closest('form') ?? document).join(' ');
}
function syncValidity(field) {
  if (field.matches(':user-invalid')) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  announce();
}
for (const field of document.querySelectorAll('input[required], select[required], textarea[required]')) {
  for (const event of ['blur', 'input', 'change']) field.addEventListener(event, () => syncValidity(field));
  const form = field.form;
  if (form) form.addEventListener('submit', () => syncValidity(field));
}
`;
const safeInsertScript = (dialect) => `
/* MWG security/sanitize-untrusted-html: user-supplied markup is parsed as inert text rather than
   inserted as live HTML. The Sanitizer API is the platform answer; where it is unavailable the
   fallback is textContent, which cannot execute. */
function insertContent(container, untrusted) {
  // TODO(baseline/element.sethtml): drop the textContent fallback and call setHTML directly.
  if (typeof container.setHTML === 'function') {
    container.setHTML(untrusted);
    return;
  }
  container.textContent = untrusted;
}
`;

/**
 * The rule bundle. Each entry declares the guide id it implements, the files it touches, and how to
 * recognise whether a project already satisfies it (so an already-good original is left alone rather
 * than cosmetically changed).
 */
export const TRANSFORMS = [
  {
    rule: 'forms/required-field-feedback',
    apply(files, spec) {
      const dialect = spec.framework.dialect;
      const target = spec.framework.markupFile;
      const edits = [];
      for (const field of spec.primaryFields) {
        edits.push(files.addAttribute(target, 'forms/required-field-feedback', { match: field.elementPattern, attr: 'required', dialect }));
        edits.push(files.addAttribute(target, 'forms/required-field-feedback', { match: field.elementPattern, attr: 'ariaErrorMessage', value: `${field.slug}-error`, dialect }));
      }
      const styles = files.get(spec.framework.stylesFile);
      if (!styles.includes(':user-invalid')) {
        files.write(spec.framework.stylesFile, `${styles}\n${errorStyles}`);
        files.edits.push({ rule: 'forms/required-field-feedback', file: spec.framework.stylesFile, kind: 'append-css' });
      }
      // The error text has to exist in the DOM for the input to be able to reference it.
      let markup = files.get(target);
      let inserted = 0;
      for (const field of spec.primaryFields) {
        // Guard on the element id, not on the string "name-error": the aria-errormessage attribute
        // added two lines above contains that very string, so the first version concluded its own
        // attribute edit was an error block and inserted none.
        if (!markup.includes(`id="${field.slug}-error"`)) {
          // `elementPatternFirst` is a regex *source*; passing it to String.replace made it a literal
          // and silently inserted nothing, so the attribute pointed at an element that did not exist.
          const pattern = new RegExp(field.elementPatternFirst);
          if (!pattern.test(markup)) continue;
          markup = markup.replace(pattern, (element) => `${element}\n${errorMarkup(field.slug, dialect)}`);
          inserted += 1;
        }
      }
      files.write(target, markup);
      if (inserted > 0) files.edits.push({ rule: 'forms/required-field-feedback', file: target, kind: 'insert-markup', blocks: inserted });
      return edits.some(Boolean) || inserted > 0 ? 'applied' : 'skipped: already present';
    },
  },
  {
    rule: 'forms/validate-input-after-interaction',
    apply(files, spec) {
      // No structural edit: the rule is satisfied by *not* styling :invalid eagerly. The uploaded
      // form is checked for `:invalid` styling and, if found, that is a defect the tool fixes by
      // removing the eager selector.
      const styles = files.get(spec.framework.stylesFile);
      // `(^|[^:a-z-])` was meant to leave `:user-invalid` alone, but the character before `:invalid`
      // in a real selector is the element name (`input:invalid`), so the pattern matched only prose in
      // comments and left every rule line eager. A negative lookbehind says what was meant.
      const eager = /(?<!user-):invalid\b/;
      if (!eager.test(styles)) return 'skipped: no eager :invalid styling';
      const fixed = styles.replace(/(?<!user-):invalid\b/g, ':user-invalid');
      files.write(spec.framework.stylesFile, fixed);
      files.edits.push({ rule: 'forms/validate-input-after-interaction', file: spec.framework.stylesFile, kind: 'replace-selector' });
      return 'applied';
    },
  },
  {
    rule: 'accessibility/accessible-error-announcement',
    apply(files, spec) {
      const script = spec.framework.enhanceFile;
      const current = files.get(script);
      if (current.includes('syncValidity')) return 'skipped: already present';
      files.write(script, `${current}\n${a11yScript}`);
      files.edits.push({ rule: 'accessibility/accessible-error-announcement', file: script, kind: 'append-js' });
      // A live region has to exist for the failure text to be announced as it appears.
      const target = spec.framework.markupFile;
      if (!files.get(target).includes('role="alert"')) {
        const cls = spec.framework.dialect === 'react' ? 'className' : 'class';
        // A string pattern is a literal pattern: this one silently matched nothing and recorded no
        // edit, so the live region the rule checks for was never inserted.
        files.replace(target, 'accessibility/accessible-error-announcement', new RegExp('<form[^>]*>'), `$&
      <div role="alert" aria-live="assertive" ${cls}="form-status" data-form-status></div>`, { required: false });
      }
      return 'applied';
    },
  },
  {
    rule: 'forms/autofill-sign-up-form',
    apply(files, spec) {
      const dialect = spec.framework.dialect;
      const target = spec.framework.markupFile;
      let changed = false;
      changed = files.addAttribute(target, 'forms/autofill-sign-up-form', { match: spec.autofill.usernamePattern ?? '(<input[^>]*type="email"[^>]*>)', attr: 'autocomplete', value: 'username', dialect }) || changed;
      changed = files.addAttribute(target, 'forms/autofill-sign-up-form', { match: spec.autofill.passwordPattern ?? '(<input[^>]*type="password"[^>]*>)', attr: 'autocomplete', value: 'new-password', dialect }) || changed;
      return changed ? 'applied' : 'skipped: already present';
    },
  },
  {
    rule: 'forms/autofill-address-form',
    apply(files, spec) {
      const dialect = spec.framework.dialect;
      const target = spec.framework.markupFile;
      let changed = false;
      changed = files.addAttribute(target, 'forms/autofill-address-form', { match: spec.autofill.streetPattern, attr: 'autocomplete', value: 'street-address', dialect }) || changed;
      changed = files.addAttribute(target, 'forms/autofill-address-form', { match: spec.autofill.postcodePattern, attr: 'autocomplete', value: 'postal-code', dialect }) || changed;
      return changed ? 'applied' : 'skipped: already present';
    },
  },
  {
    rule: 'security/sanitize-untrusted-html',
    apply(files, spec) {
      const script = spec.framework.enhanceFile;
      const current = files.get(script);
      if (current.includes('insertContent')) return 'skipped: already present';
      // Only a literal `.innerHTML = <expr>;` is rewritten, and only into the helper: the tool must not
      // restructure the surrounding code, or the pair stops being a local fix.
      const unsafe = /([A-Za-z_$][\w$.\[\]]*)\.innerHTML\s*=\s*([^;]+);/g;
      const matches = [...current.matchAll(unsafe)];
      if (matches.length === 0) return 'skipped: no innerHTML insertion';
      const fixed = current.replace(unsafe, 'insertContent($1, $2);');
      files.write(script, `${fixed}\n${safeInsertScript(spec.framework.dialect)}`);
      files.edits.push({ rule: 'security/sanitize-untrusted-html', file: script, kind: 'replace-insertion', sites: matches.length });
      return 'applied';
    },
  },
];

export function upliftProject(root, spec, outDir) {
  const files = new ProjectFiles(root);
  const applied = [];
  const skipped = [];
  const failed = [];
  for (const transform of TRANSFORMS) {
    try {
      const result = transform.apply(files, spec);
      if (result === 'applied') applied.push(transform.rule);
      else skipped.push({ rule: transform.rule, reason: result.replace(/^skipped: /, '') });
    } catch (error) {
      failed.push({ rule: transform.rule, reason: error.message });
    }
  }
  if (outDir) files.writeAll(outDir);
  return {
    applied,
    skipped,
    failed,
    edits: files.edits,
    rule_ids: applied,
    changed_files: [...new Set(files.edits.map((edit) => edit.file))],
  };
}

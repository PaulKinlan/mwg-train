/**
 * The pilot's fixed measurement vector.
 *
 * Design brief section 7: "score uplift on a fixed vector rather than an opaque quality score ...
 * never grant points merely for using a named API". Every rule below therefore has two halves:
 *
 *   - `transform` (in uplift.mjs) is how the pilot's deterministic tool *attempts* the rule, and
 *   - `check` (here) is what is *observed in a real browser*, on the rendered page, after the
 *     journey has been driven.
 *
 * The check never looks for a framework idiom or a named API call. It asserts the property a user or
 * a screen reader would get: is the error text exposed and associated, does the field carry the
 * autofill hint the browser needs, does submitting markup execute script. That is what stops the
 * React arm winning by construction over the raw-platform arm.
 *
 * Rule ids are real ids from the pinned Modern Web Guidance snapshot (docs/eval/rules.json), so a
 * brief that names one can be validated against the vocabulary it came from.
 */
export const MWG_SNAPSHOT = '2026_09_04-7de96777';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helpers shared by checks, as an *expression* rather than a statement block.
 *
 * The first version was a block containing `if (!el) return null;`, which returned from the enclosing
 * evaluate wrapper and left every rule inspecting `undefined` - so a page that plainly had the field
 * was reported as having none. An expression that evaluates to the facts cannot do that.
 */
const fieldBySelector = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  return {
    tag: el.tagName,
    type: el.type ?? null,
    autocomplete: el.getAttribute('autocomplete'),
    required: el.hasAttribute('required'),
    ariaInvalid: el.getAttribute('aria-invalid'),
    ariaErrorMessage: el.getAttribute('aria-errormessage'),
    ariaDescribedBy: el.getAttribute('aria-describedby'),
    describedText: (() => {
      const ids = (el.getAttribute('aria-describedby') ?? '').split(/\\s+/).filter(Boolean)
        .concat([el.getAttribute('aria-errormessage')].filter(Boolean));
      return ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
    })(),
    invalidMatches: el.matches(':invalid'),
    userInvalidMatches: el.matches(':user-invalid'),
  };
})()`;

export const RULES = Object.freeze({
  'forms/required-field-feedback': {
    title: 'Required fields report only after interaction, and not by colour alone',
    property: 'a required field that the user has left empty reports an error, associated in the DOM',
    async check(page, ctx) {
      const facts = await page.evaluate(`
        const field = ${fieldBySelector(ctx.primaryField)};
        return { field, stylesheet: [...document.styleSheets].flatMap((sheet) => {
          try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
        }).join('\\n') };
      `);
      const findings = [];
      if (!facts.field) return { rule: 'forms/required-field-feedback', status: 'ERROR', detail: 'no primary field found' };
      if (!facts.field.required) findings.push('the field is not marked required');
      if (!facts.field.ariaErrorMessage && !facts.field.ariaDescribedBy) findings.push('no aria-errormessage/aria-describedby linking the field to its error text');
      if (!/:[a-z-]*user-invalid|:[a-z-]*user-invalid\b/.test(facts.stylesheet)) findings.push('no :user-*invalid* styling, so the error state cannot be shown without JS');
      // The property, not the API: after an interaction that leaves the field empty, the error text
      // must be exposed. On a fresh page it must not be (that is the companion rule below).
      // Trusted input only: see Page.touchEmpty. The interaction is the observation.
      await page.touchEmpty(ctx.primaryField);
      await sleep(120);
      const after = await page.evaluate(`
        const el = document.querySelector(${JSON.stringify(ctx.primaryField)});
        const described = (() => {
          const ids = (el.getAttribute('aria-describedby') ?? '').split(/\\s+/).filter(Boolean)
            .concat([el.getAttribute('aria-errormessage')].filter(Boolean));
          return ids.map((id) => document.getElementById(id)).filter(Boolean);
        })();
        const visible = (node) => node && node.offsetParent !== null && node.textContent.trim() !== '';
        return {
          userInvalid: el.matches(':user-invalid'),
          describedVisible: described.some(visible),
          describedInlineStyle: described.map((node) => getComputedStyle(node).display),
        };
      `);
      if (!after.describedVisible) findings.push('after a failed interaction the error text is still not visible');
      return {
        rule: 'forms/required-field-feedback',
        status: findings.length === 0 ? 'PASS' : 'FAIL',
        detail: findings.join('; '),
        observed: { required: facts.field.required, userInvalid: after.userInvalid, describedVisible: after.describedVisible },
      };
    },
  },

  'accessibility/accessible-error-announcement': {
    title: 'Invalid state is exposed programmatically as it appears visually',
    property: 'aria-invalid tracks :user-invalid, so assistive tech and sighted users get the state at the same moment',
    async check(page, ctx) {
      const state = await page.evaluate(`
        return { field: ${fieldBySelector(ctx.primaryField)} };
      `);
      if (!state.field) return { rule: 'accessibility/accessible-error-announcement', status: 'ERROR', detail: 'no primary field found' };
      const findings = [];
      if (state.field.ariaInvalid !== null) findings.push('aria-invalid is present before any interaction, so an empty required field is announced as invalid on load');
      // A real user interaction: type, delete, tab away. Synthetic events do not set the browser's
      // "user interacted" flag, so this check could only ever have observed the eager :invalid styles.
      await page.touchEmpty(ctx.primaryField);
      await sleep(150);
      const after = await page.evaluate(`
        const el = document.querySelector(${JSON.stringify(ctx.primaryField)});
        return {
          userInvalid: el.matches(':user-invalid'),
          ariaInvalid: el.getAttribute('aria-invalid'),
          live: [...document.querySelectorAll('[role=alert],[aria-live]')].map((n) => ({
            role: n.getAttribute('role'), live: n.getAttribute('aria-live'), text: n.textContent.trim(), visible: n.offsetParent !== null,
          })),
        };
      `);
      if (after.userInvalid && after.ariaInvalid !== 'true') findings.push('the field is user-invalid but aria-invalid was not set, so the state exists only visually');
      if (!after.live.some((region) => region.visible && region.text !== '')) findings.push('no visible live region carries the error text');
      return {
        rule: 'accessibility/accessible-error-announcement',
        status: findings.length === 0 ? 'PASS' : 'FAIL',
        detail: findings.join('; '),
        observed: { userInvalid: after.userInvalid, ariaInvalid: after.ariaInvalid, liveRegions: after.live.length },
      };
    },
  },

  'forms/validate-input-after-interaction': {
    title: 'A fresh page shows no error state',
    property: 'on load, a required empty field is not already presented as invalid',
    async check(page, ctx) {
      // This is the regression the required-field rule can introduce: eager :invalid styling announces
      // errors before the user has done anything. The first version relied on being the first rule to
      // run, but another rule had already typed into the field by then, so it reported the uplift as a
      // regression on a page it had itself dirtied. A check that asserts "on load" reloads first.
      if (ctx.base && ctx.startPath) await page.goto(`${ctx.base}${ctx.startPath}`);
      const fresh = await page.evaluate(`
        const el = document.querySelector(${JSON.stringify(ctx.primaryField)});
        if (!el) return null;
        const described = (() => {
          const ids = (el.getAttribute('aria-describedby') ?? '').split(/\\s+/).filter(Boolean)
            .concat([el.getAttribute('aria-errormessage')].filter(Boolean));
          return ids.map((id) => document.getElementById(id)).filter(Boolean);
        })();
        return {
          invalid: el.matches(':invalid'),
          userInvalid: el.matches(':user-invalid'),
          ariaInvalid: el.getAttribute('aria-invalid'),
          errorVisible: described.some((node) => node.offsetParent !== null && node.textContent.trim() !== ''),
          // The join separator is double-escaped because this source is itself inside a template
          // literal sent to the browser; a single one arrives as a real newline and is a syntax error.
          stylesheet: [...document.styleSheets].flatMap((sheet) => {
            try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
          }).join('\\n'),
        };
      `);
      if (!fresh) return { rule: 'forms/validate-input-after-interaction', status: 'ERROR', detail: 'no primary field found' };
      const findings = [];
      if (fresh.userInvalid) findings.push('the field already matches :user-invalid before any interaction');
      if (fresh.ariaInvalid === 'true') findings.push('aria-invalid is already true on load');
      if (fresh.errorVisible) findings.push('error text is visible on load');
      // An empty required field is `:invalid` from the moment it is parsed, so a rule that styles
      // `:invalid` reports "you got this wrong" before the user has typed anything. That was the whole
      // seeded defect, and checking only the referenced error text let it pass unnoticed.
      if (fresh.stylesheet && /(?<!user-):invalid\b/.test(fresh.stylesheet)) {
        findings.push('the stylesheet styles :invalid, so an untouched field is presented as wrong');
      }
      return {
        rule: 'forms/validate-input-after-interaction',
        status: findings.length === 0 ? 'PASS' : 'FAIL',
        detail: findings.join('; '),
        observed: fresh,
      };
    },
  },

  'forms/autofill-sign-up-form': {
    title: 'Sign-in/sign-up fields carry the autofill tokens the browser needs',
    property: 'the username field with a password field next to it is autofillable from a password manager',
    async check(page, ctx) {
      const facts = await page.evaluate(`
        const pick = (s) => document.querySelector(s);
        const read = (el) => el ? { name: el.name, type: el.type, autocomplete: el.getAttribute('autocomplete') } : null;
        return {
          username: read(pick(${JSON.stringify(ctx.usernameField ?? 'input[type=email],input[name=email]')})),
          password: read(pick(${JSON.stringify(ctx.passwordField ?? "input[type=password]")})),
        };
      `);
      const findings = [];
      if (!facts.username) findings.push('no username/email field found');
      else if (facts.username.autocomplete !== 'username') findings.push(`username field has autocomplete='${facts.username.autocomplete}', expected 'username'`);
      if (facts.password && facts.password.autocomplete !== 'new-password' && facts.password.autocomplete !== 'current-password') {
        findings.push(`password field has autocomplete='${facts.password.autocomplete}', expected 'new-password' or 'current-password'`);
      }
      return {
        rule: 'forms/autofill-sign-up-form',
        status: findings.length === 0 ? 'PASS' : 'FAIL',
        detail: findings.join('; '),
        observed: facts,
      };
    },
  },

  'forms/autofill-address-form': {
    title: 'Address fields carry the autofill tokens the browser needs',
    property: 'a delivery/contact address block is autofillable as a unit',
    async check(page, ctx) {
      const facts = await page.evaluate(`
        // An absent element reads as undefined and a missing attribute as null: different facts, and
        // conflating them marked a token-less address block as "not applicable".
        const read = (sel) => { const el = document.querySelector(sel); return el ? el.getAttribute('autocomplete') : undefined; };
        return { street: read(${JSON.stringify(ctx.addressField)}), postcode: read(${JSON.stringify(ctx.postcodeField)}) };
      `);
      const findings = [];
      if (facts.street === undefined && facts.postcode === undefined) {
        // Not an address form at all: the rule has nothing to measure here, and failing it would credit
        // the uplift for adding a field the project never asked the user for.
        return { rule: 'forms/autofill-address-form', status: 'NOT_APPLICABLE', detail: 'this project has no address block', observed: facts };
      }
      if (facts.street !== 'street-address') findings.push(`street field has autocomplete='${facts.street}', expected 'street-address'`);
      if (facts.postcode !== 'postal-code') findings.push(`postcode field has autocomplete='${facts.postcode}', expected 'postal-code'`);
      return { rule: 'forms/autofill-address-form', status: findings.length === 0 ? 'PASS' : 'FAIL', detail: findings.join('; '), observed: facts };
    },
  },

  'security/sanitize-untrusted-html': {
    title: 'User-supplied markup is not inserted as live HTML',
    property: 'submitting markup as content renders it as text and executes nothing',
    async check(page, ctx) {
      const payload = '<img src=x onerror="window.__mwg_xss = true">';
      const submitted = await ctx.journey.submitContent(payload);
      if (!submitted) return { rule: 'security/sanitize-untrusted-html', status: 'ERROR', detail: 'the content journey could not be driven' };
      await sleep(200);
      const observed = await page.evaluate(`
        return {
          executed: window.__mwg_xss === true,
          liveElements: document.querySelectorAll('img[onerror], script, iframe').length,
          bodyHasPayloadText: document.body.innerText.includes('<img'),
        };
      `);
      const findings = [];
      if (observed.executed) findings.push('the submitted markup executed: an inline event handler ran');
      return {
        rule: 'security/sanitize-untrusted-html',
        status: findings.length === 0 ? 'PASS' : 'FAIL',
        detail: findings.join('; '),
        observed,
      };
    },
  },
});

/**
 * Security checks that are not MWG rules but are part of acceptance: a pair is rejected for a new
 * high-severity issue regardless of which rule was improved. This is the brief's gate, not a rule.
 */
export const SECURITY_CHECKS = Object.freeze({
  'session-cookie-attributes': {
    title: 'The session cookie is HttpOnly, Secure and SameSite',
    async check(page) {
      const cookies = (await page.cookies()).filter((cookie) => cookie.session || /session|sid|auth/i.test(cookie.name));
      if (cookies.length === 0) return { check: 'session-cookie-attributes', status: 'ERROR', detail: 'no session cookie was set by the journey' };
      const findings = [];
      for (const cookie of cookies) {
        if (!cookie.httpOnly) findings.push(`${cookie.name} is not HttpOnly`);
        if (!cookie.secure) findings.push(`${cookie.name} is not Secure`);
        if (!cookie.sameSite || cookie.sameSite === 'None') findings.push(`${cookie.name} has SameSite=${cookie.sameSite ?? '(unset)'}`);
      }
      return { check: 'session-cookie-attributes', status: findings.length === 0 ? 'PASS' : 'FAIL', detail: findings.join('; '), observed: cookies.map((c) => ({ name: c.name, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite })) };
    },
  },
  'form-token-exposure': {
    title: 'No credential or token appears in the page or its URLs',
    async check(page, ctx) {
      const leak = await page.evaluate(`
        const text = document.documentElement.innerHTML;
        const patterns = [/sk-[A-Za-z0-9]{16,}/, /BEGIN [A-Z ]*PRIVATE KEY/, /password\\s*[:=]\\s*['"][^'"]{6,}['"]/i];
        return { matched: patterns.filter((p) => p.test(text)).map((p) => String(p)), url: location.href };
      `);
      const findings = [];
      if (leak.matched.length > 0) findings.push(`page content matches ${leak.matched.join(', ')}`);
      if (/[?&](password|token|secret)=/.test(leak.url)) findings.push('a credential-looking parameter is in the URL');
      return { check: 'form-token-exposure', status: findings.length === 0 ? 'PASS' : 'FAIL', detail: findings.join('; '), observed: leak };
    },
  },
});

export const MWG_RULE_IDS = Object.freeze(Object.keys(RULES));
export const SECURITY_CHECK_IDS = Object.freeze(Object.keys(SECURITY_CHECKS));
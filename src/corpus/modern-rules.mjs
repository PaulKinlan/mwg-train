/* Optional browser diagnostics. These are observations, not preregistered acceptance gates.
 * An absent feature is NOT_APPLICABLE; an unexercised feature is ERROR, never PASS.
 * The guide IDs resolve in docs/eval/rules.json. */

const verdict = (rule, status, detail, observed = {}) => ({ rule, status, detail, observed });

export const MODERN_RULES = Object.freeze({
  'ui-behaviors/platform-controls-dismiss-dialog': {
    title: 'A modal dialog opens with native modality and an accessible name',
    property: 'an invoked modal enters the top layer and has a programmatic name',
    async check(page) {
      const rule = 'ui-behaviors/platform-controls-dismiss-dialog';
      const initial = await page.evaluate(`
        const dialog = document.querySelector('dialog');
        if (!dialog) return null;
        const trigger = dialog.id && [...document.querySelectorAll('button[commandfor]')]
          .find((button) => button.getAttribute('commandfor') === dialog.id && button.getAttribute('command') === 'show-modal');
        return { id: dialog.id, open: dialog.open, modal: dialog.matches(':modal'), trigger: trigger?.outerHTML ?? null };
      `);
      if (!initial) return verdict(rule, 'NOT_APPLICABLE', 'no dialog is present');
      if (!initial.modal && !initial.trigger) return verdict(rule, 'ERROR', 'dialog is not modal and no declarative show-modal trigger can be driven');
      if (!initial.modal) {
        // The selector is derived from the observed ID, never from untrusted markup interpolated as code.
        await page.click(`button[commandfor=${JSON.stringify(initial.id)}][command="show-modal"]`);
      }
      const result = await page.evaluate(`
        const dialog = document.querySelector('dialog');
        if (!dialog) return null;
        const labelledBy = dialog.getAttribute('aria-labelledby');
        const name = dialog.getAttribute('aria-label')?.trim() ||
          (labelledBy ? labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim() : '');
        return { modal: dialog.matches(':modal'), name, open: dialog.open };
      `);
      if (result?.modal) await page.realKey('Escape');
      const dismissed = result?.modal ? await page.evaluate(`return !document.querySelector('dialog')?.open`) : false;
      return verdict(rule, result?.modal && result.name && dismissed ? 'PASS' : 'FAIL',
        !result?.modal ? 'the invoked dialog did not become modal' : !result.name ? 'modal dialog has no programmatic name' : !dismissed ? 'Escape did not dismiss the modal dialog' : 'named modal dialog opened and dismissed',
        { ...result, dismissed });
    },
  },
  'ui-behaviors/declarative-dialog-popover-control': {
    title: 'A declarative popover opens and light-dismisses',
    property: 'its own invoker opens the top-layer popover and Escape dismisses it',
    async check(page) {
      const rule = 'ui-behaviors/declarative-dialog-popover-control';
      const initial = await page.evaluate(`
        const popover = document.querySelector('[popover]');
        if (!popover) return null;
        const trigger = popover.id && [...document.querySelectorAll('button[popovertarget]')]
          .find((button) => button.getAttribute('popovertarget') === popover.id);
        return { id: popover.id, kind: popover.getAttribute('popover') || 'auto', trigger: Boolean(trigger) };
      `);
      if (!initial) return verdict(rule, 'NOT_APPLICABLE', 'no popover is present');
      if (!initial.trigger || initial.kind === 'manual') return verdict(rule, 'ERROR', 'no declarative auto-popover trigger was available to drive', initial);
      await page.click(`button[popovertarget=${JSON.stringify(initial.id)}]`);
      const opened = await page.evaluate(`return document.getElementById(${JSON.stringify(initial.id)})?.matches(':popover-open') ?? false`);
      if (opened) await page.realKey('Escape');
      const dismissed = await page.evaluate(`return !document.getElementById(${JSON.stringify(initial.id)})?.matches(':popover-open')`);
      return verdict(rule, opened && dismissed ? 'PASS' : 'FAIL',
        !opened ? 'invoker did not open the popover' : !dismissed ? 'Escape did not dismiss the auto popover' : 'popover opened and dismissed',
        { opened, dismissed });
    },
  },
  'css/size-aware-styling': {
    title: 'A container query visibly responds to container size',
    property: 'changing the component container width changes a descendant declaration',
    async check(page) {
      const rule = 'css/size-aware-styling';
      const result = await page.evaluate(`
        const queries = [];
        const walk = (rules) => { for (const entry of rules) {
          if (entry.constructor.name === 'CSSContainerRule') queries.push(entry);
          if (entry.cssRules) walk(entry.cssRules);
        } };
        for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
        if (!queries.length) return { present: false };
        for (const query of queries) for (const child of query.cssRules) {
          if (!child.selectorText || !child.style?.length) continue;
          let target;
          try { target = document.querySelector(child.selectorText); } catch { continue; }
          if (!target) continue;
          let container = target.parentElement;
          while (container && !['inline-size','size'].includes(getComputedStyle(container).containerType)) container = container.parentElement;
          if (!container) continue;
          const prop = child.style[0];
          const previous = container.style.inlineSize;
          try {
            container.style.inlineSize = '240px';
            const small = getComputedStyle(target).getPropertyValue(prop);
            container.style.inlineSize = '900px';
            const large = getComputedStyle(target).getPropertyValue(prop);
            return { present: true, driven: true, prop, small, large, changed: small !== large };
          } finally { container.style.inlineSize = previous; }
        }
        return { present: true, driven: false };
      `);
      if (!result.present) return verdict(rule, 'NOT_APPLICABLE', 'no container query is present');
      if (!result.driven || !result.changed) return verdict(rule, 'ERROR', 'a matching container query could not be shown to change a computed descendant style at the probed sizes', result);
      return verdict(rule, 'PASS', 'descendant computed style changed with container size', result);
    },
  },
  'ui-behaviors/same-document-transitions': {
    title: 'Visible view-transition names are unique',
    property: 'no two visible elements currently share a non-none view-transition-name',
    async check(page) {
      const rule = 'ui-behaviors/same-document-transitions';
      const result = await page.evaluate(`
        const counts = {};
        for (const element of document.querySelectorAll('*')) {
          if (element === document.documentElement || !element.checkVisibility()) continue;
          const name = getComputedStyle(element).viewTransitionName;
          if (name && name !== 'none') counts[name] = (counts[name] ?? 0) + 1;
        }
        return { names: counts, duplicates: Object.entries(counts).filter(([, count]) => count > 1).map(([name]) => name) };
      `);
      if (!Object.keys(result.names).length) return verdict(rule, 'NOT_APPLICABLE', 'no visible named view-transition elements were observed');
      return verdict(rule, result.duplicates.length ? 'FAIL' : 'PASS',
        result.duplicates.length ? `duplicate visible view-transition-name: ${result.duplicates.join(', ')}` : 'visible named elements have unique transition names; transition execution was not asserted', result);
    },
  },
  'css/child-state-based-styling': {
    title: 'A :has() parent style follows a child state',
    property: 'toggling a child checkbox changes its parent’s computed style via :has()',
    async check(page) {
      const rule = 'css/child-state-based-styling';
      const result = await page.evaluate(`
        const candidates = [];
        const walk = (rules) => { for (const entry of rules) {
          if (entry.selectorText?.includes(':has(')) candidates.push(entry);
          if (entry.cssRules) walk(entry.cssRules);
        } };
        for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
        if (!candidates.length) return { present: false };
        for (const entry of candidates) {
          if (!entry.selectorText.includes(':checked') || !entry.style.length) continue;
          const parentSelector = entry.selectorText.split(':has(')[0].trim();
          let parent;
          try { parent = document.querySelector(parentSelector); } catch { continue; }
          const input = parent?.querySelector('input[type=checkbox],input[type=radio]');
          if (!input) continue;
          const prop = entry.style[0], previous = input.checked;
          try {
            input.checked = false;
            const off = getComputedStyle(parent).getPropertyValue(prop);
            input.checked = true;
            const on = getComputedStyle(parent).getPropertyValue(prop);
            return { present: true, driven: true, prop, off, on, changed: off !== on };
          } finally { input.checked = previous; }
        }
        return { present: true, driven: false };
      `);
      if (!result.present) return verdict(rule, 'NOT_APPLICABLE', 'no :has() style rule is present');
      if (!result.driven || !result.changed) return verdict(rule, 'ERROR', 'a child-state :has() style change could not be observed', result);
      return verdict(rule, 'PASS', 'parent computed style changed with child state', result);
    },
  },
});

export const MODERN_RULE_IDS = Object.freeze(Object.keys(MODERN_RULES));

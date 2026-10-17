// Separate from the pinned MWG rule vector: dark-mode behaviour is a browser measurement,
// not a guidance-rule improvement, and must never inflate the guidance score.
const MEDIA = (value) => ({ features: value ? [{ name: 'prefers-color-scheme', value }] : [] });

const SNAPSHOT = `
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  // Canvas resolves rgb(), color-mix(), oklch() and system colors into measured sRGB bytes.
  // Do not guess luminance from the token's spelling or from an unsupported color syntax.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const opaque = (color) => {
    if (!ctx || !color) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? 'rgb(' + r + ', ' + g + ', ' + b + ')' : null;
  };
  const visible = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility === 'visible' && el.getClientRects().length > 0 && Boolean(el.textContent.trim()); };
  const opaqueBackground = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba?\\([^)]*,\\s*0(?:\\.0+)?\\s*\\)$/.test(bg)) {
        // A translucent or image-backed surface has no trustworthy single background color.
        if (getComputedStyle(node).backgroundImage !== 'none') return null;
        return opaque(bg);
      }
    }
    return null;
  };
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  root.append(probe);
  const tokens = {};
  try {
    for (const name of [...rootStyle].filter((x) => x.startsWith('--') && /(?:bg|background|surface|text|ink|fg|color|accent|border)/i.test(x)).slice(0, 32)) {
      if (!rootStyle.getPropertyValue(name).trim()) continue;
      probe.style.backgroundColor = 'var(' + name + ')';
      const color = opaque(getComputedStyle(probe).backgroundColor);
      if (color) tokens[name] = color;
    }
  } finally { probe.remove(); }
  const samples = [...document.querySelectorAll('h1,h2,h3,p,label,button,a,li')].filter(visible).slice(0, 32)
    .map((el) => { const s = getComputedStyle(el); return { tag: el.tagName.toLowerCase(), color: opaque(s.color),
      background: opaqueBackground(el), fontSize: parseFloat(s.fontSize), fontWeight: parseInt(s.fontWeight, 10) || 400 }; });
  return { prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    rootScheme: rootStyle.colorScheme, background: opaqueBackground(document.body), tokens, samples };
`;

const rgb = (value) => {
  if (typeof value !== 'string' || !/^rgba?\(/.test(value)) return null;
  const parts = value.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n) || n < 0 || n > 255) ||
      (parts.length > 3 && parts[3] < 1)) return null;
  return parts.slice(0, 3);
};
const luminance = (channels) => channels?.reduce((sum, value, i) => {
  const x = value / 255;
  return sum + (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
}, 0);

export function contrastRatio(foreground, background) {
  const fg = rgb(foreground); const bg = rgb(background);
  if (!fg || !bg) return null;
  const a = luminance(fg); const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function verdict(light, dark, source) {
  const failures = [];
  if (!light || !dark || typeof light.prefersDark !== 'boolean' || typeof dark.prefersDark !== 'boolean') {
    return { status: 'ERROR', detail: 'CDP returned no complete light/dark style snapshots' };
  }
  if (source === 'preference' && (light.prefersDark || !dark.prefersDark)) {
    return { status: 'ERROR', detail: 'CDP did not apply the requested light/dark media preference' };
  }
  if (!dark.rootScheme?.split(/\s+/).includes('dark')) failures.push('root color-scheme does not support dark native controls');
  const lightBg = rgb(light.background); const darkBg = rgb(dark.background);
  if (!lightBg || !darkBg) return { status: 'ERROR', detail: 'opaque page backgrounds could not be measured in both schemes' };
  if (luminance(lightBg) - luminance(darkBg) < 0.03) failures.push('dark theme did not visibly darken the page background');
  const changedTokens = Object.keys(dark.tokens ?? {}).filter((name) => light.tokens?.[name] && light.tokens[name] !== dark.tokens[name]);
  if (!changedTokens.length) failures.push('no effective authored color token changed with the dark theme');
  const sampled = (dark.samples ?? []).map(({ tag, color, background, fontSize, fontWeight }) => {
    const ratio = contrastRatio(color, background);
    const threshold = fontSize >= 24 || fontSize >= 18.66 && fontWeight >= 700 ? 3 : 4.5;
    return { tag, ratio, threshold };
  }).filter(({ ratio }) => ratio !== null);
  if (!sampled.length) return { status: 'ERROR', detail: 'no visible text had a measurable opaque background' };
  const bad = sampled.filter(({ ratio, threshold }) => ratio < threshold);
  if (bad.length) failures.push(`${bad.length} of ${sampled.length} sampled visible text surfaces failed WCAG AA contrast`);
  return { status: failures.length ? 'FAIL' : 'PASS', source,
    detail: failures.length ? failures.join('; ') : `dark scheme activated, ${changedTokens.length} effective token(s) changed, ${sampled.length} text surface(s) met contrast`,
    observed: { lightBackground: light.background, darkBackground: dark.background, rootScheme: dark.rootScheme,
      changedTokens: changedTokens.slice(0, 12), samples: sampled.length,
      minContrast: Number(Math.min(...sampled.map(({ ratio }) => ratio)).toFixed(2)),
      contrastFailures: bad.slice(0, 5).map(({ tag, ratio, threshold }) => ({ tag, ratio: Number(ratio.toFixed(2)), threshold })) } };
}

/** Drive a real page, never infer a dark result from a JPEG or the existence of a media rule. */
export async function evaluateDarkMode(page, url) {
  let mediaSet = false;
  try {
    await page.send('Emulation.setEmulatedMedia', MEDIA('light')); mediaSet = true;
    await page.goto(url);
    const light = await page.evaluate(SNAPSHOT);
    await page.send('Emulation.setEmulatedMedia', MEDIA('dark'));
    await page.goto(url);
    const dark = await page.evaluate(SNAPSHOT);
    const preference = verdict(light, dark, 'preference');
    if (preference.status === 'PASS' || preference.status === 'ERROR') return preference;

    // Only try an explicit one-click theme control if the system preference did not activate dark.
    // The selector is fixed and narrow; a generic settings button is not itself a dark-mode toggle.
    await page.send('Emulation.setEmulatedMedia', MEDIA('light'));
    await page.goto(url);
    const clicked = await page.evaluate(`
      const toggle = document.querySelector('[data-theme-toggle], button[aria-label*="toggle theme" i], button[aria-label*="toggle dark" i], [role="switch"][aria-label*="dark mode" i]');
      if (!toggle) return false;
      toggle.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    `);
    if (!clicked) return preference;
    const toggled = await page.evaluate(SNAPSHOT);
    const result = verdict(light, toggled, 'toggle');
    // Restore the starting theme before screenshots/security checks reuse the browser session.
    const restored = await page.evaluate(`
      const toggle = document.querySelector('[data-theme-toggle], button[aria-label*="toggle theme" i], button[aria-label*="toggle dark" i], [role="switch"][aria-label*="dark mode" i]');
      if (!toggle) return false;
      toggle.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    `);
    const reset = restored && await page.evaluate(SNAPSHOT);
    if (!reset || reset.background !== light.background) return { status: 'ERROR', detail: 'theme toggle could not restore the initial appearance' };
    return result;
  } finally {
    if (mediaSet) await page.send('Emulation.setEmulatedMedia', MEDIA(null));
  }
}

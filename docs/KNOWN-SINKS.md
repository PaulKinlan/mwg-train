# Known sinks: intentional curriculum defects, and one frozen artifact

The nightly factory audit flags XSS sinks in `pilot/`. Most of those are **teaching material, not
vulnerabilities**, and one is a real gap that the frozen-corpus invariant currently protects. This file
exists so the next audit does not have to work that out from scratch, and so nobody "fixes" the corpus.

Read this before changing any generated-output code path. Two different things are flagged as the same
rule, and acting on the rule alone would destroy the corpus.

## 1. Seeded defect arms — intentional, must NOT be sanitized

The training corpus contains deliberately broken sites. A defect arm is generated to contain a specific
weakness so a model can be trained and measured on repairing it. The sink at `pilot/frameworks.mjs:409`
is one of these, and it is not an accident:

```js
// pilot/frameworks.mjs:380
const unsafe = defects.includes('xss-innerhtml');
// pilot/frameworks.mjs:405-412
return unsafe
  ? `${pad}// DEFECT: user-supplied text inserted as live HTML.\n${pad}container.innerHTML = value;...`
  : `...// MWG security/sanitize-untrusted-html: user-supplied markup is parsed as inert content.
     // TODO(baseline/element.sethtml): drop the textContent fallback and call setHTML directly.
     if (typeof container.setHTML === 'function') container.setHTML(value);
     else container.textContent = value;...`;
```

Three things follow, and each was checked rather than assumed:

- **The clean baseline is already safe.** With no defect flagged, the generator emits `setHTML` with a
  `textContent` fallback — no `innerHTML` anywhere. The sink exists only in arms whose spec asks for it.
- **It is committed, on purpose, into frozen trees.** `pilot/projects/event-registration-react/app/enhance.js`
  is a committed pilot tree, and it contains the sink because that pilot arm carries the defect. The
  frozen trees therefore *must* keep it; "cleaning" one would falsify the corpus and break the
  byte-invariance gate, `npm run check:specs` (35 of 35).
- **The audit finding on it is a false positive.** A static linter cannot know that a repository whose
  product *is* a defect corpus contains defects deliberately. The factory's own triage already annotated
  this one: *"Seeded DOM XSS is intentional defect-arm corpus content."*

`test/known-sinks.test.mjs` locks this: the defect arm must still emit the sink, and the clean arm must
still emit none. A future "sanitize the generator" change now fails loudly instead of quietly deleting
curriculum.

## 2. The reflected query in the page title — a real gap, frozen by invariant

Separate from the above, and **not** defect-gated:

```js
// pilot/frameworks.mjs:1060, 1065 (raw server) and 1336, 1337 (Hono)
const query = url.searchParams.get('q') ?? '';
return html(response, await renderDocument({ title: `Search: ${query}`, ... }));
// renderDocument interpolates it into:  <title>${title}</title>
```

The query is reflected into `<title>` with no escaping, so a search-capable generated site reflects
attacker-controlled markup. This is a genuine gap and not curriculum, for three reasons:

1. **It is not gated on the defect flag**, so it is in the *clean* baseline of every search-capable
   archetype, not only in defect arms.
2. **The same value is escaped elsewhere in the same file** — `pilot/frameworks.mjs:643` writes it into
   the search input as `query.replace(/"/g, '&quot;')`. An escape present in a sibling sink and missing
   here is an oversight, not a design.
3. The factory's intentional-defect list covers `:409` and **not** this one.

**It is nevertheless not being fixed here, by explicit ruling.** Correcting it changes what the generator
emits, which changes the bytes of every affected tree — and "search-capable archetype" is most of the
corpus. That collides with the frozen-corpus invariant in both directions:

- `pilot/CORPUS.json` plus `npm run check:specs`, which must reproduce the 35 pilot trees exactly;
- `pilot/TRAINING_CORPUS.json` plus `docs/train/corpus/tokens.json`, whose figures are gated by
  `test/tokens-record.test.mjs`.

Re-recording the pilot corpus requires a completed browser run with staged uplifts
(`scripts/pilot-corpus.mjs --record`), so the freeze cannot be re-taken from a lane at all. The fix is
therefore deferred to whoever owns that pipeline, and the sink is recorded here instead. When it is fixed,
both corpus records and the token figures move with it, in one reviewed change — not as a drive-by.

## 3. Our own tooling — checked, and already safe

The viewer reads untrusted query parameters (`src/viewer/server.mjs:395-461`: `family`, `variant`,
`framework`, `run`, `archetype`, `state`, `rule`) and renders HTML, so it was audited in the same pass.
It escapes: `escapeHtml` is defined at `src/viewer/pages.mjs:14` and applied to page titles, table cells,
badges, option values and labels, and the filter path in particular — an unknown `state` filter is
rendered through `option()`, which escapes both the value and the label. `renderMarkdown` escapes its
input before parsing.

`test/known-sinks.test.mjs` asserts this with a live payload rather than trusting the reading, so a future
change to the viewer fails a test instead of shipping a reflected XSS in the tool we use to inspect the
corpus.

## For the next audit

Expect these to be flagged, and check them against this file before acting:

| Flagged | Truth |
|---|---|
| `pilot/frameworks.mjs:409` and the committed trees containing it | Intentional defect arm. Do not sanitize. |
| `pilot/frameworks.mjs` search-arm `<title>` interpolation | Real gap, frozen corpus. Does not belong in a lane. |
| `src/viewer/**` query parameters | Escaped, and gated by `test/known-sinks.test.mjs`. |

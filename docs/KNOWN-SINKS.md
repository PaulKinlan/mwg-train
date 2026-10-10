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

## 2. The reflected query in the page title — a real gap in every non-Hono arm, frozen by invariant

Separate from the above, and **not** defect-gated:

```js
// pilot/frameworks.mjs:1060 and :1065, inside serverSource()
const query = url.searchParams.get('q') ?? '';
return html(response, await renderDocument({ title: `Search: ${query}`, ... }));
// and every NON-HONO arm's renderDocument is a PLAIN template literal:
return `<!doctype html> ... <title>${title}</title> ...
```

The query is reflected into `<title>` with no escaping, so a search-capable site built on the raw arm
reflects attacker-controlled markup. This is a genuine gap and not curriculum, for three reasons:

1. **It is not gated on the defect flag**, so it is in the *clean* baseline, not only in defect arms.
2. **The same value is escaped elsewhere in the same file** — `pilot/frameworks.mjs:643` writes it into
   the search input as `query.replace(/"/g, '&quot;')`. An escape present in a sibling sink and missing
   here is an oversight, not a design.
3. The factory's intentional-defect list covers `:409` and **not** this one.

### Which arms are affected, and which are not — checked, not assumed

The generator emits `renderDocument` five times, and **only the Hono one escapes**. This section has been
corrected twice and both corrections matter, because the reach decides which trees anyone would have to
re-record. It first named the Hono arm as affected — wrong, the tag escapes. It then said only the raw arm
was affected — also wrong, for a reason worth stating plainly: the search route at `:1060` and `:1065`
lives in `serverSource()`, which is not the raw arm, it is the server generator for **every non-Hono
framework**. `pilot/frameworks.mjs:1510` chooses it as
`framework.name === 'hono' ? honoServerSource(...) : serverSource(...)`. So every non-Hono arm gets that
route, and every non-Hono `renderDocument` is a plain template literal:

| emitter | template | title sink |
|---|---|---|
| `pilot/frameworks.mjs:209` raw and webcomponents | plain template literal | **YES — the demonstrated gap** |
| `pilot/frameworks.mjs:239` Hono | **tagged** `html` from `hono/html` (`:229`) | **NO — the tag escapes** |
| `pilot/frameworks.mjs:273` react and preact | plain template literal | **YES — `serverSource` gives it the search route** |
| `pilot/frameworks.mjs:308` vue | plain template literal | **YES — `serverSource` gives it the search route** |
| `pilot/frameworks.mjs:1440` svelte | plain template literal | **YES — `serverSource` gives it the search route** |

So the affected set is **every non-Hono arm**: raw, webcomponents, react, preact, vue and svelte. The only
call sites that pass a request-derived title are `:1060`/`:1065` (non-Hono) and `:1336`/`:1337` (Hono, and
therefore escaped), which means the reflection is live in all six non-Hono arms rather than latent in any
of them. Demonstrated rather than argued, in committed trees: `catalogue-react`, `catalogue-preact`,
`catalogue-vue` and `catalogue-webcomponents` all carry the `/search` route in `server.mjs` and a plain
`<title>${title}</title>` in `app/page.mjs`, and calling that tree's own `renderDocument` with
`title: 'Search: <script>alert(1)</script>'` returns
`<title>Search: <script>alert(1)</script></title>` — the payload survives.

The Hono arm is exempt because a tagged template escapes its interpolations. That is library behaviour,
so it is asserted rather than described: `test/known-sinks.test.mjs` renders a hostile value through the
real `hono/html` tag and requires it to come out escaped, which means an upgrade that stopped escaping
would fail a test rather than silently reopening this.

**It is nevertheless not being fixed here, by explicit ruling.** Correcting the raw arm changes what the
generator emits, which changes the bytes of every raw and webcomponents tree that carries a search
journey. That collides with the frozen-corpus invariant in both directions:

- `pilot/CORPUS.json` plus `npm run check:specs`, which must reproduce the 35 pilot trees exactly;
- `pilot/TRAINING_CORPUS.json` plus `docs/train/corpus/tokens.json`, whose figures are gated by
  `test/tokens-record.test.mjs`.

Re-recording the pilot corpus requires a completed browser run with staged uplifts
(`scripts/pilot-corpus.mjs --record`), so the freeze cannot be re-taken from a lane at all. The fix is
therefore deferred to whoever owns that pipeline, and the sink is recorded here instead. When it is fixed,
both corpus records and the token figures move with it, in one reviewed change — not as a drive-by.
**Re-record every non-Hono search tree and leave only the Hono ones alone.** Concretely, the arms whose
`server.mjs` carries the search route and whose `page.mjs` interpolates unescaped: raw, webcomponents,
react, preact, vue, svelte.

### Correction: the radius is 30 trees, not six arms, and the exact bill (mwg-train-sia)

Section 2 above originally scoped this to six arms - the six non-Hono `renderDocument` definitions. The emitter set
is right but the reach is larger, and the difference is in the server, not the page.

`serverSource()` emits the reflecting `/search` handler **unconditionally**. The branch is selected on
`archetype.journey?.search`, which is falsy for all five pilot archetypes, so the fallback handler is generated into
every non-Hono project - including archetypes whose spec declares no search at all. Only `catalogue` has a search
journey; the handler is present everywhere. Six non-Hono frameworks x five archetypes is therefore **30 of the 35
frozen trees**, not 6, and `honoServerSource()` emits the equivalent route for the seventh.

So any real fix costs one corpus re-record covering these 30, whichever side of the seam it is applied to:

- `account-recovery-{raw,webcomponents,react,preact,vue,svelte}`
- `booking-{raw,webcomponents,react,preact,vue,svelte}`
- `catalogue-{raw,webcomponents,react,preact,vue,svelte}`
- `contact-lead-{raw,webcomponents,react,preact,vue,svelte}`
- `event-registration-{raw,webcomponents,react,preact,vue,svelte}`

The failure signature is `npm run check:specs` failing 30 of 35: the gate hashes generated files, so an escaping helper
in the emitted source changes the tree even though a clean title renders identically. Re-recording requires a browser
run with staged uplifts (`scripts/pilot-corpus.mjs --record`), which cannot be done from a lane.

**The fix is staged, not applied.** `test/reflected-title-helper.test.mjs` holds the exact inline helper text, evaluated
the way the generated module would, and asserts against the payload this section was raised from. The change in each
page module is one line: `<title>${title}</title>` becomes `<title>${escapeTitle(title)}</title>`, with the helper
emitted alongside it - it must be inline, because a generated project is standalone and cannot import from this repo.
The ampersand is escaped first; escaping it last double-encodes `&lt;` into `&amp;lt;`.

**And the debt is now pinned rather than described.** `test/reflected-title-escape.test.mjs` derives which arms still
interpolate `title` unescaped and fails if that set differs from the recorded 30 in either direction - an arm that
regresses is unlisted, and an arm that gets fixed is stale and must come off. Applying the fix therefore turns the list
red until the re-record happens, which is the point: the bill cannot go out of date quietly. Hono is excluded by name
rather than by text, because its emitted page contains the identical literal `<title>${title}</title>` while escaping
at runtime through `hono/html`.

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
| `pilot/frameworks.mjs` non-Hono search `<title>` interpolation (all six arms) | Real gap, frozen corpus. Does not belong in a lane. |
| `pilot/frameworks.mjs` Hono search `<title>` interpolation | **Not a sink** — tagged `hono/html` template escapes. Do not re-record these trees. |
| `src/viewer/**` query parameters | Escaped, and gated by `test/known-sinks.test.mjs`. |

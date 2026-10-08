# The instrumented pilot: 25 projects, five arms, one deterministic uplift

This pilot measures one thing: **when the uplift tool is pointed at a project that violates a Modern
Web Guidance rule, how often does the result actually preserve the task and improve the property the
rule is about?** It exists because the design brief (§8) asks for an instrumented pilot with server
journeys before any evaluation is run at scale, and because "the tool applied a rule" is not evidence
that the rule's property now holds.

Everything measured here is measured in a real browser, against a real server, from a record written
to disk. The records are the evidence; this file explains what they mean.

## What the corpus is

Twenty-five projects: **five server-backed archetypes × five rendering arms**. No static pages, and no
arm that renders only in the browser — every project is server-rendered, has a driven journey that makes
the server **write** to SQLite, and a read that proves the value is there. The catalogue is the one
archetype whose own journey is a reflected query rather than a form POST, so it carries a second form and
a second, separately driven write journey; the gate refuses a pair whose declared write journey was not
driven or did not persist, which is what keeps that sentence true of all twenty-five.

| Archetype | Server journey | Echo source | What it exercises |
| --- | --- | --- | --- |
| `booking` | POST `/book` → 303 → `/booking/:ref`, reload | record reference | The classic form: required fields, an address block, free text |
| `contact-lead` | POST `/enquiry` → 303 → `/enquiry/:ref`, reload | record reference | A public-service enquiry: validation and a free-text echo |
| `catalogue` | GET `/search?q=…`, reload **and** POST `/cart` → `/cart`, reload | reflected query | Server-side search, a reflected query, an **optional** field, and a second form whose POST the write journey drives |
| `account-recovery` | POST `/signup` → 303 → `/account`, reload | session cookie | A session journey: the server decides who you are |
| `event-registration` | POST `/register` → 303 → `/registration/:ref` | record reference | A select control and a capacity rule |

The three echo sources matter: a record-reference flow, a reflected-query flow and a session flow are
three different ways untrusted text reaches the DOM and three different ways a server holds state. An
uplift rule that only works on one of them is a rule that works on a third of the web.

| Arm | Version | Rendering | Why it is here |
| --- | --- | --- | --- |
| `raw` | platform, no framework | HTML string | The control: much of MWG is about what a framework does or hides for you |
| `react` | 19.2.0 | `htm/react` + `react-dom/server` | The dominant framework family |
| `preact` | 10.27.2 | `htm/preact` + `preact-render-to-string` | A second runtime in the same family |
| `vue` | 3.5.22 | runtime template compiler + `@vue/server-renderer` | A non-React framework |
| `hono` | 4.9.12 | Hono routing + `hono/html` templates | A modern server framework, no virtual DOM |

Versions are pinned in the root `package.json`; no arm needs a build step, which is deliberate — a
compile step would mean the markup a browser receives is not the markup in the file, and the uplift
tool edits markup.

The composition lives in `pilot/plan.json` as data, and `pilot/archetypes.mjs` /
`pilot/frameworks.mjs` generate every project from it, so the corpus is one reviewable plan rather
than twenty-five hand-written directories.

## What is measured

Six properties from the pinned Modern Web Guidance snapshot (`docs/eval/rules.json`, skill version
`2026_09_04-7de96777`, 178 guides, `rule_set_hash` recorded), plus two local properties that are
marked as local rather than borrowing a guide id they do not implement.

| Rule id | Property the browser is asked about |
| --- | --- |
| `forms/required-field-feedback` | After an interaction that leaves a required field empty, the failure is reported **and** the field points at its error text |
| `accessibility/accessible-error-announcement` | `aria-invalid` tracks `:user-invalid`, and a visible live region carries the failure text |
| `forms/validate-input-after-interaction` | A freshly loaded page presents no error state, and no selector styles `:invalid` |
| `forms/autofill-sign-up-form` | The sign-in fields carry the tokens a password manager needs |
| `forms/autofill-address-form` | The address block is autofillable **as a unit**; a project with no address block is `NOT_APPLICABLE`, not failed |
| `security/sanitize-untrusted-html` | Markup submitted as content renders as text and executes nothing |
| `session-cookie-attributes` *(local)* | The session cookie is `HttpOnly`, `Secure`, `SameSite` |
| `form-token-exposure` *(local)* | No credential-shaped value appears in the page or its URLs |

Two rules of measurement, both learned the hard way in this pilot:

1. **The vector drives trusted input.** `dispatchEvent(new Event('input'))` does not set the browser's
   "user interacted" flag, so `:user-invalid` never flips for it — a page that reported correctly
   looked broken, and a page that styled `:invalid` eagerly looked correct. Interaction now goes
   through the input pipeline (`Input.insertText`, real `Backspace`, real `Tab`).
2. **Every rule starts from a pristine page.** Two of these rules assert something about a page nobody
   has touched yet; before the harness gave each rule a fresh page, they inherited the previous rule's
   interaction and reported a regression for the fix the previous rule had just checked.

## The uplift tool

`src/corpus/uplift.mjs` is deterministic and has one transform per rule. It edits markup, a stylesheet
and one enhancement script in place, in whichever dialect the arm uses, and it records every edit with
the rule that made it. Its limits are part of the contract:

- It will not add a deliverable the project did not ask for. A field the project treats as optional is
  not made required; a project with no address block does not acquire one.
- A rule a project already satisfies is left alone — a project with no seeded defects draws zero edits.
- The clean baseline for a rule is the *same code* the tool injects for it (one exported constant), so
  the control arm cannot fail a rule it is supposed to satisfy.

## The acceptance gate

A pair is **accepted** only if all four hold:

1. both versions are runnable (server starts, journeys complete, no page errors);
2. the uplifted version preserves the original task (the same journey, including the reload, still
   shows the record the server stored);
3. it improves at least one measured property (a rule that failed before passes after);
4. it introduces no new high-severity security finding and breaks no flow.

Refusals are classified, because "the tool had nothing to fix here" and "the tool broke the flow" are
different facts about the pipeline and only one of them is a bug:

| Category | What it means |
| --- | --- |
| `accepted` | Preserved the task and improved at least one measured property |
| `no-warranted-change` | The original already satisfied everything measured (a valid control, not a positive pair) |
| `no-mwg-improvement` | Defects were seeded but the tool changed none of the measured properties (coverage gap) |
| `uplift-broke-the-flow` | The journey no longer completes — **tool or rule bug** |
| `rule-regression` | A property that passed now fails — **rule bug** |
| `security-regression` | The uplift introduced a security finding — **rule bug** |
| `original-not-runnable` | The original did not complete its own journey; nothing could be measured |

Four clauses fail closed, because each of them is a way a verdict could otherwise be reached without
measuring anything:

- **No expected echoed value** → the pair is refused rather than passing with the persistence check skipped.
- **A declared rule that is missing, errors, or is reported not-applicable without the project declaring
  it** → `rule-not-measured`. Every rule the spec requires must appear in *both* records with a real
  verdict; a property that can no longer be measured after the uplift is a regression, not a preserved one.
- **A declared write journey that was not driven, or that did not show the posted value stored** → the
  pair is refused.
- **A corpus manifest with no rows** → invalid rather than vacuously valid.

A gate a blank file can pass is not a gate. This is the single most repeated bug in this project, which is
why each of these has a test that fails without it.

## Evidence

`node scripts/pilot.mjs --out <dir>` writes, per project:

- `original.json` / `uplifted.json` — journeys with per-step URLs and statuses, every rule's status
  with what the browser observed, security checks, console messages, network log;
- `*-desktop.png` and `*-mobile.png` — the page as rendered at 1280×900 and 390×844;
- `*-trace.json` — a CDP trace of the run;
- `decision.json` — the gate's verdict, the edits the tool made, the improved and regressed rules;
- `YIELD.md` and `yield.json` — the yield, the taxonomy, and every pair.

Screenshots and traces stay out of git (they are regenerated per run); the summary and the corpus
manifest are committed.

## Reproducibility instead of byte retention

The corpus is generated, so the guarantee that matters is not "we kept a copy" but "the originals can
be produced again, and so can the uplifts":

```bash
node scripts/pilot.mjs --out pilot/out           # generate the 25 projects and measure them (needs Chrome)
node scripts/pilot-corpus.mjs --record <runDir>  # pin the measured corpus to pilot/CORPUS.json
npm run check:pilot-corpus                       # re-derive every original and every uplift, compare
node scripts/scaffold-pilot.mjs --clean          # optional: write the same corpus to pilot/projects
```

The run **generates its own corpus** from `pilot/plan.json`, so what is measured is what the generator
produces now. It used not to: the pilot read whatever was in `pilot/projects`, while the recorder
regenerated the plan, and the two only agreed if someone remembered to scaffold first. A directory left
over from an earlier revision was measured and then reported as a corpus that could not be reproduced.
`--projects <dir>` still measures an existing tree, for debugging, and says so when it does. One
implementation of "the corpus on disk" (`pilot/generate.mjs`) is used by the run, the recorder and the
scaffolder, and a test generates the plan twice and requires identical tree hashes.

`check:pilot-corpus` regenerates all 25 projects from the plan and re-runs the uplift tool on each,
then compares tree hashes with the record. A mismatch means the measured artefact can no longer be
reproduced, which makes the yield numbers stale by definition. Recording a partial run is refused: a
partial corpus is not the corpus.

## Results

**24 of 25 pairs accepted (96.0%)**, measured on 2026-10-08 in 154s, one Chrome, one project at a
time. The full report is [YIELD.md](YIELD.md); the per-project hashes, applied rules and verdicts are
in `pilot/CORPUS.json`, which `npm run check:pilot-corpus` re-derives from `pilot/plan.json` and the
uplift tool. ### Who witnesses a write

The write journey's evidence comes from the **server**, not the browser. A form POST is invisible in the
browser's own network log — the trace for a catalogue write contains `GET /cart` and `GET /api/records`
and no POST at all — so the POST's status was originally read off the page it redirected to. That is how
"the POST succeeded" came to be claimed with no POST ever observed: `posted: true, status: 200` while no
POST request existed in the log. Both generated servers now record every request they answer and expose
it at `GET /__requests`, the harness requires a POST to the form's own `action` with a 2xx/3xx status
before it will call a write successful, and an unobserved POST fails closed rather than inheriting the
redirect's status. The claim is then checkable: `POST /cart → 303`, then `GET /cart → 200`.

The run's own decisions — every verdict, the rules each pair improved, the tree hashes and
each original's empty-submission observation — are committed as [yield.json](yield.json), and the
journeys, rule statuses and tree hashes behind them as [records.json](records.json). A test asserts that
every claim below is supported by those files: no property in any version carries an `ERROR` status, and
each catalogue project drove a write journey that posted a value and read that value back.

| Category | Count |
| --- | --- |
| `accepted` | 24 |
| `no-warranted-change` | 1 |
| `no-mwg-improvement`, `uplift-broke-the-flow`, `rule-regression`, `security-regression`, `rule-not-measured`, `original-not-runnable` | 0 |

The single refusal is `catalogue-vue`, the project with no seeded defects: the tool made **zero edits**
to it, which is the result the control exists to produce. No pair was refused because the uplift broke
a journey, regressed a rule, introduced a security finding, or left a rule unmeasured — and
`records.json` shows every measured property in both versions of every project, so that sentence is
checkable rather than asserted.

| Arm | Accepted | Attempted | Which properties improved, in how many pairs |
| --- | --- | --- | --- |
| `raw` | 5 | 5 | `accessibility/accessible-error-announcement` 19, `security/sanitize-untrusted-html` 16, `forms/required-field-feedback` 15, `forms/validate-input-after-interaction` 15, `forms/autofill-sign-up-form` 5, `forms/autofill-address-form` 5 (counts are across all arms, not the `raw` arm alone) |
| `react` | 5 | 5 | |
| `preact` | 5 | 5 | |
| `hono` | 5 | 5 | |
| `vue` | 4 | 5 | the missing pair is the control |

Every archetype scored 5/5 except `catalogue` (4/5, the control). The evenness across arms is itself a
finding: the same generator writes all five, so the arms differ mainly in dialect, and the uplift tool
handles all five dialects — including Hono's `hono/html` templates and Vue's runtime-compiled ones —
without a rule failing on any of them.

### Eight corrections the pilot made to itself, and why they are in the record

The first full run measured 1/20 and the second 25/25; neither number survived scrutiny, and the three
runs of 24/25 or 22/25 that followed each hid a different defect in the measurement rather than in the
tool. The failures and the corrections are more useful than the final figure, so they are kept:

1. **1/20 was measurement, not the tool.** Form ids no journey could find, uplifted copies staged where
   Node could not resolve framework modules, a generated enhancement script with a top-level `return`,
   an account page that was never routed. Every one was in my harness or corpus.
2. **25/25 was a stale corpus.** The "clean" control had been scaffolded before a fix that linked error
   text to its field, so it was itself defective and the tool scored a fix on it. Re-scaffolding and
   re-measuring produced 24/25 with the control refusing, and exposed a second real gap: projects not
   seeded with the announcement defect had a live region nothing ever filled, while the tool called that
   "already present".
3. **24/25 hid a false pass.** For all five `account-recovery` projects the sanitisation check reported
   PASS in both versions, because the content journey navigated to the route the record-reference arm
   uses and landed on a 404: the payload never reached the page, so "nothing executed" was trivially
   true. Fixing it produced one more correction in the opposite direction — the replacement precondition
   treated the Sanitizer API *removing* the payload as "never measured" and refused all 25 pairs. The
   final precondition asks the page whether its insertion path ran, which distinguishes `sanitised away`
   from `never delivered`.

4. **The cross-family review found five more claims that could pass without measuring**, and they were
   real: a validation clause that could never fire (it tested the start path as a substring of the URL,
   which is true of every HTTP URL, and required three conditions to be false at once); a fail-closed gate
   that only recognised `PASS → FAIL` as a regression; two interaction checks that credited a stylesheet
   *string* (satisfiable by a comment) and *any* visible live region rather than the tested field's error;
   a sanitisation check that accepted the presence of a marker without tying it to the payload; and a
   claim about the twenty-five projects that the twenty-fifth did not satisfy. All five are fixed, with a
   test each.

5. **The second review round found three more predicates proving less than they claimed.** The write
   journey accepted a *fixed* posted value, so a row already in the database plus a refused POST would
   have read as a successful write: the harness now posts a value generated for that attempt and
   requires the POST to have succeeded. The expression-compilation test was vacuous - its stub returned
   `{}` for every call, so any check that returned early never compiled its later expressions, which is
   the exact bug the test exists to catch - and it now drives each check along a full-truth and an
   empty path and requires every call site to have executed. And `refused` did not require an observed
   refusal: a handler that silently prevented submission leaves the same trace as one that refused, so
   the observation is now `refused-observed`, `accepted-empty`, or `blocked-without-evidence`.
6. **24/25 was survivorship, and the report measured nothing.** Two more of the same class, both found
   while folding the review's fixes in. The gate required the *original* to refuse an empty submission,
   but the arms seeded without a client-side requirement legitimately cannot - so it labelled exactly
   the most defective pairs `original-not-runnable` and dropped them from the yield, biasing the number
   upward. A precondition may require that a measurement happened, never what it found. And the section
   added to report those observations looked for the original record under a key decisions do not carry,
   defaulted all 25 to `not-driven`, and printed `0 of 25 ... 0 accepted it` - a confident-looking zero
   measuring nothing. The observation is now recorded where the data is, and a missing one is printed as
   missing instead of being folded into a zero. The final run reports 23 of 25 originals refusing an
   empty submission and the 2 that accept it, which are the two `no-required` arms.

7. **The corpus was measured from a directory, and verified by regeneration.** Three scripts each had
   their own answer to "the corpus on disk": the scaffolder wrote it, the recorder wrote it again with
   a copy of the loop, and the pilot read whatever was already there. The measured tree and the
   reconstructed tree therefore agreed only by convention, and a stale directory was measured, reported
   and then refused by the recorder as unreproducible. That refusal is the strict recorder from round 2
   doing its job: the fix is one generator, used by all three, with the run generating its own corpus.

8. **"The POST succeeded" was never observed.** The write journey read the POST's status off the page it
   redirected to, so a project could claim a successful write with no POST in the log; the committed
   records showed `posted: true, status: 200` next to a null method and URL, which is what gave it away.
   Adding a request log to both generated servers produced the missing half immediately: the server saw
   `POST /cart → 303` while the browser's trace showed only `GET /cart`. The witness for a write is the
   process that stored it. Checking that change also exposed a fifth instance of the same class:
   `spec.framework` was a hand-copied list of fields and silently dropped the new `serverFile` key, which
   is now a spread of the table entry.

The number worth trusting is therefore not the percentage on its own: it is the percentage with one
control, zero unmeasured rules, and a reproducibility gate that can regenerate both the originals and the
uplifts — a figure that has been wrong three times in the direction of flattering the tool, and was
corrected each time by asking what would have to be true for the check to pass while measuring nothing.

## Limits, and what would make this more credible

This pilot measures the tool against defects **I planted**, in projects **I wrote**. It is a
measurement of the pipeline, not a survey of the web. Specifically:

- **Authoring bias.** Each project is seeded with the defects the tool claims to fix, so a high yield
  says "the tool does what its rules say" — not "these are the defects real projects have". The
  control arm (one project with no seeded defects) is the only check against that; a corpus with
  out-of-scope defects, where the expected verdict is `no-mwg-improvement`, would test the coverage
  side. That is the follow-up bead, not a claim made here.
- **Six of 178 guides.** The vector is a slice chosen because these rules are observable in a browser
  without a build step. A rule outside the vector cannot be measured, and a defect outside it is
  indistinguishable from no defect.
- **Shared markup shapes.** The arms differ in runtime and dialect, but one generator writes all of
  them, so framework-specific uplift behaviour is only partly exercised: a Vue project here is one the
  generator can express, not one a Vue developer would necessarily write.
- **One browser build, one box.** Two cores, one Chrome at a time; the version is recorded in each
  record (`chrome.version`).
- **Acceptance is not shipping.** A pair that passes says the property improved without breaking the
  journey. It does not say the diff is what a maintainer would merge.

## Running it

```bash
npm run pilot:scaffold            # (re)generate the 25 projects from the plan
npm run pilot:run -- --out pilot/out        # all arms; --framework raw for one arm
npm test                          # the corpus tests, which need no browser
npm run check:pilot-corpus        # reproducibility gate over the recorded corpus
```

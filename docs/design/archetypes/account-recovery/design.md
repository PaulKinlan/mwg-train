---
archetype: account-recovery
type: b2b-saas-signup
boards: docs/design/archetypes/account-recovery/
register: docs/provenance/assets/design-reference-wave2.md
---

# `account-recovery` — aesthetic system

The look of the `account-recovery` archetype. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`), so it is reviewable the way the evaluation side's design documents are.

One difference from those documents is stated up front rather than implied. There, the design
describes a target board that a designer authored; here the accepted target is **`demo/`** - a
hand-written page whose values are in `demo/styles.css` and are quoted below from it - and the two
reference boards are *generated rasters* of the intended states. The demo and the boards do not agree
in every particular, and where they disagree the demo is the target and the difference is recorded
rather than averaged away. Behaviour is in [`plan.md`](plan.md), not here.

## Visual thesis

A lockout is a moment of doubt, and the surface is built to answer one question with no competition for
attention: one card, centred on a dark ground, one accent, one action. There is no masthead, no
navigation and no second column, because there is nowhere else in this journey to go - the card is the
whole interface, and the only chrome is the ambient ground behind it.

The accent is a single emerald used for exactly one thing per state: the action that moves the journey
forward. Everything not that action - the address, the explanation, the way back - is held one step
down in weight or colour so the eye has one place to land. The dark ground is not decoration: it is
what makes a single small card read as deliberate rather than as a page that failed to load.

The thing this archetype must never look like is a **browser window pretending to be a service**. A
recovery screen that shows a desktop, a window frame and a toolbar is showing the person a picture of
software rather than software, and it invites them to trust a status bar that knows nothing about their
account. It must equally never look like a dashboard, a settings page, or a marketing page - anything
that offers a second destination is a false promise in a flow whose whole premise is that the person
cannot get in.

## Grammar and layout

- One centred shell, `main.auth-shell`: `min-height: 100svh` on a grid with `place-items: center` and
  `padding: clamp(1rem, 5vw, 2rem)`, so the card is optically centred at every height and never
  touches the viewport edge.
- One card, `.auth-card`: `width: min(100%, 29rem)` - it fills a narrow viewport and stops at a
  comfortable measure on a wide one - with `padding: clamp(1.5rem, 5vw, 2.5rem)`, a `1px` `#475569`
  border, a `12px` radius and a single soft shadow. The card is the unit of the layout; nothing is
  positioned relative to the viewport instead.
- **One card is visible at a time.** The request and sent states are sibling sections of the same
  shell and the transition is `hidden`, not a route change, so no scroll position, no second layout and
  no history entry is involved. The state that is not shown is not merely invisible - it is `.hidden`,
  so it has no focusable descendants.
- The comparison surface is a **reading page, not a second application** (`compare.html`, `.compare-page`):
  a `#101827` ground with `width: min(100% - 2rem, 82rem)`, and a two-column comparison grid that
  collapses to one column below `48rem`. It exists to put the pictures beside the live states so a
  reviewer can see them disagree - it is not part of the journey and carries no controls.
- The demo is hand-written and standalone: no remote assets, no font download, no framework, and no
  request to a server. That is a layout decision as much as a technical one - the page must not depend
  on anything that could fail while the person is already locked out.

## Typography

- The system sans stack throughout (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
  sans-serif`): no webfont, so the recovery screen renders identically with no network and no layout
  shift.
- One heading size per card: `h1` at `clamp(1.65rem, 5vw, 2rem)`, `line-height: 1.18`,
  `letter-spacing: -.025em` and `text-wrap: balance`. The headline is short by design - "Reset Your
  Password", "Check Your Inbox" - so balance is what keeps it from breaking badly on a narrow screen.
- Body text is `1.55` line height at the inherited size; the explanation under the heading is the only
  running prose, capped at `34ch` and centred so it reads as two or three deliberate lines rather than
  a paragraph squeezed to the card's width.
- The echoed address is the one emphasised substring in the flow (`.intro strong`, weight `650`,
  `overflow-wrap: anywhere`), because it is the one piece of the screen the person needs to check
  against what they typed - and a long address must wrap rather than force the card wider.
- Everything secondary - hints, the preview notice, error text, the resend line - is one step below
  body size (`.875rem`) in a muted or error colour, so no two kinds of text compete for the same
  attention.

## Token usage

Every value below is from the accepted target's own stylesheet, `demo/styles.css`.

| Token | Value | Used for |
| --- | --- | --- |
| `--page` | `#0f172a` | The ground behind the card |
| `--card` | `#1e293b` | The card surface, both states |
| `--field` | `#172235` | The input's own ground, one step off the card |
| `--border` | `#64748b` | Input and notice borders |
| `--accent` | `#10b981` | The forward action - the submit button, the inbox mark |
| `--accent-ink` | `#04231a` | Text on the accent, and the selection foreground |
| `--accent-text` | `#34d399` | Links, the soft button hover, the caret |
| `--text` | `#f8fafc` | Heading and body text |
| `--muted` | `#cbd5e1` | Explanation, hints, labels, notices, the way back |
| `--error` | `#fca5a5` | Invalid border, invalid label, error message |

Two values sit outside the token block and are deliberate: the focus ring is `#6ee7b7` at `3px` with a
`3px` offset - a *lighter* green than the accent, so the ring is never mistaken for the button it
surrounds - and the comparison surface's ground is `#101827`, a slightly deeper page than `--page`,
which is what separates "a page that shows pictures" from the journey itself.

## Spacing rhythm

- Both outer insets are clamps, so one stylesheet covers a phone and a desktop without a breakpoint:
  shell `clamp(1rem, 5vw, 2rem)`, card `clamp(1.5rem, 5vw, 2.5rem)`.
- Controls have minimum heights rather than padding alone - the input `3.5rem`, the primary button
  `3rem` - so the tap targets hold on touch, and the error state cannot collapse the layout.
- Two radii, and only two: `8px` for controls and inline notices, `12px` for the card. The card is
  always the larger radius, which is what keeps it reading as the container and the controls as things
  inside it.
- The floating label is positioned absolutely inside the field (`top: .91rem`, `left: .9rem`) and
  translates to `-.77rem` at `scale(.78)` when the field is focused or no longer empty, so the label
  animation costs no layout: the field's height is fixed by the input, not by the label's position.
- Vertical gaps are single-purpose: `1.2rem` above and `.75rem` below the primary action in the
  request state, `1.3rem` in the sent state, and the two `.resend-copy` lines sit directly together so
  the countdown reads as one sentence with its own action.

## Component hierarchy

1. **Shell** - `main.auth-shell`: centres the visible card, owns the page padding and the ground.
2. **Card** - `section.auth-card`, labelled by its own heading (`aria-labelledby`), one per state.
3. **Brand mark** - a decorative `aria-hidden` SVG above the heading. **The accepted target is
   deliberately unbranded**: the mark is stroke art with no wordmark, and the heading rather than a
   logo is what names the screen.
4. **Heading** - `h1`, the first thing in the card. In the sent state it is `tabindex="-1"` and is
   focused programmatically on the transition, so the change of state is announced to a screen reader
   instead of only being visible; the stylesheet removes the focus outline for that programmatic
   focus only.
5. **Explanation** - `.intro`, capped at `34ch`, carrying the echoed address in the sent state.
6. **Field** - `.field`: the input, a floating `<label for>`, and a decorative icon. The input carries
   `autocomplete="email"` so a password manager or browser can fill it, and the constraint is native
   (`type="email"`, `required`) rather than re-implemented in script.
7. **Hint and error** - `.input-hint` and `.error-text`, both bound to the input by
   `aria-describedby`/`aria-errormessage`. The error is revealed by
   `.field:has(input:user-invalid) ~ .error-text`, so it appears only after the browser considers the
   field's value to have been tried and rejected - never on a pristine field.
8. **Primary action** - one per card. The request state's submit is the accent-filled button; the sent
   state's "Open Email App" is present but `disabled` and described by a hint saying it is unavailable
   in the preview.
9. **Secondary way out** - `.secondary-link`, quiet, below the action: back to sign-in, and in the sent
   state a return to the request form that clears the field and returns focus to it.
10. **State notice** - `.demo-notice`, including the sent state's `role="status"` warning. This is the
    component that carries the archetype's honesty: it says in words that nothing was sent and no
    expiry exists.

## Anti-patterns

- **A second accent colour, or the accent used for anything other than the forward action.** One
  emerald, one meaning; a link, a hint or a border in accent green competes with the button.
- **A framed window in a reference board.** One of the two boards shows a macOS window with a toolbar
  on a desktop; the other is a full-bleed viewport. They are a picture of software, not a design
  system, and the pair currently contradicts itself - see *Rationale* and `mwg-train-jnkx`.
- **A brand element the archetype does not have.** The request board carries a "NEXUS" wordmark. The
  accepted target is unbranded and the decision is recorded in `decisions.json`, so the wordmark is an
  artefact of the draw, not a token to copy.
- **A stepper.** The two boards show "STEP 1 OF 2" and "STEP 2 OF 3" - different totals, and the
  accepted target has no stepper at all. A two-state preview whose states disagree about how many
  there are is worse than no progress indicator.
- **Claiming a message was sent.** The sent board asserts that a link was sent and expires in fifteen
  minutes. Nothing was sent and there is no expiry; the accepted target says so in a notice and
  disables the controls that would imply otherwise. A recovery screen that lies about having mailed a
  link is the one defect in this archetype that is not cosmetic.
- **Error before interaction**, or an error carried by colour alone. The message must follow the
  person's own attempt, and it must be text bound to the field rather than a red border.
- **Horizontal overflow at a narrow width.** The card is `min(100%, 29rem)` inside a clamped padding
  precisely so 390 pixels needs no special case; a fixed-width card or a long unbroken address breaks
  it, which is why the echoed address is `overflow-wrap: anywhere`.
- **A second destination in the journey** - navigation, a settings link, a footer of links. There is
  one action and one way back.
- **Motion that cannot be turned off.** The countdown and the state change are the only motion; the
  stylesheet honours `prefers-reduced-motion` and keeps borders legible under `forced-colors`.

## Rationale

The dark slate ground with a single emerald accent is what the accepted target uses, and the choice
survives scrutiny rather than merely being inherited: the accent `#10b981` is a mid-tone that reads as
action against a `#0f172a` page, and `--accent-ink` `#04231a` on it gives the button label a contrast
that a white label would not. The lighter `#34d399` exists so that *text* can carry the accent colour
at a readable contrast where the button's own green cannot - the two greens are one idea at two
contrasts, not a palette.

Two decisions are worth naming because they are design decisions and not styling. First, the state
change moves focus to the sent card's heading: a person who cannot see the switch still learns that
the screen changed, which matters more here than anywhere else in the corpus because the whole
premise is that the person is locked out and unsure. Second, the preview is honest by construction - the
controls that would imply a working service are disabled and labelled, and the notice states that no
message was sent and no expiry exists. A preview that showed a live countdown and an enabled "Open
Email App" would be a more attractive picture and a false one.

Where the boards disagree with this system, it is recorded here rather than smoothed over. Measured on
the committed JPEGs: `step1-request.jpg` is a full-bleed viewport with a "NEXUS" wordmark, a left-side
field icon and a placeholder address, while `step2-sent.jpg` renders as a macOS window on a blurred
desktop with no wordmark - so the pair disagrees about its own frame, and the second board's copy
promises a sent message and a fifteen-minute expiry that the specification does not. `mwg-train-jnkx`
is the bead that re-renders them as unframed UI. Until it lands, these two boards are the least
reliable part of this archetype's record, and the stylesheet quoted above is the reliable one.

## Provenance

- Boards, prompts, SHA-256 digests and rights: [`README.md`](README.md) and the register
  [`docs/provenance/assets/design-reference-wave2.md`](../../../provenance/assets/design-reference-wave2.md).
  Both boards are `excluded_from_training: true`, `approved_for_training: false`, generated with
  `gemini-nano-banana-2.1` through a gateway that refuses to write a board unless the response attests
  that model, and no seed was set, so they are not reproducible.
- The accepted target and every value quoted above: [`demo/styles.css`](demo/styles.css),
  [`demo/index.html`](demo/index.html) and [`demo/README.md`](demo/README.md), driven in a real browser
  by `scripts/verify-account-recovery-demo.mjs`.
- Behaviour for the same archetype: [`plan.md`](plan.md) beside this file.
- The recorded brand decision, and why the wordmark on a board is not a token:
  `assets/archetypes/account-recovery/decisions.json`.
- The type axis that classifies this archetype: [`docs/train/briefs/TYPE-AXIS.md`](../../../train/briefs/TYPE-AXIS.md).
- Section contract this document follows: `src/design/contract.mjs` (`DESIGN_SECTIONS`).

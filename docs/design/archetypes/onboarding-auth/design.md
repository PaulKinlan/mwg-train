---
archetype: onboarding-auth
type: b2b-saas-signup
boards: docs/design/archetypes/onboarding-auth/
---

# `onboarding-auth` — aesthetic system

The look of the `onboarding-auth` type, expanding from the `tr-05` and `fam-05` reference boards into a full multi-step journey. This document is written in the section order `src/design/contract.mjs` requires of a design document (`DESIGN_SECTIONS`).

One difference from those documents is stated up front rather than implied: they describe an authored target board, and this describes a set of **pending generated** reference boards for the full multi-step journey. Every value below is the set the generation prompts will declare. Behaviour is in [`plan.md`](plan.md), not in this file.

## Visual thesis

A secure member onboarding and authentication portal. The visual language conveys privacy, security, and institutional trust: focused, distraction-free centered forms, unmistakable validation states, and unambiguous session controls. The palette is grounded in an accessible, professional aesthetic appropriate for a reading society or civic volunteer network.

The layout emphasizes the primacy of the credential exchange. Forms are isolated from complex navigation to prevent distraction during sensitive data entry. The authenticated profile view pivots from the tight onboarding layout to a wider, personalized dashboard that reinforces the user's logged-in state.

## Grammar and layout

- A focused page frame for authentication states, `--auth-frame: 480px`, vertically and horizontally centred, with subtle shadow elevation.
- The registration page (`step1-signup`) is a clean, single-column form collecting name, email, and password.
- The sign-in page (`step2-login`) mirrors the registration structure but prioritizes the credential fields and password recovery link.
- The authenticated dashboard (`step3-profile`) breaks out of the narrow auth frame into a wider `--content-frame: 1000px`, displaying the member's details and a prominent 'Log out' action.
- The password recovery request (`step4-forgot`) is a simplified form asking only for the registered email address.
- The password update state (`step5-reset`) securely captures and confirms the new credential verified by the token.

## Typography

- A highly legible system sans-serif stack ensuring critical email characters (like 'l' vs 'I') are unambiguous.
- Exactly one `h1` per page, clearly titling the authentication step (e.g. "Create your account" or "Sign in").
- Form inputs feature clear programmatic labels placed directly above the fields.
- Validation errors and password strength hints use a slightly smaller, distinct font weight to distinguish them from standard input labels.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--bg-page` | `#f8fafc` | The clean page ground isolating the auth cards |
| `--bg-surface` | `#ffffff` | Elevated auth cards and profile dashboards |
| `--border` | `#cbd5e1` | Structural input borders and card outlines |
| `--accent` | `#0f766e` | Teal primary actions, submit buttons, and focus rings |
| `--text-primary` | `#0f172a` | High-contrast slate text for primary readability |
| `--text-error` | `#b91c1c` | Crimson red for inline accessible validation warnings |

## Spacing rhythm

- `--page-padding: 2rem` surrounding the auth card, `--control-radius: 6px`, `--control-border: 1px solid var(--border)`.
- Ample spacing (`1.5rem` or more) between adjacent inputs to prevent accidental mis-taps on mobile devices.
- Form fields are separated by sufficient vertical rhythm so that `aria-invalid` error messages fit seamlessly beneath inputs without causing jarring layout shifts when they appear.

## Component hierarchy

1. **Brand Header** - Minimal logo mark centered above the auth card (no complex navigation).
2. **Auth Card** - The elevated surface housing the active credential form.
3. **Form Fields** - Standardized email, text, and password inputs with autofill attributes.
4. **Validation Messages** - Inline text tied to inputs via `aria-describedby`.
5. **Primary Action** - The high-contrast submit button.
6. **Secondary Links** - Contextual navigation (e.g. "Forgot password?" or "Already have an account?").

## Anti-patterns

- Relying exclusively on red borders without accompanying text to indicate an invalid password or email.
- Trapping users in a narrow auth frame after they successfully log in; the profile should expand to utilize the full viewport.
- Omitting proper `autocomplete` attributes, which needlessly frustrates users relying on password managers.

## Rationale

The authentication and account recovery use case demands absolute clarity and security. Users are exchanging sensitive credentials, meaning the layout cannot afford distracting marketing sidebars or ambiguous validation errors. The design system therefore elevates standard forms into focused, trustworthy isolation chambers. The teal and slate palette provides a calming, professional aesthetic that reinforces institutional safety while guaranteeing strict WCAG contrast for accessible error reporting.

## Provenance

- Evaluated against the A1 training family (`tr-05`) and the A6 evaluation spec (`fam-05` / `onboarding-auth`).
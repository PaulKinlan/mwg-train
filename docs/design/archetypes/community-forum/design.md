---
archetype: community-forum
type: fan-community
axis: docs/train/briefs/TYPE-AXIS.md
boards: docs/design/archetypes/community-forum/
register: docs/provenance/assets/training-reference-boards.md
---

# `community-forum` — aesthetic system

The look of the `fan-community` type as this archetype implements it, expanded from the family's single
landing reference into a full multi-step journey. This document is written in the section order
[`src/design/contract.mjs`](../../../../src/design/contract.mjs) requires of a design document
(`DESIGN_SECTIONS`).

**Where this system comes from.** The token set below is **declared**, not observed: it is the palette named
in the generation prompt for this family ([`prompt.txt`](../../training/tr-20/prompt.txt)), which asks for a
light palette "recognisable by its own token prefix rather than by a shared template". The committed landing
reference ([`reference.jpg`](../../training/tr-20/reference.jpg)) is a depiction of that declaration, and
every use recorded in the table below was read out of those bytes. The five journey boards this document
describes do not exist yet — see *Implementation status* in `plan.md`.

## Visual thesis

A working tune archive for people who play together in person. It should read like a well-kept session
notebook rather than a social feed: parchment paper, one deep heritage brown banding the header and footer,
one amber-gold accent carrying the single primary action, and room around the things musicians actually read
— a tune's key, its rhythm, its notation, and the notes other players left about it.

The reference's own composition states the priority. The tune is presented with its ABC notation line **and**
a rendered musical staff, so the design is claiming that a session player can read the tune here, not merely
link to it. The discussion thread sits below the tune and is set quieter than it: a note is apparatus
attached to a tune, never a post in a feed.

## Grammar and layout

- One page frame, `--content-frame: 1200px`, centred, with `--page-padding: 1.5rem` at the sides.
- The reference is a **browser viewport**: the chrome runs along the top edge with macOS-style window
  controls, a single tab and an address bar, and the page fills the rest. That framing is declared by the
  prompt and is visible in the bytes, so it is part of what this board depicts rather than an accident of
  capture.
- Page structure top to bottom, as the reference renders it: a brand header carrying the title, its tagline
  and the current date; a navigation bar; a two-column main area; a social-proof row; and a full-width
  footer.
- The library (`step1-browse`) leads with the rhythm filter, because filtering by reel, jig, hornpipe or
  polka is the first thing a player does. Tunes are listed as rows carrying title, key and rhythm rather than
  as image cards.
- The thread (`step2-thread`) is a reading page: the tune's title, its key and rhythm stated at the top, its
  notation, then its discussion as a chronological column of notes, each naming its author and date.
- The composer (`step3-composer`) is the note form itself, `form#note-form`, rendered inline as a card in the
  page rather than hidden behind a modal or a step wizard, so the thread being contributed to stays visible.
- The moderation view (`step4-moderation`) is the same thread with held notes visible to the moderator and a
  stated reason on each hold, so the decision stays legible after the fact.
- The empty state (`step5-empty`) is a quiet panel naming what did not match — the searched term or the
  selected rhythm — never an apology and never a bare blank region.

**One divergence, recorded rather than smoothed over.** The prompt also instructs that the content "runs past
the left, right and bottom edges" with no visible page end. The committed reference does not do that: it
shows the whole page bounded inside the viewport, with a complete footer band across the bottom. The bytes
are the measurement, so any future board generated for this archetype should be read with that difference in
mind rather than assumed to match the instruction.

## Typography

- A system UI sans-serif stack, as declared, and exactly one `h1` on the reference — the archive's own name
  in the header. Section headings inside cards keep a real document outline below it.
- Roughly three visual tiers on the reference: the archive's name, the card-level section titles, and one
  level below that for sub-elements inside a card.
- ABC notation and the tempo value are the two places where a monospace or otherwise character-aligned face
  earns its keep, because both are read character by character.
- Form inputs carry visible labels placed directly above their fields. On the reference every one of the six
  controls has a visible label, and the single placeholder present is an example rather than a label.

## Token usage

| Token | Value | Used for |
| --- | --- | --- |
| `--fv-brown` | `#450a0a` | The header and footer bands; the frame around the whole page |
| `--fv-gold` | `#b45309` | The accent: the primary submit action, the selected filter pill, the active navigation underline, and the rating stars |
| `--fv-parchment` | `#fefce8` | The page ground |
| `--fv-card` | `#ffffff` | Card and form surfaces against the parchment ground |
| `--fv-border` | `#fef08a` | Warm hairline borders on cards and inputs |
| `--fv-text` | `#292524` | Tune titles, headings and body copy |
| `--fv-muted` | `#78716c` | Author names, dates, placeholders and secondary metadata |

The accent is the only chromatic colour and carries the single primary action, as declared; the brown is a
structural tone for banding rather than a second accent. The declared values are light-ground tokens, and the
reference bears that out: the parchment ground and white cards cover most of the frame, with the brown
confined to the two bands. Because this palette is declared rather than sampled from a colour profile, its
contrast ratios should be verified when the journey boards are generated, not asserted here.

## Spacing rhythm

- `--page-padding: 1.5rem`, `--control-radius: 8px`, `--control-border: 1px solid var(--fv-border)` — the
  declared structural constants.
- Notes in a thread are separated by a full step of vertical rhythm, so a long thread stays scannable and an
  author byline never reads as part of the previous note's body.
- The filter row keeps a consistent height whether a tag is selected or not, so selecting a rhythm does not
  shift the library beneath it.

## Component hierarchy

1. **Brand header** — the archive's name and tagline, the current date, and the session greeting.
2. **Navigation bar** — the brown band carrying the section links and the active-tab indicator.
3. **Rhythm and key filters** — the two rows of selectable pills that scope the library.
4. **Tune card** — the selected tune: title, key and rhythm, a background line, the ABC notation text and a
   rendered staff excerpt.
5. **Thread** — the discussion list, each note carrying its body, its author and its date.
6. **Note form** — `form#note-form`: musician name, tune title, dance rhythm, musical key, optional tempo and
   the discussion note.
7. **Community voice** — the social-proof row of quoted reviews with portraits and ratings.
8. **Footer** — the archive's contact details and its statement of purpose.
9. **State panels** — the empty result state and the moderation view's stated hold reason.

## Anti-patterns

- A posting control offered to a reader who cannot use it: a form a signed-out visitor can fill in but not
  submit, or a moderation affordance shown to someone who cannot moderate.
- A second accent colour competing with the primary action.
- Placeholder text standing in for a visible label.
- A modal or step wizard hiding part of the form, so the thread being contributed to disappears while writing.
- Colour alone carrying an error state with no message naming the field.
- An empty result rendered as a blank region rather than naming the search or the filter that matched nothing.

These are the prompt's own prohibitions, kept here as the archetype's rules. On the committed landing
reference none of them is violated: the six controls all carry visible labels, the accent is used
consistently, the form is inline rather than modal, and the greeting indicates a recognised session player
rather than a visitor being offered a control they cannot use.

## Rationale

The use case is a pub session: the same people, in the same room, building a repertoire over months. That
argues for a notebook, not a feed. A player arrives with a tune in mind or a rhythm in mind, and leaves
either having read the tune properly — including its notation — or having written a variation down.
Everything the design does serves those two acts.

The archive's own authority is the record, so the design keeps the tune visually primary and the discussion
subordinate but present, and gives the notation enough room to be read. The heritage brown banding is doing
the same work as a pub's painted sign: it says whose archive this is, at no cost to the legibility of the
tunes themselves.

## Provenance

- **The declaration:** [`prompt.txt`](../../training/tr-20/prompt.txt) for this family, sha256 `1b61d3a4…`,
  which names the palette, the structural constants, the page structure and the prohibited anti-patterns
  quoted above.
- **The depiction:** [`reference.jpg`](../../training/tr-20/reference.jpg), 1376 × 768, 659761 bytes, sha256
  `3e000d4f2c68620c312a99ad…`, generated by `gemini-nano-banana-2.1`. Its token uses, its single `h1`, its
  card structure and its inline form were read out of those bytes. Both files are pinned in
  [`docs/provenance/assets/training-reference-boards.md`](../../../provenance/assets/training-reference-boards.md).
- **The behaviour behind the screens:** `docs/train/briefs/manifest.jsonl`, family `tr-20` (`tr-20-v1`,
  `tr-20-v2`), and the train-side pair `docs/train/design/tr-20/`.
- **Not yet depicted:** the five journey states named in this document and in `plan.md`. They are planned and
  ungenerated, so this document is the declared system those boards will be generated against.

# Browser state-persistence measurement

The measured unit is a **rendered change produced by browser input**, not the existence of a design board, a URL parameter, a `localStorage` key, or a successful GET. This contract is separate from the pinned Modern Web Guidance rule vector. The pilot's original/uplifted form journeys still gate their final server echo. When `journey.steps` is declared, they additionally gate draft controls observed after returning to each step and after a **new document** via CDP `Page.reload` (main-frame loader ID must change); carried text is gated only when a step declares `expectText`. Missing optional `expectText` does not mean carry failed. Old committed records were measured before this change and **do not gain a new verdict**.

For a future non-form project, add `state_journey` to its functional spec, or `stateJourney` to its generator archetype. `archetypeFromSpec` and `buildProjectFor` carry it into the generated `spec.json`; the harness executes it for each version and acceptance requires `PASS` on both sides. Omit the block when no implementation exists: omission means **unmeasured**, not pass. Do not backfill an opt-in contract onto a historical run.

```json
{
  "startPath": "/workspace",
  "detourPath": "/roadmap",
  "actions": [
    { "type": "pointer", "selector": "[data-test=move-issue]" }
  ],
  "observations": [
    { "selector": "[data-test=issue-status]", "property": "text", "equals": "In Progress" }
  ]
}
```

Selectors and routes above are **illustrative only**; they do not exist in today's generic form-scaffolded workspace. An author must pin the real interface's selectors and an existing, same-origin detour route. Supported input types are `pointer` (trusted CDP mouse sequence), `type` (trusted text input), `select` (trusted native option), and `key` (explicit supported keys). Observations read visible DOM `text`, control `value`/`checked`, or a named `attribute`; they never read a storage key as proof. At least one expectation must be absent before interaction. Every expectation must then be present after the action, a true reload, browser Back from the detour, and a second reload to rule out a bfcache-only illusion. A missing route, invalid contract or failed CDP operation is `ERROR`, not a pass. A real but lost state is `FAIL`, naming each failed selector/property and whether it was missing or visibly mismatched. If Back restores a cached document, the second reload must still observe the declared state.

Example future contracts should use the authored functional plans, not screenshot copy: an issue's status/assignee in the workspace, selected option and BOM/URL state in the configurator, or a puzzle's move count and textual board state. The current `browser-puzzle-game`, `interactive-product-configurator` and `saas-workspace-board` training scaffold projects only expose ordinary intake forms. No live provider-generated app, non-form journey, or saved build/solution is claimed to have passed here. Run such projects only when generated-code sandbox containment is approved; controlled browser fixtures exercise this evaluator without executing untrusted generated code.

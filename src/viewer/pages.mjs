/**
 * HTML rendering for the viewer. Everything from a corpus record is escaped: the records describe
 * untrusted generated sites, and evidence text is attacker-controlled markup until proven
 * otherwise.
 *
 * The viewer's own chrome is deliberately plain raw-web-platform HTML with one inline stylesheet:
 * the viewer is not a demo of anything except the corpus.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASELINE_LABEL } from '../eval/ruleset.mjs';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const PAGE_CSS = `
  :root { color-scheme: light dark; --ground: #f5f7f8; --surface: #fff; --ink: #172b38; --muted: #4a606d; --line: #c8d5dc; --control-line: #687985; --action: #14577a; --focus: #087cbe; --success: #146238; --success-bg: #e3f4e9; --error: #9a2830; --error-bg: #fcebed; --warning: #795300; --warning-bg: #fff2d5; }
  @media (prefers-color-scheme: dark) { :root { --ground: #101b24; --surface: #192b36; --ink: #ecf4f7; --muted: #bbcad2; --line: #49606d; --control-line: #8aa4b2; --action: #9ed5fa; --focus: #8fd1ff; --success: #a8e9be; --success-bg: #173d2d; --error: #ffb9bc; --error-bg: #49252c; --warning: #f8d888; --warning-bg: #42361d; } }
  * { box-sizing: border-box; }
  html { background: var(--ground); }
  body { max-width: 88rem; margin: 0 auto; padding: clamp(1rem, 3vw, 2rem); color: var(--ink); background: var(--ground); font: 1rem/1.55 system-ui, sans-serif; }
  h1 { margin: 1.2rem 0 0.7rem; font-size: clamp(1.75rem, 1.35rem + 1.4vw, 2.4rem); line-height: 1.15; letter-spacing: -0.025em; overflow-wrap: anywhere; }
  h2 { margin: 2.3rem 0 0.8rem; font-size: 1.35rem; }
  h3 { font-size: 1.08rem; }
  p { max-width: 75ch; }
  a { color: var(--action); text-underline-offset: 0.2em; }
  a:hover { text-decoration-thickness: 0.13em; }
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
  ::selection { background: var(--action); color: var(--ground); }
  nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; padding-block: 0.55rem 1rem; border-bottom: 1px solid var(--line); }
  nav a { display: inline-flex; align-items: center; min-height: 2.75rem; padding-inline: 0.45rem; font-weight: 650; }
  .muted { color: var(--muted); }
  .inline-form { display: inline; }
  /* The prompt workbench's own layout, kept here so viewer pages carry no inline styles at all and the CSP can
     name this block by hash (mwg-train-mslb). Declarations moved verbatim from the elements that carried them. */
  .tuning-hint { margin-top: 0.5rem; font-size: 0.85rem; }
  .tuning-note { font-size: 0.85rem; }
  .tuning-subhead { margin-top: 1.5rem; }
  .tuning-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .tuning-actions { display: flex; justify-content: space-between; align-items: center; margin-block: 1rem 0.25rem; }
  .tuning-label-flush { margin: 0; }
  .notice, .danger { max-width: none; padding: 0.9rem 1rem; border-radius: 0.65rem; }
  .notice { background: var(--warning-bg); color: var(--ink); }
  .danger { background: var(--error-bg); color: var(--ink); }
  .badge { display: inline-block; max-width: 100%; padding: 0.14rem 0.55rem; border-radius: 0.45rem; font-size: 0.78rem; line-height: 1.45; font-weight: 700; vertical-align: middle; overflow-wrap: anywhere; }
  .badge.accepted, .badge.scan-pass { background: var(--success-bg); color: var(--success); }
  .badge.rejected, .badge.scan-fail, .badge.scan-error { background: var(--error-bg); color: var(--error); }
  .badge.warn { background: var(--warning-bg); color: var(--warning); }
  .badge.no-run { background: var(--surface); color: var(--muted); border: 1px solid var(--line); }
  .status-PASS { color: var(--success); font-weight: 700; }
  .status-FAIL { color: var(--error); font-weight: 700; }
  .status-ERROR { color: var(--warning); font-weight: 700; }
  .sha, code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
  .sha { font-size: 0.82rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { padding: 0.12rem 0.45rem; border-radius: 0.35rem; background: var(--ground); font-size: 0.8rem; }
  .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .panel { min-width: 0; padding: clamp(0.9rem, 2vw, 1.3rem); border: 1px solid var(--line); border-radius: 0.75rem; background: var(--surface); overflow-wrap: anywhere; }
  .panel h2, .panel h3 { margin-top: 0; }
  dl { display: grid; grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr); gap: 0.5rem 1rem; margin: 0; }
  dt { font-weight: 650; color: var(--muted); }
  dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .shots img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 0.4rem; margin: 0.5rem 0 1rem; }
  details { margin: 0.45rem 0; }
  summary { cursor: pointer; min-height: 2.75rem; padding: 0.5rem 0; }
  pre { max-width: 100%; padding: 0.8rem; border-radius: 0.45rem; background: var(--ground); overflow-x: auto; font-size: 0.85rem; }
  pre code { display: block; white-space: pre; line-height: 1.35; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  blockquote { margin: 1rem 0; padding: 0.6rem 1rem; border-left: 4px solid var(--action); background: var(--surface); color: var(--ink); border-radius: 0 0.45rem 0.45rem 0; }
  blockquote p { margin: 0; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }
  button, select { min-height: 2.75rem; padding: 0.45rem 0.75rem; border: 1px solid var(--control-line); border-radius: 0.45rem; background: var(--surface); color: var(--ink); font: inherit; }
  button { cursor: pointer; border-color: var(--action); background: var(--action); color: var(--ground); font-weight: 700; }
  button:disabled { cursor: not-allowed; border-color: var(--line); background: var(--ground); color: var(--muted); }
  form.filters { display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: end; margin: 1.3rem 0; padding: 1rem; border: 1px solid var(--line); border-radius: 0.75rem; background: var(--surface); }
  form.filters label { display: flex; flex: 1 1 9rem; flex-direction: column; gap: 0.25rem; min-width: 0; font-size: 0.88rem; font-weight: 650; }
  form.filters select { width: 100%; font-weight: 400; }
  .table-scroll { max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; border: 1px solid var(--line); border-radius: 0.65rem; background: var(--surface); }
  .table-hint { margin: 0.2rem 0 0.45rem; color: var(--muted); font-size: 0.9rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  table { width: 100%; min-width: 45rem; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; font-variant-numeric: tabular-nums; }
  .corpus-table { min-width: 76rem; }
  th, td { padding: 0.75rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  th { position: sticky; top: 0; z-index: 1; background: var(--ground); font-weight: 700; white-space: nowrap; }
  tbody tr:last-child > * { border-bottom: 0; }
  tbody tr:hover { background: var(--ground); }
  .corpus-table tbody tr:not(.empty-row) td:first-child, .corpus-table thead th:first-child { position: sticky; left: 0; z-index: 2; min-width: 10.5rem; background: var(--surface); border-right: 1px solid var(--line); }
  .corpus-table thead th:first-child { z-index: 3; background: var(--ground); }
  td form { display: inline-block; margin: 0 0.25rem 0.4rem 0; }
  .journey-steps { padding-inline-start: 1.4rem; font-size: 0.9rem; overflow-wrap: anywhere; }
  .pipeline-context { margin-block: 0.8rem 1rem; }
  .pipeline-context summary { font-weight: 650; color: var(--action); }
  .tuning-selector { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; align-items: end; gap: 0.4rem 0.8rem; margin: 1.3rem 0; padding: 1rem; border: 1px solid var(--line); border-radius: 0.75rem; background: var(--surface); }
  .tuning-selector label { grid-row: 1; color: var(--muted); font-size: 0.88rem; font-weight: 700; }
  .tuning-selector select { grid-row: 2; min-width: 0; width: 100%; }
  .tuning-selector button { grid-column: 4; grid-row: 2; }
  .tuning-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: start; }
  .tuning-grid > div { display: grid; gap: 1rem; min-width: 0; }
  .tuning-grid .panel h2 { margin: 0 0 0.5rem; }
  .tuning-grid .panel p { margin-block: 0.5rem 1rem; }
  .tuning-target { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 0.4rem; }
  .tuning-source { padding-block: 0.6rem; border-top: 1px solid var(--line); }
  .tuning-source h3 { margin-block: 0.3rem; }
  .tuning-editor label { display: block; font-weight: 700; margin-block: 1rem 0.25rem; }
  .tuning-editor textarea, .tuning-editor input { width: 100%; min-height: 3rem; padding: 0.65rem 0.75rem; border: 1px solid var(--control-line); border-radius: 0.45rem; background: var(--surface); color: var(--ink); font: inherit; }
  .tuning-editor textarea { min-height: 8rem; resize: vertical; font-family: inherit; }
  .tuning-editor textarea[readonly] { background: var(--ground); font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .tuning-settings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
  .tuning-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-block: 1.2rem; }
  .tuning-actions button:not([type=submit]) { background: var(--surface); color: var(--action); }
  #draft-status { color: var(--muted); font-weight: 650; }
  .prompt-comparison-panel { margin-bottom: 1.2rem; }
  .prompt-comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 0.8rem; }
  .prompt-voice-card { padding: 1rem; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--ground); }
  .prompt-voice-card.active { border-color: var(--focus); background: var(--surface); box-shadow: 0 0 0 1px var(--focus); }
  .prompt-voice-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.65rem; }
  .prompt-voice-header h3 { margin: 0; font-size: 1.05rem; }
  .prompt-voice-text { font-size: 0.95rem; line-height: 1.6; margin: 0; }
  .diff-chip { padding: 0.08rem 0.3rem; border-radius: 0.25rem; font-weight: 600; text-decoration: none; }
  .diff-chip.diff-v1 { background: rgba(20, 87, 122, 0.16); color: var(--ink); }
  .diff-chip.diff-v2 { background: rgba(20, 98, 56, 0.2); color: var(--ink); }
  .diff-legend { display: flex; flex-wrap: wrap; gap: 0.8rem; font-size: 0.84rem; margin-top: 0.8rem; color: var(--muted); }
  .diff-legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
  .convergence-preview-panel { margin-bottom: 1.2rem; border: 2px solid var(--line); }
  .preview-panel-header { margin-bottom: 1rem; }
  .draft-callout { margin-block: 0.6rem 1rem; padding: 0.75rem 1rem; border-radius: 0.5rem; background: var(--warning-bg); color: var(--ink); border: 1px solid var(--warning); font-size: 0.9rem; }
  .convergence-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.2rem; align-items: start; }
  .convergence-target-col, .convergence-draft-col { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .convergence-col-header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
  .convergence-col-header h3 { margin: 0; font-size: 1.1rem; }
  .target-preview-frame { position: relative; border: 1px solid var(--line); border-radius: 0.4rem; overflow: hidden; background: var(--ground); }
  .target-preview-frame img { display: block; width: 100%; height: auto; }
  .draft-prompt-live { padding: 1rem; border-radius: 0.5rem; background: var(--ground); border: 1px solid var(--line); font-size: 0.95rem; line-height: 1.6; min-height: 7rem; white-space: pre-wrap; word-break: break-word; }
  .draft-meta-pills { margin-top: 0.4rem; }
  .board-generation-panel { margin-bottom: 1.2rem; }
  .board-generation-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.2rem; align-items: start; }
  .board-generation-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 0.4rem; }
  .board-generation-actions button { min-height: 2.6rem; padding: 0.4rem 1rem; border: 1px solid var(--action); border-radius: 0.45rem; background: var(--surface); color: var(--action); font: inherit; font-weight: 700; cursor: pointer; }
  .board-generation-actions button:hover:not(:disabled) { background: var(--action); color: var(--ground); }
  .board-generation-actions button:disabled { cursor: progress; opacity: 0.6; }
  .board-frame { border: 1px solid var(--line); border-radius: 0.4rem; overflow: hidden; background: var(--ground); }
  .board-frame img { display: block; width: 100%; height: auto; }
  .board-frame.board-empty { display: grid; place-items: center; min-height: 12rem; padding: 1.5rem 1rem; border-style: dashed; text-align: center; }
  .board-frame.board-empty p { margin: 0; max-width: 34rem; }
  .board-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.55rem 0 0; padding: 0; list-style: none; }
  .board-notes { margin: 0.5rem 0 0; padding-inline-start: 1.2rem; color: var(--muted); font-size: 0.86rem; }
  .target-inspection-panel .target-inspection-frame { position: relative; border: 1px solid var(--line); border-radius: 0.4rem; overflow: hidden; background: var(--ground); }
  .target-inspection-panel .target-inspection-frame img { display: block; width: 100%; height: auto; }
  .target-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.6rem; }
  .button-link { display: inline-flex; align-items: center; min-height: 2.4rem; padding: 0.35rem 0.85rem; border: 1px solid var(--action); border-radius: 0.45rem; background: var(--surface); color: var(--action); text-decoration: none; font-weight: 650; font-size: 0.88rem; }
  .button-link:hover { background: var(--action); color: var(--ground); }
  .button-link.small { min-height: 1.9rem; padding: 0.2rem 0.55rem; font-size: 0.8rem; }
  .tuning-target-meta { margin-top: 0.8rem; }
  .target-boards-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 0.8rem; }
  .target-board-card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.85rem; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--ground); }
  .target-board-card h3 { margin: 0; font-size: 1.05rem; }
  .reference-missing-card { display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 12rem; padding: 1.5rem 1rem; border: 1px dashed var(--line); border-radius: 0.4rem; background: var(--ground); text-align: center; }
  .reference-missing-card p { margin: 0.25rem 0; }
  .concept-lede { font-size: 1.08rem; max-width: 72ch; }
  .concept-jump { display: flex; flex-wrap: wrap; gap: 0.6rem 1.2rem; padding-block: 0.65rem; border-block: 1px solid var(--line); }
  .concept-jump a { display: inline-flex; align-items: center; min-height: 2.75rem; }
  .concept-pattern-index { display: block; padding: 0.4rem 0; border-bottom: none; }
  .concept-pattern-index ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr)); gap: 0.6rem 1rem; list-style: none; padding: 0; margin-block: 0.5rem 1.5rem; }
  .concept-pattern-index li { break-inside: avoid; padding-block: 0.12rem; }
  .concept-pattern-index a { display: inline; min-height: 0; padding-inline: 0; }
  .concept-explainer { max-width: 76ch; padding-block: 0.5rem 1.3rem; }
  .concept-explainer p { margin-block: 0.6rem; }
  .concept-board-flow { display: grid; grid-template-columns: minmax(0, 1fr); gap: clamp(1.5rem, 3vw, 2.5rem); }
  .concept-comparison figure { min-width: 0; margin: 0; }
  .concept-prompt { max-width: 80ch; padding-block: 0.3rem; border-bottom: 1px solid var(--line); }
  .concept-prompt summary { color: var(--action); font-weight: 650; cursor: pointer; padding-block: 0.2rem; }
  .concept-prompt-pre { margin-block: 0.5rem 0.8rem; border: 1px solid var(--line); background: var(--ground); border-radius: 0.35rem; padding: 0.75rem 1rem; overflow-x: auto; }
  code.concept-prompt-copy { font-family: var(--code-font, ui-monospace, monospace); font-size: 0.88rem; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; color: var(--ink); display: block; background: transparent; padding: 0; border: none; }
  .score-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-block: 1rem; }
  .score-card { border: 1px solid var(--line); border-radius: 0.4rem; padding: 1rem 1.2rem; background: var(--surface); }
  .score-card h4 { margin: 0 0 0.5rem; font-size: 0.92rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .score-card.score-default { border-left: 4px solid var(--line); }
  .score-card.score-ideal { border-left: 4px solid var(--action); }
  .score-stat { font-size: 1.05rem; margin: 0 0 0.35rem; font-weight: 600; }
  .score-num { font-size: 1.35rem; color: var(--ink); }
  .score-delta { color: var(--action); font-size: 0.95rem; font-weight: bold; margin-left: 0.4rem; }
  .score-meta { margin: 0; font-size: 0.88rem; color: var(--muted); }
  .concept-spec-panel { margin-block: 1.2rem; }
  .concept-image-frame a { display: block; background: var(--surface); }
  .concept-comparison { padding-block: 0.6rem 1.5rem; border-top: 1px solid var(--line); }
  .concept-comparison h3 { margin: 0.3rem 0 0.8rem; text-transform: capitalize; }
  .concept-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(0.9rem, 2vw, 1.5rem); }
  .concept-image-frame { display: grid; place-items: center; min-height: 11rem; background: var(--surface); }
  .concept-image-frame img { display: block; max-width: 100%; width: 100%; height: auto; }
  .concept-image-frame p { padding: 1.5rem; overflow-wrap: anywhere; }
  .concept-main-board { margin-bottom: 1rem; }
  .concept-main-board figure { margin: 0; }
  .concept-main-board img { display: block; width: 100%; max-width: 100%; height: auto; border-radius: 0.4rem; }
  .harness-target-drawer { margin-top: 0.75rem; padding: 0.6rem 0.9rem; background: var(--surface); border: 1px solid var(--line); border-radius: 0.4rem; }
  .harness-target-drawer summary { cursor: pointer; font-size: 0.9rem; color: var(--muted); font-weight: 500; }
  .harness-target-drawer summary:hover { color: var(--ink); }
  .harness-target-drawer figure { margin-top: 0.75rem; }
  .concept-comparison figcaption { margin-top: 0.45rem; overflow-wrap: anywhere; }
  .concept-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1.5rem; padding-inline-start: 1.6rem; }
  .concept-steps li { min-width: 0; padding-inline-start: 0.2rem; }
  .concept-steps figure { min-width: 0; margin: 0; }
  .concept-steps figcaption { padding-block: 0.45rem; color: var(--muted); overflow-wrap: anywhere; }
  .concept-steps figcaption strong { color: var(--ink); }
  .concept-theme-set { margin-block: 1rem 1.4rem; padding: 1rem 1.15rem; border: 1px solid var(--line); border-radius: 0.55rem; background: var(--surface); }
  .concept-theme-set.concept-theme-dark { background: color-mix(in srgb, var(--surface) 88%, #090d16 12%); }
  .concept-theme-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; margin: 0 0 0.85rem; font-size: 0.98rem; }
  .theme-pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.18rem 0.65rem; border-radius: 999px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.02em; border: 1px solid var(--line); }
  .theme-pill-light { background: #fffbeb; color: #78350f; border-color: #fcd34d; }
  .theme-pill-dark { background: #0f172a; color: #e2e8f0; border-color: #334155; }
  .eval-target-showcase { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; margin-top: 0.75rem; }
  .eval-reference-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
  @media (max-width: 55rem) { .tuning-grid, .prompt-comparison-grid, .convergence-grid, .target-boards-pair, .board-generation-grid { grid-template-columns: minmax(0, 1fr); } .tuning-selector { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tuning-selector label, .tuning-selector select, .tuning-selector button { grid-column: auto; grid-row: auto; } .tuning-selector button { grid-column: 1 / -1; } }
  @media (max-width: 35rem) { .tuning-selector, .tuning-settings { grid-template-columns: minmax(0, 1fr); } .tuning-selector button { grid-column: auto; } }
  @media (max-width: 48rem) {
    .concept-pair { grid-template-columns: minmax(0, 1fr); }
    .pair { grid-template-columns: minmax(0, 1fr); }
    dl { grid-template-columns: minmax(0, 1fr); gap: 0.1rem; }
    dd { margin-bottom: 0.5rem; }
    form.filters > button { flex: 1 1 100%; }
    .table-hint { display: block; }
  }
`;

/**
 * The sha256 of the page's style block, for the Content-Security-Policy's style-src (mwg-train-mslb). The viewer
 * emits PAGE_CSS as one inline <style> block; naming its hash is what lets the policy refuse inline styles
 * everywhere else rather than allowing 'unsafe-inline' for the sake of that one block. Because it is computed from
 * the same constant the page emits, adding or editing a CSS rule cannot silently break the page's styling; a test
 * asserts the header's hash and the served block still agree.
 */
export function pageStyleHash() {
  return createHash('sha256').update(PAGE_CSS).digest('base64');
}

export function page(title, body, { navOrigin = '' } = {}) {
  const base = escapeHtml(navOrigin);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — mwg-train corpus viewer</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<nav aria-label="Primary"><a href="${base}/">corpus index</a> · <a href="${base}/concepts">concepts</a> · <a href="${base}/tuning">prompt workbench</a> · <a href="${base}/pipeline">pipeline</a></nav>
<main id="content">${body}</main>
</body>
</html>`;
}

/**
 * Minimal markdown renderer for docs/PIPELINE.md (the doc stays the source of truth; the viewer
 * renders it, so the pipeline page cannot drift from the doc). Handles headings, pipe tables,
 * lists, paragraphs, and inline bold/code formatting. Everything is escaped before formatting.
 */
export function renderMarkdown(md) {
  const inline = (text) =>
    escapeHtml(text)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  const out = [];
  let inCode = false;
  let codeLines = [];
  let inList = null;
  let inSubList = false;
  let table = null;

  const closeBlocks = () => {
    if (inSubList) { out.push('</ul>'); inSubList = false; }
    if (inList) { out.push(`</${inList}>`); inList = null; }
    if (table) { out.push('</tbody></table></div>'); table = null; }
  };

  for (const rawLine of md.split('\n')) {
    if (rawLine.trim().startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${codeLines.map(escapeHtml).join('\n')}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeBlocks();
        inCode = true;
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    const trimmed = rawLine.trim();

    if (trimmed === '---' || trimmed === '***') {
      closeBlocks();
      out.push('<hr>');
      continue;
    }

    if (rawLine.startsWith('> ')) {
      closeBlocks();
      out.push(`<blockquote><p>${inline(rawLine.slice(2).trim())}</p></blockquote>`);
      continue;
    }

    if (rawLine.startsWith('### ')) { closeBlocks(); out.push(`<h3>${inline(rawLine.slice(4))}</h3>`); continue; }
    if (rawLine.startsWith('## ')) { closeBlocks(); out.push(`<h2>${inline(rawLine.slice(3))}</h2>`); continue; }
    if (rawLine.startsWith('# ')) { closeBlocks(); out.push(`<h1>${inline(rawLine.slice(2))}</h1>`); continue; }

    if (rawLine.startsWith('|')) {
      const cells = rawLine.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
      if (!table) {
        closeBlocks();
        out.push('<div class="table-scroll" role="region" aria-label="Pipeline table" tabindex="0"><table><tbody>');
        out.push(`<tr>${cells.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr>`);
        table = true;
      } else {
        out.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
      }
      continue;
    }

    const subBulletMatch = rawLine.match(/^\s{2,}[-*]\s+(.*)$/);
    if (subBulletMatch && inList) {
      if (!inSubList) {
        out.push('<ul>');
        inSubList = true;
      }
      out.push(`<li>${inline(subBulletMatch[1])}</li>`);
      continue;
    }

    const bulletMatch = rawLine.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (table) { out.push('</tbody></table></div>'); table = null; }
      if (inSubList) { out.push('</ul>'); inSubList = false; }
      if (inList !== 'ul') {
        if (inList) out.push(`</${inList}>`);
        out.push('<ul>');
        inList = 'ul';
      }
      out.push(`<li>${inline(bulletMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = rawLine.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (table) { out.push('</tbody></table></div>'); table = null; }
      if (inSubList) { out.push('</ul>'); inSubList = false; }
      if (inList !== 'ol') {
        if (inList) out.push(`</${inList}>`);
        out.push('<ol>');
        inList = 'ol';
      }
      out.push(`<li>${inline(orderedMatch[1])}</li>`);
      continue;
    }

    closeBlocks();
    if (trimmed) out.push(`<p>${inline(trimmed)}</p>`);
  }

  if (inCode) {
    out.push(`<pre><code>${codeLines.map(escapeHtml).join('\n')}</code></pre>`);
  }
  closeBlocks();
  return out.join('\n');
}

/**
 * Legibility banners (Paul, 2026-10-08): every page says what it shows and why it matters - and
 * only claims what this checkout can actually show. Run evidence (journeys, rule measurements,
 * screenshots) exists only where a pilot run executed locally (pilot/out/ is gitignored); the
 * committed record (CORPUS.json) carries decisions and tree SHAs, and says so.
 */
export function indexBanner({ runEvidence, projectCount, archetypeCount, armCount }) {
  const evidenceLine = runEvidence
    ? 'acceptance is backed by browser-run evidence you can click through (journeys, rule measurements, screenshots)'
    : 'this checkout has the committed record (CORPUS.json: decisions, tree SHAs, improved rules) but no local run records - journey-level evidence appears here after a local `npm run pilot:run`';
  return `
<div class="notice"><strong>${num(projectCount)} generated sites</strong> · ${num(archetypeCount)} archetypes × ${num(armCount)} rendering arms. Compare each DEFAULT with deterministic MWG repair (the IDEAL floor). Accepted and rejected attempts remain visible together.
<details><summary>What evidence is available, and why it matters</summary><p>This viewer covers pipeline stages 3–5 (GENERATE → MEASURE → RECORD). In this checkout, ${evidenceLine}. Rejected attempts stay visible because acceptance bias is only inspectable when they do. This is the EVAL instrument; training data comes only from a separate, disjoint corpus. <a href="/pipeline">Read the full pipeline</a>.</p></details></div>`;
}

export function projectBanner({ runEvidence }) {
  const evidenceLine = runEvidence
    ? 'the measured DEFAULT vs IDEAL evidence (journeys, rule tables, screenshots)'
    : 'the committed decision and SHAs (journey-level evidence exists after a local `npm run pilot:run`)';
  return `
<div class="notice"><strong>One project's evidence:</strong> attribution, acceptance, ${evidenceLine}, owner-auth status and live sandboxed trees.
<details><summary>How to read the DEFAULT and IDEAL</summary><p>The IDEAL is the deterministic mechanical-repair floor, not a model's work; the gap above it is what training exists to close. The served trees are hash-verified against the recorded corpus. Anything that cannot be reproduced to its recorded SHA is refused, not served.</p></details></div>`;
}
export const PIPELINE_STRIP = `
<p class="muted"><strong>Pipeline</strong> (<a href="/pipeline">full doc</a>):
1 BRIEFS → 2 RULES → 3 GENERATE → 4 MEASURE → 5 RECORD/VERIFY → 6 PRICE → <strong>7 TRAIN — queued behind disjoint training-set generation (mwg-train-0ov); the sealed eval set is never trained on</strong>.
Stages 1–6 are built, measured, and active. Roles: <strong>EVAL INSTRUMENT</strong> measures and is never trained on · <strong>DEFAULT</strong> is what we improve FROM · <strong>TRAINING SOURCE</strong> is the disjoint corpus accepted pairs come from · <strong>COST INPUT</strong> prices each accepted pair.</p>`;

export function stateBadge(view) {
  if (view.historical) return '<span class="badge no-run">NOT REMEASURED</span>';
  if (!view.hasRun) return '<span class="badge no-run">NOT YET RUN</span>';
  if (view.accepted) {
    // The recorded measurement decision and the owner-auth gate are distinct things: a pair is
    // presented as gate-clean only when the scan is a full PASS on both trees and the records.
    const gate = view.scan?.status;
    if (gate === 'PASS') return '<span class="badge accepted" title="recorded acceptance, and the owner-auth gate PASSes both trees and the records">ACCEPTED PAIR — gate-clean</span>';
    if (gate === 'PARTIAL') {
      const baselinePending = view.scan?.original?.status === 'MISSING';
      const title = baselinePending
        ? 'recorded acceptance; the trees are not on disk in this checkout - materialized from the plan, hash-verified and scanned at serve time'
        : 'recorded acceptance; baseline and records clean, the target is hash-verified and scanned at serve time';
      return `<span class="badge accepted" title="${title}">ACCEPTED PAIR — recorded; ${baselinePending ? 'trees verified+scanned at serve' : 'target scanned at serve'}</span>`;
    }
    return `<span class="badge warn">recorded acceptance — owner-auth gate ${escapeHtml(gate ?? 'not run')}: NOT gate-approved</span>`;
  }
  return `<span class="badge rejected" title="${escapeHtml(view.category)}">REJECTED ATTEMPT · ${escapeHtml(view.category)}</span>`;
}

export function scanBadge(scan, { originalOnly = false } = {}) {
  if (!scan) return '<span class="badge no-run">scan: not run</span>';
  if (scan.status === 'PASS') return '<span class="badge scan-pass">owner-auth scan: PASS</span>';
  if (scan.status === 'PARTIAL') {
    const originalPending = scan.original?.status === 'MISSING';
    if (originalOnly) {
      const label = originalPending ? 'DEFAULT pending (hash-verified+scanned at serve)' : 'DEFAULT PASS';
      return `<span class="badge warn">owner-auth scan: ${label}; no IDEAL recorded</span>`;
    }
    const targetPending = scan.uplifted?.status === 'MISSING';
    const pending = [originalPending && 'DEFAULT', targetPending && 'IDEAL'].filter(Boolean).join(' + ');
    const title = pending
      ? `${pending} not on disk in this checkout - materialized from the plan, hash-verified and scanned at serve time; nothing is claimed clean until then`
      : 'baseline tree clean; target snapshot not kept, regenerated and scanned at serve time';
    return `<span class="badge warn" title="${title}">owner-auth scan: ${pending ? `${pending} pending (verified+scanned at serve)` : 'PASS (baseline; target scanned at serve)'}</span>`;
  }
  if (scan.status === 'ERROR') return `<span class="badge scan-error">owner-auth scan: ERROR (fail-closed)</span>`;
  return '<span class="badge scan-fail">owner-auth scan: FAIL</span>';
}

function verificationBadge(verification, version) {
  if (!verification) return '';
  const entry = verification[version];
  if (!entry) return '';
  if (entry.status === 'verified') return '<span class="badge scan-pass">tree matches recorded sha</span>';
  if (entry.status === 'drifted') return '<span class="badge warn" title="the tree on disk no longer matches the sha recorded at run time">tree DRIFTED from recorded sha</span>';
  if (entry.status === 'unrecorded') return '<span class="badge no-run">no sha recorded</span>';
  return `<span class="badge warn">${escapeHtml(entry.status)}</span>`;
}

const shortSha = (sha) => (sha ? sha.replace(/^sha256:/, '').slice(0, 12) : '—');

/** Record-derived numbers are untrusted data too: coerce, never interpolate raw. */
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '0';
};

/**
 * Attribution for the artefact (Paul, 2026-10-08): every project/run view shows who or what made
 * it - the generating model with exact provider/id (or an explicit non-model source), the brief,
 * the framework with its pinned version, the generator with its timestamp, and the acceptance
 * status. Historical or unrecorded fields say UNKNOWN rather than implying a value.
 */
function attributionBlock(view) {
  const a = view.attribution ?? {};
  const row = (label, value) => `<dt>${label}</dt><dd>${escapeHtml(value ?? 'UNKNOWN (unrecorded)')}</dd>`;
  const rowRaw = (label, value) => `<dt>${label}</dt><dd>${value}</dd>`;

  const familyMatch = view.id?.match(/^(tr-\d{2})-/);
  const familyId = familyMatch ? familyMatch[1] : null;

  const archetypeHtml = view.archetype && view.archetype !== 'unknown'
    ? `<a href="/concepts/pattern/${escapeHtml(view.archetype)}"><code>${escapeHtml(view.archetype)}</code></a>`
    : 'UNKNOWN (unrecorded)';

  let briefHtml = escapeHtml(a.brief ?? 'UNKNOWN (unrecorded)');
  if (familyId) {
    briefHtml = `${escapeHtml(a.brief ?? '')} · <a href="/concepts/family/${escapeHtml(familyId)}"><code>${escapeHtml(familyId)}</code> Concept Family</a>`;
  } else if (view.archetype && view.archetype !== 'unknown') {
    briefHtml = `${escapeHtml(a.brief ?? '')} · <a href="/concepts/pattern/${escapeHtml(view.archetype)}"><code>${escapeHtml(view.archetype)}</code> Concept Pattern</a>`;
  }

  return `<section class="panel">
  <h2>attribution</h2>
  <dl>
    ${row('generating model', a.model)}
    ${a.buildKey ? row('build key', a.buildKey) : ''}
    ${rowRaw('archetype', archetypeHtml)}
    ${rowRaw('brief', briefHtml)}
    ${row('framework', a.framework)}
    ${row('generator', a.generator)}
    ${row('acceptance', a.acceptance)}
  </dl>
</section>`;
}

function liveLinks(view, liveOrigin, runId) {
  const scan = view.scan;
  // The buttons mirror the serving gate: a pair-level FAIL (a dirty tree OR a dirty record)
  // means the request would be refused, so the button is disabled rather than offered. A MISSING
  // tree (not materialized on disk) is servable: the live route materializes it from the plan,
  // hash-verifies it against the record, and scans it before it is reachable.
  const pairOk = scan && (scan.status === 'PASS' || scan.status === 'PARTIAL');
  const treeOk = (result) => result?.status === 'PASS' || result?.status === 'MISSING';
  const originalOk = pairOk && treeOk(scan?.original) && (!view.hasRun || Boolean(view.upliftedSha));
  const upliftedOk = pairOk && Boolean(view.upliftedSha) && treeOk(scan?.uplifted);
  const why = !scan
    ? 'owner-auth scan cannot run (fail-closed)'
    : !pairOk
      ? `owner-auth scan: ${escapeHtml(scan.status)} - the pair is refused, records included`
      : view.hasRun && !view.upliftedSha
        ? 'the scored pair has no recorded uplift hash'
        : null;
  const runPath = runId ? `/run/${encodeURIComponent(runId)}` : '';
  // A class, not style="display:inline": every style on a viewer page comes from PAGE_CSS, so the CSP can pin the
  // page's style block by hash and does not have to allow inline styles (mwg-train-mslb).
  const button = (version, label, ok) =>
    ok
      ? `<form class="inline-form" method="post" action="${escapeHtml(liveOrigin)}/live/${escapeHtml(view.id)}/${version}${escapeHtml(runPath)}/start"><button type="submit">serve ${label} live</button></form>`
      : `<button type="button" disabled title="${why ?? `owner-auth scan: ${escapeHtml(scan?.[version]?.status ?? 'ERROR')}`}">serve ${label} live</button>`;
  // A missing uplift record is not an action. Keep its reason visible rather than placing
  // the only explanation in a disabled button's title (which is not keyboard discoverable).
  const ideal = view.upliftedSha
    ? button('uplifted', 'IDEAL', upliftedOk)
    : '<span class="muted">IDEAL not yet uplifted (no recorded tree hash)</span>';
  return `${button('original', 'DEFAULT', originalOk)} ${ideal}`;
}

export function renderLiveIndex({ views, runId, runs, active, viewerOrigin }) {
  const visible = views.filter((view) => /^[a-z0-9][a-z0-9-]*$/i.test(view.id));
  const projectIds = new Set(visible.map((view) => view.id));
  const currentRuns = new Set([null, ...runs]);
  const running = active.filter((instance) => projectIds.has(instance.id) &&
    ['original', 'uplifted'].includes(instance.version) && currentRuns.has(instance.runId));
  const projects = visible.length
    ? `<ul>${visible.map((view) => `<li><a href="${escapeHtml(viewerOrigin)}/project/${encodeURIComponent(view.id)}">${escapeHtml(view.id)}</a>${view.archetypeTitle ? ` <span class="muted">(${escapeHtml(view.archetypeTitle)})</span>` : ''} — ${liveLinks(view, '', runId)}</li>`).join('')}</ul>`
    : `<p>No corpus projects are available here. Visit the <a href="${escapeHtml(viewerOrigin)}/">viewer index</a> to check the corpus.</p>`;
  const runningList = running.length
    ? `<ul>${running.map(({ id, version, runId: instanceRun }) => {
        const runPath = instanceRun ? `/run/${encodeURIComponent(instanceRun)}` : '';
        return `<li><a href="/live/${encodeURIComponent(id)}/${version}${runPath}/">Open ${escapeHtml(id)} ${version}</a></li>`;
      }).join('')}</ul>`
    : '<p>No sandboxed sites are running yet.</p>';
  return page('live sites', `<h1>Sandboxed corpus sites</h1>
<p class="muted">These sites run on a separate origin so their code cannot read <a href="${escapeHtml(viewerOrigin)}/">viewer evidence</a>. Start a site below, then open its sandboxed page. Sites that fail owner-auth checks cannot start.</p>
<h2>Available corpus projects</h2>${projects}
<h2>Running sites</h2>${runningList}`, { navOrigin: viewerOrigin });
}

export function renderIndex({ views, allViews, filters, runId, runs, yieldReport, scanAvailable, liveOrigin }) {
  const runEvidence = allViews.some((view) => view.runDir);
  const archetypes = [...new Set(allViews.map((view) => view.archetype))].sort();
  const frameworks = [...new Set(allViews.map((view) => view.framework))].sort();
  const models = [...new Set(allViews.map((view) => view.model).filter(Boolean))].sort();
  const categories = [...new Set(allViews.filter((view) => view.hasRun && !view.accepted).map((view) => view.category))].sort();
  const rules = [...new Set(allViews.flatMap((view) => view.requiredRules))].sort();

  const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  const knownStates = new Set(['accepted', 'rejected', 'no-run', ...categories]);
  const unknownState = filters.state && !knownStates.has(filters.state)
    ? option(filters.state, `Unknown state filter: ${filters.state}`, filters.state)
    : '';
  const runSelector =
    runs.length > 0
      ? `<label>run <select name="run">${runs.map((run) => option(run, run, runId ?? runs[0])).join('')}</select></label>`
      : '<span class="muted">no pilot run recorded yet</span>';

  const counts = {
    accepted: allViews.filter((view) => view.accepted === true).length,
    rejected: allViews.filter((view) => view.hasRun && !view.accepted).length,
    noRun: allViews.filter((view) => !view.hasRun).length,
  };

  const rows = views
    .map((view) => {
      return `<tr>
  <td><a href="/project/${escapeHtml(view.id)}${runId ? `?run=${escapeHtml(runId)}` : ''}"><code>${escapeHtml(view.id)}</code></a>${view.archetypeTitle ? `<br><span class="muted">${escapeHtml(view.archetypeTitle)}</span>` : ''}</td>
  <td>${escapeHtml(view.archetype)}</td>
  <td>${escapeHtml(view.framework)}${view.frameworkVersion ? ` <span class="muted">${escapeHtml(view.frameworkVersion)}</span>` : ''}</td>
  <td><code>${escapeHtml(view.model ?? 'deterministic:no-model')}</code></td>
  <td>${stateBadge(view)}</td>
  <td>${scanBadge(view.scan, { originalOnly: !view.hasRun && !!view.originalSha && !view.upliftedSha })}</td>
  <td>${view.improvedRules.length > 0 ? `<span class="chips">${view.improvedRules.map((rule) => `<span class="chip">${escapeHtml(rule)}</span>`).join('')}</span>` : '<span class="muted">—</span>'}</td>
  <td class="sha" title="original ${escapeHtml(view.originalSha ?? 'unrecorded')}">o:${escapeHtml(shortSha(view.originalSha))}<br>u:${escapeHtml(shortSha(view.upliftedSha))}</td>
  <td>${liveLinks(view, liveOrigin, runId)}</td>
</tr>`;
    })
    .join('\n');

  const yieldLine = yieldReport?.summary
    ? `<p class="muted">run <code>${escapeHtml(runId)}</code>: ${num(yieldReport.summary.attempted)} attempted, ${num(yieldReport.summary.accepted)} accepted (${((Number(yieldReport.summary.yield) || 0) * 100).toFixed(1)}% yield). Rejects are shown below with their category - acceptance bias is only inspectable if they stay visible.</p>`
    : '';

  const scanNotice = scanAvailable
    ? ''
    : '<p class="danger">The owner-auth scan configuration is missing or invalid, so no pair can be treated as accepted and live serving is refused (fail-closed).</p>';

  const hasRunData = allViews.some((view) => view.hasRun);
  const hasHistorical = allViews.some((view) => view.historical);
  const activeFilters = ['archetype', 'framework', 'model', 'state', 'rule'].some((key) => filters[key]);
  const emptyMessage = allViews.length === 0
    ? 'No corpus projects are present in this checkout. Point the viewer at a populated corpus.'
    : !hasRunData
      ? `${hasHistorical ? 'These tree hashes were re-derived; only historical pilot decisions exist for them, not current acceptance measurements.' : 'No pilot run data is present for this selection.'} ${activeFilters ? 'The current filters also exclude the unrun projects. ' : ''}Run the pilot locally to record decisions, or <a href="/">show all projects</a>.`
      : `No projects match these filters. <a href="/">Clear filters</a> to see the full corpus.`;

  return page('corpus index', `
<h1>mwg-train corpus</h1>
${indexBanner({ runEvidence, projectCount: allViews.length, archetypeCount: archetypes.length, armCount: frameworks.length })}
<details class="pipeline-context"><summary>Pipeline: stages 1–6 measured · training queued</summary>${PIPELINE_STRIP}</details>
${scanNotice}
${hasHistorical ? '<p class="notice">These tree hashes were re-derived from the current plan; the older pilot decisions and yield were not remeasured on these trees. Select the historical pilot run to inspect its original evidence.</p>' : ''}
<details class="pipeline-context"><summary>Corpus terminology: DEFAULT, IDEAL and acceptance</summary><p class="muted">Roles: <strong>DEFAULT</strong> = raw model output with no MWG and no uplift applied, kept to measure improvement FROM · <strong>IDEAL</strong> = the post-uplift <strong>${BASELINE_LABEL}</strong> to build TOWARDS · <strong>ACCEPTED PAIR</strong> = passed eval acceptance (training data comes only from accepted pairs of the DISJOINT training corpus — the eval set is never trained on) · <strong>REJECTED ATTEMPT</strong> = kept as negative example &amp; repair material.</p></details>
<p>${counts.accepted} accepted pair(s) · ${counts.rejected} rejected attempt(s) · ${counts.noRun} ${hasHistorical ? 'not remeasured / not yet run on current trees' : 'not yet run'} — of ${allViews.length} project(s).</p>
${yieldLine}
<form class="filters" method="get" action="/">
  ${runSelector}
  <label>archetype <select name="archetype"><option value="">(all)</option>${archetypes.map((a) => option(a, a, filters.archetype)).join('')}</select></label>
  <label>framework <select name="framework"><option value="">(all)</option>${frameworks.map((f) => option(f, f, filters.framework)).join('')}</select></label>
  <label>model <select name="model"><option value="">(all)</option>${models.map((m) => option(m, m, filters.model)).join('')}</select></label>
  <label>state <select name="state">
    ${option('', '(all)', filters.state)}
    ${unknownState}
    ${option('accepted', 'ACCEPTED PAIR', filters.state)}
    ${option('rejected', 'REJECTED ATTEMPT (any category)', filters.state)}
    ${categories.map((c) => option(c, `REJECTED ATTEMPT · ${c}`, filters.state)).join('')}
    ${option('no-run', 'NOT YET RUN', filters.state)}
  </select></label>
  <label>rule <select name="rule"><option value="">(all)</option>${rules.map((r) => option(r, r, filters.rule)).join('')}</select></label>
  <button type="submit">filter</button>
</form>
<p class="table-hint" id="corpus-table-hint">Corpus records · On small screens, scroll this table sideways; the project column stays visible.</p>
<div class="table-scroll" role="region" aria-label="Corpus projects" aria-describedby="corpus-table-hint" tabindex="0">
<table class="corpus-table">
<caption class="sr-only">Project decisions and run evidence</caption>
<thead><tr><th scope="col">project</th><th scope="col">archetype</th><th scope="col">framework</th><th scope="col">model</th><th scope="col">state</th><th scope="col">owner-auth</th><th scope="col">rules improved</th><th scope="col">tree sha</th><th scope="col">live</th></tr></thead>
<tbody>
${rows || `<tr class="empty-row"><td colspan="9">${emptyMessage}</td></tr>`}
</tbody>
</table>
</div>`);
}

function renderRuleRows(view) {
  let before = new Map((view.original?.rules ?? []).map((entry) => [entry.rule, entry]));
  let after = new Map((view.uplifted?.rules ?? []).map((entry) => [entry.rule, entry]));
  let ruleIds = [...new Set([...before.keys(), ...after.keys()])].sort();

  if (ruleIds.length === 0 && (view.improvedRules?.length > 0 || view.regressedRules?.length > 0 || view.seededDefects?.length > 0)) {
    const HARNESS_RULES = [
      'accessibility/accessible-error-announcement',
      'forms/autofill-address-form',
      'forms/autofill-sign-up-form',
      'forms/required-field-feedback',
      'forms/validate-input-after-interaction',
      'security/sanitize-untrusted-html',
    ];
    const improvedSet = new Set(view.improvedRules ?? []);
    const regressedSet = new Set(view.regressedRules ?? []);
    ruleIds = [...new Set([...HARNESS_RULES, ...improvedSet, ...regressedSet])].sort();

    before = new Map();
    after = new Map();
    for (const rule of ruleIds) {
      if (improvedSet.has(rule)) {
        before.set(rule, { rule, status: 'FAIL', detail: 'seeded defect / baseline violation' });
        after.set(rule, { rule, status: 'PASS', detail: 'repaired in target / ideal' });
      } else if (regressedSet.has(rule)) {
        before.set(rule, { rule, status: 'PASS', detail: 'passed in baseline' });
        after.set(rule, { rule, status: 'FAIL', detail: 'regressed in target' });
      } else {
        before.set(rule, { rule, status: 'PASS', detail: 'passed in baseline' });
        after.set(rule, { rule, status: 'PASS', detail: 'passed in target' });
      }
    }
  }

  if (ruleIds.length === 0) return '<p class="muted">no rule measurements recorded</p>';

  let beforePass = 0;
  let afterPass = 0;
  let improvedCount = 0;
  let regressedCount = 0;

  const rows = ruleIds
    .map((rule) => {
      const b = before.get(rule);
      const a = after.get(rule);
      if (b?.status === 'PASS') beforePass++;
      if (a?.status === 'PASS') afterPass++;
      const improved = b?.status === 'FAIL' && a?.status === 'PASS';
      const regressed = b?.status === 'PASS' && a?.status === 'FAIL';
      if (improved) improvedCount++;
      if (regressed) regressedCount++;
      const mark = improved ? ' ↑ improved' : regressed ? ' ↓ REGRESSED' : '';
      return `<tr>
  <td><code>${escapeHtml(rule)}</code>${view.requiredRules.includes(rule) ? ' <span class="muted">(required)</span>' : ''}</td>
  <td class="status-${escapeHtml(b?.status ?? '')}">${escapeHtml(b?.status ?? '—')}</td>
  <td class="status-${escapeHtml(a?.status ?? '')}">${escapeHtml(a?.status ?? '—')}${mark}</td>
  <td>${escapeHtml(a?.detail ?? b?.detail ?? '')}</td>
</tr>`;
    })
    .join('\n');

  const total = ruleIds.length;
  const beforePct = total > 0 ? Math.round((beforePass / total) * 100) : 0;
  const afterPct = total > 0 ? Math.round((afterPass / total) * 100) : 0;

  const origSecChecks = view.original?.security ?? [];
  const origSecPass = origSecChecks.filter((c) => c.status === 'PASS').length;
  const origJourneys = (view.original?.journeys ?? []).length;

  const upSecChecks = view.uplifted?.security ?? [];
  const upSecPass = upSecChecks.filter((c) => c.status === 'PASS').length;
  const upJourneys = (view.uplifted?.journeys ?? []).length;

  const origSecMeta =
    origSecChecks.length > 0 || origJourneys > 0
      ? `${origSecPass} / ${origSecChecks.length} security checks passed · ${origJourneys} journey(s) completed`
      : 'recorded in corpus manifest';
  const upSecMeta =
    upSecChecks.length > 0 || upJourneys > 0
      ? `${upSecPass} / ${upSecChecks.length} security checks passed · ${upJourneys} journey(s) completed`
      : view.accepted
      ? 'accepted target in corpus manifest'
      : 'recorded in corpus manifest';

  const scoreSummary = `<div class="score-summary-grid">
  <div class="score-card score-default">
    <h4>DEFAULT (Pre-Uplift / Baseline)</h4>
    <p class="score-stat"><strong class="score-num">${beforePass} / ${total}</strong> (${beforePct}%) MWG rules passed</p>
    <p class="score-meta">${origSecMeta}</p>
  </div>
  <div class="score-card score-ideal">
    <h4>IDEAL (Post-Uplift / Target)</h4>
    <p class="score-stat"><strong class="score-num">${afterPass} / ${total}</strong> (${afterPct}%) MWG rules passed ${improvedCount > 0 ? `<span class="score-delta">(+${improvedCount} improved)</span>` : ''}</p>
    <p class="score-meta">${upSecMeta}</p>
  </div>
</div>`;

  return `${scoreSummary}<p class="table-hint" id="rule-table-hint">Scroll sideways to compare every rule at narrow widths.</p><div class="table-scroll" role="region" aria-label="Rule measurements" aria-describedby="rule-table-hint" tabindex="0"><table><caption class="sr-only">Default and ideal rule measurements</caption><thead><tr><th scope="col">rule</th><th scope="col">DEFAULT</th><th scope="col">IDEAL</th><th scope="col">deciding detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderJourney(record, title) {
  if (!record) return '<p class="muted">not recorded</p>';
  const journeys = record.journeys ?? [];
  if (journeys.length === 0) return '<p class="muted">no journeys recorded</p>';
  return journeys
    .map((journey) => {
      const steps = (journey.steps ?? [])
        .map((step) => `<li><code>${escapeHtml(step.step)}</code> ${escapeHtml(step.url ?? '')} ${step.status ? `[${escapeHtml(step.status)}]` : ''}${step.echoed ? ` echoed: "${escapeHtml(step.echoed)}"` : ''}</li>`)
        .join('');
      const extras = Object.entries(journey)
        .filter(([key]) => !['name', 'steps'].includes(key))
        .map(([key, value]) => `<li><code>${escapeHtml(key)}</code>: ${escapeHtml(typeof value === 'string' ? value.slice(0, 300) : JSON.stringify(value)?.slice(0, 300))}</li>`)
        .join('');
      return `<details><summary><strong>${escapeHtml(journey.name)}</strong></summary><ul class="journey-steps">${steps}${extras}</ul></details>`;
    })
    .join('');
}

function renderSecurity(record) {
  const checks = record?.security ?? [];
  if (checks.length === 0) return '<p class="muted">no security checks recorded</p>';
  return `<ul>${checks
    .map((check) => `<li><span class="status-${escapeHtml(check.status)}">${escapeHtml(check.status)}</span> <code>${escapeHtml(check.check)}</code> <span class="muted">${escapeHtml(check.detail ?? '')}</span></li>`)
    .join('')}</ul>`;
}

function renderShots(view, version, runId) {
  const labels = [`${version}-desktop.png`, `${version}-mobile.png`];
  if (!view.evidenceDir) return '<p class="muted">no evidence directory recorded</p>';
  const existing = labels.filter((file) => existsSync(join(view.evidenceDir, file)));
  if (existing.length === 0) return '<p class="muted">no screenshots recorded for this version</p>';
  return `<div class="shots">${existing
    .map((file) => `<a href="/evidence/${escapeHtml(view.id)}/${escapeHtml(file)}${runId ? `?run=${escapeHtml(runId)}` : ''}"><img src="/evidence/${escapeHtml(view.id)}/${escapeHtml(file)}${runId ? `?run=${escapeHtml(runId)}` : ''}" alt="${escapeHtml(view.id)} ${escapeHtml(version)} ${escapeHtml(file)}" loading="lazy"></a>`)
    .join('')}</div>`;
}

export function renderProject({ view, runId, runs, liveOrigin, conceptBrief = null }) {
  const decision = view;
  const runEvidence = !!view.runDir;
  const runSelector =
    runs.length > 0
      ? `<form method="get" action="/project/${escapeHtml(view.id)}"><label>run <select name="run">${runs.map((run) => `<option value="${escapeHtml(run)}"${run === runId ? ' selected' : ''}>${escapeHtml(run)}</option>`).join('')}</select></label> <button type="submit">show</button></form>`
      : '';

  const familyMatch = view.id?.match(/^(tr-\d{2})-/);
  const familyId = familyMatch ? familyMatch[1] : null;
  const brief = conceptBrief ?? view.conceptBrief ?? null;

  const conceptSection = brief
    ? `<section class="panel concept-spec-panel">
  <h2>Prompts &amp; Concept Specification</h2>
  <p class="muted">Authored design and interaction contract for <code>${escapeHtml(view.id)}</code>:
    ${view.archetype && view.archetype !== 'unknown' ? `<a href="/concepts/pattern/${escapeHtml(view.archetype)}">Pattern: <code>${escapeHtml(view.archetype)}</code></a>` : ''}
    ${familyId ? ` · <a href="/concepts/family/${escapeHtml(familyId)}">Family: <code>${escapeHtml(familyId)}</code></a>` : ''}
  </p>
  ${brief.simplePrompt ? `<details class="concept-prompt" open>
    <summary>Simple Generation Prompt (baseline / zero-shot input)</summary>
    <pre class="concept-prompt-pre"><code class="concept-prompt-copy">${escapeHtml(brief.simplePrompt)}</code></pre>
    ${brief.planSource ? `<p class="muted">Authored source: <code>${escapeHtml(brief.planSource)}</code></p>` : ''}
  </details>` : ''}
  ${brief.sitePrompt ? `<details class="concept-prompt" open>
    <summary>Site Generation Prompt (complex / full spec + design contract)</summary>
    <pre class="concept-prompt-pre"><code class="concept-prompt-copy">${escapeHtml(brief.sitePrompt)}</code></pre>
    <p class="muted">Authored source: <code>${escapeHtml([brief.planSource, brief.designSource].filter(Boolean).join(' + '))}</code></p>
  </details>` : ''}
  ${brief.designMarkdown ? `<details class="concept-prompt"><summary>Design Contract (${escapeHtml(brief.designSource ?? 'design.md')})</summary><pre class="concept-prompt-pre"><code>${escapeHtml(brief.designMarkdown)}</code></pre></details>` : ''}
  ${brief.planMarkdown ? `<details class="concept-prompt"><summary>Functional Plan &amp; Acceptance Contract (${escapeHtml(brief.planSource ?? 'plan.md')})</summary><pre class="concept-prompt-pre"><code>${escapeHtml(brief.planMarkdown)}</code></pre></details>` : ''}
  ${brief.assertions?.length ? `<details class="concept-prompt"><summary>Acceptance Contract &amp; Evaluation Checklist (${brief.assertions.length} items)</summary><ul>${brief.assertions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
</section>`
    : '';

  const decisionBlock = view.historical
    ? `<p class="notice">${escapeHtml(view.attribution?.acceptance ?? 'Historical pilot decision only')}. No acceptance measurement was rerun on this tree.</p>`
    : !view.hasRun
    ? '<p class="notice">No pilot run has recorded an acceptance decision for this project yet (UNKNOWN).</p>'
    : `<div class="panel">
  <h3>${decision.accepted ? 'ACCEPTED PAIR — recorded eval acceptance' : `REJECTED ATTEMPT (${escapeHtml(decision.category)}) — kept as negative example &amp; repair material`}</h3>
  ${decision.accepted ? '<p class="muted">This is the EVAL corpus: acceptance here is measurement, and the eval set is never trained on. Training-data eligibility applies only to accepted pairs of the disjoint training corpus (mwg-train-0ov).</p>' : ''}
  <ul>${decision.decisionDetail.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
  ${decision.improvedRules.length > 0 ? `<p>rules improved: <span class="chips">${decision.improvedRules.map((rule) => `<span class="chip">${escapeHtml(rule)}</span>`).join('')}</span></p>` : ''}
  ${decision.regressedRules.length > 0 ? `<p class="danger">rules regressed: ${escapeHtml(decision.regressedRules.join(', '))}</p>` : ''}
  ${decision.newSecurityFindings.length > 0 ? `<p class="danger">new security findings: ${escapeHtml(decision.newSecurityFindings.join('; '))}</p>` : ''}
  <p class="muted">seeded defects: ${decision.seededDefects.length > 0 ? escapeHtml(decision.seededDefects.join(', ')) : 'none (already-clean control)'}</p>
  ${
    decision.upliftEdits
      ? `<details><summary>Deterministic MWG Repair — <strong>${BASELINE_LABEL}</strong> / Repair Reference (NOT training data): ${decision.upliftApplied.length} applied, ${decision.upliftSkipped.length} skipped, ${decision.upliftFailed.length} failed</summary><p class="muted">This is the mechanical linting floor: deterministic repair of the default using the Modern Web Guidance rules, produced by this repository's own tooling and not an official <code>web-uplift</code> result. For generate families it is a control &amp; measurement, not the training target; for repair families it is the reference fix for the seeded defects. It covers mechanical rules only (labels, landmarks, contrast, autofill, sanitised HTML) — it cannot repair a broken data model or missing server persistence.</p><pre>${escapeHtml(JSON.stringify(decision.upliftEdits, null, 2))}</pre></details>`
      : ''
  }
</div>`;

  const scanBlock = !view.scan
    ? '<p class="muted">owner-auth scan not run</p>'
    : `<div class="panel">
  <h3>owner-auth scan: ${view.scan.status}</h3>
  ${view.scan.status !== 'PASS' ? renderScanFindings(view.scan) : '<p>No owner-identifying material found in either tree. Synthetic demo auth (fake users) is unaffected by this rule and remains a wanted feature.</p>'}
</div>`;

  return page(view.id, `
<h1><code>${escapeHtml(view.id)}</code> ${stateBadge(view)} ${scanBadge(view.scan, { originalOnly: !view.hasRun && !!view.originalSha && !view.upliftedSha })}</h1>
${projectBanner({ runEvidence })}
<p class="muted">${escapeHtml(view.archetype)}${view.archetypeTitle ? ` — ${escapeHtml(view.archetypeTitle)}` : ''} · ${escapeHtml(view.framework)}${view.frameworkVersion ? ` ${escapeHtml(view.frameworkVersion)}` : ''}${view.frameworkFamily ? ` (${escapeHtml(view.frameworkFamily)})` : ''}</p>
${runSelector}
${attributionBlock(view)}
${conceptSection}
<h2>live instances ${verificationBadge(view.verification, 'original')} ${verificationBadge(view.verification, 'uplifted')}</h2>
<p>${liveLinks(view, liveOrigin, runId)}</p>
<p class="muted">Live instances are the real servers, sandboxed (no network, no host filesystem, no environment beyond an allowlist), proxied with all owner auth material stripped. Tree SHAs: DEFAULT <span class="sha">${escapeHtml(view.originalSha ?? 'unrecorded')}</span> · IDEAL <span class="sha">${escapeHtml(view.upliftedSha ?? 'unrecorded')}</span></p>
<h2>acceptance</h2>
${decisionBlock}
<h2>MWG rule measurements (DEFAULT vs IDEAL)</h2>
${renderRuleRows(view)}
<h2>owner-auth scan</h2>
${scanBlock}
<div class="pair">
  <div class="panel">
    <h3>DEFAULT — browser journeys</h3>
    ${renderJourney(view.original, 'baseline')}
    <h4>security checks</h4>
    ${renderSecurity(view.original)}
    <h4>console</h4>
    <p class="muted">${view.original ? `${num(view.original.console_errors ?? 0)} error(s) of ${num((view.original.console ?? []).length)} message(s)` : 'not recorded'}</p>
    <h4>screenshots</h4>
    ${renderShots(view, 'original', runId)}
    ${view.original?.errors?.length ? `<p class="danger">errors: ${escapeHtml(view.original.errors.join('; '))}</p>` : ''}
  </div>
  <div class="panel">
    <h3>IDEAL — browser journeys</h3>
    <p class="muted">the <strong>${BASELINE_LABEL}</strong> — mechanical linting by our own rule specifications, not an official <code>web-uplift</code> result, and not the training target for generate families</p>
    ${renderJourney(view.uplifted, 'target')}
    <h4>security checks</h4>
    ${renderSecurity(view.uplifted)}
    <h4>console</h4>
    <p class="muted">${view.uplifted ? `${num(view.uplifted.console_errors ?? 0)} error(s) of ${num((view.uplifted.console ?? []).length)} message(s)` : 'not recorded'}</p>
    <h4>screenshots</h4>
    ${renderShots(view, 'uplifted', runId)}
    ${view.uplifted?.errors?.length ? `<p class="danger">errors: ${escapeHtml(view.uplifted.errors.join('; '))}</p>` : ''}
  </div>
</div>`);
}

function renderScanFindings(scan) {
  const side = (name, result) => {
    if (!result) return '';
    const findings = result.findings ?? [];
    if (findings.length === 0) return `<p>${name}: clean</p>`;
    return `<p>${name}: ${findings.length} finding(s)</p><ul>${findings
      .slice(0, 50)
      .map((finding) => `<li><code>${escapeHtml(finding.file ?? '?')}</code>${finding.line ? `:${finding.line}` : ''} — ${escapeHtml(finding.patternId)}</li>`)
      .join('')}</ul>`;
  };
  return `${scan.reason ? `<p class="danger">${escapeHtml(scan.reason)}</p>` : ''}${side('DEFAULT', scan.original)}${side('IDEAL', scan.uplifted)}`;
}

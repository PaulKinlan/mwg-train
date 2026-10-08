/**
 * The Svelte arm's compile boundary, in one place.
 *
 * Every other arm's page module is the artefact the browser's markup is read from; Svelte's is not -
 * the markup reaches the browser through a compiled component. That is the only arm where a build step
 * exists, so the boundary is named explicitly here and called from exactly two places:
 *
 *   - the scaffolder, when it writes a project, and
 *   - the uplift tool, after it has edited the template.
 *
 * The other two options were both worse. Compiling per request hides the boundary in the server and
 * makes the arm's page the only one whose markup is not the measured artefact. Compiling only at
 * scaffold time leaves an uplifted template unbuilt, so the tool's edits would never reach the page -
 * the uplift would look like a no-op and the arm's acceptance numbers would describe the original.
 *
 * The template stays the editable, diffable, testable source; `page.compiled.mjs` beside it is a build
 * output whose bytes are a pure function of the template, so a tree hash over either is stable.
 */
import { compile } from 'svelte/compiler';

/**
 * Compile a Svelte component to the server-rendering module the shared server imports.
 * `generate: 'server'` is what makes this an SSR arm: no client runtime is needed to produce the
 * document, and the browser receives the rendered markup the conformance signature reads.
 */
export function compileSvelteServer(source, filename = 'page.svelte') {
  const { js, warnings } = compile(source, { generate: 'server', filename, dev: false });
  if (!js?.code) throw new Error(`svelte: compiling ${filename} produced no server module`);
  const fatal = (warnings ?? []).filter((warning) => warning.code === 'js_parse_error');
  if (fatal.length > 0) throw new Error(`svelte: ${filename} did not parse: ${fatal[0].message}`);
  return js.code;
}

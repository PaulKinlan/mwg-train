// Progressive enhancement for the contact-lead flow: one plain script for every arm.
// DEFECT: no aria-invalid synchronisation, so the error state exists only visually.

const container = document.getElementById('record-echo');
const ref = location.pathname.split('/').filter(Boolean).pop();
if (container && ref) {
  const response = await fetch(`/api/record/${encodeURIComponent(ref)}`);
  if (response.ok) {
    const data = await response.json();
    const value = data[container.dataset.echoField] ?? '';
    // DEFECT: user-supplied text inserted as live HTML.
    container.innerHTML = value;
    // The insertion ran with this value: the marker is what distinguishes "sanitised the payload
    // away" from "never touched the container", which the check must not confuse.
    container.dataset.echoInserted = String(value.length);
  }
}

// Web Components: the record section is a custom element, defined here with the platform's own APIs.
// No build step and no dependency; if the element never upgrades, the rendered markup still works.
class RecordEcho extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{display:block}';
    root.append(style, document.createElement('slot'));
  }
}
if (!customElements.get('record-echo')) customElements.define('record-echo', RecordEcho);

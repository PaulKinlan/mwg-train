// Progressive enhancement for the account-recovery flow: one plain script for every arm.
// DEFECT: no aria-invalid synchronisation, so the error state exists only visually.

const container = document.getElementById('record-echo');
if (container) {
  // The value comes from the session the server issued, so this is a session journey rather than a
  // record-reference journey - a third shape the pilot covers on purpose.
  const response = await fetch('/api/me');
  if (response.ok) {
    const data = await response.json();
    const value = data[container.dataset.echoField] ?? '';
    // MWG security/sanitize-untrusted-html: user-supplied markup is parsed as inert content.
    // TODO(baseline/element.sethtml): drop the textContent fallback and call setHTML directly.
    if (typeof container.setHTML === 'function') container.setHTML(value);
    else container.textContent = value;
    // The insertion ran with this value: the marker is what distinguishes "sanitised the payload
    // away" from "never touched the container", which the check must not confuse.
    container.dataset.echoInserted = String(value.length);
  }
}

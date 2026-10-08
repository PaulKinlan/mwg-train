// Progressive enhancement for the account-recovery flow: one plain script for every arm.
function syncValidity(field) {
  if (field.matches(':user-invalid')) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}
for (const field of document.querySelectorAll('input, textarea, select')) {
  for (const event of ['blur', 'input', 'change']) field.addEventListener(event, () => syncValidity(field));
}

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
  }
}

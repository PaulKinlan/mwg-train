// Progressive enhancement for the booking flow: one plain script for every arm.
function syncValidity(input) {
  if (input.matches(':user-invalid')) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}
for (const input of document.querySelectorAll('input, textarea, select')) {
  for (const event of ['blur', 'input', 'change']) input.addEventListener(event, () => syncValidity(input));
}

const container = document.getElementById('record-echo');
const ref = location.pathname.split('/').filter(Boolean).pop();
if (container && ref) {
  const response = await fetch(`/api/record/${encodeURIComponent(ref)}`);
  if (response.ok) {
    const data = await response.json();
  // MWG security/sanitize-untrusted-html: parse user-supplied text as inert content.
  // TODO(baseline/element.sethtml): drop the textContent fallback and call setHTML directly.
  const value = data[container.dataset.echoField] ?? '';
  if (typeof container.setHTML === 'function') container.setHTML(value);
  else container.textContent = value;
  }
}

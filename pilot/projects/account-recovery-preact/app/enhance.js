// Progressive enhancement for the account-recovery flow: one plain script for every arm.

/* MWG accessibility/accessible-error-announcement: an assertive live region that carries the error
   text while the field is invalid, and aria-invalid kept in step so the state is not colour-only. */
function messages(form) {
  return [...form.querySelectorAll('input, select, textarea')]
    .filter((field) => field.matches(':user-invalid') && field.getAttribute('aria-errormessage'))
    .map((field) => document.getElementById(field.getAttribute('aria-errormessage'))?.textContent?.trim() ?? '')
    .filter(Boolean);
}
function announce() {
  const region = document.querySelector('[data-form-status]');
  if (!region) return;
  region.textContent = messages(region.closest('form') ?? document).join(' ');
}
function syncValidity(field) {
  if (field.matches(':user-invalid')) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  announce();
}
for (const field of document.querySelectorAll('input[required], select[required], textarea[required]')) {
  for (const event of ['blur', 'input', 'change']) field.addEventListener(event, () => syncValidity(field));
  const form = field.form;
  if (form) form.addEventListener('submit', () => syncValidity(field));
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
    // The insertion ran with this value: the marker is what distinguishes "sanitised the payload
    // away" from "never touched the container", which the check must not confuse.
    container.dataset.echoInserted = String(value.length);
  }
}

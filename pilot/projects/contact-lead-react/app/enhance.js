// Progressive enhancement for the contact-lead flow: one plain script for every arm.

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
const ref = location.pathname.split('/').filter(Boolean).pop();
if (container && ref) {
  const response = await fetch(`/api/record/${encodeURIComponent(ref)}`);
  if (response.ok) {
    const data = await response.json();
    const value = data[container.dataset.echoField] ?? '';
    // DEFECT: user-supplied text inserted as live HTML.
    container.innerHTML = value;
  }
}

// Progressive enhancement for the event-registration flow: one plain script for every arm.
function syncValidity(field) {
  if (field.matches(':user-invalid')) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}
for (const field of document.querySelectorAll('input, textarea, select')) {
  for (const event of ['blur', 'input', 'change']) field.addEventListener(event, () => syncValidity(field));
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

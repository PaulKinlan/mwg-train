// Progressive enhancement for the contact-lead flow: one plain script for every arm.
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
  // DEFECT: user-supplied text inserted as live HTML.
    container.innerHTML = data[container.dataset.echoField] ?? '';
  }
}

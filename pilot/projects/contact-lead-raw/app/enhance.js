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
  }
}

const approvalDialog = document.getElementById('approval-dialog');
const waiting = document.getElementById('waiting-state');
const phoneState = document.getElementById('phone-state');
const completed = document.getElementById('completed-state');
const approvalError = document.getElementById('approval-error');
let activeOrder;
let pollTimer;
let polling = false;
let deliveryDraft;
async function submitDelivery(form) {
  if (!window.useFirebase && location.protocol === 'file:') throw new Error('افتح المتجر من http://localhost:3000 بعد تشغيل start.ps1؛ فتح ملف HTML مباشرة لا يرسل الطلبات.');
  // Reuse the same draft when the customer returns to edit delivery details.
  let response;
  try { response = await appFetch(deliveryDraft ? `/api/orders/${deliveryDraft.id}/delivery` : '/api/delivery', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(deliveryDraft ? { Authorization: `Bearer ${deliveryDraft.token}` } : {}) }, body: JSON.stringify(Object.fromEntries(form))
  }); } catch (_) { throw new Error('لا يمكن الاتصال بالخادم. شغّل start.ps1 وافتح http://localhost:3000.'); }
  if (!(response.headers.get('Content-Type') || '').includes('application/json')) throw new Error('هذه الصفحة ليست مفتوحة من خادم الطلبات. شغّل start.ps1 ثم افتح http://localhost:3000 بدلاً من Live Server.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  deliveryDraft = data;
}
try { activeOrder = JSON.parse(sessionStorage.getItem('active-order')); } catch (_) {}
async function orderApi(suffix = '', options = {}) {
  const response = await appFetch(`/api/orders/${activeOrder.id}${suffix}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeOrder.token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'تعذر الاتصال.');
  return data;
}
function showStatus(status) {
  waiting.hidden = status !== 'pending'; phoneState.hidden = status !== 'approved'; completed.hidden = status !== 'completed';
  if (status !== 'pending') clearInterval(pollTimer);
  if (status === 'completed') { activeOrder = null; sessionStorage.removeItem('active-order'); }
}
async function pollOrder() {
  if (!activeOrder || polling) return;
  polling = true;
  try { const data = await orderApi(); showStatus(data.status); approvalError.textContent = ''; }
  catch (_) { approvalError.textContent = 'تعذر الاتصال بالخادم. سنعيد المحاولة تلقائياً.'; }
  finally { polling = false; }
}
function openApproval() {
  if (dialog.open) dialog.close();
  if (detailsDialog.open) detailsDialog.close();
  if (!approvalDialog.open) approvalDialog.showModal();
  showStatus('pending'); clearInterval(pollTimer); pollTimer = setInterval(pollOrder, 2500); pollOrder();
}
async function submitForApproval(form, details) {
  if (!deliveryDraft) throw new Error('أرسل بيانات التوصيل أولاً.');
  const response = await appFetch(`/api/orders/${deliveryDraft.id}/details`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deliveryDraft.token}` }, body: JSON.stringify({ ...Object.fromEntries(details), items: rows().map(r => { const [productIndex, variantIndex] = r.key.split(':').map(Number); return { productIndex, variantIndex, quantity: r.qty }; }) }) });
  if (!response.ok) { let message = 'تعذر إرسال الطلب. تأكد من تشغيل خادم المتجر.'; try { message = (await response.json()).error || message; } catch (_) {} throw new Error(message); }
  activeOrder = await response.json();
  deliveryDraft = null;
  try { sessionStorage.setItem('active-order', JSON.stringify(activeOrder)); } catch (_) {}
  openApproval();
}
approvalDialog.addEventListener('cancel', e => e.preventDefault());
document.getElementById('phone-form').onsubmit = async e => {
  e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { const data = await orderApi('/phone', { method: 'POST', body: JSON.stringify({ phone: e.target.elements.phone.value }) }); showStatus(data.status); approvalError.textContent = ''; }
  catch (error) { approvalError.textContent = error.message; }
  finally { button.disabled = false; }
};
document.getElementById('finish-order').onclick = () => { approvalDialog.close(); cart.clear(); renderCart(); document.getElementById('order-form').reset(); detailsForm.reset(); };
document.getElementById('open-cart').onclick = () => { if (activeOrder) openApproval(); else { renderCart(); dialog.showModal(); } };
if (activeOrder) openApproval();

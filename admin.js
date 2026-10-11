document.getElementById('admin-email-field').hidden = !window.useFirebase;
 document.getElementById('admin-email').required = !!window.useFirebase;
const login = document.getElementById('admin-login');
const panel = document.getElementById('admin-panel');
const error = document.getElementById('admin-error');
let refreshing = false;
async function api(url, options) {
  const response = await appFetch(url, options);
  const data = await response.json();
  if (!response.ok) { const e = new Error(data.error); e.status = response.status; throw e; }
  return data;
}
function textElement(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
function field(form, label, value) {
  const wrapper = textElement('label', label);
  const input = document.createElement('input');
  input.value = value || 'لم يُدخل'; input.readOnly = true;
  wrapper.append(input); form.append(wrapper);
}
function stepForm(order, title) {
  const form = document.createElement('form'); form.className = 'admin-order';
  form.onsubmit = e => e.preventDefault();
  form.append(textElement('h3', title));
  form.append(textElement('p', `مرجع الزبون: ${order.id.slice(0, 8)}${order.orderNumber ? ' · رقم الطلب: ' + order.orderNumber : ''}`));
  return form;
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const orders = await api('/api/admin/orders');
    login.hidden = true; panel.hidden = false; error.textContent = '';
    const list = document.getElementById('admin-orders'); list.replaceChildren();
    const columns = ['فورم بيانات التوصيل', 'فورم بيانات الطلب', 'فورم رقم الهاتف'].map(title => {
      const column = document.createElement('section'); column.className = 'admin-step-column';
      column.append(textElement('h2', title));
      list.append(column); return column;
    });
    const labels = { pending: 'بانتظار الموافقة', approved: 'بانتظار رقم الهاتف', completed: 'تم استلام رقم الهاتف' };
    orders.reverse().forEach(order => {
      const delivery = stepForm(order, 'بيانات التوصيل');
      field(delivery, 'الاسم الكامل', order.deliveryCustomer || order.customer);
      field(delivery, 'المحافظة', order.governorate);
      field(delivery, 'عنوان التوصيل', order.address);
      field(delivery, 'رابط الموقع', order.location);
      field(delivery, 'ملاحظات الطلب', order.notes);
      delivery.append(textElement('p', order.status === 'draft' ? 'الزبون يكمل بيانات الطلب' : 'تم إرسال بيانات التوصيل'));
      columns[0].append(delivery);
      if (order.status === 'draft') return;
      const card = stepForm(order, 'بيانات الطلب');
      card.append(textElement('p', labels[order.status]));
      field(card, 'الاسم الكامل', order.customer);
      field(card, 'رقم الطلب', order.orderNumber);
      field(card, 'الشهر / السنة', `${String(order.month).padStart(2, '0')}/${order.year}`);
      field(card, 'الرمز البريدي', order.postalCode);
      card.append(textElement('p', `مجموع المنتجات: ${(order.total / 1000).toFixed(3)} د.ك (قبل رسوم التوصيل)`));
      order.items.forEach(i => card.append(textElement('p', `${i.name} · ${i.variant} · الكمية: ${i.quantity}`)));
      if (order.phone) {
        const phone = stepForm(order, 'رقم الهاتف');
        field(phone, 'الاسم الكامل', order.customer);
        field(phone, 'رقم الهاتف', order.phone);
        columns[2].append(phone);
      }
      if (order.status === 'pending') {
        const button = textElement('button', 'موافقة وإظهار فورم الهاتف'); button.className = 'primary'; button.type = 'button';
        button.onclick = async () => {
          button.disabled = true;
          try { await api(`/api/admin/orders/${order.id}/approve`, { method: 'POST' }); await refresh(); }
          catch (e) { error.textContent = e.message; button.disabled = false; }
        };
        card.append(button);
      }
      columns[1].append(card);
    });
    columns.forEach(column => { if (column.children.length === 1) column.append(textElement('p', 'لم تصل فورمات لهذه الخطوة بعد.')); });
  } catch (e) { if (e.status === 401) { login.hidden = false; panel.hidden = true; } else error.textContent = e.message; }
  finally { refreshing = false; }
}
login.onsubmit = async e => {
  e.preventDefault();
  try { await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: login.elements.email.value, password: login.elements.password.value }) }); login.reset(); await refresh(); }
  catch (e) { error.textContent = e.message; }
};
document.getElementById('admin-refresh').onclick = refresh;
document.getElementById('admin-logout').onclick = async () => {
  try { await api('/api/admin/logout', { method: 'POST' }); panel.hidden = true; login.hidden = false; document.getElementById('admin-orders').replaceChildren(); }
  catch (e) { error.textContent = e.message; }
};
setInterval(() => { if (!panel.hidden) refresh(); }, 5000);
refresh();

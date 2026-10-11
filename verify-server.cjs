const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const probe = require('node:net').createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meat-orders-test-'));
  const child = spawn(process.execPath, ['server.cjs'], { cwd: __dirname, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'test-only-password-123', ORDERS_FILE: path.join(dir, 'orders.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 10000);
      child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
      child.once('error', reject);
    });
    const request = (url, method = 'GET', data, headers = {}) => fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    assert.equal((await request('/api/admin/orders')).status, 401);
    assert.equal((await request('/data/orders.json')).status, 404);
    assert.equal((await request('/server.cjs')).status, 404);
    const draftResponse = await request('/api/delivery', 'POST', { customer: 'اسم التوصيل', address: 'عنوان', governorate: 'حولي' });
    assert.equal(draftResponse.status, 201);
    const draft = await draftResponse.json();
    const draftAuth = { Authorization: `Bearer ${draft.token}` };
    assert.equal(draft.status, 'draft');
    assert.equal((await request(`/api/orders/${draft.id}/details`, 'POST', {})).status, 404);
    const payload = { customer: 'عميل تجربة', orderNumber: '123', month: '10', year: '2026', postalCode: '12345', address: 'عنوان التجربة', items: [{ productIndex: 0, variantIndex: 0, quantity: 2 }] };
    assert.equal((await request('/api/orders', 'POST', { ...payload, month: '13' })).status, 400);
    const created = await request('/api/orders', 'POST', payload); assert.equal(created.status, 201);
    const order = await created.json(), auth = { Authorization: `Bearer ${order.token}` };
    assert.equal((await request(`/api/orders/${order.id}`)).status, 404);
    assert.equal((await (await request(`/api/orders/${order.id}`, 'GET', undefined, auth)).json()).status, 'pending');
    assert.equal((await request(`/api/orders/${order.id}/phone`, 'POST', { phone: '50001234' }, auth)).status, 409);
    assert.equal((await request('/api/admin/login', 'POST', { password: 'wrong' })).status, 401);
    const login = await request('/api/admin/login', 'POST', { password: 'test-only-password-123' }); assert.equal(login.status, 200);
    const cookie = { Cookie: login.headers.get('set-cookie').split(';')[0] };
    const list = await (await request('/api/admin/orders', 'GET', undefined, cookie)).json();
    assert.equal(list[0].deliveryCustomer, 'اسم التوصيل');
    assert.equal(list[0].status, 'draft');
    assert.equal(list[0].token, undefined); assert.equal(list[1].total, 13000);
    const detailsResponse = await request(`/api/orders/${draft.id}/details`, 'POST', payload, draftAuth);
    assert.equal(detailsResponse.status, 200);
    assert.equal((await detailsResponse.json()).status, 'pending');
    const updated = await (await request('/api/admin/orders', 'GET', undefined, cookie)).json();
    assert.equal(updated[0].deliveryCustomer, 'اسم التوصيل');
    assert.equal(updated[0].customer, 'عميل تجربة');
    assert.equal((await request(`/api/orders/${draft.id}/details`, 'POST', payload, draftAuth)).status, 409);
    assert.equal((await request(`/api/admin/orders/${order.id}/approve`, 'POST')).status, 401);
    assert.equal((await request(`/api/admin/orders/${order.id}/approve`, 'POST', {}, { ...cookie, Origin: 'https://other.example' })).status, 403);
    assert.equal((await request(`/api/admin/orders/${order.id}/approve`, 'POST', {}, cookie)).status, 200);
    assert.equal((await (await request(`/api/orders/${order.id}`, 'GET', undefined, auth)).json()).status, 'approved');
    assert.equal((await request(`/api/orders/${order.id}/phone`, 'POST', { phone: '123' }, auth)).status, 400);
    assert.equal((await request(`/api/orders/${order.id}/phone`, 'POST', { phone: '+965 ٥٠٠٠١٢٣٤' }, auth)).status, 200);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'orders.json'), 'utf8'));
    assert.equal(saved[1].phone, '+96550001234'); assert.equal(saved[1].status, 'completed');
    await request('/api/admin/logout', 'POST', {}, cookie);
    assert.equal((await request('/api/admin/orders', 'GET', undefined, cookie)).status, 401);
    console.log('Passed: authorization, pending gate, approval, phone validation, saved order, protected files, logout.');
  } finally {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

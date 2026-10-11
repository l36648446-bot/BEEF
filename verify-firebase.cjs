const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8')).rules;
let database = { admins: { admin: true }, orders: {} };
class Snapshot {
  constructor(tree, path = []) { this.tree = tree; this.path = path; }
  val() { return this.path.reduce((value, key) => value?.[key], this.tree) ?? null; }
  child(key) { return new Snapshot(this.tree, [...this.path, ...String(key).split('/')]); }
  parent() { return new Snapshot(this.tree, this.path.slice(0, -1)); }
  exists() { return this.val() !== null; }
  hasChild(key) { return this.child(key).exists(); }
  hasChildren(keys) { return keys ? keys.every(key => this.hasChild(key)) : this.val() !== null && typeof this.val() === 'object' && Object.keys(this.val()).length > 0; }
  isString() { return typeof this.val() === 'string'; }
  isNumber() { return typeof this.val() === 'number'; }
}
function evaluate(expression, before, after, path, uid, bindings = {}) {
  if (typeof expression === 'boolean') return expression;
  // Firebase's matches(regex) corresponds to String.match for these anchored patterns.
  return !!vm.runInNewContext(expression.replace(/\.matches\(/g, '.match('), { data: new Snapshot(before, path), newData: new Snapshot(after, path), root: new Snapshot(before), auth: uid ? { uid } : null, ...bindings });
}
function validate(rule, before, after, path, uid, bindings) {
  const next = new Snapshot(after, path);
  if (!next.exists()) return true;
  if ('.validate' in rule && !evaluate(rule['.validate'], before, after, path, uid, bindings)) return false;
  if (typeof next.val() !== 'object') return true;
  for (const key of Object.keys(next.val())) {
    const wildcard = Object.keys(rule).find(k => k.startsWith('$'));
    const selected = rule[key] || (wildcard && rule[wildcard]);
    if (selected && !validate(selected, before, after, [...path, key], uid, { ...bindings, ...(rule[key] ? {} : { [wildcard]: key }) })) return false;
  }
  return true;
}
function writeOrder(id, value, uid) {
  const next = JSON.parse(JSON.stringify(database)); next.orders[id] = value;
  const path = ['orders', id], bindings = { $id: id };
  if (!evaluate(rules.orders.$id['.write'], database, next, path, uid, bindings) || !validate(rules.orders.$id, database, next, path, uid, bindings)) return false;
  database = next; return true;
}
async function fakeFetch(url, options = {}) {
  if (url.includes('identitytoolkit')) {
    const admin = url.includes('signInWithPassword');
    return Response.json({ idToken: admin ? 'admin' : 'customer', refreshToken: 'refresh', localId: admin ? 'admin' : 'customer', expiresIn: '3600' });
  }
  const parsed = new URL(url), route = parsed.pathname.slice(1, -5), uid = parsed.searchParams.get('auth');
  const parts = route.split('/');
  if ((options.method || 'GET') === 'GET') {
    const allowed = parts[0] === 'admins' ? uid === parts[1] : parts.length === 1 ? uid === 'admin' : evaluate(rules.orders.$id['.read'], database, database, parts, uid, { $id: parts[1] });
    if (!allowed) return Response.json({ error: 'Permission denied' }, { status: 401 });
    return Response.json(new Snapshot(database, parts).val());
  }
  const value = JSON.parse(options.body);
  const next = options.method === 'PATCH' ? { ...database.orders[parts[1]], ...value } : value;
  return writeOrder(parts[1], next, uid) ? Response.json(next) : Response.json({ error: 'Permission denied' }, { status: 401 });
}
(async () => {
  const store = new Map(); const window = { useFirebase: true, firebaseConfig: { projectId: 'test', apiKey: 'test', databaseURL: 'https://database.example' } };
  const context = { window, fetch: fakeFetch, Response, URLSearchParams, crypto: require('node:crypto').webcrypto, sessionStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('products.js', 'utf8') + '\n' + fs.readFileSync('firebase-client.js', 'utf8'), context);
  const request = async (route, data) => { const response = await window.appFetch(route, data ? { method: 'POST', body: JSON.stringify(data) } : {}); return { status: response.status, data: await response.json() }; };
  assert.equal((await request('/api/admin/orders')).status, 401);
  const delivery = await request('/api/delivery', { customer: 'اسم التوصيل', address: 'عنوان', governorate: 'حولي' });
  assert.equal(delivery.status, 200); const id = delivery.data.id;
  const copy = () => JSON.parse(JSON.stringify(database.orders[id]));
  assert.equal(writeOrder(id, { ...copy(), status: 'approved' }, 'customer'), false);
  assert.equal(evaluate(rules.orders.$id['.read'], database, database, ['orders', id], 'other', { $id: id }), false);
  assert.equal((await request(`/api/orders/${id}/phone`, { phone: '50001234' })).status, 401);
  const details = { customer: 'اسم الطلب', orderNumber: '123', month: '10', year: '2026', postalCode: '12345', items: [{ productIndex: 0, variantIndex: 0, quantity: 2 }] };
  assert.equal((await request(`/api/orders/${id}/details`, details)).status, 200);
  assert.equal(database.orders[id].deliveryCustomer, 'اسم التوصيل');
  assert.equal(database.orders[id].customer, 'اسم الطلب');
  assert.equal(writeOrder(id, { ...copy(), ownerUid: 'other' }, 'customer'), false);
  assert.equal(writeOrder(id, { ...copy(), items: [{ productIndex: 0, variantIndex: 0, quantity: 99 }] }, 'customer'), false);
  assert.equal((await request('/api/admin/login', { email: 'admin@example.com', password: 'test' })).status, 200);
  const list = await request('/api/admin/orders'); assert.equal(list.data[0].total, 13000);
  assert.equal((await request(`/api/admin/orders/${id}/approve`, {})).status, 200);
  assert.equal(writeOrder(id, { ...copy(), status: 'completed', phone: '+96550001234', month: 11 }, 'customer'), false);
  assert.equal((await request(`/api/orders/${id}/phone`, { phone: '+965 ٥٠٠٠١٢٣٤' })).status, 200);
  assert.equal(database.orders[id].phone, '+96550001234');
  assert.equal((await request('/api/admin/logout', {})).status, 200);
  assert.equal((await request('/api/admin/orders')).status, 401);
  console.log('Passed: Firebase adapter with simulated REST and rule expressions; draft, details, owner isolation, admin approval, immutable submitted data, phone, logout.');
})().catch(error => { console.error(error); process.exitCode = 1; });

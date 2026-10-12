const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const catalog = vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'products.js'), 'utf8') + '\nproducts');
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters.');
const file = process.env.ORDERS_FILE || path.join(__dirname, 'data', 'orders.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
let orders = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const sessions = new Map();
const attempts = new Map();
function save() {
  fs.writeFileSync(file + '.tmp', JSON.stringify(orders), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 32768) throw new Error('حجم الطلب كبير.');
  }
  return JSON.parse(raw || '{}');
}
function value(v, max = 500) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function authenticated(req) {
  const token = /(?:^|;\s*)admin_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  return sessions.get(token) > Date.now();
}
const staticFiles = new Set(['index.html', 'style.css', 'products.js', 'app.js', 'checkout.js', 'firebase-config.js', 'firebase-client.js', 'admin.html', 'admin.js']);
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const allowedOrigin = process.env.PUBLIC_ORIGIN || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
      if (req.method === 'POST' && req.headers.origin && req.headers.origin !== allowedOrigin) return reply(res, 403, { error: 'طلب غير مسموح.' });
      if (url.pathname === '/api/admin/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const attempt = attempts.get(ip) || { count: 0, until: Date.now() + 600000 };
        if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 600000; }
        if (attempt.count >= 10) return reply(res, 429, { error: 'محاولات كثيرة. حاول بعد عشر دقائق.' });
        const data = await body(req);
        const supplied = crypto.createHash('sha256').update(String(data.password || '')).digest();
        const expected = crypto.createHash('sha256').update(password).digest();
        if (!crypto.timingSafeEqual(supplied, expected)) {
          attempt.count++; attempts.set(ip, attempt);
          return reply(res, 401, { error: 'كلمة المرور غير صحيحة.' });
        }
        attempts.delete(ip);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, Date.now() + 8 * 3600000);
        res.setHeader('Set-Cookie', `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
        return reply(res, 200, { ok: true });
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (!authenticated(req)) return reply(res, 401, { error: 'سجّل الدخول أولاً.' });
        if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
          const token = /admin_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
          sessions.delete(token);
          res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
          return reply(res, 200, { ok: true });
        }
        if (url.pathname === '/api/admin/orders' && req.method === 'GET') return reply(res, 200, orders.map(({ token, ...order }) => order));
        const approve = /^\/api\/admin\/orders\/([a-f0-9-]+)\/approve$/.exec(url.pathname);
        if (approve && req.method === 'POST') {
          const order = orders.find(o => o.id === approve[1]);
          if (!order) return reply(res, 404, { error: 'الطلب غير موجود.' });
          if (order.status === 'pending') { order.status = 'approved'; save(); }
          return reply(res, 200, { ok: true });
        }
      }
      const deliveryRoute = /^\/api\/orders\/([a-f0-9-]+)\/delivery$/.exec(url.pathname);
      if ((url.pathname === '/api/delivery' || deliveryRoute) && req.method === 'POST') {
        const data = await body(req);
        const customer = value(data.customer, 100), address = value(data.address), governorate = value(data.governorate, 100);
        if (!customer || !address || !governorate) return reply(res, 400, { error: 'أكمل بيانات التوصيل.' });
        if (deliveryRoute) {
          const order = orders.find(o => o.id === deliveryRoute[1] && `Bearer ${o.token}` === req.headers.authorization);
          if (!order) return reply(res, 404, { error: 'الطلب غير موجود.' });
          if (order.status !== 'draft') return reply(res, 409, { error: 'تم إرسال الطلب مسبقاً.' });
          Object.assign(order, { deliveryCustomer: customer, customer, address, governorate, location: value(data.location), notes: value(data.notes) });
          save();
          return reply(res, 200, { id: order.id, token: order.token, status: order.status });
        }
        const order = { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex'), status: 'draft', createdAt: new Date().toISOString(), deliveryCustomer: customer, customer, address, governorate, location: value(data.location), notes: value(data.notes) };
        orders.push(order); save();
        return reply(res, 201, { id: order.id, token: order.token, status: order.status });
      }
      const detailsRoute = /^\/api\/orders\/([a-f0-9-]+)\/details$/.exec(url.pathname);
      if (detailsRoute && req.method === 'POST') {
        const order = orders.find(o => o.id === detailsRoute[1] && `Bearer ${o.token}` === req.headers.authorization);
        if (!order) return reply(res, 404, { error: 'الطلب غير موجود.' });
        if (order.status !== 'draft') return reply(res, 409, { error: 'تم إرسال بيانات الطلب مسبقاً.' });
        const data = await body(req), customer = value(data.customer, 100), orderNumber = value(data.orderNumber, 40);
        const month = Number(data.month), year = Number(data.year);
        if (!customer || !/^\d+$/.test(orderNumber) || !/^[1-9]+$/.test(data.postalCode) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 9999 || !Array.isArray(data.items) || !data.items.length || data.items.length > 100) return reply(res, 400, { error: 'تحقق من بيانات الطلب.' });
        const items = data.items.map(i => {
          const product = Number.isInteger(i.productIndex) && catalog[i.productIndex];
          const variant = product && Number.isInteger(i.variantIndex) && product.variants[i.variantIndex];
          if (!variant || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99) throw new Error('Invalid item');
          return { name: product.name, variant: variant.name, quantity: i.quantity, price: variant.price };
        });
        Object.assign(order, { customer, orderNumber, month, year, postalCode: data.postalCode, items, total: items.reduce((sum, i) => sum + i.price * i.quantity, 0), status: 'pending', detailsSubmittedAt: new Date().toISOString() });
        save();
        return reply(res, 200, { id: order.id, token: order.token, status: order.status });
      }
      if (url.pathname === '/api/orders' && req.method === 'POST') {
        const data = await body(req);
        const customer = value(data.customer, 100), number = value(data.orderNumber, 40);
        const month = Number(data.month), year = Number(data.year);
        if (!customer || !/^\d+$/.test(number) || !/^[1-9]+$/.test(data.postalCode) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 9999 || !Array.isArray(data.items) || !data.items.length || data.items.length > 100) return reply(res, 400, { error: 'تحقق من بيانات الطلب.' });
        const items = data.items.map(i => {
          const product = Number.isInteger(i.productIndex) && catalog[i.productIndex];
          const variant = product && Number.isInteger(i.variantIndex) && product.variants[i.variantIndex];
          if (!variant || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99) throw new Error('Invalid item');
          return { name: product.name, variant: variant.name, quantity: i.quantity, price: variant.price };
        });
        const order = { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex'), status: 'pending', createdAt: new Date().toISOString(), customer, orderNumber: number, month, year, postalCode: data.postalCode, address: value(data.address), governorate: value(data.governorate, 100), notes: value(data.notes), location: value(data.location), items, total: items.reduce((sum, i) => sum + i.price * i.quantity, 0) };
        orders.push(order); save();
        return reply(res, 201, { id: order.id, token: order.token, status: order.status });
      }
      const match = /^\/api\/orders\/([a-f0-9-]+)(\/phone)?$/.exec(url.pathname);
      if (match) {
        const order = orders.find(o => o.id === match[1] && `Bearer ${o.token}` === req.headers.authorization);
        if (!order) return reply(res, 404, { error: 'الطلب غير موجود.' });
        if (!match[2] && req.method === 'GET') return reply(res, 200, { status: order.status });
        if (match[2] && req.method === 'POST') {
          if (order.status !== 'approved') return reply(res, 409, { error: 'يجب موافقة الإدارة أولاً.' });
          const data = await body(req);
          const phone = String(data.phone || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).trim();
          if (!/^[0-9]{1,30}$/.test(phone)) return reply(res, 400, { error: 'أدخل رقماً من اختيارك، حتى 30 خانة.' });
          order.phone = phone; order.status = 'completed'; save();
          return reply(res, 200, { status: order.status });
        }
      }
      return reply(res, 404, { error: 'المسار غير موجود.' });
    }
    if (req.method !== 'GET') return reply(res, 405, { error: 'غير مسموح.' });
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!staticFiles.has(relative) && !/^assets\/[a-zA-Z0-9_.-]+\.(jpg|png|webp|svg)$/.test(relative)) return reply(res, 404, { error: 'الصفحة غير موجودة.' });
    const target = path.join(__dirname, relative);
    if (!fs.existsSync(target)) return reply(res, 404, { error: 'الملف غير موجود.' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(target)], 'Cache-Control': 'no-cache' });
    fs.createReadStream(target).pipe(res);
  } catch (error) { reply(res, 400, { error: 'تعذر تنفيذ الطلب. حاول مرة أخرى.' }); }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('Shop: http://localhost:' + (process.env.PORT || 3000) + ' | Admin: /admin.html'));

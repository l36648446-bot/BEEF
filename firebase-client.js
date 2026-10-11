(() => {
  const config = window.firebaseConfig;
  const enabled = window.useFirebase;
  const authBase = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  const sessionKey = kind => `${config.projectId}-${kind}-auth`;
  const sessions = {};
  const inflight = {};
  const failure = (message, status = 400) => Object.assign(new Error(message), { status });
  const errors = {
    OPERATION_NOT_ALLOWED: 'فعّل Anonymous وEmail/Password من Firebase Authentication.',
    ADMIN_ONLY_OPERATION: 'فعّل تسجيل الدخول Anonymous من Firebase Authentication.',
    CONFIGURATION_NOT_FOUND: 'فعّل Firebase Authentication أولاً من لوحة Firebase.',
    INVALID_LOGIN_CREDENTIALS: 'البريد أو كلمة المرور غير صحيحة.',
    EMAIL_NOT_FOUND: 'البريد أو كلمة المرور غير صحيحة.',
    INVALID_PASSWORD: 'البريد أو كلمة المرور غير صحيحة.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'محاولات كثيرة. حاول لاحقاً.',
    USER_DISABLED: 'هذا الحساب معطّل.',
    'Permission denied': 'الوصول مرفوض. تحقق من نشر قواعد Firebase وصلاحية حساب الأدمن.'
  };
  function remember(kind, value) {
    sessions[kind] = value;
    try { if (value) sessionStorage.setItem(sessionKey(kind), JSON.stringify(value)); else sessionStorage.removeItem(sessionKey(kind)); } catch (_) {}
  }
  function stored(kind) {
    if (sessions[kind]) return sessions[kind];
    try { return sessions[kind] = JSON.parse(sessionStorage.getItem(sessionKey(kind))); } catch (_) { return null; }
  }
  async function jsonRequest(url, options) {
    let response;
    try { response = await fetch(url, options); } catch (_) { throw failure('تعذر الاتصال بـ Firebase. تحقق من الإنترنت وحاول مرة أخرى.', 503); }
    const data = await response.json();
    if (!response.ok) {
      const code = typeof data.error === 'string' ? data.error : data.error?.message;
      throw failure(errors[code] || `تعذر إكمال الاتصال بـ Firebase: ${code || response.status}`, response.status);
    }
    return data;
  }
  async function authenticate(action, body) {
    return jsonRequest(`${authBase}${action}?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, returnSecureToken: true }) });
  }
  function authRecord(result) {
    return { idToken: result.idToken, refreshToken: result.refreshToken, uid: result.localId, expiresAt: Date.now() + Number(result.expiresIn) * 1000 };
  }
  async function identity(kind) {
    if (inflight[kind]) return inflight[kind];
    inflight[kind] = (async () => {
      let record = stored(kind);
      if (!record) {
        if (kind === 'admin') throw failure('سجّل الدخول أولاً.', 401);
        record = authRecord(await authenticate('signUp', {}));
      } else if (record.expiresAt < Date.now() + 60000) {
        const result = await jsonRequest(`https://securetoken.googleapis.com/v1/token?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: record.refreshToken }).toString() });
        record = { idToken: result.id_token, refreshToken: result.refresh_token, uid: result.user_id, expiresAt: Date.now() + Number(result.expires_in) * 1000 };
      }
      remember(kind, record); return record;
    })();
    try { return await inflight[kind]; } finally { delete inflight[kind]; }
  }
  async function database(route, kind, method = 'GET', value) {
    const record = await identity(kind);
    return jsonRequest(`${config.databaseURL}/${route}.json?auth=${encodeURIComponent(record.idToken)}`, { method, headers: { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  }
  const clean = (v, max = 500) => String(v || '').trim().slice(0, max);
  function deliveryFields(data) {
    const customer = clean(data.customer, 100), address = clean(data.address), governorate = clean(data.governorate, 100);
    if (!customer || !address || !governorate) throw failure('أكمل الاسم والمحافظة وعنوان التوصيل.');
    return { deliveryCustomer: customer, customer, address, governorate, location: clean(data.location), notes: clean(data.notes) };
  }
  function selectedItems(data) {
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw failure('أضف المنتجات أولاً.');
    return data.items.map(i => {
      const product = Number.isInteger(i.productIndex) && products[i.productIndex];
      const variant = product && Number.isInteger(i.variantIndex) && product.variants[i.variantIndex];
      if (!variant || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99) throw failure('خيارات المنتجات غير صحيحة.');
      return { productIndex: i.productIndex, variantIndex: i.variantIndex, quantity: i.quantity };
    });
  }
  function displayOrder(order) {
    if (order.items) {
      order.items = Object.values(order.items).map(i => {
        const product = products[i.productIndex], variant = product?.variants[i.variantIndex];
        return { ...i, name: product?.name || 'منتج غير متاح', variant: variant?.name || '', price: variant?.price || 0 };
      });
      order.total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    }
    return order;
  }
  async function handle(route, options = {}) {
    const method = options.method || 'GET', data = options.body ? JSON.parse(options.body) : {};
    if (route === '/api/admin/login') {
      const result = await authenticate('signInWithPassword', { email: data.email, password: data.password });
      remember('admin', authRecord(result));
      try { if (await database(`admins/${result.localId}`, 'admin') !== true) throw failure('الحساب مسجّل لكن ليس أدمن. أضف UID الخاص به ضمن admins في قاعدة البيانات.', 403); }
      catch (e) { remember('admin', null); throw e; }
      return { ok: true };
    }
    if (route === '/api/admin/logout') { remember('admin', null); return { ok: true }; }
    if (route === '/api/admin/orders' && method === 'GET') {
      const orders = await database('orders', 'admin');
      return Object.values(orders || {}).map(displayOrder).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    const approve = /^\/api\/admin\/orders\/([a-f0-9-]+)\/approve$/.exec(route);
    if (approve && method === 'POST') { await database(`orders/${approve[1]}`, 'admin', 'PATCH', { status: 'approved' }); return { ok: true }; }
    if (route === '/api/delivery' && method === 'POST') {
      const user = await identity('customer'), id = crypto.randomUUID();
      await database(`orders/${id}`, 'customer', 'PUT', { id, ownerUid: user.uid, status: 'draft', createdAt: new Date().toISOString(), ...deliveryFields(data) });
      return { id, token: 'firebase-auth', status: 'draft' };
    }
    const match = /^\/api\/orders\/([a-f0-9-]+)(?:\/(delivery|details|phone))?$/.exec(route);
    if (!match) throw failure('المسار غير موجود.', 404);
    const [, id, step] = match;
    if (step === 'delivery' && method === 'POST') {
      await database(`orders/${id}`, 'customer', 'PATCH', deliveryFields(data)); return { id, token: 'firebase-auth', status: 'draft' };
    }
    if (step === 'details' && method === 'POST') {
      const month = Number(data.month), year = Number(data.year), customer = clean(data.customer, 100), orderNumber = clean(data.orderNumber, 40);
      if (!customer || !/^\d+$/.test(orderNumber) || !/^\d{5}$/.test(data.postalCode) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 9999) throw failure('تحقق من الاسم ورقم الطلب والتاريخ والرمز البريدي.');
      const items = selectedItems(data);
      await database(`orders/${id}`, 'customer', 'PATCH', { customer, orderNumber, month, year, postalCode: data.postalCode, items, itemCount: items.length, status: 'pending', detailsSubmittedAt: new Date().toISOString() });
      return { id, token: 'firebase-auth', status: 'pending' };
    }
    if (step === 'phone' && method === 'POST') {
      const phone = clean(data.phone, 30).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[\s()+-]/g, '').replace(/^(00965|965)/, '');
      if (!/^[24569]\d{7}$/.test(phone)) throw failure('أدخل رقم هاتف كويتي صحيح من 8 أرقام.');
      await database(`orders/${id}`, 'customer', 'PATCH', { phone: '+965' + phone, status: 'completed' }); return { status: 'completed' };
    }
    if (!step && method === 'GET') {
      const order = await database(`orders/${id}`, 'customer');
      if (!order) throw failure('الطلب غير موجود.', 404);
      return { status: order.status };
    }
    throw failure('المسار غير موجود.', 404);
  }
  window.appFetch = async (url, options) => {
    if (!enabled) return fetch(url, options);
    try { return new Response(JSON.stringify(await handle(url, options)), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: e.status >= 400 && e.status <= 599 ? e.status : 400, headers: { 'Content-Type': 'application/json' } }); }
  };
})();

# Firebase — gerty-b6913

إعدادات تطبيق الويب موجودة في firebase-config.js. يتصل الموقع مباشرة بـ Realtime Database باستخدام Firebase Authentication وREST؛ لا يحتاج خادم Node.js بعد نشر نسخة Firebase. تم نشر الموقع وقواعد قاعدة البيانات بتاريخ 11 أكتوبر 2026. المتجر: https://gerty-b6913.web.app والأدمن: https://gerty-b6913.web.app/admin.html . بقي تفعيل Authentication وإعداد حساب الأدمن لإكمال التشغيل.

## إعداد الحسابات

1. افتح https://console.firebase.google.com/project/gerty-b6913/authentication/providers . فعّل Email/Password وAnonymous.
2. من Authentication → Users أنشئ حساب الأدمن بالبريد وكلمة المرور، وانسخ UID الخاص به.
3. افتح Realtime Database → Data. أضف المسار admins ثم داخله UID حساب الأدمن بقيمة boolean هي true. مثال: `admins/UID: true`. هذا الإجراء من لوحة Firebase فقط؛ لا يمكن للزبون منح نفسه صلاحية أدمن.
4. من Realtime Database → Rules الصق محتوى database.rules.json وانشره، أو استخدم أمر النشر أدناه. لا تستخدم قواعد القراءة والكتابة المفتوحة.

دخول الأدمن على Firebase يكون ببريد الحساب وكلمة مروره؛ كلمة المرور المحلية لا تُنقل إلى Firebase. الطلبات القديمة في data/orders.json تبقى محلية ولا تُرفع تلقائياً.

## النشر

بعد تثبيت Node.js وFirebase CLI، من مجلد المشروع:

```powershell
node build.cjs
firebase login
firebase deploy --only database,hosting --project gerty-b6913
```

إذا Node.js متوفر فقط داخل المشروع، يمكن بناء الملفات هكذا:

```powershell
.\.tools\node.exe --preserve-symlinks --preserve-symlinks-main build.cjs
```

firebase.json ينشر مجلد dist الذي يحتوي صفحات الموقع والصور فقط، ولا يتضمن كلمات المرور المحلية أو بيانات الزبائن أو ملفات الخادم. يتم توليد dist بأمر البناء، ولا يُرفع إلى GitHub.

بعد النشر افتح https://gerty-b6913.web.app وhttps://gerty-b6913.web.app/admin.html . تم التحقق من فتح هذه الصفحات بعد النشر.

## الاختبار المحلي

الخادم على localhost:3000 يستمر باستخدام الحفظ المحلي. لتجربة قاعدة Firebase بعد تفعيل الخدمات ونشر القواعد:

- المتجر: http://localhost:3000/?firebase=1
- الأدمن: http://localhost:3000/admin.html?firebase=1

في النسخة المستضافة يتم اختيار Firebase تلقائياً. يتم تسجيل الزبون بشكل مجهول وحفظ هويته في التبويب لقراءة طلبه فقط. يراجع الأدمن الفورمات من أي جهاز، وتظهر الموافقة للزبون خلال ثوانٍ. المجموع المعروض يُحسب من كتالوج المنتجات الحالي؛ لا توجد عملية دفع أو تحصيل.

## GitHub

ارفع ملفات المصدر والإعدادات. .gitignore يستثني data و.tools و.env ومفاتيح service account. إعدادات Firebase لتطبيق الويب ليست كلمة مرور الأدمن. مستودع المصدر: https://github.com/l36648446-bot/BEEF . تم رفع الملفات إلى فرع main.

## التحقق

```powershell
node verify.cjs
node verify-server.cjs
node verify-firebase.cjs
```

اختبار Firebase يستخدم REST محاكاة وتقييماً محلياً لتعبيرات القواعد، ولا يغني عن تجربة المشروع الفعلي أو Firebase Emulator قبل النشر العام.

المراجع: https://firebase.google.com/docs/reference/rest/auth وhttps://firebase.google.com/docs/database/security وhttps://firebase.google.com/docs/hosting/quickstart .

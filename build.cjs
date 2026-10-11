const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'dist');
fs.mkdirSync(dir, { recursive: true });
for (const name of ['index.html', 'admin.html', 'style.css', 'products.js', 'app.js', 'checkout.js', 'admin.js', 'firebase-config.js', 'firebase-client.js']) fs.copyFileSync(path.join(__dirname, name), path.join(dir, name));
fs.cpSync(path.join(__dirname, 'assets'), path.join(dir, 'assets'), { recursive: true });
console.log('Firebase Hosting files prepared in dist/');

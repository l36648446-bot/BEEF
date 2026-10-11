// Firebase web configuration is public. Database access is controlled by database.rules.json.
window.firebaseConfig = {
  apiKey: 'AIzaSyA499k4GVcSWVnkty9PIqyKRmYJdBk-HTM',
  authDomain: 'gerty-b6913.firebaseapp.com',
  databaseURL: 'https://gerty-b6913-default-rtdb.firebaseio.com',
  projectId: 'gerty-b6913',
  storageBucket: 'gerty-b6913.firebasestorage.app',
  messagingSenderId: '1095611220276',
  appId: '1:1095611220276:web:81b75a44477cc5db15e561',
  measurementId: 'G-Q86RJKZ9W6'
};
// Keep the existing local server available. Use ?firebase=1 to test Firebase locally.
window.useFirebase = !(['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '3000') || new URLSearchParams(location.search).get('firebase') === '1';

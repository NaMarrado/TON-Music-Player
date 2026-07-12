export const SHARED_SCRIPT = `// ========== Anti-detection ==========
Object.defineProperty(navigator, 'webdriver', { get: function() { return false; }, configurable: true });

// ========== Constants ==========
var GOOG_API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';
var CREATE_URL = 'https://www.youtube.com/api/jnn/v1/Create';
var GENERATE_IT_URL = 'https://www.youtube.com/api/jnn/v1/GenerateIT';
var REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

// ========== Logging ==========
function log(msg) {
  try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'po_token_log', msg: msg })); } catch(e) {}
}

// ========== Helpers ==========
function base64ToU8(b64) {
  var mod = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (mod.length % 4) mod += '=';
  var raw = atob(mod);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function u8ToBase64(u8, websafe) {
  var CHUNK = 0x8000;
  var parts = [];
  for (var i = 0; i < u8.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
  }
  var r = btoa(parts.join(''));
  if (websafe) r = r.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '');
  return r;
}

function getHeaders() {
  return {
    'accept': 'application/json',
    'content-type': 'application/json+protobuf',
    'x-goog-api-key': GOOG_API_KEY,
    'x-user-agent': 'grpc-web-javascript/0.1'
  };
}

function descramble(scrambled) {
  var buf = base64ToU8(scrambled);
  if (!buf.length) return '';
  var mapped = new Uint8Array(buf.length);
  for (var i = 0; i < buf.length; i++) mapped[i] = (buf[i] + 97) & 0xFF;
  return new TextDecoder().decode(mapped);
}

function generateVisitorData() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var id = '';
  for (var i = 0; i < 11; i++) id += chars[Math.floor(Math.random() * chars.length)];
  var ts = Math.floor(Date.now() / 1000);

  var idBytes = new TextEncoder().encode(id);
  var tsBytes = encodeVarint(ts);
  var buf = new Uint8Array(1 + 1 + idBytes.length + 1 + tsBytes.length);
  var pos = 0;
  buf[pos++] = 0x0A;
  buf[pos++] = idBytes.length;
  for (var j = 0; j < idBytes.length; j++) buf[pos++] = idBytes[j];
  buf[pos++] = 0x10;
  for (var k = 0; k < tsBytes.length; k++) buf[pos++] = tsBytes[k];

  return u8ToBase64(buf, true);
}

function encodeVarint(value) {
  var bytes = [];
  while (value > 0x7F) {
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7F);
  return new Uint8Array(bytes);
}

function DeferredPromise() {
  var self = this;
  this.promise = new Promise(function(resolve, reject) {
    self.resolve = resolve;
    self.reject = reject;
  });
}`;

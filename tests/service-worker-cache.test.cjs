'use strict';

// Focused service-worker cache tests. No browser, network, or real user data.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const listeners = new Map();
const entries = new Map();
let networkFails = false;
const scope = 'https://sommaapp.github.io/';
const keyOf = value => {
  const url = new URL(typeof value === 'string' ? value : value.url, scope);
  return url.href;
};
const cache = {
  async addAll() {},
  async add() {},
  async put(request, response) { entries.set(keyOf(request), response); }
};
const caches = {
  async open() { return cache; },
  async keys() { return ['somma-app-backend-v1.2']; },
  async delete() { return true; },
  async match(request, options = {}) {
    const key = keyOf(request);
    if (entries.has(key)) return entries.get(key);
    if (options.ignoreSearch) {
      const url = new URL(key);
      url.search = '';
      return entries.get(url.href);
    }
    return undefined;
  }
};
const self = {
  location: { origin: 'https://sommaapp.github.io' },
  registration: { scope },
  clients: { async claim() {} },
  async skipWaiting() {},
  addEventListener(name, callback) { listeners.set(name, callback); }
};
const context = {
  self, caches, URL, Promise, Set,
  async fetch(request) {
    if (networkFails) throw new Error('offline');
    return { ok: true, url: request.url, clone() { return this; } };
  }
};
vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), context);

async function request(url, mode = 'navigate') {
  let responsePromise;
  const event = {
    request: { method: 'GET', mode, url },
    respondWith(promise) { responsePromise = promise; }
  };
  listeners.get('fetch')(event);
  assert.ok(responsePromise, 'fetch handler should respond to navigation');
  return responsePromise;
}

(async () => {
  const clean = await request(scope);
  assert.equal(clean.ok, true);
  assert.ok(entries.has(scope), 'clean app shell navigation should be cached');
  console.log('PASS clean navigation is cached');

  const callbackUrl = scope + '?code=one-time-auth-code';
  const callback = await request(callbackUrl);
  assert.equal(callback.ok, true);
  assert.ok(!entries.has(callbackUrl), 'PKCE callback URL must not be cached');
  console.log('PASS PKCE callback query URL is not cached');

  networkFails = true;
  const fallback = await request(scope + '?code=offline-callback');
  assert.equal(fallback.url, scope, 'offline callback should fall back to clean shell');
  assert.ok(!entries.has(scope + '?code=offline-callback'));
  console.log('PASS offline callback falls back to clean shell without query URL');

  console.log('3/3 service-worker cache checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

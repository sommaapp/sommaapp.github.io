'use strict';
// Regression test: operational idempotency secrets must not be projected to browser reads.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(new URL('../backend.js', `file://${__filename}`), 'utf8');
const match = source.match(/contributions:\s*'([^']+)'/);
assert.ok(match, 'contribution projection must exist');
const columns = match[1].split(',').map(value => value.trim());
assert.ok(columns.includes('id'), 'contribution id is needed by UI');
assert.ok(columns.includes('amount_cents'), 'amount is needed by UI');
assert.ok(!columns.includes('idempotency_key'), 'idempotency key must never be returned by client projection');
assert.match(source, /\.eq\('idempotency_key',\s*intent\.key\)/, 'idempotency lookup must remain server-filtered');
console.log('PASS idempotency key excluded from client projection and used only as lookup filter');

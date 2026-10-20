'use strict';

const assert = require('node:assert/strict');

const baseUrl = 'http://localhost:3000/requests';
const now = new Date().toISOString();

function buildUrl(cursor) {
  const params = new URLSearchParams();
  params.set('select', 'id,created_at,expires_at,status');
  params.set('status', 'eq.active');
  params.set('order', 'created_at.desc,id.desc');
  const expiryBranches = ['expires_at.is.null', `expires_at.gt.${now}`];
  if (!cursor) {
    params.set('or', `(${expiryBranches.join(',')})`);
  } else {
    const positions = [
      `created_at.lt.${cursor.created_at}`,
      `and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    ];
    const branches = [];
    for (const expiry of expiryBranches) {
      for (const position of positions) branches.push(`and(${expiry},${position})`);
    }
    params.set('or', `(${branches.join(',')})`);
  }
  params.set('limit', '2');
  return `${baseUrl}?${params.toString()}`;
}

async function getRows(cursor) {
  const response = await fetch(buildUrl(cursor), { headers: { Accept: 'application/json' } });
  const body = await response.text();
  assert.equal(response.status, 200, `PostgREST returned ${response.status}: ${body}`);
  return JSON.parse(body);
}

(async () => {
  const first = await getRows(null);
  assert.equal(first.length, 2, 'first page returns two eligible synthetic rows');
  assert(first.every(row => row.status === 'active'), 'status filter excludes completed rows');
  assert(first.every(row => row.expires_at === null || Date.parse(row.expires_at) > Date.parse(now)),
    'expiry filter excludes expired rows');
  assert.deepEqual(first.map(row => row.id), [
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222'
  ], 'same-timestamp records use UUID as stable tie-breaker');

  const last = first.at(-1);
  const cursor = { created_at: last.created_at, id: last.id };
  const next = await getRows(cursor);
  assert.equal(next.length, 2, 'cursor returns both remaining eligible synthetic rows');
  assert.deepEqual(next.map(row => row.id), [
    '11111111-1111-4111-8111-111111111111',
    '66666666-6666-4666-8666-666666666666'
  ], 'cursor preserves ordering across null and future expiry branches');
  assert(!first.some(row => next.some(nextRow => nextRow.id === row.id)),
    'consecutive pages do not overlap');
  assert.deepEqual([...first, ...next].map(row => row.id), [
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    '66666666-6666-4666-8666-666666666666'
  ], 'full traversal includes every eligible row exactly once');
  console.log('PASS PostgREST parses nested expiry/cursor OR expression and applies filters');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

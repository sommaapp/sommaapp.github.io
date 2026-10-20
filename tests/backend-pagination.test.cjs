const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const captured = [];
let resultRows = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; this.limitValue = null; }
  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push(['eq', column, value]); return this; }
  or(expression) { this.orExpression = expression; return this; }
  order(column, options) { this.orders.push([column, options]); return this; }
  limit(value) { this.limitValue = value; return this; }
  then(resolve, reject) {
    captured.push(this);
    return Promise.resolve({ data: resultRows.slice(0, this.limitValue), error: null }).then(resolve, reject);
  }
}
const client = { from: table => new Query(table) };
const context = {
  window: {
    SOMMA_CONFIG: { supabaseUrl: 'https://example.invalid', supabasePublishableKey: 'public-test-key' },
    supabase: { createClient: () => client }
  },
  AbortController,
  fetch: async () => { throw new Error('Unexpected network request in unit test'); },
  setTimeout,
  clearTimeout,
  Date,
  console
};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'backend.js'), 'utf8'), context);
const api = context.window.SommaBackend;

(async () => {
  assert.equal(typeof api.requestPage, 'function', 'pagination API is exported');
  const now = new Date().toISOString();
  const id1 = '11111111-1111-4111-8111-111111111111';
  const id2 = '22222222-2222-4222-8222-222222222222';
  resultRows = [
    { id: id1, created_at: now },
    { id: id2, created_at: now },
    { id: '33333333-3333-4333-8333-333333333333', created_at: now }
  ];
  const first = await api.requestPage({ limit: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  assert.deepEqual(JSON.parse(JSON.stringify(first.nextCursor)), { created_at: now, id: id2 });
  assert.equal(captured.at(-1).limitValue, 3, 'fetches one extra row to determine hasMore');
  assert.deepEqual(captured.at(-1).orders.map(item => item[0]), ['created_at', 'id']);
  assert.equal(captured.at(-1).filters.some(f => f[0] === 'eq' && f[1] === 'status' && f[2] === 'active'), true);
  assert.match(captured.at(-1).orExpression, /expires_at\.is\.null/);
  assert.match(captured.at(-1).orExpression, /expires_at\.gt\./);

  resultRows = [{ id: id2, created_at: now }];
  const second = await api.requestPage({ limit: 2, cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
  assert.match(captured.at(-1).orExpression, /created_at\.lt\./);
  assert.match(captured.at(-1).orExpression, /created_at\.eq\./);
  assert.match(captured.at(-1).orExpression, /id\.lt\./);
  assert.equal((captured.at(-1).orExpression.match(/and\(/g) || []).length, 4,
    'cursor and expiry constraints are combined into one OR expression');

  resultRows = [];
  await api.requestPage({ limit: 1000 });
  assert.equal(captured.at(-1).limitValue, 51, 'page size is capped at 50 plus look-ahead row');
  await assert.rejects(api.requestPage({ cursor: { created_at: 'not-a-date', id: id1 } }), /invalid_request_page_cursor/);
  await assert.rejects(api.requestPage({ cursor: { created_at: now, id: 'not-a-uuid' } }), /invalid_request_page_cursor/);
  console.log('PASS stable request pagination contract (10 assertions groups)');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

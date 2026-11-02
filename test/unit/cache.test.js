const { test } = require('node:test');
const assert = require('node:assert/strict');
const StreamService = require('../../src/server/services/streamService').constructor;

test('cache prunes to a byte budget and prefetch coalesces browser probes', () => {
  const service = new StreamService();
  service.maxCacheBytes = 10;
  service.cache.set('1:auto', { size: 6, timestamp: 1 });
  service.cache.set('2:auto', { size: 6, timestamp: 2 });
  service.cache.set('3:auto', { size: 6, timestamp: 3 });
  service.pruneCache();
  assert.deepEqual([...service.cache.keys()], ['3:auto']);
  service.prefetch('3');
  assert.equal(service.prefetchTimers.size, 0);
  for (let i = 0; i < 20; i++) service.prefetch('4');
  assert.equal(service.prefetchTimers.size, 1);
  service.prefetch('5'); service.prefetch('6');
  assert.equal(service.prefetchTimers.size, 2);
  for (const timer of service.prefetchTimers.values()) clearTimeout(timer);
});

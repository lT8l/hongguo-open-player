const { test } = require('node:test');
const assert = require('node:assert/strict');
const Service = require('../../src/server/services/streamService').constructor;
const tick = () => new Promise(resolve => setImmediate(resolve));

test('downloads serialize, coalesce consumers, and abort only after the last disconnect', async () => {
  const service = new Service();
  const started = [];
  const finish = [];
  service.loadBuffer = async (vid, quality, signal) => {
    started.push({ vid, quality, signal });
    return new Promise((resolve, reject) => {
      finish.push(resolve);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  const a = new AbortController(), b = new AbortController();
  const one = service.getDecryptedBuffer('1', '720p', { signal: a.signal });
  const oneAgain = service.getDecryptedBuffer('1', '720p', { signal: b.signal });
  const two = service.getDecryptedBuffer('2');
  await tick();
  assert.equal(started.length, 1);
  const cancelled = assert.rejects(one);
  a.abort(new Error('gone')); await cancelled;
  assert.equal(started[0].signal.aborted, false);
  const cancelledAgain = assert.rejects(oneAgain);
  b.abort(new Error('gone')); await cancelledAgain; await tick();
  assert.equal(started.length, 2);
  finish[1](Buffer.from('2')); await two;
  await tick();
  assert.equal(service.inFlight.size, 0);
});

test('foreground playback supersedes background prefetch', async () => {
  const service = new Service();
  service.loadBuffer = async (vid, _, signal) => vid === '1'
    ? new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))) : Buffer.from('2');
  const prefetch = service.getDecryptedBuffer('1', 'auto', { background: true });
  await tick();
  const stopped = assert.rejects(prefetch, /superseded/);
  assert.equal((await service.getDecryptedBuffer('2')).toString(), '2');
  await stopped;
});

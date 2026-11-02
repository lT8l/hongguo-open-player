const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const StreamService = require('../../src/server/services/streamService').constructor;

test('all CDN candidates fail promptly or reach a third working candidate', async () => {
  const service = new StreamService();
  const variants = [1, 2, 3].map(n => ({ url: `https://cdn.example/${n}` }));
  const seen = [];
  service.downloadWithParallelRanges = async url => {
    seen.push(url);
    if (!url.endsWith('/3')) throw new Error('offline');
    return Buffer.from('media');
  };
  const result = await service.downloadFastestMedia(variants);
  assert.equal(result.buffer.toString(), 'media');
  assert.equal(seen.length, 3);
  service.downloadWithParallelRanges = async () => { throw new Error('offline'); };
  await assert.rejects(service.downloadFastestMedia(variants), /offline/);
});

test('range downloads handle tiny files and CDNs ignoring or truncating ranges', async t => {
  const body = Buffer.from('abcdefghi');
  let mode = 'ranges';
  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (!range || (mode === 'ignore' && range !== 'bytes=0-0')) return res.end(body);
    const [, a, b] = range.match(/bytes=(\d+)-(\d+)/);
    const start = Number(a), end = Number(b);
    assert.ok(start <= end && end < body.length);
    const chunk = body.subarray(start, end + 1);
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${body.length}` });
    res.end(mode === 'truncate' && end > start ? chunk.subarray(1) : chunk);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (mode of ['ranges', 'ignore', 'truncate']) {
    assert.deepEqual(await new StreamService({ requestOptions: () => ({ maxRedirects: 0 }) }).downloadWithParallelRanges(url), body);
  }
});


test('media downloads reject loopback destinations by default', async () => {
  await assert.rejects(new StreamService().downloadWithParallelRanges('http://127.0.0.1/'), /公网/);
});

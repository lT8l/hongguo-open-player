// SPDX-License-Identifier: GPL-3.0-only
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { render, optionsFrom } = require('../../scripts/render-nginx-config');

test('nginx root and nested installation config derives path without hardcoded host', () => {
  const base = { prefix: '/watch/deep/', resolver: '127.0.0.53', 'ca-bundle': '/etc/ssl/cert.pem' };
  const config = render(base);
  assert.match(config, /js_engine qjs;/);
  assert.match(config, /location \^~ \/watch\/deep\/api\//);
  assert.match(config, /location = \/watch\/deep \{ return 308 \/watch\/deep\/; \}/);
  assert.match(config, /alias ".*src\/client\/";/);
  assert.match(render({ ...base, prefix: '/' }), /location \^~ \/api\//);
  assert.doesNotMatch(render({ ...base, prefix: '/' }), /return 308 \//);
  assert.throws(() => render({ ...base, prefix: '/../admin/' }));
  assert.throws(() => optionsFrom(['--prefix', '/foo/']));
});
test('browser local store persists per subpath and rejects malformed ID', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/client/js/local-store.js'), 'utf8');
  const values = new Map();
  const localStorage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) };
  const load = prefix => {
    const context = { window: { localStorage }, document: { currentScript: { src: 'https://player.invalid' + prefix + 'js/local-store.js' } }, URL };
    vm.runInNewContext(source, context);
    return context.window.HongguoLocalStore;
  };
  const store = load('/watch/');
  assert.equal(store.toggleFavorite({ series_id: '100', series_title: 'foo' }), true);
  assert.equal(load('/watch/').getFavorites()[0].series_title, 'foo');
  store.updateProgress({ series_id: '100', episode_index: 3, position_sec: 15, watched_indexes: [1, 3, 3] });
  assert.equal(load('/watch/').getSeriesProgress('100').position_sec, 15);
  assert.equal(load('/watch/').getHistory().length, 1);
  assert.equal(load('/other/').getFavorites().length, 0);
  assert.throws(() => store.toggleFavorite({ series_id: '../a' }), /series_id/);
});
test('QuickJS API validates identity and never redirects to an arbitrary host', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../nginx/player.js'), 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const sid = '123456', vid = '789123';
  const router = data => '<script>window._ROUTER_DATA = ' + JSON.stringify({ loaderData: data }) + ';</script>';
  const series = router({ 'player_(series_id)/page': { seriesDetail: { series_id: sid,
    series_name: 'demo', vid_list: [vid] } } });
  const publicPage = router({ 'player_(series_id)/(vid)/page': {
    series_id: sid, vid, seriesDetail: { series_id: sid }, isSuccess: true,
    protectedPlayback: false, publicVideoSeo: { available: true, itemId: vid, seriesId: sid }
  } }) + '<script type="application/ld+json">' + JSON.stringify({ '@type': 'VideoObject',
    url: 'https://hongguoduanju.com/player/' + sid + '/' + vid,
    contentUrl: 'https://hongguoduanju.com/video/public/' + vid + '/demo.mp4' }) + '</script>';
  globalThis.ngx = { fetch: async url => ({
    ok: true, status: 200, text: async () => url.includes('/player/_/') ? publicPage
      : url.includes('/player/' + sid) ? series
      : JSON.stringify({ searchList: [{ series_id: sid, series_name: 'demo' }], pageNum: 1 })
  }) };
  const request = async uri => {
    const r = { uri: '/custom/app/' + uri, method: 'GET', args: { keyword: 'demo' },
      headersOut: {}, error() {}, return(status, result) { this.status = status; this.body = result; } };
    await mod.default.api(r);
    return r;
  };
  assert.equal(JSON.parse((await request('api/search')).body).results[0].series_id, sid);
  assert.equal(JSON.parse((await request('api/series/' + sid)).body).episodes[0].vid, vid);
  const redir = await request('api/stream/' + vid);
  assert.equal(redir.status, 302);
  assert.match(redir.body, /\/video\/public\//);
  assert.equal((await request('api/stream/../admin')).status, 404);
  globalThis.ngx.fetch = async () => ({ ok: true, text: async () => publicPage.replace('hongguoduanju.com/video/public', 'untrusted.invalid/video/public') });
  assert.equal((await request('api/stream/' + vid)).status, 404);
});

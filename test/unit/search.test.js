const { test } = require('node:test');
const assert = require('node:assert/strict');
const web = require('../../src/server/native/hongguo-search');
const app = require('../../src/server/native/hongguo-app-search');
const Service = require('../../src/server/services/dramaService').constructor;

function webDrama(id, title, metadata = {}) {
  return { name: title, video_data: { series_id: id, series_title: title, ...metadata } };
}

test('website search removes unrelated recommendations but keeps title, cast and genre matches', () => {
  const payload = { searchList: [
    webDrama('123456', '离婚以后'),
    webDrama('123457', '一生相伴', { series_intro: '离婚后的故事' }),
    webDrama('123458', '都市生活', { category_list: [{ name: '离婚' }] }),
    webDrama('123459', '重逢', { celebrities: [{ nickname: '离婚' }] }),
    webDrama('123460', '无关的推荐'),
  ], totalCount: 30, pageNum: 2, hasMore: true };
  const result = web.parseSearchResponse(payload, { keyword: '离婚' });
  assert.deepEqual(result.results.map(item => item.series_id), ['123456', '123457', '123458', '123459']);
  assert.equal(result.page, 2);
  assert.equal(result.hasMore, true);
});

test('unmatched recommendations produce a cached empty search without triggering App fallback', async t => {
  const originalWeb = web.searchHongguo, originalApp = app.searchApp;
  t.after(() => { web.searchHongguo = originalWeb; app.searchApp = originalApp; web.clearSearchCache(); });
  let requests = 0, appCalls = 0;
  const options = { retries: 0, request: async () => {
    requests++;
    return { searchList: [webDrama('123456', '无关推荐')], pageNum: 1, totalCount: '183', hasMore: true };
  } };
  web.clearSearchCache();
  web.searchHongguo = (keyword, pageOptions) => originalWeb(keyword, { ...options, ...pageOptions });
  app.searchApp = async () => { appCalls++; throw new Error('must not replace empty results'); };
  const service = new Service();
  for (let i = 0; i < 2; i++) {
    const result = await service.search('zzzxqv987654321');
    assert.deepEqual(result.results, []);
    assert.equal(result.total, 0);
    assert.equal(result.hasMore, false);
    assert.equal(result.error, undefined);
  }
  assert.equal(requests, 1);
  assert.equal(appCalls, 0);
});

test('unrecognizable website entries remain format failures rather than no-match results', () => {
  assert.throws(() => web.parseSearchResponse({ searchList: [{ unknown: true }] }, { keyword: '离婚' }),
    error => error.kind === 'format' && error.fallback === true);
});

test('App search fallback also suppresses unrelated recommendations', () => {
  const payload = { search_tabs: [{ tab_type: 11, has_more: true, data: [
    { video_data: [{ series_id: '123456', title: '重逢', celebrities: [{ nickname: '代高政' }] }] },
    { video_data: [{ series_id: '123457', title: '无关推荐' }] },
  ] }] };
  const matched = app.parseSearchPayload(payload, { keyword: '代高政' });
  assert.deepEqual(matched.results.map(item => item.series_id), ['123456']);
  assert.equal(matched.hasMore, true);
  const empty = app.parseSearchPayload(payload, { keyword: 'zzzxqv987654321', page: 2 });
  assert.deepEqual(empty.results, []);
  assert.equal(empty.page, 2);
  assert.equal(empty.hasMore, false);
  assert.equal(empty.nextPage, null);
});

test('search relevance normalizes width and case and does not match unrelated IDs or URLs', () => {
  const payload = { searchList: [webDrama('123456', 'ＡＩ 都市故事', {
    series_cover: 'https://example.com/zzzxqv987654321', category_list: [{ name: '爱情' }],
  })] };
  assert.equal(web.parseSearchResponse(payload, { keyword: 'ai 爱情' }).results.length, 1);
  assert.equal(web.parseSearchResponse(payload, { keyword: '123456' }).results.length, 0);
  assert.equal(web.parseSearchResponse(payload, { keyword: 'zzzxqv987654321' }).results.length, 0);
});

test('search forwards page options and preserves App pagination cursor', async t => {
  const originalWeb = web.searchHongguo, originalApp = app.searchApp;
  t.after(() => { web.searchHongguo = originalWeb; app.searchApp = originalApp; });
  const service = new Service();
  web.searchHongguo = async (_, options) => ({ success: true, results: [], page: options.page });
  assert.equal((await service.search('离婚', 3)).page, 3);
  web.searchHongguo = async () => { throw new Error('offline'); };
  const cursor = { search_id: 'abc', next_offset: 20 };
  app.searchApp = async (_, options) => {
    if (options.page === 2) assert.deepEqual(options.cursor, cursor);
    return { results: [{ series_id: '1' }], page: options.page, hasMore: true, cursor };
  };
  assert.equal((await service.search('离婚', 1)).page, 1);
  assert.equal((await service.search('离婚', 2)).page, 2);
  await assert.rejects(service.search(['bad']), /搜索词/);
  await assert.rejects(service.search('离婚', -1), /页码/);
});

test('catalog preserves terminal empty pages and never substitutes another category', async t => {
  const catalog = require('../../src/server/native/hongguo-app-catalog');
  const original = catalog.browseList;
  t.after(() => { catalog.browseList = original; });
  const service = new Service();
  catalog.browseList = async () => ({ success: true, results: [], page: 2, hasMore: false });
  assert.equal((await service.catalog({ page: 2, category: 'comic-drama' })).page, 2);
  catalog.browseList = async () => ({ success: false, error: 'upstream unavailable' });
  await assert.rejects(service.catalog({ category: 'comic-drama' }), /所选分类/);
});

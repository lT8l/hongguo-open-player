// SPDX-License-Identifier: GPL-3.0-only
// nginx http JS module using the QuickJS engine (js_engine qjs).
// Only public website metadata and unprotected public video are served here.
// The Node/Electron signing, download and decryption modules are NOT imported.
const SITE = 'https://hongguoduanju.com';
const WEB_HEADERS = {
  'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'User-Agent': 'Mozilla/5.0 (compatible; HongguoOpenPlayerWeb/1.0)',
  'Referer': SITE + '/'
};
const CATEGORIES = new Set(['hot-drama', 'real-drama', 'comic-drama', 'ai-drama']);
const DECIMAL_ID = /^[0-9]{1,30}$/;
const MEDIA_DOMAINS = /(^|\.)(hongguoduanju\.com|fqnovelvod\.com|qznovelvod\.com|douyinvod\.com|bytecdn\.cn|bytedance\.com|volces\.com)$/i;

function send(r, data, status = 200) {
  r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
  r.headersOut['Cache-Control'] = 'no-store';
  r.headersOut['X-Content-Type-Options'] = 'nosniff';
  r.return(status, JSON.stringify(data));
}
function failure(r, error) {
  const status = Number(error?.status) || 502;
  r.error('QuickJS API: ' + String(error?.message || error));
  send(r, { error: status === 400 ? error.message : '上游数据暂不可用，请稍后重试' }, status);
}
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function argument(r, name, fallback = '') {
  const value = r.args?.[name];
  if (Array.isArray(value)) throw invalid('不允许重复的请求参数');
  return value === undefined ? fallback : String(value);
}
function pageNumber(r) {
  const raw = argument(r, 'page', '1');
  const num = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(num) || num < 1 || num > 50) throw invalid('页码必须在 1 至 50 之间');
  return num;
}
function idParam(raw) {
  if (!DECIMAL_ID.test(raw)) throw invalid('无效的剧集编号');
  return raw;
}
function text(value) { return String(value ?? '').trim(); }
function decodeHtml(s) {
  return text(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(?:0?39|x27);/gi, "'").replace(/&amp;/g, '&');
}
function publicCover(value) {
  const raw = text(value);
  // Do not depend on the browser URL class: nginx QuickJS has no DOM URL API.
  return /^https:\/\/[a-z0-9.-]+\/[^@\s]*$/i.test(raw) ? raw : '';
}
function tagsOf(item) {
  const items = Array.isArray(item?.tags) ? item.tags : Array.isArray(item?.category_list) ? item.category_list : [];
  return items.map(tag => text(typeof tag === 'string' ? tag : tag?.name || tag?.tag_name || tag?.title))
    .filter(Boolean).slice(0, 4);
}
function cardOf(item) {
  if (!item || typeof item !== 'object') return null;
  const video = item.video_data && !Array.isArray(item.video_data) ? item.video_data : item;
  const id = text(video.series_id || item.series_id || item.keyword);
  const title = decodeHtml(video.series_name || video.series_title || item.name || video.title);
  if (!DECIMAL_ID.test(id) || !title) return null;
  const label = text(video.episode_right_text);
  const count = Number(video.episode_cnt) || Number((label.match(/([0-9]+)\s*集/) || [])[1]) || 0;
  return {
    series_id: id, series_title: title,
    cover: publicCover(video.series_cover || video.cover),
    episode_count: count, description: decodeHtml(video.series_intro || video.video_desc),
    tags: tagsOf(video)
  };
}
function readRouterData(html) {
  const match = html.match(/(?:window\.)?_ROUTER_DATA\s*=\s*(\{)/);
  if (!match) throw new Error('官网未提供页面数据');
  const start = match.index + match[0].length - 1;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; ++i) {
    const ch = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error('官网页面数据不完整');
}
async function getText(url) {
  // Every caller builds a URL under the single fixed origin, never a user-supplied host.
  if (typeof url !== 'string' || !url.startsWith(SITE + '/')) throw new Error('不允许访问未知上游');
  const response = await ngx.fetch(url, { headers: WEB_HEADERS, method: 'GET' });
  if (!response.ok) throw new Error('官网响应 HTTP ' + response.status);
  return await response.text();
}
async function getJSON(url) { return JSON.parse(await getText(url)); }
function collectCards(source, limit = 32) {
  const result = [], seen = new Set(), visited = new WeakSet();
  function visit(node, depth) {
    if (!node || typeof node !== 'object' || depth > 13 || result.length >= limit || visited.has(node)) return;
    visited.add(node);
    const card = cardOf(node);
    if (card && !seen.has(card.series_id)) {
      seen.add(card.series_id);
      result.push(card);
    }
    // Walk only the returned route's data; recommendations are acceptable in catalog.
    if (Array.isArray(node)) {
      for (const child of node.slice(0, 500)) visit(child, depth + 1);
    } else {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'vid_list' || key === 'episodes' || key === 'html') continue;
        visit(value, depth + 1);
      }
    }
  }
  visit(source, 0);
  return result;
}
async function search(r) {
  const keyword = argument(r, 'keyword').trim();
  const page = pageNumber(r);
  if (!keyword || keyword.length > 80) throw invalid('搜索词需为 1 至 80 字');
  const url = SITE + '/api/search/result?aid=8662&query=' + encodeURIComponent(keyword) + '&page=' + page;
  const response = await getJSON(url);
  if (!Array.isArray(response.searchList)) throw new Error('官网搜索接口结构发生变化');
  const results = [], seen = new Set();
  for (const item of response.searchList) {
    const card = cardOf(item);
    if (card && !seen.has(card.series_id)) { seen.add(card.series_id); results.push(card); }
  }
  send(r, { results, page, total: Number(response.totalCount) || results.length,
    totalPages: Number(response.totalPages) || 0, hasMore: response.hasMore === true });
}
async function catalog(r) {
  const category = argument(r, 'category', 'hot-drama');
  const page = pageNumber(r);
  if (!CATEGORIES.has(category)) throw invalid('无效的分类');
  const group = category === 'hot-drama' ? 'rank' : 'category';
  const html = await getText(SITE + '/' + group + '/' + category + (page > 1 ? '?page=' + page : ''));
  const router = readRouterData(html);
  const entries = collectCards(router.loaderData || router);
  if (!entries.length) throw new Error('官网目录结构发生变化');
  send(r, { success: true, results: entries, page, total: 0,
    hasMore: entries.length >= 20 && page < 50, genres: [] });
}
async function series(r, id) {
  const sid = idParam(id);
  let html;
  try { html = await getText(SITE + '/player/' + sid); }
  catch { html = await getText(SITE + '/detail?series_id=' + sid); }
  const router = readRouterData(html);
  const data = router.loaderData?.['player_(series_id)/page'] ||
    router.loaderData?.['player_(series_id)/(vid)/page'] || router.loaderData?.detail_page;
  const detail = data?.seriesDetail;
  if (data?.isSuccess === false || String(detail?.series_id) !== sid || (data.series_id && String(data.series_id) !== sid)) {
    throw new Error('官网剧集身份不匹配');
  }
  if (!Array.isArray(detail.vid_list) || !detail.vid_list.length) throw new Error('官网未返回有效分集');
  const vids = detail.vid_list.map(String);
  if (vids.some(vid => !DECIMAL_ID.test(vid)) || new Set(vids).size !== vids.length) throw new Error('官网分集数据无效');
  const title = text(detail.series_name);
  const cover = publicCover(detail.series_cover);
  const celebrities = Array.isArray(detail.celebrities) ? detail.celebrities.filter(c => c && !c.is_label && (c.nickname || c.name))
    .map(c => ({ actor_id: text(c.celebrity_id || c.actor_id), name: text(c.nickname || c.name),
      avatar: publicCover(c.avatar), role: text(c.sub_title || c.role) })) : [];
  send(r, { series_id: sid, series_title: title, cover,
    total: vids.length, intro: text(detail.series_intro), tags: tagsOf(detail),
    episode_label: text(detail.episode_right_text), celebrities, social_info: null,
    episodes: vids.map((vid, i) => ({ vid, vid_index: i + 1, title: '第 ' + (i + 1) + ' 集',
      series_id: sid, series_title: title, cover })) });
}
function publicVideoUrl(raw, vid) {
  const value = text(raw).replace(/&amp;/g, '&');
  // Reject credentials, custom ports and unknown hosts before issuing a 302.
  const match = /^https:\/\/([a-z0-9.-]+)(\/[^?#\s@]*)(?:[?#][^\s]*)?$/i.exec(value);
  if (!match || !MEDIA_DOMAINS.test(match[1])) return null;
  if (match[1].toLowerCase() === 'hongguoduanju.com' &&
      !match[2].startsWith('/video/public/' + vid + '/')) return null;
  return value;
}
function inspectVideo(html, vid) {
  const data = readRouterData(html).loaderData?.['player_(series_id)/(vid)/page'];
  const sid = text(data?.series_id);
  if (!DECIMAL_ID.test(sid) || text(data?.vid) !== vid ||
    text(data?.seriesDetail?.series_id) !== sid ||
    data?.isSuccess === false || data?.protectedPlayback === true ||
    data?.publicVideoSeo?.available !== true ||
    text(data.publicVideoSeo.itemId) !== vid || text(data.publicVideoSeo.seriesId) !== sid) {
    return null;
  }
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
  for (const script of scripts) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(script[1])) continue;
    let video;
    try { video = JSON.parse(script[2]); } catch { continue; }
    if (video?.['@type'] !== 'VideoObject') continue;
    const source = publicVideoUrl(video.contentUrl, vid);
    if (!source) continue;
    const official = text(video.url).replace(/\/$/, '');
    const currentPath = SITE + '/player/' + sid;
    if (official !== currentPath + '/' + vid &&
      !(official === currentPath && source.startsWith(SITE + '/video/public/' + vid + '/'))) continue;
    if (video['@id'] && text(video['@id']).replace(/\/$/, '') !== official) continue;
    return source;
  }
  return null;
}
async function play(r, vid, asRedirect) {
  idParam(vid);
  // Unprotected official SEO media only; never redirect to an arbitrary client URL.
  const html = await getText(SITE + '/player/_/' + vid);
  const source = inspectVideo(html, vid);
  if (!source) {
    send(r, { error: '官网未提供此集的公开完整视频；QuickJS 版本不支持桌面端专有解密链路' }, 404);
    return;
  }
  if (asRedirect) {
    r.headersOut['Cache-Control'] = 'no-store';
    r.return(302, source);
  } else {
    send(r, { vid, url: source, codec: '', quality: 'source', contentKeyHex: null, variants: [] });
  }
}
// Called from a location with "js_content player.api".
async function api(r) {
  try {
    if (r.method === 'POST' && /\/api\/client-log$/.test(r.uri)) { send(r, { success: true }); return; }
    if (r.method !== 'GET') { send(r, { error: 'Method not allowed' }, 405); return; }
    const route = r.uri.slice(r.uri.lastIndexOf('/api/') + 5);
    let match;
    if (route === 'search') return await search(r);
    if (route === 'catalog') return await catalog(r);
    if ((match = /^series\/([^/]+)$/.exec(route))) return await series(r, match[1]);
    if ((match = /^play\/([^/]+)$/.exec(route))) return await play(r, match[1], false);
    if ((match = /^stream\/([^/]+)$/.exec(route))) return await play(r, match[1], true);
    if (route.startsWith('actors/') || route.startsWith('system/')) {
      send(r, { error: '此功能依赖上游专有签名接口，尚未移植到 nginx QuickJS' }, 501);
      return;
    }
    // Browser owns all progress/favorites. These endpoints must not collect personal data.
    if (route === 'history' || route === 'favorites') {
      send(r, { error: '播放记录与收藏只保存在浏览器 localStorage' }, 410);
      return;
    }
    send(r, { error: 'API not found' }, 404);
  } catch (error) { failure(r, error); }
}
export default { api };

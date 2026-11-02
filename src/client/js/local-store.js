// SPDX-License-Identifier: GPL-3.0-only
// Same-origin, per-installation browser-only personal data. No backend storage.
(function () {
  'use strict';
  const scriptUrl = document.currentScript?.src || '';
  const marker = scriptUrl.lastIndexOf('/js/');
  const prefix = marker >= 0 ? new URL(scriptUrl.slice(0, marker + 1)).pathname : '/';
  const KEY = 'hongguo-open-player:local:v1:' + prefix;
  const empty = () => ({ history: Object.create(null), favorites: Object.create(null) });
  const idOf = item => {
    const id = String(item?.series_id ?? '');
    if (!/^\\d{1,30}$/.test(id)) throw new TypeError('series_id 必须是数字字符串');
    return id;
  };
  function read() {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' ||
      !['history', 'favorites'].every(key => parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key]))) {
      throw new Error('本地收藏或播放记录格式损坏；请备份后修复');
    }
    return parsed;
  }
  function mutate(change) {
    // Re-read on each write, so tabs don't hold stale in-memory copies.
    const state = read();
    const value = change(state);
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return value;
  }
  function sorted(field) {
    return Object.values(read()[field])
      .sort((a, b) => (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0));
  }
  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const store = {
    getHistory: () => sorted('history'),
    getFavorites: () => sorted('favorites'),
    getSeriesProgress: seriesId => read().history[String(seriesId)] || null,
    isFavorite: seriesId => Object.prototype.hasOwnProperty.call(read().favorites, String(seriesId)),
    toggleFavorite(item) {
      const id = idOf(item);
      return mutate(state => {
        if (Object.prototype.hasOwnProperty.call(state.favorites, id)) {
          delete state.favorites[id];
          return false;
        }
        state.favorites[id] = {
          series_id: id,
          series_title: String(item.series_title || '').slice(0, 300),
          cover: String(item.cover || ''),
          episode_count: number(item.episode_count || item.total),
          updated_at: Date.now()
        };
        return true;
      });
    },
    updateProgress(item) {
      const id = idOf(item);
      const episodeIndex = number(item.episode_index);
      if (!Number.isInteger(episodeIndex) || episodeIndex < 1) throw new TypeError('无效的集数');
      return mutate(state => {
        const progress = {
          series_id: id,
          series_title: String(item.series_title || '').slice(0, 300),
          cover: String(item.cover || ''),
          episode_index: episodeIndex,
          vid: String(item.vid || ''),
          position_sec: number(item.position_sec),
          duration_sec: number(item.duration_sec),
          watched_indexes: [...new Set((Array.isArray(item.watched_indexes) ? item.watched_indexes : [])
            .filter(n => Number.isInteger(n) && n > 0))].slice(0, 10000),
          updated_at: Date.now()
        };
        state.history[id] = progress;
        return progress;
      });
    },
    storageKey: KEY
  };
  Object.freeze(store);
  window.HongguoLocalStore = store;
})();

/* Eagle Vault Viewer — スマホ専用 PWA のロジック
   軽量なデータ層を内蔵し（バックエンドと同じ /api を使う）、デスクトップ版の api.js には依存しない。
   --app-h は mobile.html の <head> のインラインスクリプトが最初のフレームより前に設定する。 */
(function () {
  'use strict';

  // ---------- 要素の参照 ----------
  const topbar = document.getElementById('topbar');
  const view = document.getElementById('view');
  const viewBody = document.getElementById('viewBody');
  const tabs = document.getElementById('tabs');
  const overlay = document.getElementById('preview');
  const pvImg = document.getElementById('pvImg');
  const pvIndex = document.getElementById('pvIndex');
  const pvName = document.getElementById('pvName');
  const pvMeta = document.getElementById('pvMeta');
  const pvDownload = document.getElementById('pvDownload');
  const pvOriginal = document.getElementById('pvOriginal');
  const pvSave = document.getElementById('pvSave');
  const pvClose = document.getElementById('pvClose');
  const pvPrev = document.getElementById('pvPrev');
  const pvNext = document.getElementById('pvNext');
  const pvShare = document.getElementById('pvShare');
  const pvStage = document.getElementById('pvStage');
  const pvStars = document.getElementById('pvStars');

  // ---------- 日英中 ----------
  const COPY = {
    ja: {
      library: 'ライブラリ', folders: 'フォルダ', search: '検索', status: '接続状態',
      tabLibrary: 'ライブラリ', tabFolders: 'フォルダ', tabSearch: '検索',
      close: '閉じる', share: '共有', back: '戻る', download: 'ダウンロード', showOriginal: 'オリジナルを表示', loadingOriginal: 'オリジナルを読み込み中…', originalShown: 'オリジナルを表示中', saveAlbum: '写真に保存',
      loadFailed: '読み込みに失敗しました：{error}', connectedChanged: '接続中 · リモートに変更あり',
      connected: '接続中', disconnected: '未接続', statusUnknown: '接続状態不明', vault: 'Eagle Vault',
      items: '素材', foldersLabel: 'フォルダ', tags: 'タグ',
      searchPlaceholder: '名前・タグ・メモで検索…', recent: '最近追加',
      locked: 'このフォルダは Eagle でロックされているため、リモートでは表示できません。',
      subfolders: 'サブフォルダ', noFolders: 'フォルダがありません',
      searchStart: 'キーワードを入力して検索', searchFailed: '検索に失敗しました：{error}',
      popularTags: 'よく使うタグ',
      results: '{count} 件 · {seconds} 秒', indexedAt: 'インデックス作成',
      remoteChangedTitle: 'リモートの変更を検出しました',
      remoteChangedBody: '前回のインデックス作成後に Vault が変更されています。再読み込みして同期してください。',
      reload: 'インデックスを再読み込み', loading: '読み込み中…', reloadFailed: '再読み込みに失敗しました',
      downloaded: '「ファイル」にダウンロードしました。写真アプリでも開けます。', saveFailed: '保存できませんでした', unsupportedPreview: 'この形式はここではプレビューできません。ダウンロードして開いてください。', videoUnavailable: 'この動画はこの端末では再生できません。ダウンロードして見てください。',
      thumbnailCache: 'サムネイルのキャッシュ', thumbnailCacheClear: 'サムネイルのキャッシュを削除', thumbnailCacheCleared: 'サムネイルのキャッシュを削除しました',
      previous: '前へ', next: '次へ',
      copied: 'リンクをコピーしました', shareUnavailable: '共有は使えません', language: 'English',
      lightTheme: 'ライトテーマにする', darkTheme: 'ダークテーマにする',
      libraryLabel: 'ライブラリ', libraryLoading: '「{name}」を読み込み中…', libraryLoadingProgress: '「{name}」を読み込み中… {done} / {total}',
      libraryLoadingDesc: '大きなライブラリは初回に時間がかかります。次からはキャッシュからすぐに開きます。', libraryError: '「{name}」を読み込めませんでした',
      sortLabel: '並べ替え', sortMtime: '新しい順', sortName: '名前', sortSize: 'サイズ', sortStar: '評価',
      ratingLabel: '評価', ratingAll: 'すべて', ratingMin: '★{n} 以上', ratingUnrated: '未評価', ratingNone: '未評価',
      ratingSet: '★{n} にする', ratingClear: '評価を外す', ratingSaved: '評価を保存しました', ratingFailed: '評価を保存できませんでした'
    },
    zh: {
      library: '资源库', folders: '目录', search: '搜索', status: '连接状态',
      tabLibrary: '资料库', tabFolders: '文件夹', tabSearch: '搜索',
      close: '关闭', share: '分享', back: '返回', download: '下载', showOriginal: '显示原图', loadingOriginal: '原图加载中…', originalShown: '已显示原图', saveAlbum: '保存相册',
      loadFailed: '加载失败：{error}', connectedChanged: '已连接 · 远程有变更',
      connected: '已连接', disconnected: '未连接', statusUnknown: '连接状态未知', vault: 'Eagle 资源库',
      items: '素材', foldersLabel: '文件夹', tags: '标签',
      searchPlaceholder: '搜索名称、标签或备注…', recent: '最近添加',
      locked: '该文件夹被 Eagle 锁定，无法在远程查看',
      subfolders: '子文件夹', noFolders: '没有文件夹',
      searchStart: '输入关键词开始搜索', searchFailed: '搜索失败：{error}',
      popularTags: '热门标签',
      results: '{count} 个结果 · {seconds}s', indexedAt: '已索引于',
      remoteChangedTitle: '检测到远程变更',
      remoteChangedBody: '资源库自上次索引后有改动，重新加载以同步。',
      reload: '重新加载索引', loading: '加载中…', reloadFailed: '重新加载失败',
      downloaded: '已下载到「文件」，可在相册中查看', saveFailed: '保存失败', unsupportedPreview: '此格式不支持在线预览，请下载后打开', videoUnavailable: '当前视频无法在此设备上播放，请下载查看',
      thumbnailCache: '缩略图缓存', thumbnailCacheClear: '清理缩略图缓存', thumbnailCacheCleared: '缩略图缓存已清理',
      previous: '上一个', next: '下一个',
      copied: '链接已复制', shareUnavailable: '分享不可用', language: '日本語',
      lightTheme: '切换到浅色', darkTheme: '切换到深色',
      libraryLabel: '资源库', libraryLoading: '正在加载「{name}」…', libraryLoadingProgress: '正在加载「{name}」… {done} / {total}',
      libraryLoadingDesc: '大型资源库首次加载需要一些时间，之后会从缓存快速打开。', libraryError: '无法加载「{name}」',
      sortLabel: '排序', sortMtime: '最新', sortName: '名称', sortSize: '大小', sortStar: '评分',
      ratingLabel: '评分', ratingAll: '全部', ratingMin: '★{n} 及以上', ratingUnrated: '未评分', ratingNone: '未评分',
      ratingSet: '设为 ★{n}', ratingClear: '清除评分', ratingSaved: '评分已保存', ratingFailed: '无法保存评分'
    },
    en: {
      library: 'Library', folders: 'Folders', search: 'Search', status: 'Connection',
      tabLibrary: 'Library', tabFolders: 'Folders', tabSearch: 'Search',
      close: 'Close', share: 'Share', back: 'Back', download: 'Download', saveAlbum: 'Save to Photos',
      loadFailed: 'Could not load: {error}', connectedChanged: 'Connected · Remote changes',
      connected: 'Connected', disconnected: 'Disconnected', statusUnknown: 'Connection unknown', vault: 'Eagle Vault',
      items: 'Items', foldersLabel: 'Folders', tags: 'Tags',
      searchPlaceholder: 'Search name, tags, or notes…', recent: 'Recently added',
      locked: 'This folder is locked in Eagle and cannot be viewed remotely.',
      subfolders: 'Subfolders', noFolders: 'No folders',
      searchStart: 'Enter a keyword to search', searchFailed: 'Search failed: {error}',
      popularTags: 'Popular tags',
      results: '{count} results · {seconds}s', indexedAt: 'Indexed at',
      remoteChangedTitle: 'Remote changes detected',
      remoteChangedBody: 'The Vault changed after the last index. Reload to sync it.',
      reload: 'Reload index', loading: 'Loading…', reloadFailed: 'Reload failed',
      downloaded: 'Downloaded to Files. You can open it in Photos.', showOriginal: 'View original', loadingOriginal: 'Loading original…', originalShown: 'Showing original', unsupportedPreview: 'This format cannot be previewed here. Download it to open.', videoUnavailable: 'This video cannot play on this device. Download it to view.',
      thumbnailCache: 'Thumbnail cache', thumbnailCacheClear: 'Clear thumbnail cache', thumbnailCacheCleared: 'Thumbnail cache cleared',
      previous: 'Previous', next: 'Next',
      saveFailed: 'Could not save', copied: 'Link copied',
      shareUnavailable: 'Sharing is unavailable', language: '中文',
      lightTheme: 'Use light theme', darkTheme: 'Use dark theme',
      libraryLabel: 'Library', libraryLoading: 'Loading "{name}"…', libraryLoadingProgress: 'Loading "{name}"… {done} / {total}',
      libraryLoadingDesc: 'Large libraries take a while the first time; later they open from the cache.', libraryError: 'Could not load "{name}"',
      sortLabel: 'Sort', sortMtime: 'Newest', sortName: 'Name', sortSize: 'Size', sortStar: 'Rating',
      ratingLabel: 'Rating', ratingAll: 'All', ratingMin: '★{n} and up', ratingUnrated: 'Unrated', ratingNone: 'Unrated',
      ratingSet: 'Rate ★{n}', ratingClear: 'Clear rating', ratingSaved: 'Rating saved', ratingFailed: 'Could not save the rating'
    }
  };
  const LANG_ORDER = ['ja', 'en', 'zh'];
  const HTML_LANG = { ja: 'ja', en: 'en', zh: 'zh-CN' };
  const DATE_LOCALE = { ja: 'ja-JP', en: 'en-US', zh: 'zh-CN' };
  let lang = 'ja';
  let searchAbortController = null;
  try {
    const saved = localStorage.getItem('eagle-viewer-lang');
    lang = LANG_ORDER.indexOf(saved) >= 0 ? saved : 'ja';
  } catch (e) {}

  function tr(key, values) {
    let text = (COPY[lang] && COPY[lang][key]) || COPY.ja[key] || COPY.en[key] || key;
    Object.keys(values || {}).forEach(k => { text = text.replace('{' + k + '}', values[k]); });
    return text;
  }

  function applyLanguage() {
    document.documentElement.lang = HTML_LANG[lang] || 'ja';
    document.getElementById('tabLibrary').textContent = tr('tabLibrary');
    document.getElementById('tabFolders').textContent = tr('tabFolders');
    document.getElementById('tabSearch').textContent = tr('tabSearch');
    document.getElementById('pvDownloadLabel').textContent = tr('download');
    document.getElementById('pvOriginalLabel').textContent = tr('showOriginal');
    document.getElementById('pvSaveLabel').textContent = tr('saveAlbum');
    pvClose.setAttribute('aria-label', tr('close'));
    pvShare.setAttribute('aria-label', tr('share'));
    document.getElementById('pvPrev').setAttribute('aria-label', tr('previous'));
    document.getElementById('pvNext').setAttribute('aria-label', tr('next'));
  }

  // ---------- デスクトップ版のテーマ選択に従い、スマホ側でも明暗を個別に切りかえられるようにする ----------
  // デスクトップ版は light/dark を localStorage['eagle-viewer-theme'] に保存するので、
  // ここでも同じキーを使い、スマホの配色をデスクトップと揃える（未選択ならシステムの設定に従う）。
  function applyMobileTheme(name) {
    try {
      // Migrate legacy keys
      if (name === 'gallery') name = 'light';
      if (name === 'workbench' || name === 'carbon') name = 'dark';
      var map = {
        light: { theme: 'light', accent: 'blue' },
        dark:  { theme: 'dark',  accent: 'blue'  }
      };
      var t = map[name];
      if (!t) return;
      var root = document.documentElement;
      root.setAttribute('data-theme', t.theme);
      root.setAttribute('data-accent', t.accent);
      root.style.colorScheme = t.theme;
      var themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.content = t.theme === 'light' ? '#f2f2f7' : '#000000';
      localStorage.setItem('eagle-viewer-theme', name);
    } catch (e) {}
  }
  (function syncTheme() {
    try {
      var name = localStorage.getItem('eagle-viewer-theme');
      if (name) applyMobileTheme(name);
    } catch (e) {}
  })();

  function toggleMobileTheme() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyMobileTheme(isDark ? 'light' : 'dark');
    renderTop();
  }

  // ---------- サムネイルの IndexedDB キャッシュ（回線が弱いとき / オフラインで、見たサムネイルを再利用）----------
  // キャッシュするのは Eagle が作ったサムネイルだけで、オリジナルは入れない。容量は件数と合計バイト数の両方で制限する。
  const Thumbs = (function () {
    const DB = 'eagle-viewer-thumbs';
    const STORE = 'blobs';
    const MAX_ENTRIES = 500;
    const MAX_BYTES = 100 * 1024 * 1024;
    let dbp = null;
    let evictTimer = null;
    let cacheGeneration = 0;
    function ok() { return typeof indexedDB !== 'undefined' && indexedDB; }
    function open() {
      if (!ok()) return Promise.resolve(null);
      if (dbp) return dbp;
      dbp = new Promise((resolve) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      return dbp;
    }
    function get(id) {
      return open().then((db) => {
        if (!db) return null;
        return new Promise((resolve) => {
          const tx = db.transaction(STORE, 'readwrite');
          const r = tx.objectStore(STORE).get(id);
          r.onsuccess = () => {
            const v = r.result;
            if (v && v.blob) {
              v.ts = Date.now();
              v.bytes = Number(v.bytes || v.blob.size || 0);
              tx.objectStore(STORE).put(v, id);
            }
            resolve(v && v.blob ? v.blob : null);
          };
          r.onerror = () => resolve(null);
        });
      });
    }
    function put(id, blob) {
      const generation = cacheGeneration;
      return open().then((db) => {
        if (!db || generation !== cacheGeneration) return;
        return new Promise((resolve) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put({ blob: blob, bytes: Number(blob.size || 0), ts: Date.now() }, id);
          tx.oncomplete = resolve; tx.onerror = resolve;
        });
      }).then(() => {
        if (generation !== cacheGeneration) return;
        if (evictTimer) return;
        evictTimer = setTimeout(() => { evictTimer = null; evict(); }, 750);
      });
    }
    function clear() {
      cacheGeneration += 1;
      if (evictTimer) { clearTimeout(evictTimer); evictTimer = null; }
      return open().then((db) => {
        if (!db) return;
        return new Promise((resolve) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete = resolve; tx.onerror = resolve;
        });
      });
    }
    function evict() {
      return open().then((db) => {
        if (!db) return;
        return new Promise((resolve) => {
          const out = [];
          const tx = db.transaction(STORE, 'readonly');
          const cur = tx.objectStore(STORE).openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (c) {
              const value = c.value || {};
              out.push({ id: c.key, ts: value.ts || 0, bytes: Number(value.bytes || (value.blob && value.blob.size) || 0) });
              c.continue();
            }
            else resolve(out);
          };
          cur.onerror = () => resolve(out);
        }).then((entries) => {
          let totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
          if (entries.length <= MAX_ENTRIES && totalBytes <= MAX_BYTES) return;
          entries.sort((a, b) => a.ts - b.ts);
          const del = [];
          while (entries.length - del.length > MAX_ENTRIES || totalBytes > MAX_BYTES) {
            const entry = entries[del.length];
            if (!entry) break;
            del.push(entry.id);
            totalBytes -= entry.bytes;
          }
          const tx = db.transaction(STORE, 'readwrite');
          del.forEach((id) => tx.objectStore(STORE).delete(id));
          return new Promise((res) => { tx.oncomplete = res; tx.onerror = res; });
        });
      });
    }
    // Drop only one library's thumbnails (keys are "<lib>:<itemId>").
    function clearPrefix(prefix) {
      if (!prefix) return clear();
      cacheGeneration += 1;
      return open().then((db) => {
        if (!db) return;
        return new Promise((resolve) => {
          const tx = db.transaction(STORE, 'readwrite');
          const cur = tx.objectStore(STORE).openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) return;
            if (String(c.key).indexOf(prefix) === 0) c.delete();
            c.continue();
          };
          tx.oncomplete = resolve; tx.onerror = resolve;
        });
      });
    }
    function stats() {
      return open().then((db) => new Promise((resolve) => {
        if (!db) { resolve({ entries: 0, bytes: 0 }); return; }
        const tx = db.transaction(STORE, 'readonly');
        const cur = tx.objectStore(STORE).openCursor();
        const out = { entries: 0, bytes: 0 };
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) {
            const value = c.value || {};
            out.entries += 1;
            out.bytes += Number(value.bytes || (value.blob && value.blob.size) || 0);
            c.continue();
          } else resolve(out);
        };
        cur.onerror = () => resolve(out);
      }));
    }
    return { ok: ok, get: get, put: put, clear: clear, clearPrefix: clearPrefix, stats: stats };
  })();

  // Thumbnails of different libraries never share a cache entry, even with equal item ids.
  function thumbKey(id) { return (S.lib || '') + ':' + id; }

  function hydrateOne(img) {
    const id = thumbKey(img.dataset.id);
    const url = img.dataset.thumb;
    const apply = (blob) => {
      if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
    };
    Thumbs.get(id).then((hit) => {
      if (hit) { apply(hit); return; }
      fetch(url).then((r) => {
        if (!r.ok) { img.src = url; return; }
        r.blob().then((blob) => { Thumbs.put(id, blob); apply(blob); });
      }).catch(() => { img.src = url; });
    });
  }

  function hydrateThumbs(container) {
    if (window.__hio) { window.__hio.disconnect(); window.__hio = null; }
    const imgs = container.querySelectorAll('.th .im[data-thumb]');
    if (!imgs.length) return;
    if (!Thumbs.ok()) {
      imgs.forEach((img) => { if (!img.src) img.src = img.dataset.thumb; });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        io.unobserve(img);
        if (!img.src) hydrateOne(img);
      });
    }, { root: view, rootMargin: '300px' });
    window.__hio = io;
    imgs.forEach((img) => io.observe(img));
  }

  // ---------- SVG の断片 ----------
  const chevSVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  const backSVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
  const folderSVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';
  const searchSVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
  const refreshSVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4"/></svg>';
  const lockSVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  // ---------- 状態 ----------
  const S = {
    view: 'library',
    folderStack: [],
    folderItems: [], folderSubfolders: [], folderOffset: 0, folderHasMore: false, folderLoading: false,
    recents: [],
    searchQuery: '', searchItems: [], searchOffset: 0, searchHasMore: false, searchTotal: 0, searchElapsed: 0, searchLoading: false,
    viewGeneration: 0, folderRequest: 0, searchRequest: 0,
    status: null,
    currentGallery: [],
    preview: { list: [], index: 0, open: false, pushed: false, token: 0, thumbObjectUrl: '' },
    lib: '', libraries: [], defaultLib: '', libPoll: 0,
    listSort: readPref('ev:listSort', ['mtime', 'name', 'size', 'star'], 'mtime'),
    listRating: readPref('ev:listRating', ['all', 'unrated', '1', '2', '3', '4', '5'], 'all'),
  };

  function readPref(key, allowed, fallback) {
    try {
      const value = localStorage.getItem(key);
      return allowed.indexOf(value) >= 0 ? value : fallback;
    } catch (e) { return fallback; }
  }
  function writePref(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  // Every API URL carries ?lib=<id> so responses and HTTP caches stay per library.
  function libUrl(path) {
    if (!S.lib) return path;
    return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'lib=' + encodeURIComponent(S.lib);
  }
  function itemUrl(id, kind, download) {
    return libUrl('/api/items/' + encodeURIComponent(id) + '/' + kind + (download ? '?download=true' : ''));
  }
  function currentLib() { return S.libraries.find(lib => lib.id === S.lib) || null; }
  function listQuery() {
    const dir = S.listSort === 'name' ? 'asc' : 'desc';
    return '&sort=' + S.listSort + '&dir=' + dir + (S.listRating !== 'all' ? '&rating=' + S.listRating : '');
  }

  // ---------- データ層 ----------
  const API = {
    async json(path) {
      const options = arguments[1] || {};
      const res = await fetch(libUrl(path), Object.assign({ credentials: 'same-origin' }, options));
      if (res.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
      if (!res.ok) throw await API.error(res);
      return res.json();
    },
    // 503 {detail:{code:'library-loading'}} = the library is still being indexed.
    async error(res) {
      const err = new Error('HTTP ' + res.status);
      try {
        const body = await res.json();
        const detail = body && body.detail;
        if (detail && detail.code === 'library-loading') { err.loading = true; err.library = detail.library || null; }
        else if (typeof detail === 'string') err.detail = detail;
      } catch (e) {}
      return err;
    },
    status(deep) { return API.json('/api/library/status?deep=' + (deep ? 'true' : 'false')); },
    tree() { return API.json('/api/tree'); },
    folderItems(id, offset) { return API.json('/api/folders/' + encodeURIComponent(id) + '/items?offset=' + (offset || 0) + '&limit=120' + listQuery()); },
    recent() { return API.json('/api/items?sort=mtime&dir=desc&limit=24'); },
    search(q, offset, signal) { return API.json('/api/search?q=' + encodeURIComponent(q) + '&offset=' + (offset || 0) + '&limit=120' + listQuery(), signal ? { signal: signal } : undefined); },
    async libraries() {
      const res = await fetch('/api/libraries', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    },
    async setStar(id, star) {
      const res = await fetch(itemUrl(id, 'star'), {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ star: star }),
      });
      if (res.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
      if (!res.ok) throw await API.error(res);
      return res.json();
    },
    async reload() {
      const res = await fetch(libUrl('/api/library/reload'), { method: 'POST', credentials: 'same-origin' });
      if (res.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
      if (!res.ok) throw await API.error(res);
      return res.json();
    },
  };

  // ---------- ユーティリティ ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function thumbItem(it, idx) {
    const w = it.width || 0, h = it.height || 0;
    const ar = (w && h) ? 'aspect-ratio:' + w + '/' + h + ';' : '';
    const ext = (it.ext || '').toUpperCase();
    const imageExt = /^(PNG|JPG|JPEG|GIF|WEBP|AVIF|BMP|SVG|HEIC|HEIF)$/.test(ext);
    const showPreview = !!it.hasThumbnail || imageExt;
    const media = showPreview
      ? '<img class="im" data-id="' + esc(it.id) + '" data-thumb="' + esc(itemUrl(it.id, 'thumbnail')) + '" style="' + ar + '" alt="' + esc(it.name) + '" onerror="this.classList.add(\'is-missing\')">'
      : '<div class="mobile-file-tile"><i></i><i></i><i></i></div>';
    const previewable = imageExt || isVideoExt(ext) || normExt(ext) === 'pdf';
    return '<button type="button" class="th' + (previewable ? '' : ' is-download-only') + '" data-idx="' + idx + '" data-previewable="' + previewable + '" data-kind="' + (imageExt ? 'image' : 'file') + '" data-ext="' + esc(ext.toLowerCase()) + '">' +
      media +
      '<span class="ext">' + esc(ext) + '</span>' +
      (normStar(it.star) ? '<span class="star-chip">\u2605' + normStar(it.star) + '</span>' : '') +
      '<span class="nm">' + esc(it.name) + '</span>' +
      '</button>';
  }
  function scrollTop() { view.scrollTop = 0; topbar.classList.remove('top-collapsed'); }
  function disconnectIO() {
    if (window.__io) { window.__io.disconnect(); window.__io = null; }
    if (window.__hio) { window.__hio.disconnect(); window.__hio = null; }
  }
  function releaseThumbObjectUrls(container) {
    if (!container) return;
    container.querySelectorAll('img').forEach(img => {
      if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
    });
  }
  function fmtSize(b) {
    if (!b) return '';
    return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  }
  function normStar(v) { const n = Math.round(Number(v) || 0); return n >= 1 && n <= 5 ? n : 0; }

  // ---------- ライブラリの切りかえ ----------
  async function initLibraries() {
    let data = null;
    try { data = await API.libraries(); } catch (e) { if (e.message === 'unauthorized') throw e; }
    S.libraries = (data && data.libraries) || [];
    S.defaultLib = (data && data.default) || '';
    const ids = S.libraries.map(lib => lib.id);
    let fromHash = '';
    try { fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('lib') || ''; } catch (e) {}
    let stored = '';
    try { stored = localStorage.getItem('eagle-viewer-library') || ''; } catch (e) {}
    S.lib = ids.indexOf(fromHash) >= 0 ? fromHash : (ids.indexOf(stored) >= 0 ? stored : (ids.indexOf(S.defaultLib) >= 0 ? S.defaultLib : (ids[0] || '')));
    if (S.lib) writePref('eagle-viewer-library', S.lib);
  }

  function libraryControl() {
    if (S.libraries.length < 2) return '';
    const options = S.libraries.map(lib => {
      const count = lib.items != null ? ' (' + Number(lib.items).toLocaleString(DATE_LOCALE[lang] || 'ja-JP') + ')' : '';
      const mark = lib.state === 'loading' ? ' …' : (lib.state === 'error' ? ' !' : '');
      return '<option value="' + esc(lib.id) + '"' + (lib.id === S.lib ? ' selected' : '') + '>' + esc(lib.name + count + mark) + '</option>';
    }).join('');
    return '<label class="lib-switch"><span>' + esc(tr('libraryLabel')) + '</span><select id="libSelect">' + options + '</select></label>';
  }

  function bindLibraryControl(root) {
    const select = root.querySelector('#libSelect');
    if (select) select.onchange = () => switchLibrary(select.value);
  }

  function switchLibrary(id) {
    if (!id || id === S.lib) return;
    S.lib = id;
    writePref('eagle-viewer-library', id);
    S.folderStack = []; S.folderItems = []; S.searchItems = []; S.recents = []; S.status = null;
    switchTab(S.view === 'status' ? 'library' : S.view);
  }

  // Show indexing progress and re-render the current tab once the library is ready.
  function showLibraryLoading(lib) {
    clearTimeout(S.libPoll);
    const name = (lib && lib.name) || (currentLib() && currentLib().name) || S.lib;
    const failed = lib && lib.state === 'error';
    const progress = lib && lib.progress && lib.progress.total ? lib.progress : null;
    const title = failed ? tr('libraryError', { name: name })
      : progress ? tr('libraryLoadingProgress', { name: name, done: progress.done, total: progress.total })
      : tr('libraryLoading', { name: name });
    const pct = progress ? Math.min(100, Math.round(progress.done * 100 / Math.max(1, progress.total))) : 0;
    releaseThumbObjectUrls(viewBody);
    viewBody.innerHTML = libraryControl() +
      '<div class="lib-loading">' + (failed ? '' : '<div class="spinner"></div>') +
      '<b>' + esc(title) + '</b><span>' + esc(failed ? (lib.error || '') : tr('libraryLoadingDesc')) + '</span>' +
      (progress ? '<div class="lib-progress"><i style="width:' + pct + '%"></i></div>' : '') + '</div>';
    bindLibraryControl(viewBody);
    const waitingFor = S.lib;
    const generation = S.viewGeneration;
    S.libPoll = setTimeout(async () => {
      if (S.lib !== waitingFor || S.viewGeneration !== generation) return;
      let data = null;
      try { data = await API.libraries(); } catch (e) { data = null; }
      if (S.lib !== waitingFor || S.viewGeneration !== generation) return;
      if (data) { S.libraries = data.libraries || []; }
      const now = currentLib();
      if (now && now.state === 'ready') switchTab(S.view === 'status' ? 'library' : S.view);
      else showLibraryLoading(now || lib);
    }, failed ? 10000 : 1500);
  }

  // Sort + rating selects for folder item lists and search results.
  function listControls() {
    const sorts = [['mtime', 'sortMtime'], ['name', 'sortName'], ['size', 'sortSize'], ['star', 'sortStar']];
    const ratings = [['all', tr('ratingAll')]].concat(['1', '2', '3', '4'].map(n => [n, tr('ratingMin', { n: n })]), [['5', '★5'], ['unrated', tr('ratingUnrated')]]);
    return '<div class="list-controls">' +
      '<label><span>' + esc(tr('sortLabel')) + '</span><select data-list-sort>' +
        sorts.map(([v, k]) => '<option value="' + v + '"' + (S.listSort === v ? ' selected' : '') + '>' + esc(tr(k)) + '</option>').join('') +
      '</select></label>' +
      '<label><span>' + esc(tr('ratingLabel')) + '</span><select data-list-rating>' +
        ratings.map(([v, label]) => '<option value="' + v + '"' + (S.listRating === v ? ' selected' : '') + '>' + esc(label) + '</option>').join('') +
      '</select></label>' +
    '</div>';
  }

  function bindListControls(root, onChange) {
    const sort = root.querySelector('[data-list-sort]');
    const rating = root.querySelector('[data-list-rating]');
    if (sort) sort.onchange = () => { S.listSort = sort.value; writePref('ev:listSort', S.listSort); onChange(); };
    if (rating) rating.onchange = () => { S.listRating = rating.value; writePref('ev:listRating', S.listRating); onChange(); };
  }

  // ---------- 上部バー ----------
  // 小さい見出し .ctitle は既定で隠し、内容をスクロールすると scroll リスナーでフェードインする（大見出しとクロスフェード）。
  // 大見出し .lt は各描画関数が内容の上端に置き、スクロールで上へ動く——iOS の代表的な動き。
  function renderTop() {
    let title = '';
    let showBack = false;
    if (S.view === 'folders') {
      if (S.folderStack.length) showBack = true;      // サブフォルダ：パンくずで、見出しなし
      else title = tr('folders');                      // ルート：大見出し
    } else if (S.view === 'status') {
      showBack = true; title = tr('status');
    } else if (S.view === 'search') {
      title = tr('search');                            // 検索はルートの Tab にしたので、戻るボタンはもうない
    } else {
      title = tr('vault');
    }

    let html = '';
    if (showBack) html += '<button class="back" id="backBtn" aria-label="' + esc(tr('back')) + '" title="' + esc(tr('back')) + '">' + backSVG + '</button>';
    if (S.view === 'folders' && S.folderStack.length) {
      html += '<div class="crumb">' + S.folderStack.map((s, i) =>
        '<span class="seg ' + (i === S.folderStack.length - 1 ? 'cur' : '') + '">' + esc(s.name) + '</span>' +
        (i < S.folderStack.length - 1 ? '<span class="sep">/</span>' : '')).join('') + '</div>';
    } else if (title) {
      if (S.view === 'library') {
        const statusClass = !S.status ? 'unknown' : (!S.status.ok ? 'offline' : (S.status.changed ? 'changed' : 'online'));
        const statusLabel = !S.status ? tr('statusUnknown') : (!S.status.ok ? tr('disconnected') : (S.status.changed ? tr('connectedChanged') : tr('connected')));
        html += '<button type="button" class="mobile-brand ' + statusClass + '" id="mobileBrandBtn" aria-label="' + esc(statusLabel) + '">' +
          '<span class="mobile-brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" focusable="false"><rect class="ev-tile" x="1.5" y="1.5" width="25" height="25" rx="8"/><path d="M8 18.6 13.4 10 16.6 14.4 19 11.4 20.5 18.6Z" fill="#fff" fill-opacity="0.95"/></svg></span>' +
          '<span class="mobile-brand-copy"><strong>Eagle</strong><span>' + esc(tr('library')) + '</span></span>' +
          '<i class="mobile-brand-status" aria-hidden="true"></i>' +
        '</button>';
      } else {
        html += '<span class="ctitle">' + esc(title) + '</span>';
      }
    }

    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var themeLabel = isDark ? tr('lightTheme') : tr('darkTheme');
    var themeIcon = isDark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 14.1A8.5 8.5 0 0 1 9.9 3.6 8.5 8.5 0 1 0 20.4 14.1Z"/></svg>';
    html += '<span class="top-spacer"></span><button class="theme" id="themeBtn" aria-label="' + esc(themeLabel) + '" title="' + esc(themeLabel) + '">' + themeIcon + '</button><button class="lang" id="langBtn" aria-label="' + esc(tr('language')) + '">' + esc(tr('language')) + '</button>';
    topbar.innerHTML = html;
    const bb = topbar.querySelector('#backBtn');
    if (bb) bb.onclick = () => {
      if (S.view === 'status') { S.view = 'library'; setTabActive('library'); renderLibrary(); }
      else if (S.view === 'folders' && S.folderStack.length) { S.folderStack.pop(); renderFolders(); }
    };
    topbar.querySelector('#themeBtn').onclick = toggleMobileTheme;
    const brand = topbar.querySelector('#mobileBrandBtn');
    if (brand) brand.onclick = goStatus;
    topbar.querySelector('#langBtn').onclick = () => {
      lang = LANG_ORDER[(LANG_ORDER.indexOf(lang) + 1) % LANG_ORDER.length];
      try { localStorage.setItem('eagle-viewer-lang', lang); } catch (e) {}
      applyLanguage();
      if (S.view === 'folders') renderFolders();
      else if (S.view === 'search') renderSearch();
      else if (S.view === 'status') goStatus();
      else renderLibrary();
    };
    // 新しいビューは上端から始め、小さい見出しを引っこめる
    topbar.classList.remove('top-collapsed');
  }

  function setTabActive(v) {
    tabs.querySelectorAll('.tb').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  }

  tabs.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.tb');
    if (button) button.classList.add('pointer-focus');
  });
  tabs.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') tabs.querySelectorAll('.tb').forEach(t => t.classList.remove('pointer-focus'));
  });

  function switchTab(v) {
    S.viewGeneration++;
    S.view = v;
    setTabActive(v);
    disconnectIO();
    if (v === 'library') renderLibrary(S.viewGeneration);
    else if (v === 'folders') renderFolders(S.viewGeneration);
    else if (v === 'search') renderSearch();
    scrollTop();
  }

  // ---------- ホーム（LIBRARY） ----------
  async function renderLibrary(token = S.viewGeneration) {
    renderTop();
    releaseThumbObjectUrls(viewBody);
    viewBody.innerHTML = '<div class="spinner"></div>';
    const results = await Promise.allSettled([API.status(false), API.recent()]);
    if (token !== S.viewGeneration || S.view !== 'library') return;
    const status = results[0].status === 'fulfilled' ? results[0].value : null;
    const recent = results[1].status === 'fulfilled' ? results[1].value : null;
    if (!recent) {
      const error = results[1].reason;
      if (error && error.message === 'unauthorized') return;
      if (error && error.loading) { showLibraryLoading(error.library); return; }
      viewBody.innerHTML = '<div class="errbox">' + esc(tr('loadFailed', { error: error && error.message })) + '</div>';
      return;
    }
    S.recents = recent.items || [];
    S.status = status;
    if (status && status.revision) {
      // Per-library revision: a change in one library only drops that library's thumbnails.
      const revKey = 'ev:thumbRev:' + S.lib;
      const saved = localStorage.getItem(revKey);
      if (saved && saved !== status.revision) Thumbs.clearPrefix(S.lib + ':');
      localStorage.setItem(revKey, status.revision);
    }
    renderTop();
    viewBody.innerHTML = libraryControl() +
      '<div class="srch library-search" id="srchEntry">' + searchSVG + '<input id="srchInput" placeholder="' + esc(tr('searchPlaceholder')) + '" /></div>' +
      '<div class="lbl">' + tr('recent') + '</div>' +
      '<div class="mas" id="recentMas">' + S.recents.map(thumbItem).join('') + '</div>';
    S.currentGallery = S.recents;
    bindLibraryControl(viewBody);
    bindThumbs(viewBody);
    hydrateThumbs(viewBody);
    const si = document.getElementById('srchInput');
    si.addEventListener('keydown', e => { if (e.key === 'Enter') { S.searchQuery = si.value.trim(); switchTab('search'); } });
  }

  // ---------- フォルダ（FOLDERS） ----------
  async function renderFolders(token = S.viewGeneration) {
    const requestId = ++S.folderRequest;
    const folderKey = S.folderStack.map(item => item.id).join('/');
    renderTop();
    disconnectIO();
    const atRoot = S.folderStack.length === 0;
    viewBody.innerHTML = '<div class="spinner"></div>';
    let subfolders = [], items = [], hasMore = false, offset = 0;
    try {
      if (atRoot) {
        const tree = await API.tree();
        subfolders = (tree.folders || []).map(f => ({ id: f.id, name: f.name, count: f.count, locked: f.locked }));
      } else {
        const data = await API.folderItems(S.folderStack[S.folderStack.length - 1].id, 0);
        subfolders = data.subfolders || [];
        items = data.items || [];
        hasMore = !!data.hasMore;
        offset = data.nextOffset || 0;
      }
    } catch (e) {
      if (token !== S.viewGeneration || S.view !== 'folders' || requestId !== S.folderRequest || folderKey !== S.folderStack.map(item => item.id).join('/')) return;
      if (e.message === 'unauthorized') return;
      if (e.loading) { showLibraryLoading(e.library); return; }
      const msg = e.message === 'HTTP 423' ? tr('locked') : tr('loadFailed', { error: e.message });
      viewBody.innerHTML = '<div class="errbox">' + msg + '</div>';
      return;
    }
    if (token !== S.viewGeneration || S.view !== 'folders' || requestId !== S.folderRequest || folderKey !== S.folderStack.map(item => item.id).join('/')) return;
    S.folderSubfolders = subfolders;
    S.folderItems = items;
    S.folderHasMore = hasMore; S.folderOffset = offset;

    let html = '';
    if (atRoot) {
      html += libraryControl() + '<div class="lt">' + esc(tr('folders')) + '</div>';
    }
    if (subfolders.length) {
      const rows = subfolders.map(f =>
        '<button class="fr' + (f.locked ? ' locked' : '') + '" data-fid="' + esc(f.id) + '" data-fname="' + esc(f.name) + '"' + (f.locked ? ' data-locked="1"' : '') + '>' +
          '<span class="fico">' + folderSVG + '</span>' +
          '<span class="fn">' + esc(f.name) + '</span>' +
          '<span class="ct">' + (f.locked ? lockSVG : (f.count != null ? f.count : '')) + '</span>' + chevSVG +
        '</button>').join('');
      if (!atRoot) html += '<div class="lbl">' + tr('subfolders') + '</div>';
      html += '<div class="card">' + rows + '</div>';
    } else if (atRoot) {
      html += '<div class="empty">' + tr('noFolders') + '</div>';
    }
    if (!items.length && !atRoot && S.listRating !== 'all') {
      html += '<div class="lbl">' + tr('items') + '</div>' + listControls() + '<div class="empty">—</div>';
    }
    if (items.length) {
      html += '<div class="lbl">' + tr('items') + '</div>' + listControls() + '<div class="mas" id="folderMas">' + items.map(thumbItem).join('') + '</div>';
      if (hasMore) html += '<div class="sentinel" id="folderSentinel"></div>';
    }
    releaseThumbObjectUrls(viewBody);
    viewBody.innerHTML = html;

    viewBody.querySelectorAll('.fr').forEach(b => b.onclick = () => {
      if (b.dataset.locked) { toast(tr('locked')); return; }
      S.folderStack.push({ id: b.dataset.fid, name: b.dataset.fname });
      renderFolders(S.viewGeneration);
      scrollTop();
    });
    S.currentGallery = S.folderItems;
    bindLibraryControl(viewBody);
    bindListControls(viewBody, () => { renderFolders(S.viewGeneration); });
    bindThumbs(viewBody);
    hydrateThumbs(viewBody);
    if (hasMore) setupInfinite('folderSentinel', loadFolderMore);
  }

  async function loadFolderMore() {
    if (S.folderLoading || !S.folderHasMore) return;
    S.folderLoading = true;
    setListLoader(true);
    const fid = S.folderStack.length ? S.folderStack[S.folderStack.length - 1].id : null;
    const requestId = S.folderRequest;
    const folderKey = S.folderStack.map(item => item.id).join('/');
    let data;
    try { data = await API.folderItems(fid, S.folderOffset); }
    catch (e) {
      S.folderLoading = false;
      setListLoader(false);
      if (requestId !== S.folderRequest || folderKey !== S.folderStack.map(item => item.id).join('/') || S.view !== 'folders') return;
      if (e.message === 'unauthorized') return;
      return;
    }
    if (requestId !== S.folderRequest || folderKey !== S.folderStack.map(item => item.id).join('/') || S.view !== 'folders') {
      S.folderLoading = false;
      setListLoader(false);
      return;
    }
    const previousLength = S.folderItems.length;
    const newItems = data.items || [];
    S.folderItems = S.folderItems.concat(newItems);
    S.folderOffset = data.nextOffset || 0;
    S.folderHasMore = !!data.hasMore;
    const mas = document.getElementById('folderMas');
    if (mas) {
      mas.insertAdjacentHTML('beforeend', newItems.map((item, index) => thumbItem(item, previousLength + index)).join(''));
      S.currentGallery = S.folderItems;
      bindThumbs(viewBody);
      hydrateThumbs(viewBody);
    }
    const old = document.getElementById('folderSentinel');
    if (S.folderHasMore) { if (!old) { const d = document.createElement('div'); d.className = 'sentinel'; d.id = 'folderSentinel'; mas.after(d); } setupInfinite('folderSentinel', loadFolderMore); }
    else if (old) old.remove();
    setListLoader(false);
    S.folderLoading = false;
  }

  // ---------- 検索（SEARCH） ----------
  function renderSearch() {
    renderTop();
    disconnectIO();
    releaseThumbObjectUrls(viewBody);
    viewBody.innerHTML =
      '<div class="search-page">' +
      '<div class="srch search-field">' + searchSVG + '<input id="srchInput2" placeholder="' + esc(tr('searchPlaceholder')) + '" value="' + esc(S.searchQuery) + '" autofocus /></div>' +
      listControls() +
      '<div class="sr-head" id="srHead"></div>' +
      '<div class="search-results" id="searchMas"></div>' +
      '<div class="sentinel" id="searchSentinel" style="display:none"></div>' +
      '</div>';
    const input = document.getElementById('srchInput2');
    bindListControls(viewBody, () => { if (S.searchQuery) doSearch(true); });
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { S.searchQuery = input.value.trim(); doSearch(true); }, 300);
    });
    document.getElementById('searchMas').addEventListener('click', e => {
      const chip = e.target.closest('[data-tag]');
      if (!chip) return;
      input.value = chip.dataset.tag;
      S.searchQuery = chip.dataset.tag;
      doSearch(true);
    });
    if (S.searchQuery) doSearch(true);
    else { document.getElementById('srHead').textContent = tr('searchStart'); renderPopularTags(); }
  }

  async function renderPopularTags() {
    const mas = document.getElementById('searchMas');
    if (!mas || S.view !== 'search' || S.searchQuery) return;
    let tags = [];
    try { tags = ((await API.json('/api/tags')).tags || []).slice(0, 8); }
    catch (e) { return; }
    if (!tags.length || S.view !== 'search' || S.searchQuery) return;
    mas.innerHTML =
      '<section class="popular-tags"><div class="pt-head">' + esc(tr('popularTags')) + '</div>' +
      '<div class="pt-row">' +
      tags.map(t => '<button class="pt-chip" data-tag="' + esc(t.name) + '">#' + esc(t.name) + '</button>').join('') +
      '</div></section>';
  }

  async function doSearch(reset) {
    const requestId = ++S.searchRequest;
    if (reset) { S.searchOffset = 0; S.searchItems = []; S.searchHasMore = false; S.searchLoading = false; }
    const q = S.searchQuery;
    const head = document.getElementById('srHead');
    const mas = document.getElementById('searchMas');
    if (searchAbortController) searchAbortController.abort();
    searchAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (!q) { if (head) head.textContent = tr('searchStart'); if (mas) { releaseThumbObjectUrls(mas); mas.classList.remove('mas'); mas.innerHTML = ''; } renderPopularTags(); return; }
    if (mas) mas.classList.add('mas');
    if (reset && mas) mas.innerHTML = '<div class="spinner"></div>';
    const t0 = performance.now();
    let data;
    const offset = S.searchOffset;
    try { data = await API.search(q, offset, searchAbortController && searchAbortController.signal); }
    catch (e) {
      if (e && e.name === 'AbortError') return;
      if (requestId !== S.searchRequest || q !== S.searchQuery || S.view !== 'search') return;
      if (e.message === 'unauthorized') return;
      if (e.loading) { showLibraryLoading(e.library); return; }
      if (head) head.textContent = tr('searchFailed', { error: e.message });
      return;
    }
    if (searchAbortController && requestId === S.searchRequest) searchAbortController = null;
    if (requestId !== S.searchRequest || q !== S.searchQuery || S.view !== 'search' || (!reset && offset !== S.searchOffset)) return;
    const previousLength = S.searchItems.length;
    if (reset) S.searchItems = [];
    const newItems = data.items || [];
    S.searchItems = S.searchItems.concat(newItems);
    S.searchOffset = data.nextOffset || 0;
    S.searchHasMore = !!data.hasMore;
    S.searchTotal = data.total || 0;
    S.searchElapsed = performance.now() - t0;
    if (head) head.innerHTML = tr('results', { count: '<b>' + S.searchTotal + '</b>', seconds: (S.searchElapsed / 1000).toFixed(2) });
    if (mas) {
      if (reset) mas.innerHTML = newItems.map((item, index) => thumbItem(item, index)).join('');
      else mas.insertAdjacentHTML('beforeend', newItems.map((item, index) => thumbItem(item, previousLength + index)).join(''));
    }
    const sent = document.getElementById('searchSentinel');
    if (sent) sent.style.display = S.searchHasMore ? 'block' : 'none';
    S.currentGallery = S.searchItems;
    bindThumbs(viewBody);
    hydrateThumbs(viewBody);
    if (S.searchHasMore) setupInfinite('searchSentinel', loadSearchMore);
  }

  async function loadSearchMore() {
    if (S.searchLoading || !S.searchHasMore) return;
    S.searchLoading = true;
    setListLoader(true);
    await doSearch(false);
    setListLoader(false);
    S.searchLoading = false;
  }

  function setListLoader(on) {
    const mas = viewBody.querySelector('.mas');
    if (!mas) return;
    let row = document.getElementById('listLoader');
    if (on) {
      if (!row) { row = document.createElement('div'); row.id = 'listLoader'; row.className = 'loadrow'; row.innerHTML = '<div class="spinner"></div>'; mas.after(row); }
    } else if (row) row.remove();
  }

  function setupInfinite(sentinelId, cb) {
    const s = document.getElementById(sentinelId);
    if (!s) return;
    if (window.__io) { window.__io.disconnect(); window.__io = null; }
    window.__io = new IntersectionObserver(entries => { if (entries[0].isIntersecting) cb(); }, { root: view, rootMargin: '500px' });
    window.__io.observe(s);
  }

  // ---------- 状態ページ ----------
  async function goStatus() {
    const token = ++S.viewGeneration;
    S.view = 'status';
    setTabActive('library');
    renderTop();
    disconnectIO();
    viewBody.innerHTML = '<div class="spinner"></div>';
    let st;
    try { st = await API.status(true); } catch (e) { if (e.message === 'unauthorized') return; if (e.loading) { showLibraryLoading(e.library); return; } if (token === S.viewGeneration && S.view === 'status') viewBody.innerHTML = '<div class="errbox">' + esc(tr('loadFailed', { error: e.message })) + '</div>'; return; }
    if (token !== S.viewGeneration || S.view !== 'status') return;
    S.status = st;
    view.scrollTop = 0;
    const fmtTime = ms => ms ? new Date(ms).toLocaleString(DATE_LOCALE[lang] || 'ja-JP', { hour12: false }) : '—';
    const stats = st.stats || {};
    viewBody.innerHTML =
      '<div class="lt">' + esc(tr('status')) + '</div>' +
      '<div class="card">' +
      '<div class="kv"><span class="k">' + tr('status') + '</span><span class="v ' + (!st.ok ? 'bad' : (st.changed ? 'warn' : 'ok')) + '">' + (st.ok ? (st.changed ? tr('connectedChanged') : tr('connected')) : tr('disconnected')) + '</span></div>' +
      (currentLib() ? '<div class="kv"><span class="k">' + tr('libraryLabel') + '</span><span class="v">' + esc(currentLib().name) + '</span></div>' : '') +
      '<div class="kv"><span class="k">' + tr('indexedAt') + '</span><span class="v">' + fmtTime(st.loadedAt) + '</span></div>' +
      '<div class="kv"><span class="k">' + tr('items') + '</span><span class="v">' + (stats.items || 0) + '</span></div>' +
      '<div class="kv"><span class="k">' + tr('foldersLabel') + '</span><span class="v">' + (stats.folders || 0) + '</span></div>' +
      '<div class="kv"><span class="k">' + tr('tags') + '</span><span class="v">' + (stats.tags || 0) + '</span></div>' +
      '</div>' +
      (st.changed ? '<div class="warnrow"><b>' + tr('remoteChangedTitle') + '</b><br>' + tr('remoteChangedBody') + '</div>' : '') +
      '<button class="actbtn" id="reloadBtn">' + refreshSVG + ' ' + tr('reload') + '</button>' +
      '<button class="actbtn ghost" id="clearThumbCacheBtn">' + tr('thumbnailCacheClear') + '</button>' +
      '<div class="status-cache" id="thumbCacheMeta">' + tr('thumbnailCache') + ' · …</div>';
    const btn = document.getElementById('reloadBtn');
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = tr('loading');
      try { await API.reload(); goStatus(); }
      catch (e) { if (e.message !== 'unauthorized') { btn.disabled = false; btn.textContent = tr('reload'); toast(tr('reloadFailed')); } }
    };
    const clearThumbCacheBtn = document.getElementById('clearThumbCacheBtn');
    const thumbCacheMeta = document.getElementById('thumbCacheMeta');
    const refreshThumbCacheMeta = () => Thumbs.stats().then((cache) => {
      if (thumbCacheMeta) thumbCacheMeta.textContent = tr('thumbnailCache') + ' · ' + cache.entries + ' · ' + fmtSize(cache.bytes);
    });
    if (clearThumbCacheBtn) clearThumbCacheBtn.onclick = async () => {
      clearThumbCacheBtn.disabled = true;
      await Thumbs.clear();
      clearThumbCacheBtn.disabled = false;
      toast(tr('thumbnailCacheCleared'));
      refreshThumbCacheMeta();
    };
    refreshThumbCacheMeta();
  }

  // ---------- サムネイルをタップ → プレビュー ----------
  function bindThumbs(container) {
    container.querySelectorAll('.th:not([data-bound])').forEach(t => {
      t.dataset.bound = '1';
      t.onclick = () => openPreview(parseInt(t.dataset.idx, 10));
    });
  }

  // ---------- プレビューのオーバーレイ + ジェスチャー ----------
  const g = { mode: null, pointers: new Map(), startX: 0, startY: 0, dx: 0, dy: 0, moved: false, t0: 0, lastTap: 0, scale: 1, baseScale: 1, pinchStart: 0, tx: 0, ty: 0, baseTx: 0, baseTy: 0 };

  function openPreview(index) {
    S.preview.list = S.currentGallery;
    S.preview.index = index;
    S.preview.open = true;
    showPreviewItem();
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('pv-open');
    document.body.style.overflow = 'hidden';
    if (!S.preview.pushed) { history.pushState({ pv: 1 }, ''); S.preview.pushed = true; }
  }
  function closePreviewVisual() {
    S.preview.token++;
    S.preview.open = false;
    S.preview.pushed = false;
    overlay.classList.remove('show', 'immersive');
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('pv-open');
    document.body.style.overflow = '';
    clearPreviewMedia();
    pvImg.onerror = null;
    pvImg.src = '';
    if (S.preview.thumbObjectUrl) URL.revokeObjectURL(S.preview.thumbObjectUrl);
    S.preview.thumbObjectUrl = '';
    pvImg.style.display = '';
    pvImg.style.transform = '';
    overlay.style.background = '#000';
    g.scale = 1; g.tx = 0; g.ty = 0;
  }
  function closePreview() {
    if (!S.preview.open) return;
    closePreviewVisual();
    history.back();
  }
  function showPreviewItem() {
    const list = S.preview.list, i = S.preview.index, it = list[i];
    if (!it) return;
    const token = ++S.preview.token;
    g.scale = 1; g.tx = 0; g.ty = 0;
    pvIndex.textContent = (i + 1) + ' / ' + list.length;
    const ext = normExt(it.ext);
    const mediaUrl = itemUrl(it.id, 'file');
    const image = isImageExt(ext);
    const video = isVideoExt(ext);
    const pdf = ext === 'pdf';
    clearPreviewMedia();
    pvImg.style.display = image ? '' : 'none';
    if (!image && !video && !pdf) {
      showPreviewUnavailable(tr('unsupportedPreview'));
    } else if (image) {
      const thumbUrl = itemUrl(it.id, 'thumbnail');
      pvImg.onerror = () => showPreviewUnavailable(tr('unsupportedPreview'));
      Thumbs.get(thumbKey(it.id)).then((blob) => {
        if (blob && S.preview.open && token === S.preview.token && S.preview.list[S.preview.index] === it) {
          if (S.preview.thumbObjectUrl) URL.revokeObjectURL(S.preview.thumbObjectUrl);
          S.preview.thumbObjectUrl = URL.createObjectURL(blob);
          pvImg.src = S.preview.thumbObjectUrl;
        } else if (S.preview.open && token === S.preview.token) {
          pvImg.src = thumbUrl;
        }
      }).catch(() => {
        if (S.preview.open && token === S.preview.token) pvImg.src = thumbUrl;
      });
    } else if (video) {
      const player = document.createElement('video');
      player.className = 'pv-media pv-video';
      player.controls = true;
      player.playsInline = true;
      player.preload = 'metadata';
      player.addEventListener('error', () => showPreviewUnavailable(tr('videoUnavailable')), { once: true });
      player.src = mediaUrl;
      pvStage.appendChild(player);
    } else if (pdf) {
      const frame = document.createElement('iframe');
      frame.className = 'pv-media pv-pdf';
      frame.src = mediaUrl;
      frame.loading = 'lazy';
      frame.title = it.name || 'PDF Preview';
      pvStage.appendChild(frame);
    }
    pvImg.style.transition = '';
    applyTransform();
    pvName.textContent = it.name || '';
    const dims = (it.width && it.height) ? it.width + '×' + it.height + ' · ' : '';
    const sz = fmtSize(it.size);
    pvMeta.textContent = dims + (it.ext || '').toUpperCase() + (sz ? ' · ' + sz : '');
    pvDownload.href = itemUrl(it.id, 'file', true);
    renderPreviewStars(it);
    pvOriginal.style.display = image ? '' : 'none';
    pvOriginal.disabled = false;
    document.getElementById('pvOriginalLabel').textContent = tr('showOriginal');
    // 「アルバムに保存」は画像/動画のときだけ出す（iOS では共有シートの「写真に保存」からしかアルバムに書き込めない）。
    pvSave.style.display = (image || video) ? '' : 'none';
    pvPrev.disabled = i <= 0;
    pvNext.disabled = i >= list.length - 1;
    updatePeeks();
    preloadAdjacent();
  }
  function clearPreviewMedia() {
    pvStage.querySelectorAll('.pv-unavailable').forEach(el => el.remove());
    pvStage.querySelectorAll('.pv-video, .pv-pdf').forEach(el => {
      if (el.pause) el.pause();
      el.remove();
    });
  }
  function showPreviewUnavailable(message) {
    pvImg.style.display = 'none';
    pvStage.querySelectorAll('.pv-unavailable').forEach(el => el.remove());
    const box = document.createElement('div');
    box.className = 'pv-unavailable';
    box.textContent = message;
    pvStage.appendChild(box);
    pvSave.style.display = 'none';
  }
  async function showOriginal() {
    const it = S.preview.list[S.preview.index];
    if (!it || !isImageExt(it.ext)) return;
    const token = S.preview.token;
    const originalUrl = itemUrl(it.id, 'file');
    pvOriginal.disabled = true;
    document.getElementById('pvOriginalLabel').textContent = tr('loadingOriginal');
    try {
      const original = new Image();
      await new Promise((resolve, reject) => {
        original.onload = resolve;
        original.onerror = reject;
        original.src = originalUrl;
      });
      if (!(S.preview.open && token === S.preview.token && S.preview.list[S.preview.index] === it)) return;
      pvImg.src = originalUrl;
      // 見た目が変わらないこともあるので、表示中であることをボタンで示す（次の項目で元に戻る）
      document.getElementById('pvOriginalLabel').textContent = tr('originalShown');
      toast(tr('originalShown'));
    } catch (e) {
      toast(tr('unsupportedPreview'));
      if (token === S.preview.token) {
        pvOriginal.disabled = false;
        document.getElementById('pvOriginalLabel').textContent = tr('showOriginal');
      }
    }
  }
  // ---------- プレビューの評価（★）----------
  function renderPreviewStars(it) {
    const n = normStar(it.star);
    const lib = currentLib();
    const editable = !!(lib && lib.editable);
    if (!editable && !n) { pvStars.hidden = true; pvStars.innerHTML = ''; return; }
    pvStars.hidden = false;
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const on = i <= n;
      html += editable
        ? '<button type="button" class="pv-star' + (on ? ' on' : '') + '" data-star="' + i + '" aria-label="' + esc(i === n ? tr('ratingClear') : tr('ratingSet', { n: i })) + '">' + (on ? '\u2605' : '\u2606') + '</button>'
        : '<span class="pv-star' + (on ? ' on' : '') + '" aria-hidden="true">' + (on ? '\u2605' : '\u2606') + '</span>';
    }
    if (!n) html += '<span class="pv-star-none">' + esc(tr('ratingNone')) + '</span>';
    pvStars.innerHTML = html;
    pvStars.classList.toggle('editable', editable);
  }

  function applyStar(it, star) {
    it.star = star;
    [S.recents, S.folderItems, S.searchItems, S.preview.list].forEach(list => (list || []).forEach(x => { if (x.id === it.id) x.star = star; }));
    document.querySelectorAll('.th').forEach(btn => {
      const idx = parseInt(btn.dataset.idx, 10);
      const item = S.currentGallery[idx];
      if (!item || item.id !== it.id) return;
      const chip = btn.querySelector('.star-chip');
      if (!star) { if (chip) chip.remove(); return; }
      if (chip) chip.textContent = '\u2605' + star;
      else btn.querySelector('.ext').insertAdjacentHTML('afterend', '<span class="star-chip">\u2605' + star + '</span>');
    });
    if (S.preview.open && S.preview.list[S.preview.index] && S.preview.list[S.preview.index].id === it.id) renderPreviewStars(S.preview.list[S.preview.index]);
  }

  // Tap a star to set it, tap the current value again to clear (0 = unrated). Optimistic with rollback.
  pvStars.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-star]');
    const it = S.preview.list[S.preview.index];
    if (!button || !it) return;
    const lib = currentLib();
    if (!lib || !lib.editable) return;
    const previous = normStar(it.star);
    const clicked = parseInt(button.dataset.star, 10);
    const next = clicked === previous ? 0 : clicked;
    const generation = (it._starGen || 0) + 1;
    it._starGen = generation;
    applyStar(it, next);
    try {
      const updated = await API.setStar(it.id, next);
      if (it._starGen !== generation) return;
      applyStar(it, normStar(updated && updated.star));
      toast(tr('ratingSaved'));
    } catch (err) {
      if (err && err.message === 'unauthorized') return;
      if (it._starGen !== generation) return;
      applyStar(it, previous);
      toast((err && err.detail) || tr('ratingFailed'));
    }
  });
  // Keep star taps from reaching the swipe/tap gestures of the stage.
  pvStars.addEventListener('pointerdown', e => e.stopPropagation());

  function normExt(ext) { return (ext || '').toLowerCase().replace(/^\./, ''); }
  function isImageExt(ext) { return ['bmp', 'gif', 'heic', 'heif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp', 'avif', 'jfif', 'jxl'].includes(normExt(ext)); }
  function isVideoExt(ext) { return ['mp4', 'mov', 'webm', 'm4v', '3gp'].includes(normExt(ext)); }
  // ファイルの Blob を取って Web Share API で File として共有する——そうすると iOS の共有シートに「写真に保存 / ビデオを保存」が出る。
  async function shareFile(it) {
    if (it.size && it.size > 200 * 1024 * 1024) throw new Error('too-large-to-share');
    const url = location.origin + itemUrl(it.id, 'file');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('fetch-failed');
    const blob = await resp.blob();
    const ext = normExt(it.ext) || (blob.type.split('/')[1] || '').toLowerCase() || 'bin';
    const fname = (it.name || 'eagle') + '.' + ext;
    const file = new File([blob], fname, { type: blob.type || undefined });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: it.name || fname });
    } else if (navigator.share) {
      await navigator.share({ title: it.name || fname, url });
    } else {
      throw new Error('no-share');
    }
  }
  function preloadAdjacent() {
    // プレビューはまずいまの画像のサムネイルを出し、テザリング回線で隣のオリジナルを同時にダウンロードしないようにする。
  }
  function showPreviewItemAnimated(dir) {
    pvImg.style.transition = 'transform .18s ease';
    pvImg.style.transform = 'translateX(' + (dir === 'next' ? '-100%' : '100%') + ')';
    setTimeout(showPreviewItem, 170);
  }
  function updatePeeks() {
    // プレビュー中は背景をすっきり保つ：隣の項目のはみ出したサムネイルを外し、他の結果が透けて見づらくならないようにする。
    pvStage.querySelectorAll('.pv-peek').forEach(p => p.remove());
  }
  // 拡大中は、はみ出した分だけ上下左右にずらせる
  function clampPan() {
    const maxX = Math.max(0, (pvImg.offsetWidth * g.scale - pvStage.clientWidth) / 2);
    const maxY = Math.max(0, (pvImg.offsetHeight * g.scale - pvStage.clientHeight) / 2);
    g.tx = clamp(g.tx, -maxX, maxX);
    g.ty = clamp(g.ty, -maxY, maxY);
  }
  function applyTransform() {
    if (g.scale <= 1) { g.tx = 0; g.ty = 0; pvImg.style.transform = ''; return; }
    clampPan();
    pvImg.style.transform = 'translate(' + g.tx + 'px, ' + g.ty + 'px) scale(' + g.scale + ')';
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  pvStage.addEventListener('pointerdown', e => {
    if (e.target.closest('video, iframe')) return;
    pvStage.setPointerCapture(e.pointerId);
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2) {
      const p = [...g.pointers.values()];
      g.pinchStart = dist(p[0], p[1]); g.baseScale = g.scale; g.mode = 'pinch';
    } else if (g.pointers.size === 1) {
      g.mode = null; g.startX = e.clientX; g.startY = e.clientY; g.dx = 0; g.dy = 0; g.moved = false; g.t0 = Date.now();
      g.baseTx = g.tx; g.baseTy = g.ty;
    }
  });
  pvStage.addEventListener('pointermove', e => {
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.mode === 'pinch' && g.pointers.size >= 2) {
      const p = [...g.pointers.values()];
      g.scale = clamp(g.baseScale * (dist(p[0], p[1]) / g.pinchStart), 1, 4);
      applyTransform();
      return;
    }
    if (g.pointers.size !== 1) return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    g.dx = dx; g.dy = dy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
    if (!g.mode && g.scale > 1 && g.moved) g.mode = 'pan';
    if (g.mode === 'pan') {
      pvImg.style.transition = 'none';
      g.tx = g.baseTx + dx; g.ty = g.baseTy + dy;
      applyTransform();
      return;
    }
    if (!g.mode) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) g.mode = 'dismiss';
      else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) g.mode = 'switch';
    }
    if (g.mode === 'dismiss') {
      const t = clamp(1 - Math.abs(dy) / (window.innerHeight * 1.1), 0.4, 1);
      pvImg.style.transition = 'none';
      pvImg.style.transform = 'translateY(' + dy + 'px) scale(' + t + ')';
      overlay.style.background = 'rgba(0,0,0,' + (0.92 * t) + ')';
    } else if (g.mode === 'switch') {
      pvImg.style.transition = 'none';
      pvImg.style.transform = 'translateX(' + dx + 'px)';
    }
  });
  function endPointer(e) {
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.delete(e.pointerId);
    if (g.mode === 'pinch') {
      if (g.pointers.size === 1) { const p = [...g.pointers.values()][0]; g.startX = p.x; g.startY = p.y; g.baseTx = g.tx; g.baseTy = g.ty; g.mode = g.scale > 1 ? 'pan' : 'switch'; }
      else if (g.pointers.size === 0) g.mode = null;
      return;
    }
    pvImg.style.transition = '';
    const elapsed = Date.now() - g.t0;
    if (g.mode === 'pan') { g.mode = null; return; }
    if (g.mode === 'dismiss') {
      if (Math.abs(g.dy) > window.innerHeight * 0.25 || (Math.abs(g.dy) > 60 && elapsed < 250)) closePreview();
      else { pvImg.style.transform = ''; overlay.style.background = '#000'; }
    } else if (g.mode === 'switch') {
      if (g.dx < -window.innerWidth * 0.22 && S.preview.index < S.preview.list.length - 1) { S.preview.index++; showPreviewItemAnimated('next'); }
      else if (g.dx > window.innerWidth * 0.22 && S.preview.index > 0) { S.preview.index--; showPreviewItemAnimated('prev'); }
      else pvImg.style.transform = '';
    } else if (!g.moved && elapsed < 300) {
      const now = Date.now();
      if (now - g.lastTap < 280) { g.scale = g.scale > 1 ? 1 : 2; applyTransform(); }
      else { g.lastTap = now; overlay.classList.toggle('immersive'); requestAnimationFrame(applyTransform); }
    }
    g.mode = null;
  }
  pvStage.addEventListener('pointerup', endPointer);
  pvStage.addEventListener('pointercancel', endPointer);

  pvClose.onclick = closePreview;
  pvPrev.onclick = () => {
    if (S.preview.index <= 0) return;
    S.preview.index--;
    showPreviewItem();
  };
  pvNext.onclick = () => {
    if (S.preview.index >= S.preview.list.length - 1) return;
    S.preview.index++;
    showPreviewItem();
  };
  pvDownload.onclick = (e) => {
    // Blob でダウンロードを起こす：ブラウザに「名前を付けて保存…」の画面を必ず出させ、Safari がファイルをその場でプレビュー（Finder/Quick Look）しないようにする。
    e.preventDefault();
    const it = S.preview.list[S.preview.index];
    if (!it) return;
    const url = itemUrl(it.id, 'file', true);
    const fname = (it.name || 'eagle') + '.' + (normExt(it.ext) || 'bin');
    fetch(url).then((r) => r.blob()).then((blob) => {
      const bUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = bUrl; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(bUrl), 5000);
    }).catch(() => { window.location.href = url; });
  };
  pvOriginal.onclick = showOriginal;
  pvSave.onclick = async () => {
    const it = S.preview.list[S.preview.index];
    if (!it) return;
    try {
      // iOS の共有シートには「写真に保存 / ビデオを保存」が出る。ユーザーが share をキャンセルしたら正常終了とみなす。
      await shareFile(it);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      // ファイルとして共有できないときは「ファイル」App へのダウンロードに切りかえる（Android ではふつうアルバムにも拾われる）。
      try {
        const a = document.createElement('a');
        a.href = itemUrl(it.id, 'file', true);
        a.download = (it.name || 'eagle') + '.' + (normExt(it.ext) || '');
        document.body.appendChild(a); a.click(); a.remove();
        toast(tr('downloaded'));
      } catch (e2) { toast(tr('saveFailed')); }
    }
  };
  pvShare.onclick = async () => {
    const it = S.preview.list[S.preview.index];
    if (!it) return;
    try {
      // ファイルとして共有すると iOS のシートに「写真に保存」が出る。共有のキャンセルは正常とみなす。
      await shareFile(it);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      const url = location.origin + itemUrl(it.id, 'file');
      try { await navigator.clipboard.writeText(url); toast(tr('copied')); }
      catch (e2) { toast(tr('shareUnavailable')); }
    }
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:8px 14px;border-radius:10px;font-size:12px;z-index:200;pointer-events:none;opacity:0;transition:opacity .2s;'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1600);
  }

  // ---------- システムの戻るジェスチャーでプレビューを閉じる ----------
  window.addEventListener('popstate', () => { if (S.preview.open) closePreviewVisual(); });

  // ---------- Tab の切りかえ ----------
  tabs.addEventListener('click', e => { const b = e.target.closest('.tb'); if (b) switchTab(b.dataset.view); });

  // ---------- 大見出しの折りたたみ：内容をスクロールしたら上部バーの小さい見出しをフェードイン ----------
  view.addEventListener('scroll', () => {
    topbar.classList.toggle('top-collapsed', view.scrollTop > 4);
  }, { passive: true });

  // ---------- 起動 ----------
  applyLanguage();
  initLibraries().then(() => switchTab('library'), () => {});

  // PWA：service worker を登録する（あれば）
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();

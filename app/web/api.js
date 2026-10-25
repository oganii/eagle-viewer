'use strict';

var state = EagleViewer.state;
var render = EagleViewer.modules.render;
var apiModule = EagleViewer.modules.api = EagleViewer.modules.api || {};
var activeListAbortController = null;

async function fetchJson(path, options) {
  var response = await fetch(API + withLib(path), options);
  if (handleAuthResponse(response)) return null;
  if (!response.ok) throw await buildResponseError(response);
  return response.json();
}

// 503 with {detail: {code: 'library-loading'}} means the selected library is still being indexed.
async function buildResponseError(response) {
  var error = new Error(response.status === 503 ? 'offline' : 'request');
  error.status = response.status;
  try {
    var body = await response.json();
    var detail = body && body.detail;
    if (detail && detail.code === 'library-loading') {
      error.message = 'library-loading';
      error.library = detail.library || null;
    } else if (typeof detail === 'string') {
      error.detail = detail;
    }
  } catch (e) {}
  return error;
}

// ===== Libraries =====
var libraryPollTimer = 0;

async function fetchLibraries() {
  var response = await fetch(API + '/api/libraries', { cache: 'no-store' });
  if (handleAuthResponse(response)) return null;
  if (!response.ok) throw new Error('request');
  var data = await response.json();
  state.libraries = data.libraries || [];
  state.defaultLibrary = data.default || '';
  return data;
}

async function initLibraries() {
  var fromHash = libraryFromHash();
  try {
    await fetchLibraries();
  } catch (e) {
    state.libraries = [];
  }
  state.currentLibrary = chooseLibrary(state.libraries, state.defaultLibrary, fromHash, readStoredLibrary());
  if (state.currentLibrary) rememberLibrary(state.currentLibrary);
  if (render.renderLibrarySwitcher) render.renderLibrarySwitcher();
  return state.currentLibrary;
}

function libraryDisplayName(libId) {
  var lib = findLibrary(libId);
  return lib ? lib.name : (libId || '');
}

function renderLibraryLoading(lib) {
  var body = document.getElementById('contentBody');
  if (!body) return;
  var name = lib ? lib.name : libraryDisplayName(state.currentLibrary);
  var failed = lib && lib.state === 'error';
  var progress = lib && lib.progress && lib.progress.total ? lib.progress : null;
  var title = failed ? tFmt('library_error', { name: name })
    : progress ? tFmt('library_loading_progress', { name: name, done: progress.done, total: progress.total })
    : tFmt('library_loading', { name: name });
  var percent = progress ? Math.min(100, Math.round(progress.done * 100 / Math.max(1, progress.total))) : 0;
  body.innerHTML = '<div class="empty-state library-loading-state" data-library-loading="' + escapeHtml(lib ? lib.id : '') + '">' +
    (failed ? iconFolderOutline() : '<div class="loading-spinner"></div>') +
    '<strong>' + escapeHtml(title) + '</strong>' +
    '<span>' + escapeHtml(failed ? (lib.error || '') : t('library_loading_desc')) + '</span>' +
    (progress ? '<div class="library-progress"><i style="width:' + percent + '%"></i></div>' : '') +
    '</div>';
  var toolbar = document.getElementById('contentToolbar');
  if (toolbar) toolbar.style.display = 'none';
}

// Poll /api/libraries until the selected library is indexed, showing progress meanwhile.
async function waitForLibraryReady(libId) {
  clearTimeout(libraryPollTimer);
  await fetch(API + '/api/libraries/' + encodeURIComponent(libId) + '/load', { method: 'POST' }).catch(function() {});
  while (state.currentLibrary === libId) {
    var data = null;
    try { data = await fetchLibraries(); } catch (e) { data = null; }
    var lib = findLibrary(libId);
    if (render.renderLibrarySwitcher) render.renderLibrarySwitcher();
    if (lib && lib.state === 'ready') return true;
    if (data && lib) renderLibraryLoading(lib);
    await new Promise(function(resolve) { libraryPollTimer = setTimeout(resolve, lib && lib.state === 'error' ? 10000 : 1500); });
  }
  return false;
}

async function ensureLibraryReady() {
  var lib = findLibrary(state.currentLibrary);
  if (!lib || lib.state === 'ready') return true;
  renderLibraryLoading(lib);
  return waitForLibraryReady(state.currentLibrary);
}

async function switchLibrary(libId) {
  if (!libId || libId === state.currentLibrary) return;
  state.currentLibrary = libId;
  rememberLibrary(libId);
  state.currentView = 'all';
  state.currentFolderId = null;
  state.currentTagName = null;
  state.searchQuery = '';
  state.pendingItemId = '';
  state.currentItems = [];
  state.currentSubfolders = [];
  state.selectedIds = new Set();
  state.folderExpanded = {};
  var searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  if (render.closeInspector && state.inspectorItem) render.closeInspector();
  if (render.renderLibrarySwitcher) render.renderLibrarySwitcher();
  if (!(await ensureLibraryReady())) return;
  if (state.currentLibrary !== libId) return;
  await fetchTree();
  render.renderSidebar();
  await fetchTags();
  render.renderTagList();
  await loadAllItems(true);
  if (window.showToast) window.showToast(tFmt('library_switched', { name: libraryDisplayName(libId) }), 'success');
}

// PUT the rating; resolves to the updated item or throws an Error with .detail (Japanese message).
async function setItemStar(itemId, star) {
  var response = await fetch(API + withLib('/api/items/' + encodeURIComponent(itemId) + '/star'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ star: star })
  });
  if (handleAuthResponse(response)) return null;
  if (!response.ok) throw await buildResponseError(response);
  return response.json();
}

async function fetchTree() {
  var data = await fetchJson('/api/tree');
  state.treeData = data ? (data.folders || []) : [];
  return state.treeData;
}

async function fetchTags() {
  var data = await fetchJson('/api/tags');
  state.tagData = data ? (data.tags || []) : [];
  return state.tagData;
}

async function resolveItems(itemIds) {
  var data = await fetchJson('/api/items/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemIds || [])
  });
  return data ? (data.items || []) : [];
}

async function fetchItemDetail(itemId) {
  var data = await fetchJson('/api/items/' + encodeURIComponent(itemId));
  return data || null;
}

async function reloadLibrary() {
  var response = await fetch(API + withLib('/api/library/reload'), { method: 'POST' });
  if (handleAuthResponse(response)) return null;
  if (!response.ok) throw new Error('reload');
  await fetchTree();
  render.renderSidebar();
  await fetchTags();
  render.renderTagList();
  await refreshCurrentView();
  return response.json();
}

async function fetchLibraryStatus(deep) {
  return fetchJson('/api/library/status' + (deep ? '?deep=true' : ''));
}

async function refreshCurrentView() {
  if (state.currentView === 'folder' && state.currentFolderId) return loadFolderItems(state.currentFolderId);
  if (state.currentView === 'tag' && state.currentTagName) return loadTagItems(state.currentTagName);
  if (state.currentView === 'recent') return loadRecentItems(state.recentDays);
  if (state.currentView === 'search') return doSearch();
  return loadAllItems(true);
}

function closeMobileSidebarIfNeeded() {
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('mobile-open');
}

function getViewModeStorageKey() {
  return window.innerWidth <= 768 ? 'eagle-viewer-view-mode-mobile' : 'eagle-viewer-view-mode-desktop';
}

function getPreferredViewMode() {
  var stored = localStorage.getItem(getViewModeStorageKey()) || localStorage.getItem('eagle-viewer-view-mode');
  return stored === 'list' ? 'list' : 'grid';
}

function findFolderPathById(folderId, nodes, trail) {
  for (var i = 0; i < (nodes || []).length; i++) {
    var node = nodes[i];
    var next = trail.concat(node.name || 'フォルダ');
    if (String(node.id) === String(folderId)) return next.join(' / ');
    var child = findFolderPathById(folderId, node.children || [], next);
    if (child) return child;
  }
  return '';
}

function findFolderNodeById(folderId, nodes) {
  for (var i = 0; i < (nodes || []).length; i++) {
    var node = nodes[i];
    if (String(node.id) === String(folderId)) return node;
    var child = findFolderNodeById(folderId, node.children || []);
    if (child) return child;
  }
  return null;
}

function buildBasicListQuery() {
  var params = new URLSearchParams();
  params.set('sort', state.listSort || 'mtime');
  params.set('dir', state.listDir || 'desc');
  params.set('type', state.listType || 'all');
  if (state.listRating && state.listRating !== 'all') params.set('rating', state.listRating);
  params.set('offset', String(state.incrementalOffset || 0));
  params.set('limit', String(INCREMENTAL_PAGE_SIZE));
  return params.toString();
}

async function loadIncrementalView(options) {
  var reset = options.reset !== false;
  if (state.incrementalLoading && !reset) return;
  var requestId = reset ? state.activeListRequest + 1 : state.activeListRequest;
  if (reset) {
    state.activeListRequest = requestId;
    state.incrementalOffset = 0;
    state.incrementalHasMore = false;
    state.currentItems = [];
  }
  state.currentView = options.view;
  state.currentFolderId = options.folderId || null;
  state.currentTagName = options.tagName || null;
  if (options.searchQuery !== undefined) state.searchQuery = options.searchQuery;
  if (options.days) state.recentDays = options.days;
  closeMobileSidebarIfNeeded();
  state.incrementalLoading = true;
  if (reset && activeListAbortController) activeListAbortController.abort();
  if (reset && typeof AbortController !== 'undefined') activeListAbortController = new AbortController();
  if (reset) {
    document.getElementById('contentBody').innerHTML = '<div class="loading-spinner">読み込み中…</div>';
    document.getElementById('contentToolbar').style.display = 'flex';
  }
  try {
    var separator = options.apiPath.indexOf('?') >= 0 ? '&' : '?';
    var data = await fetchJson(options.apiPath + separator + buildBasicListQuery(), activeListAbortController ? { signal: activeListAbortController.signal } : undefined);
    if (!data || requestId !== state.activeListRequest) return;
    var newItems = data.items || [];
    state.currentTitle = options.title;
    state.currentSubfolders = reset && options.getSubfolders ? options.getSubfolders(data) : (reset ? [] : state.currentSubfolders);
    state.currentEmptyMsg = options.emptyMsg;
    state.currentTotal = Number(data.total || 0);
    state.incrementalOffset = Number(data.nextOffset != null ? data.nextOffset : state.incrementalOffset + newItems.length);
    state.incrementalHasMore = !!data.hasMore;
    state.currentItems = reset ? newItems : state.currentItems.concat(newItems);
    state.incrementalLoading = false;
    if (reset && render.syncActiveNavigationState) render.syncActiveNavigationState();
    render.updateContentTitle();
    if (!reset && state.viewMode === 'grid' && render.appendItemsToGrid(newItems)) {
      updateUrlFromState();
      return;
    }
    render.renderContent();
    updateUrlFromState();
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    if (requestId !== state.activeListRequest) return;
    state.incrementalLoading = false;
    if (error && error.message === 'library-loading') {
      if (error.library) renderLibraryLoading(error.library);
      if (await waitForLibraryReady(state.currentLibrary)) refreshCurrentView();
      return;
    }
    if (reset) {
      var title = error && error.message === 'offline' ? 'リモート Vault に接続できません' : '読み込みに失敗しました';
      document.getElementById('contentBody').innerHTML = '<div class="empty-state offline-state">' + iconFolderOutline() + '<strong>' + title + '</strong><span>ネットワーク接続、VPN、リモートのマウント状態を確認してください。</span></div>';
    }
  } finally {
    if (reset && requestId === state.activeListRequest) activeListAbortController = null;
  }
}

function loadAllItems(reset) {
  return loadIncrementalView({ view: 'all', apiPath: '/api/items', title: 'すべて', emptyMsg: 'このライブラリには素材がありません', reset: reset });
}

function loadRecentItems(days, reset) {
  days = Number(days) === 30 ? 30 : 7;
  setRecentActive(days);
  return loadIncrementalView({ view: 'recent', apiPath: '/api/recent?days=' + days, title: '過去 ' + days + ' 日間', emptyMsg: '最近の素材はありません', reset: reset, days: days });
}

function loadTagItems(tagName, reset) {
  return loadIncrementalView({ view: 'tag', apiPath: '/api/tags/' + encodeURIComponent(tagName) + '/items', title: 'タグ「' + tagName + '」', emptyMsg: 'このタグの素材はありません', reset: reset, tagName: tagName });
}

function loadFolderItems(folderId, reset) {
  var folder = findFolderNodeById(folderId, state.treeData);
  if (folder && folder.locked) {
    if (render.showLockedFolderNotice) render.showLockedFolderNotice(folder);
    return Promise.resolve();
  }
  expandFolderPathTo(folderId, state.treeData);
  return loadIncrementalView({
    view: 'folder',
    apiPath: '/api/folders/' + encodeURIComponent(folderId) + '/items',
    title: findFolderPathById(folderId, state.treeData, []) || 'フォルダ',
    emptyMsg: 'このフォルダには素材がありません',
    reset: reset,
    folderId: folderId,
    getSubfolders: function(data) { return data.subfolders || []; }
  });
}

function doSearch(reset) {
  var input = document.getElementById('searchInput');
  var query = String((input && input.value) || state.searchQuery || '').trim();
  if (!query) return loadAllItems(true);
  return loadIncrementalView({ view: 'search', apiPath: '/api/search?q=' + encodeURIComponent(query), title: '「' + query + '」の検索結果', emptyMsg: '一致する素材はありません', reset: reset, searchQuery: query });
}

function maybeLoadMoreIncrementalView() {
  if (['all', 'recent', 'folder', 'tag', 'search'].indexOf(state.currentView) < 0 || !state.incrementalHasMore || state.incrementalLoading) return;
  var body = document.getElementById('contentBody');
  if (body && body.scrollHeight - body.scrollTop - body.clientHeight < 600) loadNextIncrementalPage();
}

async function loadNextIncrementalPage() {
  if (!state.incrementalHasMore || state.incrementalLoading) return false;
  var before = state.currentItems.length;
  if (state.currentView === 'all') await loadAllItems(false);
  else if (state.currentView === 'recent') await loadRecentItems(state.recentDays, false);
  else if (state.currentView === 'folder') await loadFolderItems(state.currentFolderId, false);
  else if (state.currentView === 'tag') await loadTagItems(state.currentTagName, false);
  else if (state.currentView === 'search') await doSearch(false);
  return state.currentItems.length > before;
}

Object.assign(apiModule, {
  fetchLibraries: fetchLibraries,
  initLibraries: initLibraries,
  ensureLibraryReady: ensureLibraryReady,
  switchLibrary: switchLibrary,
  setItemStar: setItemStar,
  fetchTree: fetchTree,
  fetchTags: fetchTags,
  resolveItems: resolveItems,
  fetchItemDetail: fetchItemDetail,
  reloadLibrary: reloadLibrary,
  fetchLibraryStatus: fetchLibraryStatus,
  refreshCurrentView: refreshCurrentView,
  getPreferredViewMode: getPreferredViewMode,
  loadAllItems: loadAllItems,
  loadRecentItems: loadRecentItems,
  loadTagItems: loadTagItems,
  loadFolderItems: loadFolderItems,
  doSearch: doSearch,
  loadNextIncrementalPage: loadNextIncrementalPage,
  maybeLoadMoreIncrementalView: maybeLoadMoreIncrementalView,
  getOfflineSnapshotCatalog: function() { return []; },
  warmCurrentOfflineSnapshot: async function() { return { ok: 0, total: 0 }; },
  clearOfflineSnapshot: async function() { return { ok: true }; }
});

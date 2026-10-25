'use strict';

function updateMobileRemoteCard(status, message) {
  var card = document.getElementById('mobileRemoteCard');
  if (!card) return;
  var title = document.getElementById('mobileRemoteTitle');
  var meta = document.getElementById('mobileRemoteMeta');
  var networkChip = document.getElementById('mobileRemoteNetwork');
  var modeChip = document.getElementById('mobileRemoteMode');
  var snapshotChip = document.getElementById('mobileRemoteSnapshot');
  var refresh = document.getElementById('mobileRemoteRefresh');
  var pwa = isStandaloneDisplay() ? 'PWA' : (isIosLikeDevice() ? 'Safari' : 'ブラウザ');
  var sync = document.getElementById('syncStatus');
  var syncText = sync ? sync.textContent : 'ローカル';
  card.dataset.state = status || 'checking';
  if (title) {
    title.textContent = message || (status === 'online' ? 'リモート Vault に接続中' : status === 'changed' ? 'Vault の更新があります' : status === 'offline' ? 'リモートに接続できません' : 'リモート接続を確認中…');
  }
  if (meta) {
    meta.textContent = status === 'changed' ? 'マウント中のフォルダが変更されました · 再読み込みしても位置はそのまま' : (navigator.onLine ? 'ネットワーク接続中' : 'オフライン') + ' · 読み取り専用 · ' + pwa + ' · ' + syncText;
  }
  if (networkChip) {
    networkChip.textContent = status === 'offline' ? 'ネットワーク · オフライン' : (status === 'checking' ? 'ネットワーク · 確認中' : status === 'changed' ? 'Vault · 更新あり' : 'ネットワーク · オンライン');
    networkChip.dataset.state = status === 'offline' ? 'offline' : (status === 'checking' ? 'checking' : 'online');
  }
  if (refresh) refresh.textContent = status === 'changed' ? '更新を読み込む' : '再接続';
  if (modeChip) {
    modeChip.textContent = 'モード · ' + pwa + ' · 読み取り専用';
    modeChip.dataset.state = isStandaloneDisplay() ? 'online' : 'checking';
  }
  if (snapshotChip) {
    var snapshot = getOfflineSnapshotMeta();
    snapshotChip.textContent = snapshot ? ('スナップショット · ' + formatSnapshotAge(snapshot.savedAt) + ' · ' + (snapshot.ok || 0) + ' 件') : 'スナップショット · 未保存';
    snapshotChip.dataset.state = snapshot ? 'online' : 'checking';
    snapshotChip.title = snapshot ? ((snapshot.title || '現在の表示') + ' · ' + new Date(snapshot.savedAt).toLocaleString(getDateLocale())) : 'オフライン用スナップショットはまだ保存されていません';
  }
  if (render && render.updateMobileWorkbar) render.updateMobileWorkbar();
}

function getOfflineSnapshotMeta() {
  try {
    var meta = JSON.parse(localStorage.getItem('eagle-viewer-offline-snapshot-meta') || 'null');
    return meta && meta.savedAt ? meta : null;
  } catch (e) {
    return null;
  }
}

function formatSnapshotAge(savedAt) {
  var diff = Date.now() - Number(savedAt || 0);
  if (!isFinite(diff) || diff < 0) return 'たった今';
  var minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return minutes + ' 分前';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' 時間前';
  var days = Math.floor(hours / 24);
  return days + ' 日前';
}

function getRemoteStatusMeta() {
  var pwa = isStandaloneDisplay() ? 'PWA' : (isIosLikeDevice() ? 'Safari' : 'ブラウザ');
  var sync = document.getElementById('syncStatus');
  var syncText = sync ? sync.textContent : 'ローカル';
  return (navigator.onLine ? 'ネットワーク接続中' : 'オフライン') + ' · 読み取り専用 · ' + pwa + ' · ' + syncText;
}

function updateRemoteStatusStrip(status, message) {
  var strip = document.getElementById('remoteStatusStrip');
  if (!strip) return;
  var title = document.getElementById('remoteStatusTitle');
  var meta = document.getElementById('remoteStatusMeta');
  var retry = document.getElementById('remoteStatusRetry');
  var stateName = status || 'checking';
  var text = message || (stateName === 'online' ? 'リモート Vault に再接続しました' : stateName === 'changed' ? 'リモート Vault に新しい内容があります' : stateName === 'offline' ? 'リモート Vault はオフラインです' : 'リモート Vault に再接続中…');

  strip.dataset.state = stateName;
  if (title) title.textContent = text;
  if (meta) meta.textContent = stateName === 'offline' ? 'VPN / NAS / リバースプロキシを確認してから再接続してください · ' + getRemoteStatusMeta() : stateName === 'changed' ? 'マウント中のフォルダが変更されました · 更新しても位置はそのまま' : getRemoteStatusMeta();
  if (retry) {
    retry.disabled = stateName === 'checking';
    retry.textContent = stateName === 'changed' ? '更新を読み込む' : '再接続';
  }

  clearTimeout(strip._hideTimer);
  if (stateName === 'online') {
    if (strip._everVisible) {
      strip.hidden = false;
      strip.classList.add('visible');
      strip._hideTimer = setTimeout(function() {
        strip.classList.remove('visible');
        strip._hideTimer = setTimeout(function() { strip.hidden = true; }, 180);
      }, 1500);
    } else {
      strip.classList.remove('visible');
      strip.hidden = true;
    }
    renderMobileSearchQuick();
    var quickSheet = document.getElementById('quickActionSheet');
    if (quickSheet && quickSheet.dataset.itemId) {
      var quickItem = findCurrentItem(quickSheet.dataset.itemId);
      if (quickItem) updateQuickActionSheetState(quickSheet, quickItem);
    }
    var contextMenu = document.getElementById('itemContextMenu');
    if (contextMenu && contextMenu.dataset.itemId) {
      var contextItem = findCurrentItem(contextMenu.dataset.itemId);
      if (contextItem) updateDesktopContextMenuState(contextMenu, contextItem);
    }
    if (state.inspectorItem && render && render.openInspector && document.body.classList.contains('inspector-open')) render.openInspector(state.inspectorItem);
    if (render && render.updateBatchBar) render.updateBatchBar();
    if (render && render.refreshOpenPreviewMobileActions) render.refreshOpenPreviewMobileActions();
    if (render && render.updateMobileWorkbar) render.updateMobileWorkbar();
    if (render && render.renderContent && (state.currentItems.length || state.currentSubfolders.length)) render.renderContent();
    return;
  }

  strip._everVisible = true;
  strip.hidden = false;
  requestAnimationFrame(function() { strip.classList.add('visible'); });
  renderMobileSearchQuick();
  var activeQuickSheet = document.getElementById('quickActionSheet');
  if (activeQuickSheet && activeQuickSheet.dataset.itemId) {
    var activeQuickItem = findCurrentItem(activeQuickSheet.dataset.itemId);
    if (activeQuickItem) updateQuickActionSheetState(activeQuickSheet, activeQuickItem);
  }
  var activeContextMenu = document.getElementById('itemContextMenu');
  if (activeContextMenu && activeContextMenu.dataset.itemId) {
    var activeContextItem = findCurrentItem(activeContextMenu.dataset.itemId);
    if (activeContextItem) updateDesktopContextMenuState(activeContextMenu, activeContextItem);
  }
  if (state.inspectorItem && render && render.openInspector && document.body.classList.contains('inspector-open')) render.openInspector(state.inspectorItem);
  if (render && render.updateBatchBar) render.updateBatchBar();
  if (render && render.refreshOpenPreviewMobileActions) render.refreshOpenPreviewMobileActions();
  if (render && render.updateMobileWorkbar) render.updateMobileWorkbar();
  if (render && render.renderContent && (state.currentItems.length || state.currentSubfolders.length)) render.renderContent();
}

var libraryChangePollTimer = 0;
var libraryChangeCheckInFlight = false;
var lastLibraryDeepCheck = 0;
var libraryHiddenAt = 0;

async function checkLibraryChanges(options) {
  var opts = options || {};
  if (libraryChangeCheckInFlight || state.reloadInFlight || document.visibilityState !== 'visible' || navigator.onLine === false) return false;
  libraryChangeCheckInFlight = true;
  var deep = !!opts.deep || Date.now() - lastLibraryDeepCheck > 5 * 60 * 1000;
  if (deep) lastLibraryDeepCheck = Date.now();
  try {
    var status = await api.fetchLibraryStatus(deep);
    if (!status) return false;
    if (status.changed) {
      updateRemoteStatusStrip('changed', 'リモート Vault に新しい内容があります');
      updateMobileRemoteCard('changed', 'Vault の更新があります');
      return true;
    }
    return false;
  } catch (err) {
    return false;
  } finally {
    libraryChangeCheckInFlight = false;
  }
}

async function applyDetectedLibraryUpdate() {
  var refreshed = await api.reloadLibrary();
  if (!refreshed) return;
  updateRemoteStatusStrip('online', 'リモート Vault を更新しました');
  updateMobileRemoteCard('online', 'リモート Vault に接続中');
}

function setupLibraryChangeMonitor() {
  if (libraryChangePollTimer) return;
  libraryChangePollTimer = window.setInterval(function() { checkLibraryChanges(); }, 45 * 1000);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      libraryHiddenAt = Date.now();
      return;
    }
    var hiddenFor = libraryHiddenAt ? Date.now() - libraryHiddenAt : 0;
    checkLibraryChanges({ deep: hiddenFor > 30 * 1000 });
  });
  window.addEventListener('focus', function() { checkLibraryChanges(); });
  window.addEventListener('eagle-viewer-library-reloaded', function() {
    lastLibraryDeepCheck = Date.now();
  });
}

async function checkRemoteStatus(options) {
  var opts = options || {};
  updateMobileRemoteCard('checking', opts.message || 'リモート接続を確認中…');
  if (!opts.quietStrip) updateRemoteStatusStrip('checking', opts.message || 'リモート Vault に再接続中…');
  var online = navigator.onLine !== false;
  if (!online) {
    updateMobileRemoteCard('offline', '端末がオフラインです');
    updateRemoteStatusStrip('offline', '端末がオフラインです');
    return false;
  }
  try {
    var response = await fetch(API + '/health', { cache: 'no-store' });
    if (handleAuthResponse(response)) return false;
    if (!response.ok) throw new Error('health failed');
    updateMobileRemoteCard('online', 'リモート Vault に接続中');
    if (!opts.quietStrip) updateRemoteStatusStrip('online', 'リモート Vault に再接続しました');
    flushPendingViewerState();
    if (opts.reload) api.reloadLibrary();
    return true;
  } catch (err) {
    updateMobileRemoteCard('offline', 'リモートに接続できません');
    updateRemoteStatusStrip('offline', 'リモートに接続できません');
    return false;
  }
}

async function refreshMobileRemoteStatus(skipReload) {
  return checkRemoteStatus({ reload: !skipReload, quietStrip: !!skipReload });
}

function setupRemoteStatusStrip() {
  var strip = document.getElementById('remoteStatusStrip');
  if (!strip || strip._bound) return;
  strip._bound = true;
  var retry = document.getElementById('remoteStatusRetry');
  if (retry) retry.onclick = function() {
    if (strip.dataset.state === 'changed') applyDetectedLibraryUpdate();
    else checkRemoteStatus({ reload: true });
  };

  if (navigator.onLine === false) updateRemoteStatusStrip('offline', '端末がオフラインです');
  window.addEventListener('online', function() { checkRemoteStatus({ reload: false, message: 'ネットワークが戻りました。リモート Vault を確認中…' }); });
  window.addEventListener('offline', function() {
    updateMobileRemoteCard('offline', '端末がオフラインです');
    updateRemoteStatusStrip('offline', '端末がオフラインです');
  });
  window.addEventListener('eagle-viewer-offline-snapshot', function(event) {
    updateMobileRemoteCard('online', 'オフライン用スナップショットを更新しました');
    if (render && render.updateMobileWorkbar) render.updateMobileWorkbar();
    if (render && render.refreshOpenPreviewMobileActions) render.refreshOpenPreviewMobileActions();
    syncMobileMoreHandoff();
    renderMobileSearchQuick();
  });
  window.addEventListener('eagle-viewer-offline-snapshot-cleared', function() {
    updateMobileRemoteCard(navigator.onLine === false ? 'offline' : 'online', 'オフライン用データを削除しました');
    if (render && render.updateMobileWorkbar) render.updateMobileWorkbar();
    if (render && render.refreshOpenPreviewMobileActions) render.refreshOpenPreviewMobileActions();
    syncMobileMoreHandoff();
    renderMobileSearchQuick();
  });
}

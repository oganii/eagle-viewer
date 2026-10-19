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
  var pwa = isStandaloneDisplay() ? 'PWA' : (isIosLikeDevice() ? 'Safari' : 'Browser');
  var sync = document.getElementById('syncStatus');
  var syncText = sync ? sync.textContent : 'Local';
  card.dataset.state = status || 'checking';
  if (title) {
    title.textContent = message || (status === 'online' ? 'Remote Vault online' : status === 'changed' ? 'Vault update found' : status === 'offline' ? 'Remote connection unavailable' : 'Checking remote connection…');
  }
  if (meta) {
    meta.textContent = status === 'changed' ? 'Mounted folder changed · position kept after reload' : (navigator.onLine ? 'Network online' : 'System offline') + ' · Read-only mount · ' + pwa + ' · ' + syncText;
  }
  if (networkChip) {
    networkChip.textContent = status === 'offline' ? 'Network · Offline' : (status === 'checking' ? 'Network · Checking' : status === 'changed' ? 'Vault · Updated' : 'Network · Online');
    networkChip.dataset.state = status === 'offline' ? 'offline' : (status === 'checking' ? 'checking' : 'online');
  }
  if (refresh) refresh.textContent = status === 'changed' ? 'Load Update' : 'Reconnect';
  if (modeChip) {
    modeChip.textContent = 'Mode · ' + pwa + ' · Read-only';
    modeChip.dataset.state = isStandaloneDisplay() ? 'online' : 'checking';
  }
  if (snapshotChip) {
    var snapshot = getOfflineSnapshotMeta();
    snapshotChip.textContent = snapshot ? ('Snapshot · ' + formatSnapshotAge(snapshot.savedAt) + ' · ' + (snapshot.ok || 0) + ' items') : 'Snapshot · Not saved';
    snapshotChip.dataset.state = snapshot ? 'online' : 'checking';
    snapshotChip.title = snapshot ? ((snapshot.title || 'Current view') + ' · ' + new Date(snapshot.savedAt).toLocaleString('zh-CN')) : 'No offline snapshot saved yet';
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
  if (!isFinite(diff) || diff < 0) return 'just now';
  var minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  return days + 'd ago';
}

function getRemoteStatusMeta() {
  var pwa = isStandaloneDisplay() ? 'PWA' : (isIosLikeDevice() ? 'Safari' : 'Browser');
  var sync = document.getElementById('syncStatus');
  var syncText = sync ? sync.textContent : 'Local';
  return (navigator.onLine ? 'Network online' : 'System offline') + ' · Read-only mount · ' + pwa + ' · ' + syncText;
}

function updateRemoteStatusStrip(status, message) {
  var strip = document.getElementById('remoteStatusStrip');
  if (!strip) return;
  var title = document.getElementById('remoteStatusTitle');
  var meta = document.getElementById('remoteStatusMeta');
  var retry = document.getElementById('remoteStatusRetry');
  var stateName = status || 'checking';
  var text = message || (stateName === 'online' ? 'Remote Vault restored' : stateName === 'changed' ? 'Remote Vault has new content' : stateName === 'offline' ? 'Remote Vault offline' : 'Reconnecting to remote Vault…');

  strip.dataset.state = stateName;
  if (title) title.textContent = text;
  if (meta) meta.textContent = stateName === 'offline' ? 'Check VPN / NAS / reverse proxy, then reconnect · ' + getRemoteStatusMeta() : stateName === 'changed' ? 'Mounted folder changed · refresh keeps your position' : getRemoteStatusMeta();
  if (retry) {
    retry.disabled = stateName === 'checking';
    retry.textContent = stateName === 'changed' ? 'Load Update' : 'Reconnect';
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
      updateRemoteStatusStrip('changed', 'Remote Vault has new content');
      updateMobileRemoteCard('changed', 'Vault update found');
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
  updateRemoteStatusStrip('online', 'Remote Vault updated');
  updateMobileRemoteCard('online', 'Remote Vault online');
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
  updateMobileRemoteCard('checking', opts.message || 'Checking remote connection…');
  if (!opts.quietStrip) updateRemoteStatusStrip('checking', opts.message || 'Reconnecting to remote Vault…');
  var online = navigator.onLine !== false;
  if (!online) {
    updateMobileRemoteCard('offline', 'Device is offline');
    updateRemoteStatusStrip('offline', 'Device is offline');
    return false;
  }
  try {
    var response = await fetch(API + '/health', { cache: 'no-store' });
    if (handleAuthResponse(response)) return false;
    if (!response.ok) throw new Error('health failed');
    updateMobileRemoteCard('online', 'Remote Vault online');
    if (!opts.quietStrip) updateRemoteStatusStrip('online', 'Remote Vault restored');
    flushPendingViewerState();
    if (opts.reload) api.reloadLibrary();
    return true;
  } catch (err) {
    updateMobileRemoteCard('offline', 'Remote connection unavailable');
    updateRemoteStatusStrip('offline', 'Remote connection unavailable');
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

  if (navigator.onLine === false) updateRemoteStatusStrip('offline', 'Device is offline');
  window.addEventListener('online', function() { checkRemoteStatus({ reload: false, message: 'Network restored, checking remote Vault…' }); });
  window.addEventListener('offline', function() {
    updateMobileRemoteCard('offline', 'Device is offline');
    updateRemoteStatusStrip('offline', 'Device is offline');
  });
  window.addEventListener('eagle-viewer-offline-snapshot', function(event) {
    updateMobileRemoteCard('online', 'Offline snapshot updated');
    if (render && render.updateMobileWorkbar) render.updateMobileWorkbar();
    if (render && render.refreshOpenPreviewMobileActions) render.refreshOpenPreviewMobileActions();
    syncMobileMoreHandoff();
    renderMobileSearchQuick();
  });
  window.addEventListener('eagle-viewer-offline-snapshot-cleared', function() {
    updateMobileRemoteCard(navigator.onLine === false ? 'offline' : 'online', 'Offline data cleared');
    if (render && render.updateMobileWorkbar) render.updateMobileWorkbar();
    if (render && render.refreshOpenPreviewMobileActions) render.refreshOpenPreviewMobileActions();
    syncMobileMoreHandoff();
    renderMobileSearchQuick();
  });
}

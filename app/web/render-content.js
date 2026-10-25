'use strict';

// ===== Main render =====
function renderContent() {
  var body = document.getElementById('contentBody');
  var toolbar = document.getElementById('contentToolbar');
  var titleEl = document.getElementById('contentTitle');

  if (state.viewMode !== getPreferredViewMode()) setViewMode(getPreferredViewMode(), true);

  toolbar.style.display = (state.currentView !== 'none') ? 'flex' : 'none';

  var ctSort = document.getElementById('ctSortSelect');
  var ctDir = document.getElementById('ctSortDirSelect');
  var ctType = document.getElementById('ctTypeSelect');
  ctSort.value = state.listSort;
  ctDir.value = state.listDir;
  ctType.value = state.listType;
  updateContentTitle();

  body.innerHTML = '';

  if (!state.currentSubfolders.length && !state.currentItems.length) {
      var remoteStrip = document.getElementById('remoteStatusStrip');
      var remoteOffline = navigator.onLine === false || (remoteStrip && !remoteStrip.hidden && remoteStrip.dataset.state === 'offline');
      var snapshotMeta = null;
      try {
        snapshotMeta = JSON.parse(localStorage.getItem('eagle-viewer-offline-snapshot-meta') || 'null');
      } catch (e) {}
      if (remoteOffline) {
        body.innerHTML =
          '<div class="empty-state offline-state">' + iconFolderOutline() +
            '<strong>' + (snapshotMeta && snapshotMeta.savedAt ? 'この表示のスナップショットはありません' : 'リモート Vault に接続できません') + '</strong>' +
            '<span>' + (snapshotMeta && snapshotMeta.savedAt ? (new Date(snapshotMeta.savedAt).toLocaleString(getDateLocale()) + ' にスナップショットを保存しましたが、この表示はまだキャッシュされていません。') : 'ライブラリは空ではありません。VPN・NAS・リバースプロキシを確認してから再接続してください。') + '</span>' +
            '<div class="empty-actions"><button type="button" id="offlineEmptyRetryBtn">再接続</button><button type="button" id="offlineEmptySnapshotBtn">スナップショットを保存</button></div>' +
          '</div>';
        var retryBtn = document.getElementById('offlineEmptyRetryBtn');
        var snapshotBtn = document.getElementById('offlineEmptySnapshotBtn');
        if (retryBtn) retryBtn.onclick = function() {
          if (EagleViewer.modules.interactions && EagleViewer.modules.interactions.checkRemoteStatus) {
            EagleViewer.modules.interactions.checkRemoteStatus({ reload: false, quietStrip: false, message: 'リモート Vault を確認中…' });
          }
        };
        if (snapshotBtn) snapshotBtn.onclick = function() {
          if (api && api.warmCurrentOfflineSnapshot) api.warmCurrentOfflineSnapshot();
        };
      } else {
        body.innerHTML = '<div class="empty-state">' + iconFolderOutline() + '<span>' + (state.currentEmptyMsg || '素材がありません') + '</span></div>';
      }
    return;
  }

  if (state.viewMode === 'list') {
    var wrap = document.createElement('div');
    var banner = getOfflineSnapshotBannerHtml();
    if (banner) body.insertAdjacentHTML('beforeend', banner);
    body.appendChild(wrap);
    renderItemsList(state.currentSubfolders, state.currentItems, wrap, state.currentEmptyMsg);
    appendSubfoldersHint(wrap);
    setupListMarquee(wrap);
    bindOfflineSnapshotBanner();
  } else if (state.viewMode === 'justified') {
    var justifiedWrap = document.createElement('div');
    justifiedWrap.style.position = 'relative';
    var justifiedBanner = getOfflineSnapshotBannerHtml();
    if (justifiedBanner) body.insertAdjacentHTML('beforeend', justifiedBanner);
    body.appendChild(justifiedWrap);
    var gallery = document.createElement('div');
    gallery.className = 'justified-gallery';
    justifiedWrap.appendChild(gallery);
    state.currentSubfolders.forEach(function(sub) { renderFolderCard(sub, gallery); });
    state.currentItems.forEach(function(item) { renderItemCard(item, gallery); });
    appendSubfoldersHint(justifiedWrap);
    renderLoadMoreStatus(justifiedWrap);
    bindOfflineSnapshotBanner();
    applyJustifiedLayout(gallery);
  } else {
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    var bannerHtml = getOfflineSnapshotBannerHtml();
    if (bannerHtml) body.insertAdjacentHTML('beforeend', bannerHtml);
    body.appendChild(wrap);
    if (state.currentSubfolders.length) {
      var folderRail = document.createElement('div');
      folderRail.className = 'folder-rail';
      state.currentSubfolders.forEach(function(sub) { renderFolderCard(sub, folderRail); });
      wrap.appendChild(folderRail);
    }
    var masonry = document.createElement('div');
    masonry.className = 'masonry';
    if (useCompactGridLayout()) masonry.classList.add('compact-grid');
    applyMasonryColumnCount(masonry, state.currentItems.length);
    wrap.appendChild(masonry);
    state.currentItems.forEach(function(item) { renderItemCard(item, masonry); });
    appendSubfoldersHint(wrap);
    setupGridMarquee(wrap, masonry);
    bindOfflineSnapshotBanner();
  }
  updateCheckboxesInView();
  focusPendingItemWhenLoaded();
  updateReturnToCurrentItemButton();
}

function appendSubfoldersHint(container) {
  if (state.currentView !== 'folder' || state.currentItems.length || !state.currentSubfolders.length) return;
  var hint = document.createElement('div');
  hint.className = 'folder-hint';
  hint.textContent = 'このフォルダにはサブフォルダだけがあります。カードをクリックして開いてください';
  container.appendChild(hint);
}

function showEmptyState() {
  state.currentView = 'none';
  state.currentItems = [];
  state.currentSubfolders = [];
  state.currentFolderId = null;
  state.currentTagName = null;
  state.currentTitle = '';
  state.currentTotal = 0;
  var body = document.getElementById('contentBody');
  body.innerHTML = '<div class="empty-state" id="emptyState">' + iconFolderOutline() + '<span>サイドバーからフォルダを選んでください</span></div>';
  document.getElementById('contentToolbar').style.display = 'none';
  renderModule.closeInspector();
  updateUrlFromState();
}

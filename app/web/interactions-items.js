'use strict';

function findCurrentItem(itemId) {
  return (state.currentItems || []).find(function(item) { return item.id === itemId; }) ||
    (state.inspectorItem && state.inspectorItem.id === itemId ? state.inspectorItem : null);
}

async function restorePendingInspector() {
  if (!state.pendingItemId) return;
  var itemId = state.pendingItemId;
  var item = findCurrentItem(itemId);
  if (!item) {
    var resolved = await api.resolveItems([itemId]);
    item = resolved && resolved[0];
  }
  if (item && state.pendingItemId === itemId) render.openInspector(item);
}

function buildItemShareUrl(item) {
  var itemId = item && item.id ? item.id : '';
  if (!itemId) return location.href;
  var params = new URLSearchParams(location.hash ? location.hash.slice(1) : '');
  params.set('view', state.currentView || 'all');
  params.set('sort', state.listSort || 'mtime');
  params.set('dir', state.listDir || 'desc');
  params.set('type', state.listType || 'all');
  if (state.currentView === 'folder' && state.currentFolderId) params.set('id', state.currentFolderId);
  else params.delete('id');
  if (state.currentView === 'tag' && state.currentTagName) params.set('tag', state.currentTagName);
  else params.delete('tag');
  if (state.currentView === 'recent') params.set('days', String(state.recentDays || 7));
  else params.delete('days');
  if (state.currentView === 'search' && state.searchQuery) params.set('q', state.searchQuery);
  else params.delete('q');
  params.set('item', itemId);
  return location.origin + location.pathname + location.search + '#' + params.toString();
}

async function shareItemLink(item, button) {
  if (!item) return;
  var url = buildItemShareUrl(item);
  var title = item.name || 'Eagle Vault の素材';
  try {
    if (navigator.share && window.innerWidth <= 768) {
      await navigator.share({ title: title, text: title, url: url });
      showToast('共有メニューを開きました', 'success');
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      showToast('素材のリンクをコピーしました', 'success');
      if (button) {
        var label = button.querySelector('span') || button;
        var old = label.textContent;
        label.textContent = 'コピーしました';
        setTimeout(function() { label.textContent = old; }, 1200);
      }
    } else {
      window.prompt('素材のリンクをコピー', url);
      showToast('素材のリンクをコピーできます');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      showToast('素材のリンクをコピーしました', 'success');
    } else {
      window.prompt('素材のリンクをコピー', url);
      showToast('素材のリンクをコピーできます');
    }
  }
}

async function shareItemFile(item, button) {
  if (!item) return;
  if (isRemoteAccessUnavailable()) {
    showToast('元ファイルの共有にはリモート Vault への接続が必要です', 'error');
    return;
  }
  if (!navigator.share || !navigator.canShare || typeof File === 'undefined') {
    showToast('このブラウザは元ファイルを共有できません。ダウンロードを使ってください', 'error');
    return;
  }
  var maxShareBytes = 64 * 1024 * 1024;
  if (Number(item.size || 0) > maxShareBytes) {
    showToast('元ファイルが 64 MB を超えています。ダウンロードするか、ページのリンクを共有してください', 'error');
    return;
  }
  var label = button ? (button.querySelector('span') || button) : null;
  var oldLabel = label ? label.textContent : '';
  var oldDisabled = button ? button.disabled : false;
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
  }
  if (label) label.textContent = '準備中…';
  try {
    var response = await fetch(buildItemFileUrl(item), { cache: 'no-store' });
    if (handleAuthResponse(response)) return;
    if (response.status === 503) throw new Error('リモート Vault に接続できません');
    if (!response.ok) throw new Error('元ファイルを読み込めませんでした');
    var blob = await response.blob();
    if (blob.size > maxShareBytes) throw new Error('元ファイルが 64 MB を超えています。ダウンロードを使ってください');
    var file = new File([blob], buildItemDownloadName(item), { type: blob.type || 'application/octet-stream' });
    if (!navigator.canShare({ files: [file] })) throw new Error('このブラウザはこの種類のファイルを共有できません。ダウンロードを使ってください');
    await navigator.share({ files: [file], title: item.name || 'Eagle Vault の素材' });
    showToast('共有メニューに送りました', 'success');
    closeQuickActionSheet();
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    showToast((err && err.message) || '元ファイルを共有できませんでした。ダウンロードを使ってください', 'error');
  } finally {
    if (button && button.isConnected) {
      button.disabled = oldDisabled;
      button.classList.remove('is-loading');
    }
    if (label && label.isConnected) label.textContent = oldLabel;
  }
}

function buildItemFileUrl(item) {
  return API + '/api/items/' + item.id + '/file';
}

function buildAbsoluteItemFileUrl(item) {
  return new URL(buildItemFileUrl(item), location.href).href;
}

function buildItemDownloadName(item) {
  return (item.name || 'file') + (item.ext ? '.' + item.ext : '');
}

function buildItemInfoText(item) {
  if (!item) return '';
  var rows = [
    ['Name', item.name || ''],
    ['Type', item.ext ? item.ext.toUpperCase() : ''],
    ['Dimensions', item.width && item.height ? item.width + ' × ' + item.height : ''],
    ['Size', item.size ? formatSize(item.size) : ''],
    ['Duration', item.duration ? formatMediaDuration(item.duration) : ''],
    ['BPM', item.bpm ? String(Math.round(item.bpm)) : ''],
    ['Folders', (item.folderPaths || []).join(' ; ')],
    ['Tags', (item.tags || []).join(', ')],
    ['Created', item.btime ? formatDate(item.btime) : ''],
    ['Modified', item.mtime ? formatDate(item.mtime) : ''],
    ['Source', item.url || ''],
    ['Link', buildItemShareUrl(item)]
  ].filter(function(row) { return row[1]; });
  return rows.map(function(row) { return row[0] + ': ' + row[1]; }).join('\n');
}

function escapeMarkdownText(text) {
  return String(text || '').replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function escapeHtmlAttributeText(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildItemReferenceText(item, format) {
  if (!item) return '';
  var name = item.name || item.id || 'Eagle Vault asset';
  var shareUrl = buildItemShareUrl(item);
  var fileUrl = buildAbsoluteItemFileUrl(item);
  var source = item.url || '';
  var tags = (item.tags || []).join(', ');
  var dims = item.width && item.height ? item.width + ' × ' + item.height : '';

  if (format === 'html') {
    if (isImageExt(item.ext)) {
      var sizeAttrs = item.width && item.height ? ' width="' + item.width + '" height="' + item.height + '"' : '';
      return '<figure>\n  <img src="' + escapeHtmlAttributeText(fileUrl) + '" alt="' + escapeHtmlAttributeText(name) + '"' + sizeAttrs + ' />\n  <figcaption><a href="' + escapeHtmlAttributeText(shareUrl) + '">' + escapeHtml(name) + '</a></figcaption>\n</figure>';
    }
    return '<a href="' + escapeHtmlAttributeText(shareUrl) + '">' + escapeHtml(name) + '</a>';
  }

  if (format === 'text') {
    return [
      name,
      dims ? 'Dimensions: ' + dims : '',
      tags ? 'Tags: ' + tags : '',
      source ? 'Source: ' + source : '',
      'Viewer: ' + shareUrl,
      'File: ' + fileUrl
    ].filter(Boolean).join('\n');
  }

  var title = escapeMarkdownText(name);
  var lines = [];
  if (isImageExt(item.ext)) lines.push('![' + title + '](' + fileUrl + ')');
  else lines.push('[' + title + '](' + shareUrl + ')');
  if (dims || tags || source) {
    lines.push('');
    if (dims) lines.push('- Dimensions: ' + dims);
    if (tags) lines.push('- Tags: ' + escapeMarkdownText(tags));
    if (source) lines.push('- Source: ' + source);
    lines.push('- Viewer: ' + shareUrl);
  }
  return lines.join('\n');
}

async function copyTextToClipboard(text, title, button) {
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast((title || 'テキスト') + 'をコピーしました', 'success');
      if (button) {
        var label = button.querySelector('span') || button;
        var old = label.textContent;
        label.textContent = 'コピーしました';
        setTimeout(function() { label.textContent = old; }, 1200);
      }
    } else {
      window.prompt(title || 'テキストをコピー', text);
      showToast((title || 'テキスト') + 'をコピーできます');
    }
  } catch (err) {
    window.prompt(title || 'テキストをコピー', text);
    showToast((title || 'テキスト') + 'をコピーできます');
  }
}

function copyItemInfo(item, button) {
  copyTextToClipboard(buildItemInfoText(item), '素材の情報', button);
}

function copyItemReference(item, format, button) {
  var title = format === 'html' ? 'HTML 形式の参照' : (format === 'text' ? 'テキスト形式の参照' : 'Markdown 形式の参照');
  copyTextToClipboard(buildItemReferenceText(item, format), title, button);
}

function buildBatchLinksText(items) {
  return items.map(function(item) {
    return (item.name || item.id || 'Untitled') + '\n' + buildItemShareUrl(item);
  }).join('\n\n');
}

function buildBatchInfoText(items) {
  return items.map(function(item, idx) {
    return '# ' + (idx + 1) + ' · ' + (item.name || item.id || 'Untitled') + '\n' + buildItemInfoText(item);
  }).join('\n\n---\n\n');
}

function buildBatchReferencesText(items) {
  return items.map(function(item) {
    return buildItemReferenceText(item, 'markdown');
  }).join('\n\n');
}

function copySelectedLinks(button) {
  var items = getSelectedItems();
  if (!items.length) return;
  copyTextToClipboard(buildBatchLinksText(items), '素材のリンク', button);
}

function copySelectedInfo(button) {
  var items = getSelectedItems();
  if (!items.length) return;
  copyTextToClipboard(buildBatchInfoText(items), '素材の情報', button);
}

function copySelectedReferences(button) {
  var items = getSelectedItems();
  if (!items.length) return;
  copyTextToClipboard(buildBatchReferencesText(items), '素材の参照', button);
}

async function copyItemImage(id, button) {
  if (!id) return;
  if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
    showToast('ここでは画像をコピーできません。HTTPS で開いてください', 'error');
    return;
  }
  var old = button ? button.innerHTML : '';
  var url = API + '/api/items/' + id + '/file';
  try {
    var response = await fetch(url);
    var blob = await response.blob();
    var type = blob.type || 'image/png';
    if (!type.startsWith('image/')) type = 'image/png';
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    showToast('画像をクリップボードにコピーしました', 'success');
    if (button) {
      button.innerHTML = iconCopy() + ' コピーしました';
      setTimeout(function() { button.innerHTML = old; }, 1500);
    }
  } catch (err) {
    showToast('画像をコピーできませんでした。HTTPS か対応ブラウザで開いてください', 'error');
  }
}

function getPrimaryItemFolder(item) {
  var folderId = ((item && item.folders) || [])[0] || '';
  if (!folderId) return null;
  var path = ((item && item.folderPaths) || [])[0] || folderId;
  var parts = String(path).split(' / ').filter(Boolean);
  return {
    id: folderId,
    label: parts.length ? parts[parts.length - 1] : path
  };
}

function openFolderAndFocus(folderId, itemId) {
  if (!folderId) return;
  if (itemId) {
    state.pendingFocusItemId = itemId;
    state.pendingFocusLoads = 0;
  }
  var search = document.getElementById('searchInput');
  if (search) search.value = '';
  clearAllActive();
  render.closeInspector();
  api.loadFolderItems(folderId).then(function() {
    if (render.syncActiveNavigationState) render.syncActiveNavigationState();
    if (render.focusPendingItemWhenLoaded) render.focusPendingItemWhenLoaded();
  });
}

function openItemFolder(item) {
  var folder = getPrimaryItemFolder(item);
  if (!folder || !folder.id) {
    showToast('この素材はどのフォルダにも入っていません', 'error');
    return;
  }
  closeQuickActionSheet();
  closeDesktopContextMenu();
  openFolderAndFocus(folder.id, item.id);
}

function isRemoteAccessUnavailable() {
  var strip = document.getElementById('remoteStatusStrip');
  return navigator.onLine === false || !!(strip && !strip.hidden && strip.dataset.state === 'offline');
}

function runItemAction(item, action, sourceEl) {
  if (!item || !action) return;
  var fileUrl = buildItemFileUrl(item);
  if (action === 'preview') {
    if (isItemPreviewable(item)) render.previewItem(item, fileUrl);
    else window.open(fileUrl, '_blank');
  } else if (action === 'inspect') {
    render.openInspector(item);
  } else if (action === 'folder') {
    openItemFolder(item);
  } else if (action === 'source') {
    var sourceDomain = getItemSourceDomain(item);
    if (!sourceDomain) {
      showToast('この素材には出典サイトがありません', 'error');
      return;
    }
    closeQuickActionSheet();
    closeDesktopContextMenu();
    openSourceDomainView(sourceDomain);
  } else if (action === 'select') {
    if (render.toggleSelect) render.toggleSelect(item.id);
    var selectSheet = document.getElementById('quickActionSheet');
    if (selectSheet) updateQuickActionSheetState(selectSheet, item);
    var selectMenu = document.getElementById('itemContextMenu');
    if (selectMenu) updateDesktopContextMenuState(selectMenu, item);
  } else if (action === 'share') {
    shareItemLink(item, sourceEl);
  } else if (action === 'share-file') {
    shareItemFile(item, sourceEl);
  } else if (action === 'copy') {
    copyItemImage(item.id, sourceEl);
  } else if (action === 'copy-info') {
    copyItemInfo(item, sourceEl);
  } else if (action === 'copy-md' || action === 'copy-html' || action === 'copy-ref') {
    copyItemReference(item, action === 'copy-html' ? 'html' : (action === 'copy-ref' ? 'text' : 'markdown'), sourceEl);
  } else if (action === 'download') {
    if (isRemoteAccessUnavailable()) {
      showToast('元ファイルのダウンロードにはリモート Vault への接続が必要です', 'error');
      return;
    }
    var resetDownloadButton = null;
    if (sourceEl) {
      var oldDisabled = sourceEl.disabled;
      sourceEl.classList.add('is-loading');
      sourceEl.disabled = true;
      var label = sourceEl.querySelector('span');
      var oldLabel = label ? label.textContent : '';
      if (label) label.textContent = 'ダウンロード中';
      resetDownloadButton = function() {
        if (!sourceEl.isConnected) return;
        sourceEl.classList.remove('is-loading');
        sourceEl.disabled = oldDisabled;
        if (label && label.isConnected) label.textContent = oldLabel;
      };
    }
    var a = document.createElement('a');
    a.href = fileUrl + '?download=true';
    a.download = buildItemDownloadName(item);
    a.click();
    showToast('ダウンロードを開始しました', 'success');
    if (resetDownloadButton) setTimeout(resetDownloadButton, 1200);
    closeQuickActionSheet();
  }
}

window._runItemAction = runItemAction;

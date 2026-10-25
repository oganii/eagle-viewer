'use strict';

var apiModule = EagleViewer.modules.api = EagleViewer.modules.api || {};

// ===== Inspector panel =====
function openInspector(item) {
  if (isBatchSelectionMode()) return;
  if (EagleViewer.modules.interactions && EagleViewer.modules.interactions.rememberViewedItem) {
    EagleViewer.modules.interactions.rememberViewedItem(item);
  }
  state.inspectorItem = item;
  renderModule.hideHoverPreview();
  state.pendingItemId = item && item.id ? item.id : '';
  rememberFocusedItem(item);
  var panel = document.getElementById('inspector');
  var inner = document.getElementById('inspectorInner');
  var actions = document.getElementById('inspectorActions');
  var thumbUrl = API + '/api/items/' + item.id + '/thumbnail';
  var fileUrl = API + '/api/items/' + item.id + '/file';
  var fileUrlDownload = fileUrl + '?download=true';
  var downloadName = (item.name || 'file') + (item.ext ? '.' + item.ext : '');

  var html = '';

  html += '<div class="inspector-preview" id="inspectorPreview"></div>';

  html += '<div class="inspector-identity">';
  html += '<div class="inspector-kind">' + escapeHtml(getInspectorTypeLabel(item)) + '</div>';
  html += '<h2>' + escapeHtml(item.name || '名称未設定の素材') + '</h2>';
  html += '<div class="inspector-file-line">' + escapeHtml(downloadName) + '</div>';
  var statusPills = renderInspectorStatusPills(item);
  if (statusPills) html += '<div class="inspector-status-row">' + statusPills + '</div>';
  html += '</div>';

  html += '<div class="inspector-fields">';

  var specHtml = '';
  specHtml += renderInspectorSpec('形式', item.ext ? '<span class="inspector-badge">' + escapeHtml(item.ext.toUpperCase()) + '</span>' : '—', 'format');
  specHtml += renderInspectorSpec('サイズ', item.size ? escapeHtml(formatSize(item.size)) : '—');
  if (item.width && item.height) specHtml += renderInspectorSpec('寸法', escapeHtml(item.width + ' × ' + item.height));
  if (item.duration) specHtml += renderInspectorSpec('再生時間', escapeHtml(formatMediaDuration(item.duration)));
  if (item.bpm) specHtml += renderInspectorSpec('BPM', escapeHtml(String(Math.round(item.bpm))));
  specHtml += renderInspectorSpec('作成日時', escapeHtml(formatDate(item.btime)));
  specHtml += renderInspectorSpec('更新日時', escapeHtml(formatDate(item.mtime)));
  html += renderInspectorSection('仕様', '<div class="inspector-spec-grid">' + specHtml + '</div>');

  var paths = item.folderPaths || [];
  var locationHtml = '';
  locationHtml += renderInspectorField('フォルダ', paths.length ? '<div class="inspector-path-list">' + renderInspectorFolderLinks(item) + '</div>' : '<span class="inspector-muted">未分類</span>');
  locationHtml += renderInspectorField('タグ', (item.tags && item.tags.length) ? '<div class="inspector-tags">' + renderInspectorTagLinks(item.tags) + '</div>' : '<span class="inspector-muted">タグなし</span>');
  html += renderInspectorSection('場所', locationHtml);

  var contextHtml = '';
  var sourceHtml = '<span class="inspector-muted">出典の記録なし</span>';
  if (item.url) {
    var safeUrl = safeExternalUrl(item.url);
    var sourceLabel = escapeHtml(item.url.length > 80 ? item.url.substring(0, 80) + '…' : item.url);
    sourceHtml = safeUrl
      ? '<a class="inspector-source-link" href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener">' + sourceLabel + ' ' + iconExternalLink() + '</a>'
      : '<span class="inspector-source-link inspector-source-plain">' + sourceLabel + '</span>';
  }
  contextHtml += renderInspectorField('出典', sourceHtml);
  contextHtml += renderInspectorField('Eagle のメモ', item.annotation ? '<div class="inspector-note">' + escapeHtml(item.annotation) + '</div>' : '<span class="inspector-muted">Eagle のメモなし</span>');
  html += renderInspectorSection('情報', contextHtml);

  html += '</div>';
  inner.innerHTML = html;
  renderInspectorMobileSummary(item);
  renderInspectorPreview(document.getElementById('inspectorPreview'), item, thumbUrl, fileUrl);
  bindInspectorPreviewAction(item, fileUrl);

  var actionsHtml = '';
  if (isItemPreviewable(item)) {
    actionsHtml += '<button type="button" class="primary inspector-action-main" onclick="window._previewInspectorItem()">' + iconEye() + ' プレビュー</button>';
  }
  actionsHtml += '<details class="inspector-more inspector-action-more"><summary aria-label="その他の操作">その他</summary><div class="inspector-more-menu">';
  var downloadDisabled = isRemoteAccessUnavailableForRender();
  actionsHtml += '<button type="button" class="btn-download-original' + (downloadDisabled ? ' requires-remote' : '') + '" data-id="' + escapeHtml(item.id) + '"' + (downloadDisabled ? ' disabled title="元ファイルのダウンロードにはリモート Vault への接続が必要です"' : '') + '>' + iconDownload() + ' ' + (downloadDisabled ? 'オフライン' : 'ダウンロード') + '</button>';
  actionsHtml += '<button type="button" class="btn-share-link" data-id="' + escapeHtml(item.id) + '">' + iconExternalLink() + ' リンクを共有</button>';
  if (canCopyImage(item.ext)) actionsHtml += '<button type="button" class="btn-copy" data-id="' + escapeHtml(item.id) + '">' + iconCopy() + ' コピー</button>';
  actionsHtml += '</div></details>';
  actions.innerHTML = actionsHtml;

  panel.classList.add('open');
  panel.classList.remove('mobile-expanded');
  document.body.classList.add('inspector-open');
  setupInspectorSwipe();
  requestAnimationFrame(refreshMasonryLayout);
  updateInspectorNav();
  syncFocusedItem(item.id);
  updateReturnToCurrentItemButton();
  updateUrlFromState();

  // Collection responses intentionally omit the potentially large note field.
  // Hydrate the inspector only when the user opens it.
  if (!Object.prototype.hasOwnProperty.call(item, 'annotation') && apiModule && apiModule.fetchItemDetail) {
    apiModule.fetchItemDetail(item.id).then(function(detail) {
      if (!detail || !state.inspectorItem || state.inspectorItem.id !== item.id) return;
      openInspector(Object.assign({}, item, detail));
    }).catch(function() {});
  }
}

window._previewInspectorItem = function() {
  if (state.inspectorItem) {
    var fileUrl = API + '/api/items/' + state.inspectorItem.id + '/file';
    renderModule.previewItem(state.inspectorItem, fileUrl);
  }
};

function closeInspector() {
  var focusItemId = state.inspectorItem && state.inspectorItem.id;
  var panel = document.getElementById('inspector');
  panel.classList.remove('open', 'mobile-expanded', 'sheet-dragging');
  panel.style.transform = '';
  document.body.classList.remove('inspector-open');
  var summary = document.getElementById('inspectorMobileSummary');
  if (summary) summary.innerHTML = '';
  state.inspectorItem = null;
  state.pendingItemId = '';
  requestAnimationFrame(refreshMasonryLayout);
  updateInspectorNav();
  updateUrlFromState();
  requestAnimationFrame(function() { returnFocusToItem(focusItemId); });
}

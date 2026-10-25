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
  var thumbUrl = itemThumbUrl(item.id);
  var fileUrl = itemFileUrl(item.id);
  var fileUrlDownload = itemFileUrl(item.id, true);
  var downloadName = (item.name || 'file') + (item.ext ? '.' + item.ext : '');

  var html = '';

  html += '<div class="inspector-preview" id="inspectorPreview"></div>';

  html += '<div class="inspector-identity">';
  html += '<div class="inspector-kind">' + escapeHtml(getInspectorTypeLabel(item)) + '</div>';
  html += '<h2>' + escapeHtml(item.name || '名称未設定の素材') + '</h2>';
  html += '<div class="inspector-file-line">' + escapeHtml(downloadName) + '</div>';
  html += '<div class="inspector-rating" id="inspectorRating">' + renderStarRow(item.star, isCurrentLibraryEditable()) + '</div>';
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
  bindInspectorRating(item);
  renderInspectorPreview(document.getElementById('inspectorPreview'), item, thumbUrl, fileUrl);
  bindInspectorPreviewAction(item, fileUrl);

  var actionsHtml = '';
  if (isItemPreviewable(item)) {
    actionsHtml += '<button type="button" class="primary inspector-action-main" onclick="window._previewInspectorItem()">' + iconEye() + ' プレビュー</button>';
  }
  actionsHtml += '<details class="inspector-more inspector-action-more"><summary aria-label="その他の操作">その他</summary><div class="inspector-more-menu">';
  var downloadDisabled = isRemoteAccessUnavailableForRender();
  actionsHtml += '<button type="button" class="btn-download-original' + (downloadDisabled ? ' requires-remote' : '') + '" data-id="' + escapeHtml(item.id) + '"' + (downloadDisabled ? ' disabled title="オリジナルのダウンロードにはリモート Vault への接続が必要です"' : '') + '>' + iconDownload() + ' ' + (downloadDisabled ? 'オフライン' : 'ダウンロード') + '</button>';
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

// ===== Star rating (inspector) =====
function bindInspectorRating(item) {
  var holder = document.getElementById('inspectorRating');
  if (!holder) return;
  holder.onclick = function(event) {
    var button = event.target.closest('[data-star-value]');
    if (!button || !isCurrentLibraryEditable()) return;
    changeItemStar(item.id, Number(button.dataset.starValue));
  };
}

// Reflect a rating in every rendered place (cards, list rows, inspector, cached item objects).
function updateItemStarEverywhere(itemId, star) {
  (state.currentItems || []).forEach(function(candidate) { if (candidate.id === itemId) candidate.star = star; });
  if (state.inspectorItem && state.inspectorItem.id === itemId) {
    state.inspectorItem.star = star;
    var holder = document.getElementById('inspectorRating');
    if (holder) holder.innerHTML = renderStarRow(star, isCurrentLibraryEditable());
  }
  document.querySelectorAll('.card[data-item-id], tr.item-row[data-item-id]').forEach(function(el) {
    if (el.dataset.itemId !== itemId) return;
    var old = el.querySelector('.star-badge');
    var html = renderStarBadge(star);
    if (el.tagName === 'TR') {
      var wrap = el.querySelector('.list-name-wrap');
      if (old) old.remove();
      if (wrap && html) wrap.insertAdjacentHTML('beforeend', html);
      return;
    }
    var holderEl = el.querySelector('.card-star');
    if (!html) { if (holderEl) holderEl.remove(); return; }
    if (!holderEl) {
      holderEl = document.createElement('div');
      holderEl.className = 'card-star';
      var thumb = el.querySelector('.card-thumb');
      if (thumb) thumb.appendChild(holderEl);
    }
    holderEl.innerHTML = html;
  });
}

var starWriteGeneration = {};

// Optimistic update; rolls back and shows the server's (Japanese) message on failure.
async function changeItemStar(itemId, clickedValue) {
  var current = state.inspectorItem && state.inspectorItem.id === itemId ? state.inspectorItem : (state.currentItems || []).find(function(c) { return c.id === itemId; });
  var previous = normalizeStar(current && current.star);
  var next = nextStarValue(previous, clickedValue);
  var generation = (starWriteGeneration[itemId] || 0) + 1;
  starWriteGeneration[itemId] = generation;
  updateItemStarEverywhere(itemId, next);
  try {
    var updated = await apiModule.setItemStar(itemId, next);
    if (starWriteGeneration[itemId] !== generation) return;
    if (updated) updateItemStarEverywhere(itemId, normalizeStar(updated.star));
    if (window.showToast) window.showToast(t('rating_saved'), 'success');
  } catch (error) {
    if (starWriteGeneration[itemId] !== generation) return;
    updateItemStarEverywhere(itemId, previous);
    if (window.showToast) window.showToast((error && error.detail) || t('rating_failed'), 'error');
  }
}

window._previewInspectorItem = function() {
  if (state.inspectorItem) {
    var fileUrl = itemFileUrl(state.inspectorItem.id);
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

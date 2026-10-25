'use strict';

function createAudioPreviewCard(item, fileUrl, overlay) {
  var card = document.createElement('div');
  card.className = 'preview-audio-card';
  var meta = [];
  if (item.ext) meta.push(String(item.ext).toUpperCase());
  if (item.duration) meta.push(formatMediaDuration(item.duration));
  if (item.bpm) meta.push(Math.round(item.bpm) + ' BPM');
  if (item.size) meta.push(formatSize(item.size));
  card.innerHTML =
    '<div class="preview-audio-art">' + iconPlay() + '<i></i><i></i><i></i><i></i></div>' +
    '<div class="preview-audio-main">' +
      '<span>音声プレビュー</span>' +
      '<strong>' + escapeHtml(item.name || '名称未設定の音声') + '</strong>' +
      '<small>' + escapeHtml(meta.join(' · ') || 'Audio') + '</small>' +
    '</div>';
  var audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'metadata';
  audio.src = fileUrl;
  audio.onloadedmetadata = function() { clearPreviewStatus(overlay); };
  audio.onerror = function() { setPreviewStatus(overlay, '音声をプレビューできませんでした。ダウンロードして確認してください'); };
  card.appendChild(audio);
  return card;
}

function renderOoxmlTable(rows, columns, compact) {
  var visibleRows = (rows || []).slice(0, compact ? 6 : 60);
  var visibleColumns = (columns || []).slice(0, compact ? 6 : 20);
  if (!visibleRows.length || !visibleColumns.length) return '<div class="ooxml-empty">このスプレッドシートに表示できるセルはありません</div>';
  var head = '<th class="row-number"></th>' + visibleColumns.map(function(column) { return '<th>' + escapeHtml(column) + '</th>'; }).join('');
  var body = visibleRows.map(function(row, rowIndex) {
    return '<tr><th class="row-number">' + (rowIndex + 1) + '</th>' + visibleColumns.map(function(_, columnIndex) {
      return '<td title="' + escapeHtml(row[columnIndex] || '') + '">' + escapeHtml(row[columnIndex] || '') + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="ooxml-sheet-scroll"><table class="ooxml-sheet-grid"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function renderOoxmlDocx(preview, compact) {
  var blocks = (preview.blocks || []).slice(0, compact ? 5 : 120);
  if (!blocks.length) return '<div class="ooxml-empty">この文書から取り出せるテキストはありません</div>';
  return '<article class="ooxml-doc-page">' + blocks.map(function(block) {
    if (block.type === 'table') return '<div class="ooxml-doc-table">' + renderOoxmlTable(block.rows || [], (block.rows && block.rows[0] || []).map(function(_, index) { return String(index + 1); }), compact) + '</div>';
    if (block.type === 'heading') {
      var level = Math.max(1, Math.min(6, Number(block.level) || 1));
      return '<h' + level + '>' + escapeHtml(block.text || '') + '</h' + level + '>';
    }
    return '<p>' + escapeHtml(block.text || '') + '</p>';
  }).join('') + '</article>';
}

function renderOoxmlXlsx(preview, compact) {
  var tabs = (preview.sheetNames || []).slice(0, compact ? 2 : 8).map(function(name, index) {
    return '<span class="ooxml-sheet-tab' + (index === 0 ? ' active' : '') + '">' + escapeHtml(name) + '</span>';
  }).join('');
  return '<div class="ooxml-workbook"><div class="ooxml-sheet-tabs">' + tabs + '</div>' + renderOoxmlTable(preview.rows || [], preview.columns || [], compact) + '</div>';
}

function renderOoxmlPptx(preview, compact) {
  var slides = (preview.slides || []).slice(0, compact ? 1 : 12);
  if (!slides.length) return '<div class="ooxml-empty">このプレゼンテーションから取り出せるテキストはありません</div>';
  return '<div class="ooxml-slide-deck">' + slides.map(function(slide) {
    var lines = (slide.lines || []).slice(0, compact ? 5 : 40);
    return '<article class="ooxml-slide"><span class="ooxml-slide-number">' + String(slide.number || '') + '</span>' +
      '<div><h2>' + escapeHtml(slide.title || ('Slide ' + slide.number)) + '</h2>' +
      lines.slice(1).map(function(line) { return '<p>' + escapeHtml(line) + '</p>'; }).join('') + '</div></article>';
  }).join('') + '</div>';
}

function renderXmindTopic(topic, depth, budget) {
  if (!topic || budget.remaining <= 0) return '';
  budget.remaining -= 1;
  var children = (topic.children || []).filter(Boolean);
  var childHtml = '';
  if (depth < budget.maxDepth && children.length && budget.remaining > 0) {
    childHtml = '<ul>' + children.map(function(child) {
      var branch = renderXmindTopic(child, depth + 1, budget);
      return branch ? '<li>' + branch + '</li>' : '';
    }).join('') + '</ul>';
  }
  return '<div class="xmind-topic depth-' + Math.min(depth, 6) + '"><span>' + escapeHtml(topic.title || '名称未設定のトピック') + '</span></div>' + childHtml;
}

function renderXmindPreview(preview, compact) {
  var sheets = (preview.sheets || []).slice(0, compact ? 1 : 8);
  if (!sheets.length) return '<div class="ooxml-empty">このマインドマップに読めるトピックはありません</div>';
  var budget = { remaining: compact ? 18 : 360, maxDepth: compact ? 2 : 12 };
  return '<div class="xmind-deck">' + sheets.map(function(sheet, sheetIndex) {
    if (budget.remaining <= 0) return '';
    return '<article class="xmind-sheet">' +
      '<header><span>CANVAS ' + String(sheetIndex + 1).padStart(2, '0') + '</span><strong>' + escapeHtml(sheet.title || ('キャンバス ' + (sheetIndex + 1))) + '</strong></header>' +
      '<div class="xmind-map"><div class="xmind-tree">' + renderXmindTopic(sheet.root, 0, budget) + '</div></div>' +
    '</article>';
  }).join('') + '</div>';
}

function renderDocumentPreviewContent(preview, compact) {
  if (!preview) return '<div class="ooxml-empty">文書の構造を読み込めませんでした</div>';
  if (preview.kind === 'doc') return renderOoxmlDocx(preview, compact);
  if (preview.kind === 'docx') return renderOoxmlDocx(preview, compact);
  if (preview.kind === 'xlsx') return renderOoxmlXlsx(preview, compact);
  if (preview.kind === 'pptx') return renderOoxmlPptx(preview, compact);
  if (preview.kind === 'xmind') return renderXmindPreview(preview, compact);
  return '<div class="ooxml-empty">この文書の構造にはまだ対応していません</div>';
}

function getDocumentPreviewSummary(preview) {
  if (!preview) return '構造のプレビュー（読み取り専用）';
  var summary = preview.summary || {};
  if (preview.kind === 'doc') return (summary.blocks || 0) + ' 段落 · 旧形式の Word';
  if (preview.kind === 'docx') return (summary.blocks || 0) + ' ブロック';
  if (preview.kind === 'xlsx') return (preview.activeSheet || '最初のシート') + ' · ' + (summary.rows || 0) + ' × ' + (summary.columns || 0);
  if (preview.kind === 'pptx') return (summary.slides || 0) + ' 枚のスライド';
  if (preview.kind === 'xmind') return (summary.sheets || 0) + ' キャンバス · ' + (summary.nodes || 0) + ' トピック';
  return '構造のプレビュー（読み取り専用）';
}

// Keep the remote preview deliberately small: fit, zoom out, and zoom in.
function addImagePreviewTools(overlay, img) {
  var scale = 1;
  var toolbar = document.createElement('div');
  toolbar.className = 'preview-tools preview-image-tools';
  toolbar.setAttribute('aria-label', '画像プレビューのツール');
  toolbar.innerHTML =
    '<button type="button" data-preview-tool="zoom-out" aria-label="縮小">−</button>' +
    '<button type="button" data-preview-tool="fit">全体</button>' +
    '<button type="button" data-preview-tool="zoom-in" aria-label="拡大">＋</button>';

  function applyScale() {
    if (scale === 1) {
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.width = '';
      img.style.height = '';
      img.classList.remove('is-zoomed');
      return;
    }
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.width = Math.max(1, img.naturalWidth * scale) + 'px';
    img.style.height = Math.max(1, img.naturalHeight * scale) + 'px';
    img.classList.add('is-zoomed');
  }
  function loadOriginalPreviewImage(after) {
    var originalSrc = img.dataset && img.dataset.previewOriginalSrc;
    if (!originalSrc || img.dataset.previewOriginalLoaded === '1') {
      if (after) after();
      return;
    }
    if (img.dataset.previewOriginalLoading === '1') return;
    img.dataset.previewOriginalLoading = '1';
    var original = new Image();
    original.onload = function() {
      img.dataset.previewOriginalLoading = '0';
      img.dataset.previewOriginalLoaded = '1';
      img.src = originalSrc;
      if (after) after();
    };
    original.onerror = function() {
      img.dataset.previewOriginalLoading = '0';
      if (after) after();
    };
    original.src = originalSrc;
  }

  toolbar.querySelector('[data-preview-tool="zoom-out"]').onclick = function(event) {
    event.stopPropagation();
    scale = Math.max(0.25, scale - 0.25);
    applyScale();
  };
  toolbar.querySelector('[data-preview-tool="fit"]').onclick = function(event) {
    event.stopPropagation();
    scale = 1;
    applyScale();
  };
  toolbar.querySelector('[data-preview-tool="zoom-in"]').onclick = function(event) {
    event.stopPropagation();
    scale = Math.min(4, scale + 0.25);
    applyScale();
  };
  overlay.appendChild(toolbar);
}

async function previewItem(item, fileUrl) {
  rememberFocusedItem(item);
  if (EagleViewer.modules.interactions && EagleViewer.modules.interactions.rememberViewedItem) {
    EagleViewer.modules.interactions.rememberViewedItem(item);
  }
  var ext = (item.ext || '').toLowerCase();
  var isVideo = PREVIEW_VIDEO_EXTS.indexOf(ext) >= 0;
  var isAudio = PREVIEW_AUDIO_EXTS.indexOf(ext) >= 0;
  var isImage = PREVIEW_IMAGE_EXTS.indexOf(ext) >= 0;
  var isPdf = ext === 'pdf';
  var isText = ext === 'txt';
  var el;
  var overlay;
  if (isVideo) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    setPreviewStatus(overlay, '動画を読み込み中…');
    el = document.createElement('video');
    el.controls = true;
    el.preload = 'metadata';
    el.autoplay = true;
    el.src = fileUrl;
    el.onloadeddata = function() { clearPreviewStatus(overlay); };
    el.onerror = function() { setPreviewStatus(overlay, '動画をプレビューできませんでした。ダウンロードして確認してください'); };
  } else if (isAudio) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    setPreviewStatus(overlay, '音声を読み込み中…');
    el = createAudioPreviewCard(item, fileUrl, overlay);
  } else if (isImage) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    setPreviewStatus(overlay, '画像を読み込み中…');
    el = document.createElement('img');
    var thumbnailUrl = API + '/api/items/' + encodeURIComponent(item.id || '') + '/thumbnail';
    var usingThumbnailFallback = false;
    var imageScroll = document.createElement('div');
    imageScroll.className = 'preview-image-scroll';
    el.dataset.previewSource = 'original';
    el.src = fileUrl;
    el.onload = function() {
      clearPreviewStatus(overlay);
    };
    el.onerror = function() {
      if (!usingThumbnailFallback && item.id) {
        usingThumbnailFallback = true;
        el.dataset.previewSource = 'thumbnail';
        setPreviewStatus(overlay, 'オリジナルを開けないため、サムネイルを表示します…');
        el.src = thumbnailUrl;
        return;
      }
      setPreviewStatus(overlay, '画像をプレビューできません。リモート Vault に再接続してからもう一度お試しください');
    };
    addImagePreviewTools(overlay, el);
  } else if (isPdf) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    setPreviewStatus(overlay, 'PDF を読み込み中…');
    el = document.createElement('iframe');
    el.src = fileUrl;
    el.loading = 'lazy';
    el.title = item.name || 'PDF Preview';
    el.onload = function() { clearPreviewStatus(overlay); };
  } else if (isText) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    var pre = document.createElement('pre');
    pre.textContent = '読み込み中…';
    overlay.appendChild(pre);
    try {
      var response = await fetch(fileUrl);
      if (handleAuthResponse(response)) {
        closePreviewOverlay(overlay);
        return;
      }
      if (!response.ok) throw new Error('テキストを読み込めませんでした');
      pre.textContent = await response.text();
    } catch (err) {
      pre.textContent = 'テキストをプレビューできませんでした：' + (err && err.message ? err.message : 'ダウンロードして確認してください');
    }
    return;
  } else {
    window.open(fileUrl, '_blank');
    return;
  }
  if (isImage) {
    imageScroll.appendChild(el);
    overlay.appendChild(imageScroll);
  } else {
    overlay.appendChild(el);
  }
}

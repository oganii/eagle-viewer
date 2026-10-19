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
      '<span>Audio Preview</span>' +
      '<strong>' + escapeHtml(item.name || 'Untitled audio') + '</strong>' +
      '<small>' + escapeHtml(meta.join(' · ') || 'Audio') + '</small>' +
    '</div>';
  var audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'metadata';
  audio.src = fileUrl;
  audio.onloadedmetadata = function() { clearPreviewStatus(overlay); };
  audio.onerror = function() { setPreviewStatus(overlay, 'Audio preview failed; download to view'); };
  card.appendChild(audio);
  return card;
}

function renderOoxmlTable(rows, columns, compact) {
  var visibleRows = (rows || []).slice(0, compact ? 6 : 60);
  var visibleColumns = (columns || []).slice(0, compact ? 6 : 20);
  if (!visibleRows.length || !visibleColumns.length) return '<div class="ooxml-empty">No cells to display in this spreadsheet</div>';
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
  if (!blocks.length) return '<div class="ooxml-empty">No extractable text in this document</div>';
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
  if (!slides.length) return '<div class="ooxml-empty">No extractable text in this presentation</div>';
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
  return '<div class="xmind-topic depth-' + Math.min(depth, 6) + '"><span>' + escapeHtml(topic.title || 'Untitled topic') + '</span></div>' + childHtml;
}

function renderXmindPreview(preview, compact) {
  var sheets = (preview.sheets || []).slice(0, compact ? 1 : 8);
  if (!sheets.length) return '<div class="ooxml-empty">No readable topics in this mind map</div>';
  var budget = { remaining: compact ? 18 : 360, maxDepth: compact ? 2 : 12 };
  return '<div class="xmind-deck">' + sheets.map(function(sheet, sheetIndex) {
    if (budget.remaining <= 0) return '';
    return '<article class="xmind-sheet">' +
      '<header><span>CANVAS ' + String(sheetIndex + 1).padStart(2, '0') + '</span><strong>' + escapeHtml(sheet.title || ('Canvas ' + (sheetIndex + 1))) + '</strong></header>' +
      '<div class="xmind-map"><div class="xmind-tree">' + renderXmindTopic(sheet.root, 0, budget) + '</div></div>' +
    '</article>';
  }).join('') + '</div>';
}

function renderDocumentPreviewContent(preview, compact) {
  if (!preview) return '<div class="ooxml-empty">Unable to read document structure</div>';
  if (preview.kind === 'doc') return renderOoxmlDocx(preview, compact);
  if (preview.kind === 'docx') return renderOoxmlDocx(preview, compact);
  if (preview.kind === 'xlsx') return renderOoxmlXlsx(preview, compact);
  if (preview.kind === 'pptx') return renderOoxmlPptx(preview, compact);
  if (preview.kind === 'xmind') return renderXmindPreview(preview, compact);
  return '<div class="ooxml-empty">This document structure isn’t supported yet</div>';
}

function getDocumentPreviewSummary(preview) {
  if (!preview) return 'Read-only structure preview';
  var summary = preview.summary || {};
  if (preview.kind === 'doc') return (summary.blocks || 0) + ' readable paragraphs · Legacy Word';
  if (preview.kind === 'docx') return (summary.blocks || 0) + ' content blocks';
  if (preview.kind === 'xlsx') return (preview.activeSheet || 'First sheet') + ' · ' + (summary.rows || 0) + ' × ' + (summary.columns || 0);
  if (preview.kind === 'pptx') return (summary.slides || 0) + ' slides';
  if (preview.kind === 'xmind') return (summary.sheets || 0) + ' canvases · ' + (summary.nodes || 0) + ' topics';
  return 'Read-only structure preview';
}

// Keep the remote preview deliberately small: fit, zoom out, and zoom in.
function addImagePreviewTools(overlay, img) {
  var scale = 1;
  var toolbar = document.createElement('div');
  toolbar.className = 'preview-tools preview-image-tools';
  toolbar.setAttribute('aria-label', 'Image preview tools');
  toolbar.innerHTML =
    '<button type="button" data-preview-tool="zoom-out" aria-label="Zoom out">−</button>' +
    '<button type="button" data-preview-tool="fit">Fit</button>' +
    '<button type="button" data-preview-tool="zoom-in" aria-label="Zoom in">＋</button>';

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
    setPreviewStatus(overlay, 'Loading video…');
    el = document.createElement('video');
    el.controls = true;
    el.preload = 'metadata';
    el.autoplay = true;
    el.src = fileUrl;
    el.onloadeddata = function() { clearPreviewStatus(overlay); };
    el.onerror = function() { setPreviewStatus(overlay, 'Video preview failed; download to view'); };
  } else if (isAudio) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    setPreviewStatus(overlay, 'Loading audio…');
    el = createAudioPreviewCard(item, fileUrl, overlay);
  } else if (isImage) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    setPreviewStatus(overlay, 'Loading image…');
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
        setPreviewStatus(overlay, 'Original unavailable, opening thumbnail…');
        el.src = thumbnailUrl;
        return;
      }
      setPreviewStatus(overlay, 'Image preview unavailable; reconnect to the remote Vault and try again');
    };
    addImagePreviewTools(overlay, el);
  } else if (isPdf) {
    overlay = createPreviewOverlay();
    overlay.dataset.previewItemId = item.id || '';
    addPreviewInfoHud(overlay, item);
    addPreviewNavigation(overlay, item);
    addPreviewMobileActions(overlay, item);
    setPreviewStatus(overlay, 'Loading PDF…');
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
    pre.textContent = 'Loading…';
    overlay.appendChild(pre);
    try {
      var response = await fetch(fileUrl);
      if (handleAuthResponse(response)) {
        closePreviewOverlay(overlay);
        return;
      }
      if (!response.ok) throw new Error('Unable to read text content');
      pre.textContent = await response.text();
    } catch (err) {
      pre.textContent = 'Text preview failed: ' + (err && err.message ? err.message : 'download to view');
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

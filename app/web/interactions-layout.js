'use strict';

// ===== View mode =====
function setViewMode(mode, skipPersist) {
  if (['grid', 'list'].indexOf(mode) < 0) mode = 'grid';
  state.viewMode = mode;
  if (!skipPersist) {
    try { localStorage.setItem(getViewModeStorageKey(), mode); } catch (e) {}
  }
  var gridBtn = document.getElementById('viewGrid');
  var justifiedBtn = document.getElementById('viewJustified');
  var listBtn = document.getElementById('viewList');
  if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
  if (justifiedBtn) justifiedBtn.classList.toggle('active', mode === 'justified');
  if (listBtn) listBtn.classList.toggle('active', mode === 'list');
}

// ===== Keyboard shortcuts =====
// The digit a rating key stands for, or -1. Uses e.code too: with the Japanese IME on, e.key is
// 'Process' or a full-width digit.
function ratingKeyValue(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return -1;
  var key = String(e.key || '').replace(/[０-５]/, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  if (/^[0-5]$/.test(key)) return Number(key);
  var m = /^(?:Digit|Numpad)([0-5])$/.exec(e.code || '');
  return m ? Number(m[1]) : -1;
}

function setupKeyboard() {
  // Rating keys run in the capture phase, before the preview's own handlers, and also while a
  // dropdown (sort, rating filter, library) still has focus after being used.
  document.addEventListener('keydown', function(e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (document.querySelector('.compare-overlay')) return;
    var star = ratingKeyValue(e);
    if (star < 0) return;
    var ids = ratingTargetIds(document.querySelector('.preview-overlay'));
    if (!ids.length) return;
    e.preventDefault();
    e.stopPropagation();
    if (tag === 'SELECT') e.target.blur();
    rateItemsByKey(ids, star);
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    var overlay = document.querySelector('.preview-overlay');
    if (overlay) {
      if (e.key === 'Escape') render.closePreviewOverlay(overlay);
      else if ((e.key === 'i' || e.key === 'I') && !e.metaKey && !e.ctrlKey && !e.altKey) togglePreviewInfoHud(overlay);
      return;
    }
    if (e.key === 'Escape') {
      if (state.selectedIds.size) {
        state.selectedIds.clear();
        state.lastSelectedId = '';
        updateBatchBar();
        updateCheckboxesInView();
        e.preventDefault();
        return;
      }
      if (document.getElementById('inspector').classList.contains('open')) {
        render.closeInspector();
        return;
      }
    }
    if (document.getElementById('inspector').classList.contains('open')) {
      if (e.key === 'ArrowLeft') {
        navigateInspector(-1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowRight') {
        navigateInspector(1);
        e.preventDefault();
        return;
      }
    }
  });
}

// Which items a number key rates: the open preview; else the selection; else the inspector item;
// else the card or row under the mouse; else the keyboard-focused one.
function ratingTargetIds(overlay) {
  if (overlay) return overlay.dataset.previewItemId ? [overlay.dataset.previewItemId] : [];
  if (state.selectedIds.size) return Array.from(state.selectedIds);
  if (state.inspectorItem) return [state.inspectorItem.id];
  var el = document.querySelector('.card[data-item-id]:hover, tr.item-row[data-item-id]:hover') ||
    document.querySelector('.card.keyboard-focus[data-item-id], tr.item-row.keyboard-focus[data-item-id]') ||
    (document.activeElement && document.activeElement.closest && document.activeElement.closest('.card[data-item-id], tr.item-row[data-item-id]'));
  return el ? [el.dataset.itemId] : [];
}

async function rateItemsByKey(ids, star) {
  if (!isCurrentLibraryEditable()) {
    showToast(t('rating_readonly'), 'error');
    return;
  }
  if (ids.length === 1) {
    render.changeItemStar(ids[0], star, { exact: true });
    return;
  }
  var results = await Promise.all(ids.map(function(id) { return render.changeItemStar(id, star, { exact: true, quiet: true }); }));
  var saved = results.filter(Boolean).length;
  if (saved) showToast(tFmt('rating_saved_n', { n: saved }), 'success');
}

function navigateItems(direction) {
  var cards = document.querySelectorAll('.card, .list-table tbody tr:not(.folder-row)');
  if (!cards.length) return;
  var focused = document.querySelector('.keyboard-focus');
  var idx = -1;
  if (focused) {
    for (var i = 0; i < cards.length; i++) {
      if (cards[i] === focused || cards[i].contains(focused)) { idx = i; break; }
    }
  }
  var newIdx = idx + direction;
  if (newIdx < 0) newIdx = 0;
  if (newIdx >= cards.length) newIdx = cards.length - 1;
  if (newIdx !== idx || !focused) {
    document.querySelectorAll('.keyboard-focus').forEach(function(el) { el.classList.remove('keyboard-focus'); });
    cards[newIdx].classList.add('keyboard-focus');
    cards[newIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ===== Sidebar resize =====
function setupSidebarResize() {
  var sidebar = document.getElementById('sidebar');
  var resizer = document.getElementById('sidebarResizer');
  if (!sidebar || !resizer) return;
  var minW = 180, maxW = 480;
  var stored = localStorage.getItem('eagle-viewer-sidebar-width');
  if (stored) {
    var w = parseInt(stored, 10);
    if (w >= minW && w <= maxW) sidebar.style.width = w + 'px';
  }
  var startX = 0, startW = 0;
  resizer.addEventListener('mousedown', function(e) {
    e.preventDefault();
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    function onMove(e2) {
      var dx = e2.clientX - startX;
      var newW = Math.max(minW, Math.min(maxW, startW + dx));
      sidebar.style.width = newW + 'px';
      try { localStorage.setItem('eagle-viewer-sidebar-width', String(newW)); } catch (err) {}
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ===== Sidebar toggle =====
function setupSidebarToggle() {
  var wrap = document.getElementById('sidebarWrap');
  var btn = document.getElementById('sidebarToggle');
  if (!wrap || !btn) return;
  var visible = localStorage.getItem('eagle-viewer-sidebar-visible');
  if (visible === 'false') {
    wrap.classList.add('hidden');
    btn.innerHTML = iconChevronRightSm();
  }
  btn.addEventListener('click', function() {
    if (wrap.classList.contains('hidden')) {
      wrap.classList.remove('hidden');
      btn.innerHTML = iconChevronLeft();
      try { localStorage.setItem('eagle-viewer-sidebar-visible', 'true'); } catch (e) {}
    } else {
      wrap.classList.add('hidden');
      btn.innerHTML = iconChevronRightSm();
      try { localStorage.setItem('eagle-viewer-sidebar-visible', 'false'); } catch (e) {}
    }
  });
}

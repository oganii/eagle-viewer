'use strict';

function closeQuickActionSheet(immediate) {
  var sheet = document.getElementById('quickActionSheet');
  if (sheet) {
    if (immediate) {
      sheet.remove();
    } else {
      sheet.classList.remove('open');
      sheet.classList.add('closing');
      setTimeout(function() {
        if (sheet.parentNode) sheet.remove();
      }, 180);
    }
  }
  document.body.classList.remove('quick-actions-open');
}

function closeDesktopContextMenu() {
  var menu = document.getElementById('itemContextMenu');
  if (menu) menu.remove();
  document.querySelectorAll('.context-active').forEach(function(el) { el.classList.remove('context-active'); });
}

function renderQuickActionStatePills(item) {
  var pills = [];
  if (state.selectedIds.has(item.id)) pills.push('<span class="quick-action-state-pill selected">' + iconCollection() + ' Selected</span>');
  if (!pills.length) pills.push('<span class="quick-action-state-pill muted">Not selected</span>');
  return pills.join('');
}

function updateQuickActionSheetState(sheet, item) {
  var select = sheet.querySelector('[data-quick-action="select"]');
  var download = sheet.querySelector('[data-quick-action="download"]');
  var status = sheet.querySelector('.quick-action-state');
  var selected = state.selectedIds.has(item.id);
  if (status) status.innerHTML = renderQuickActionStatePills(item);
  if (select) {
    select.classList.toggle('active', selected);
    select.querySelector('span').textContent = selected ? 'Deselect' : 'Select';
  }
  if (download) {
    var offline = isRemoteAccessUnavailable();
    download.classList.toggle('requires-remote', offline);
    download.disabled = offline;
    download.title = offline ? 'Downloading originals requires the remote Vault' : '';
    download.querySelector('span').textContent = offline ? 'Offline' : 'Download';
  }
}

function updateDesktopContextMenuState(menu, item) {
  var select = menu.querySelector('[data-context-action="select"] span');
  var download = menu.querySelector('[data-context-action="download"]');
  if (select) select.textContent = state.selectedIds.has(item.id) ? 'Deselect' : 'Add to Selection';
  if (download) {
    var offline = isRemoteAccessUnavailable();
    download.classList.toggle('requires-remote', offline);
    download.disabled = offline;
    download.title = offline ? 'Downloading originals requires the remote Vault' : '';
    var label = download.querySelector('span');
    if (label) label.textContent = offline ? 'Offline' : 'Download Original';
  }
}

function openDesktopContextMenu(item, x, y, sourceEl) {
  if (!item) return;
  closeDesktopContextMenu();
  var meta = [];
  if (item.ext) meta.push(String(item.ext).toUpperCase());
  if (item.width && item.height) meta.push(item.width + ' × ' + item.height);
  else if (item.size) meta.push(formatSize(item.size));
  var primaryFolder = getPrimaryItemFolder(item);
  var menu = document.createElement('div');
  menu.id = 'itemContextMenu';
  menu.className = 'item-context-menu';
  menu.dataset.itemId = item.id || '';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Asset menu');
  menu.innerHTML =
    '<div class="item-context-head">' +
      '<strong>' + escapeHtml(item.name || 'Untitled asset') + '</strong>' +
      '<span>' + escapeHtml(meta.join(' · ') || 'Asset') + '</span>' +
    '</div>' +
    '<button type="button" role="menuitem" data-context-action="preview">' + iconEye() + '<span>Preview</span><kbd>Enter</kbd></button>' +
    '<button type="button" role="menuitem" data-context-action="inspect">' + iconInfo() + '<span>View Details</span></button>' +
    (primaryFolder ? '<button type="button" role="menuitem" data-context-action="folder">' + iconFolder() + '<span>Open Folder</span></button>' : '') +
    '<button type="button" role="menuitem" data-context-action="select">' + iconCollection() + '<span>Add to Selection</span></button>' +
    '<div class="item-context-separator"></div>' +
    '<button type="button" role="menuitem" data-context-action="share">' + iconExternalLink() + '<span>Copy Asset Link</span></button>' +
    (canCopyImage(item.ext) ? '<button type="button" role="menuitem" data-context-action="copy">' + iconCopy() + '<span>Copy Image</span></button>' : '') +
    '<div class="item-context-separator"></div>' +
    '<button type="button" role="menuitem" data-context-action="download">' + iconDownload() + '<span>Download Original</span></button>';
  document.body.appendChild(menu);
  if (sourceEl) sourceEl.classList.add('context-active');
  updateDesktopContextMenuState(menu, item);

  var rect = menu.getBoundingClientRect();
  var left = Math.min(Math.max(8, x), window.innerWidth - rect.width - 8);
  var top = Math.min(Math.max(8, y), window.innerHeight - rect.height - 8);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  requestAnimationFrame(function() { menu.classList.add('open'); });

  menu.onclick = function(e) {
    var actionEl = e.target.closest('[data-context-action]');
    if (!actionEl) return;
    var action = actionEl.dataset.contextAction;
    if (action !== 'share' && action !== 'copy' && action !== 'copy-info' && action !== 'copy-md' && action !== 'copy-html') closeDesktopContextMenu();
    runItemAction(item, action, actionEl);
    if (action === 'share' || action === 'copy' || action === 'copy-info' || action === 'copy-md' || action === 'copy-html') setTimeout(closeDesktopContextMenu, 700);
  };
}

function openQuickActionSheet(item) {
  if (!item) return;
  closeQuickActionSheet(true);
  var primaryFolder = getPrimaryItemFolder(item);
  var meta = [];
  if (item.ext) meta.push(String(item.ext).toUpperCase());
  if (item.width && item.height) meta.push(item.width + ' × ' + item.height);
  if (item.size) meta.push(formatSize(item.size));
  var sheet = document.createElement('div');
  sheet.id = 'quickActionSheet';
  sheet.className = 'quick-action-overlay';
  sheet.dataset.itemId = item.id || '';
  sheet.innerHTML =
    '<div class="quick-action-backdrop" data-quick-action="close"></div>' +
    '<div class="quick-action-sheet" role="dialog" aria-modal="true" aria-label="Asset actions">' +
      '<div class="quick-action-grabber"></div>' +
      '<div class="quick-action-head">' +
        '<strong>' + escapeHtml(item.name || 'Untitled asset') + '</strong>' +
        '<span>' + escapeHtml(meta.join(' · ') || 'Asset') + '</span>' +
      '</div>' +
      '<div class="quick-action-sections">' +
        '<section class="quick-action-section primary">' +
          '<div class="quick-action-section-title"><span>Open</span><em>Preview or view asset info</em></div>' +
          '<div class="quick-action-grid quick-action-grid-primary">' +
            '<button type="button" class="primary-action" data-quick-action="preview">' + iconEye() + '<span>Preview</span></button>' +
            '<button type="button" data-quick-action="inspect">' + iconInfo() + '<span>Details</span></button>' +
            (primaryFolder ? '<button type="button" data-quick-action="folder">' + iconFolder() + '<span>Folder</span></button>' : '') +
          '</div>' +
        '</section>' +
        '<section class="quick-action-section organize">' +
          '<div class="quick-action-section-title"><span>Actions</span><em>Select this asset</em></div>' +
          '<div class="quick-action-grid">' +
            '<button type="button" data-quick-action="select">' + iconCollection() + '<span>Select</span></button>' +
          '</div>' +
        '</section>' +
        '<section class="quick-action-section output">' +
          '<div class="quick-action-section-title"><span>Export</span><em>Copy link or download original</em></div>' +
          '<div class="quick-action-grid">' +
            '<button type="button" data-quick-action="share">' + iconExternalLink() + '<span>Link</span></button>' +
            '<button type="button" data-quick-action="download">' + iconDownload() + '<span>Download</span></button>' +
          '</div>' +
        '</section>' +
      '</div>' +
    '</div>';
  document.body.appendChild(sheet);
  document.body.classList.add('quick-actions-open');
  updateQuickActionSheetState(sheet, item);
  requestAnimationFrame(function() { sheet.classList.add('open'); });

  var panel = sheet.querySelector('.quick-action-sheet');
  var backdrop = sheet.querySelector('.quick-action-backdrop');
  var drag = null;

  function resetSheetDrag() {
    if (!panel) return;
    panel.classList.remove('dragging');
    panel.style.transform = '';
    if (backdrop) backdrop.style.opacity = '';
    drag = null;
  }

  function startSheetDrag(e) {
    if (!panel || !e.touches || e.touches.length !== 1) return;
    if (e.target.closest('button, a, input, textarea, select')) return;
    drag = {
      startY: e.touches[0].clientY,
      lastY: e.touches[0].clientY,
      startedAt: Date.now(),
      active: false,
      fromHandle: !!e.target.closest('.quick-action-grabber, .quick-action-head')
    };
  }

  function moveSheetDrag(e) {
    if (!drag || !panel || !e.touches || e.touches.length !== 1) return;
    var currentY = e.touches[0].clientY;
    var dy = currentY - drag.startY;
    drag.lastY = currentY;
    if (dy <= 0) {
      if (drag.active) resetSheetDrag();
      return;
    }
    if (!drag.fromHandle && panel.scrollTop > 0) return;
    drag.active = true;
    panel.classList.add('dragging');
    var eased = Math.min(180, dy * 0.78);
    panel.style.transform = 'translateY(' + eased + 'px)';
    if (backdrop) backdrop.style.opacity = String(Math.max(0.24, 1 - eased / 210));
    e.preventDefault();
  }

  function endSheetDrag() {
    if (!drag || !panel) return;
    var dy = drag.lastY - drag.startY;
    var elapsed = Math.max(1, Date.now() - drag.startedAt);
    var velocity = dy / elapsed;
    if (drag.active && (dy > 92 || velocity > 0.62)) {
      closeQuickActionSheet();
    } else {
      resetSheetDrag();
    }
  }

  if (panel) {
    panel.addEventListener('touchstart', startSheetDrag, { passive: true });
    panel.addEventListener('touchmove', moveSheetDrag, { passive: false });
    panel.addEventListener('touchend', endSheetDrag);
    panel.addEventListener('touchcancel', resetSheetDrag);
  }

  sheet.onclick = function(e) {
    var actionEl = e.target.closest('[data-quick-action]');
    if (!actionEl) return;
    var action = actionEl.dataset.quickAction;
    if (action === 'close') {
      closeQuickActionSheet();
    } else if (action === 'preview') {
      closeQuickActionSheet();
      runItemAction(item, action, actionEl);
    } else if (action === 'inspect') {
      closeQuickActionSheet();
      runItemAction(item, action, actionEl);
    } else if (action === 'folder' || action === 'source') {
      runItemAction(item, action, actionEl);
    } else if (action === 'select') {
      runItemAction(item, action, actionEl);
      closeQuickActionSheet();
    } else if (action === 'share' || action === 'copy-info' || action === 'copy-md') {
      runItemAction(item, action, actionEl);
      setTimeout(closeQuickActionSheet, 650);
    } else if (action === 'download') {
      runItemAction(item, action, actionEl);
    }
  };
}

function setupMobileQuickActions() {
  if (document.body._quickActionsBound) return;
  document.body._quickActionsBound = true;
  var pressTimer = null;
  var startX = 0;
  var startY = 0;
  var activeCard = null;
  var suppressClick = false;

  function resetPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
    if (activeCard) activeCard.classList.remove('touch-pressing');
    activeCard = null;
  }

  function beginPress(target, x, y) {
    if (window.innerWidth > 768) return;
    if (target.closest('button, a, input, textarea, select, summary, .inspector, .utility-panel, .preview-overlay, .quick-action-overlay')) return;
    var card = target.closest('.card[data-item-id]');
    if (!card) return;
    var item = findCurrentItem(card.dataset.itemId);
    if (!item) return;
    activeCard = card;
    card.classList.add('touch-pressing');
    startX = x;
    startY = y;
    pressTimer = setTimeout(function() {
      suppressClick = true;
      card.classList.add('long-press-active');
      setTimeout(function() { card.classList.remove('long-press-active'); }, 360);
      openQuickActionSheet(item);
    }, 520);
  }

  function movePress(x, y) {
    if (!pressTimer) return;
    if (Math.abs(x - startX) > 12 || Math.abs(y - startY) > 12) resetPress();
  }

  document.body.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    beginPress(e.target, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  document.body.addEventListener('touchmove', function(e) {
    if (e.touches.length !== 1) return;
    movePress(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  document.body.addEventListener('touchend', resetPress, { passive: true });
  document.body.addEventListener('touchcancel', resetPress, { passive: true });

  document.body.addEventListener('pointerdown', function(e) {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    beginPress(e.target, e.clientX, e.clientY);
  });
  document.body.addEventListener('pointermove', function(e) {
    if (e.pointerType === 'touch') return;
    movePress(e.clientX, e.clientY);
  });
  document.body.addEventListener('pointerup', resetPress);
  document.body.addEventListener('pointercancel', resetPress);

  document.body.addEventListener('contextmenu', function(e) {
    if (e.target.closest('button, a, input, textarea, select, summary, .inspector, .utility-panel, .preview-overlay, .quick-action-overlay, .item-context-menu')) return;
    var target = e.target.closest('.card[data-item-id], tr.item-row[data-item-id]');
    if (!target) return;
    var item = findCurrentItem(target.dataset.itemId);
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick = true;
    setTimeout(function() { suppressClick = false; }, 650);
    if (window.innerWidth <= 768) openQuickActionSheet(item);
    else openDesktopContextMenu(item, e.clientX, e.clientY, target);
  });

  document.body.addEventListener('click', function(e) {
    if (!e.target.closest('.item-context-menu')) closeDesktopContextMenu();
    if (!suppressClick) return;
    var card = e.target.closest('.card[data-item-id], tr.item-row[data-item-id]');
    if (!card) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    closeDesktopContextMenu();
  }, true);
  window.addEventListener('resize', closeDesktopContextMenu);
  document.getElementById('contentBody').addEventListener('scroll', closeDesktopContextMenu, { passive: true });
}

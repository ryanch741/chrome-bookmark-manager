/* ===== State ===== */
let allFolders = [];
let allBookmarks = [];
let currentFilter = 'all';
let theme = 'auto';
let bgPreset = 'default';
let bgImageUrl = null;
let searchQuery = '';
let editMode = false;
let navStack = []; // navigation history for folder back button

/* ===== Initialize ===== */
function init() {
  loadSettings().then(() => {
    loadBookmarks();
    setupEventListeners();
    setupDragDrop();
    applyTheme();
    // Follow system theme changes if using auto
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme === 'auto') applyTheme();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ===== Settings ===== */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['theme', 'bgPreset', 'bgImageUrl']);
    theme = result.theme || 'auto';
    bgPreset = result.bgPreset || 'default';
    bgImageUrl = result.bgImageUrl || null;
  } catch {
    theme = localStorage.getItem('bm_theme') || 'auto';
    bgPreset = localStorage.getItem('bm_bgPreset') || 'default';
    bgImageUrl = localStorage.getItem('bm_bgImageUrl') || null;
  }
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({ theme, bgPreset, bgImageUrl });
  } catch {
    localStorage.setItem('bm_theme', theme);
    localStorage.setItem('bm_bgPreset', bgPreset);
    localStorage.setItem('bm_bgImageUrl', bgImageUrl || '');
  }
}

/* ===== Load Bookmarks ===== */
async function loadBookmarks() {
  let tree;
  try {
    tree = await chrome.bookmarks.getTree();
  } catch {
    renderDemoData();
    return;
  }

  allFolders = [];
  allBookmarks = [];
  flattenTree(tree[0], null);
  updateStats();
  renderGroups();
}

function flattenTree(node, parentTitle) {
  if (!node.children) {
    if (node.url) {
      allBookmarks.push({ id: node.id, title: node.title || node.url, url: node.url, parentTitle });
    }
    return;
  }

  const bookmarks = [];
  const subFolders = [];

  for (const child of node.children) {
    if (child.url) {
      bookmarks.push({ id: child.id, title: child.title || child.url, url: child.url });
      allBookmarks.push({ id: child.id, title: child.title || child.url, url: child.url, parentTitle: node.title });
    } else if (child.children) {
      subFolders.push({ id: child.id, title: child.title });
    }
  }

  if (node.title) {
    allFolders.push({ id: node.id, title: node.title, bookmarks, subFolders, parentTitle });
  }

  for (const child of node.children) {
    if (!child.url) flattenTree(child, node.title);
  }
}

/* ===== Render Groups ===== */
function renderGroups(filterFolders) {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '';
  const folders = filterFolders || allFolders;

  if (folders.length === 0) {
    container.innerHTML = '<div class="loading">' + icon('inbox') + ' 没有找到匹配的书签</div>';
    return;
  }

  // In non-search mode, render first-level bookmarks as pinned strip at top,
  // and only show first-level groups (direct children of root containers)
  if (!searchQuery) {
    const rootTitles = allFolders.filter(f => f.parentTitle === '').map(f => f.title);
    const rootFolders = folders.filter(f => f.parentTitle === '');
    const pinnedBms = [];
    for (const rf of rootFolders) {
      for (const bm of rf.bookmarks) {
        pinnedBms.push({ bm, folderId: rf.id });
      }
    }
    if (pinnedBms.length > 0) {
      const ps = document.createElement('div');
      ps.className = 'pinned-bookmarks glass';
      for (const item of pinnedBms) {
        const bm = item.bm;
        try {
          const url = new URL(bm.url);
          const link = document.createElement('a');
          link.className = 'pinned-bookmark';
          link.href = bm.url;
          link.target = '_blank';
          link.dataset.bmId = bm.id;
          link.dataset.bmTitle = bm.title || url.hostname;
          link.dataset.bmUrl = bm.url;
          link.dataset.bmFolderId = item.folderId;
          link.draggable = true;
          link.innerHTML = '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(url.hostname) + '&sz=32" alt=""> <span>' + esc(bm.title || url.hostname) + '</span>'
            + '<div class="pinned-actions">'
            + '<button class="pinned-action-btn edit" title="编辑">' + icon('edit') + '</button>'
            + '<button class="pinned-action-btn delete" title="删除">' + icon('trash') + '</button>'
            + '</div>';
          ps.appendChild(link);
        } catch {}
      }
      container.appendChild(ps);
    }

    // Only show first-level groups (direct children of root containers) as cards
    const visibleFolders = folders.filter(f => rootTitles.includes(f.parentTitle));
    for (const folder of visibleFolders) {
      const card = document.createElement('div');
      card.className = 'group-card glass';
      card.dataset.folderId = folder.id;
      card.draggable = true;
      card.innerHTML = `
        <div class="group-card-icon">${icon('folder')}</div>
        <div class="group-card-title">${esc(folder.title)}</div>
        <div class="group-card-count">${folder.bookmarks.length} 个书签${folder.subFolders.length ? ' · ' + folder.subFolders.length + ' 个子分组' : ''}</div>
        <button class="group-card-delete" title="删除分组">${icon('trash')}</button>
      `;
      card.addEventListener('mouseenter', () => {
        if (editMode) return;
        showPreview(folder, card);
      });
      card.addEventListener('mouseleave', () => scheduleHidePreview());
      card.addEventListener('click', () => {
        if (editMode) {
          // In edit mode, preview is blocked; folder navigation is allowed.
          // The delegated click handler blocks bookmark link navigation.
        }
        currentFilter = folder.id;
        navStack = [];
        updateActiveFilter();
        renderFilteredView(folder);
      });
      container.appendChild(card);
    }
  } else {
    // Search mode: show matching folders with expanded bookmarks
    for (const folder of folders) {
      if (!matchesSearch(folder)) continue;

      if (hasMatchingBookmarks(folder)) {
        const detail = document.createElement('div');
        detail.className = 'folder-detail glass search-match';
        detail.dataset.folderId = folder.id;
        let html = '<div class="folder-detail-header" style="cursor:pointer" data-folder-id="' + folder.id + '">'
          + '<span class="folder-detail-icon">' + icon('folder') + '</span>'
          + '<span class="folder-detail-title">' + esc(folder.title) + '</span>'
          + '<span class="folder-detail-count">' + folder.bookmarks.length + ' 个书签</span>'
          + '</div>';

        html += '<div class="folder-detail-links">';
        const q = searchQuery.toLowerCase();
        for (const bm of folder.bookmarks) {
          if (bm.title.toLowerCase().includes(q)) {
            try {
              const url = new URL(bm.url);
              html += '<a href="' + esc(bm.url) + '" class="bookmark-card glass" target="_blank" draggable="true"'
                + ' data-bm-id="' + esc(bm.id) + '"'
                + ' data-bm-title="' + esc(bm.title) + '"'
                + ' data-bm-url="' + esc(bm.url) + '"'
                + ' data-folder-id="' + folder.id + '">'
                + '<img class="bookmark-card-favicon" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(url.hostname) + '&sz=32" alt="">'
                + '<div class="bookmark-card-info">'
                + '<div class="bookmark-card-title">' + highlightText(esc(bm.title), esc(q)) + '</div>'
                + '<div class="bookmark-card-url">' + esc(url.hostname) + '</div>'
                + '</div>'
                + '<div class="bookmark-actions">'
                + '<button class="bookmark-action-btn edit" title="编辑">' + icon('edit') + '</button>'
                + '<button class="bookmark-action-btn delete" title="删除">' + icon('trash') + '</button>'
                + '</div></a>';
            } catch {}
          }
        }
        html += '</div>';

        for (const sub of folder.subFolders) {
          const sf = allFolders.find(f => f.id === sub.id);
          if (sf && (sub.title.toLowerCase().includes(q) || hasMatchingBookmarks(sf))) {
            html += '<div class="search-sub-ref" data-folder-id="' + sub.id + '">'
              + icon('folder-open') + ' ' + esc(sub.title) + ' →</div>';
          }
        }

        detail.innerHTML = html;

        const sHeader = detail.querySelector('.folder-detail-header[data-folder-id]');
        if (sHeader) {
          const fid = sHeader.dataset.folderId;
          sHeader.addEventListener('click', () => {
            const f = allFolders.find(f => f.id === fid);
            if (f) renderFilteredView(f);
          });
        }
        detail.querySelectorAll('.search-sub-ref[data-folder-id]').forEach(el => {
          const fid = el.dataset.folderId;
          el.addEventListener('click', () => {
            const f = allFolders.find(f => f.id === fid);
            if (f) renderFilteredView(f);
          });
        });

        container.appendChild(detail);
      } else {
        const card = document.createElement('div');
        card.className = 'group-card glass search-matched-card';
        card.dataset.folderId = folder.id;
        card.draggable = true;
        card.innerHTML = `
          <div class="group-card-icon">${icon('folder')}</div>
          <div class="group-card-count">${folder.bookmarks.length} 个书签${folder.subFolders.length ? ' · ' + folder.subFolders.length + ' 个子分组' : ''}</div>
          <button class="group-card-delete" title="删除分组">${icon('trash')}</button>
        `;
        card.addEventListener('mouseenter', () => {
          if (editMode) return;
          showPreview(folder, card);
        });
        card.addEventListener('mouseleave', () => scheduleHidePreview());
        card.addEventListener('click', (e) => {
          if (editMode) return;
          currentFilter = folder.id;
          navStack = [];
          updateActiveFilter();
          renderFilteredView(folder);
        });
        container.appendChild(card);
      }
    }
  }
}

function renderFilteredView(folder) {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '';
  // Close hover preview when entering a folder
  clearTimeout(previewTimeout);
  document.getElementById('activePreview').classList.remove('visible');
  document.querySelectorAll('.group-card.active-preview').forEach(c => c.classList.remove('active-preview'));

  const detail = document.createElement('div');
  detail.className = 'folder-detail glass';
  detail.innerHTML = `
    <div class="folder-detail-header">
      <button class="detail-back-btn" title="返回全部分组">${icon('arrow-left')}</button>
      <span class="folder-detail-icon">${icon('folder')}</span>
      <span class="folder-detail-title">${esc(folder.title)}</span>
      <button class="add-folder-btn" data-folder-id="${folder.id}">+ 添加书签</button>
    </div>
  `;

  detail.querySelector('.detail-back-btn').addEventListener('click', () => {
    if (navStack.length > 0) {
      const parentId = navStack.pop();
      const parent = allFolders.find(f => f.id === parentId);
      if (parent) {
        currentFilter = parentId;
        updateActiveFilter();
        renderFilteredView(parent);
        return;
      }
    }
    currentFilter = 'all';
    updateActiveFilter();
    renderGroups();
  });

  if (folder.subFolders.length > 0) {
    const subsDiv = document.createElement('div');
    subsDiv.className = 'folder-detail-subfolders';
    const subTitle = document.createElement('div');
    subTitle.className = 'folder-detail-section-title';
    subTitle.textContent = '子分组';
    subsDiv.appendChild(subTitle);

    const subGrid = document.createElement('div');
    subGrid.className = 'subfolder-grid';
    for (const sub of folder.subFolders) {
      const sf = allFolders.find(f => f.id === sub.id);
      const sc = document.createElement('div');
      sc.className = 'group-card glass sub-card';
      sc.innerHTML = `
        <div class="group-card-icon">${icon('folder-open')}</div>
        <div class="group-card-title">${esc(sub.title)}</div>
        <div class="group-card-count">${sf ? sf.bookmarks.length : 0} 个书签</div>
      `;
      if (sf) {
        sc.addEventListener('mouseenter', () => showPreview(sf, sc));
        sc.addEventListener('mouseleave', () => scheduleHidePreview());
        sc.addEventListener('click', (e) => { e.stopPropagation(); navStack.push(folder.id); renderFilteredView(sf); });
      }
      subGrid.appendChild(sc);
    }
    subsDiv.appendChild(subGrid);
    detail.appendChild(subsDiv);
  }

  const linksDiv = document.createElement('div');
  linksDiv.className = 'folder-detail-links';

  for (const bm of folder.bookmarks) {
    try {
      const url = new URL(bm.url);
      const el = document.createElement('a');
      el.className = 'bookmark-card glass';
      el.href = bm.url;
      el.target = '_blank';
      el.dataset.bmId = bm.id;
      el.dataset.bmTitle = bm.title;
      el.dataset.bmUrl = bm.url;
      el.dataset.folderId = folder.id;
      el.draggable = true;
      el.innerHTML = `
        <img class="bookmark-card-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=32" alt="">
        <div class="bookmark-card-info">
          <div class="bookmark-card-title">${esc(bm.title)}</div>
          <div class="bookmark-card-url">${esc(url.hostname)}</div>
        </div>
        <div class="bookmark-actions">
          <button class="bookmark-action-btn edit" title="编辑">${icon('edit')}</button>
          <button class="bookmark-action-btn delete" title="删除">${icon('trash')}</button>
        </div>
      `;
      linksDiv.appendChild(el);
    } catch { /* invalid url */ }
  }
  detail.appendChild(linksDiv);

  container.appendChild(detail);
}

/* ===== Preview ===== */
let previewTimeout = null;

function showPreview(folder, card) {
  clearTimeout(previewTimeout);
  const preview = document.getElementById('activePreview');
  const cardRect = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Remove visible class from ALL other previews first
  document.querySelectorAll('.group-preview.visible').forEach(p => p.classList.remove('visible'));

  // Highlight the active card
  document.querySelectorAll('.group-card.active-preview').forEach(c => c.classList.remove('active-preview'));
  card.classList.add('active-preview');

  let html = '<div class="group-preview-title">' + icon('folder') + ' ' + esc(folder.title) + '</div>';

  if (folder.bookmarks.length > 0) {
    html += '<div class="group-preview-links">';
    for (const bm of folder.bookmarks) {
      try {
        const url = new URL(bm.url);
        html += '<a href="' + esc(bm.url) + '" class="bookmark-link" target="_blank" title="' + esc(bm.title) + '">'
          + '<img class="favicon" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(url.hostname) + '&sz=16" alt="">'
          + '<span>' + (esc(bm.title) || esc(url.hostname)) + '</span></a>';
      } catch {
        html += '<a href="' + esc(bm.url) + '" class="bookmark-link" target="_blank"><span>' + esc(bm.title) + '</span></a>';
      }
    }
    html += '</div>';
  } else {
    html += '<div class="group-preview-empty">暂无书签</div>';
  }

  if (folder.subFolders.length > 0) {
    html += '<div class="group-preview-subfolders">';
    for (const sub of folder.subFolders) {
      const sf = allFolders.find(f => f.id === sub.id);
      html += '<div class="subfolder-item">'
        + '<div class="subfolder-header" data-sub-id="' + sub.id + '">'
        + '<span class="arrow">▶</span> ' + icon('folder-open') + ' ' + esc(sub.title) + (sf ? ' (' + sf.bookmarks.length + ')' : '')
        + '</div>'
        + '<div class="subfolder-content">'
        + (sf ? buildSubLinks(sf) : '<div class="group-preview-empty">空</div>')
        + '</div></div>';
    }
    html += '</div>';
  }

  preview.innerHTML = html;

  // Set column count based on bookmark quantity, not container width
  const linksDiv = preview.querySelector('.group-preview-links');
  let cols = 1;
  if (linksDiv) {
    const n = folder.bookmarks.length;
    cols = n >= 12 ? 3 : n >= 5 ? 2 : 1;
    linksDiv.style.columnCount = cols;
  }
  preview.querySelectorAll('.subfolder-content').forEach(el => {
    const parentItem = el.closest('.subfolder-item');
    if (parentItem) {
      const header = parentItem.querySelector('.subfolder-header');
      const match = header && header.textContent.match(/\((\d+)\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      el.style.columnCount = count >= 8 ? 2 : 1;
    }
  });

  // Set width based on column count
  const prefWidth = Math.min(cols === 3 ? 960 : cols === 2 ? 580 : 340, vw - 24);
  preview.style.width = prefWidth + 'px';
  let left = Math.max(16, Math.min(cardRect.left, vw - prefWidth - 16));
  const spaceBelow = vh - cardRect.bottom - 24;
  const spaceAbove = cardRect.top - 24;
  let top, maxHeight;

  if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
    top = cardRect.bottom + 8;
    maxHeight = Math.min(spaceBelow, 800);
  } else {
    maxHeight = Math.min(spaceAbove, 800);
    top = Math.max(16, cardRect.top - maxHeight - 8);
  }

  preview.style.left = left + 'px';
  preview.style.top = top + 'px';
  preview.style.maxHeight = maxHeight + 'px';
  preview.classList.add('visible');

  preview.querySelectorAll('.subfolder-header').forEach(h => {
    h.addEventListener('click', () => {
      h.querySelector('.arrow').classList.toggle('expanded');
      h.nextElementSibling.classList.toggle('expanded');
    });
    // Expand all sub-folders by default
    h.querySelector('.arrow').classList.add('expanded');
    h.nextElementSibling.classList.add('expanded');
  });
}

function buildSubLinks(folder) {
  let html = '';
  for (const bm of folder.bookmarks) {
    try {
      const url = new URL(bm.url);
      html += '<a href="' + esc(bm.url) + '" class="bookmark-link" target="_blank" title="' + esc(bm.title) + '">'
        + '<img class="favicon" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(url.hostname) + '&sz=16" alt="">'
        + '<span>' + (esc(bm.title) || esc(url.hostname)) + '</span></a>';
    } catch {
      html += '<a href="' + esc(bm.url) + '" class="bookmark-link" target="_blank"><span>' + esc(bm.title) + '</span></a>';
    }
  }
  return html || '<div class="group-preview-empty">空</div>';
}

function scheduleHidePreview() {
  previewTimeout = setTimeout(() => {
    const p = document.getElementById('activePreview');
    if (p && !p.matches(':hover')) {
      p.classList.remove('visible');
      document.querySelectorAll('.group-card.active-preview').forEach(c => c.classList.remove('active-preview'));
    }
  }, 200);
}

document.getElementById('activePreview').addEventListener('mouseenter', () => clearTimeout(previewTimeout));
document.getElementById('activePreview').addEventListener('mouseleave', () => {
  document.getElementById('activePreview').classList.remove('visible');
  document.querySelectorAll('.group-card.active-preview').forEach(c => c.classList.remove('active-preview'));
});

/* ===== Theme ===== */
function applyTheme() {
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.getElementById('appBody').dataset.theme = resolved;
  document.getElementById('themeIcon').innerHTML = resolved === 'dark' ? icon('sun') : icon('moon');
  applyBackground();
}

function toggleTheme() {
  theme = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark')
    : (theme === 'dark' ? 'light' : 'dark');
  applyTheme();
  saveSettings();
}

function toggleEditMode() {
  editMode = !editMode;
  document.getElementById('app').classList.toggle('edit-mode', editMode);
  document.getElementById('editModeIcon').innerHTML = editMode ? icon('check') : icon('edit');
  document.getElementById('editToggle').classList.toggle('active', editMode);
}

/* ===== Background ===== */
function applyBackground() {
  const body = document.getElementById('appBody');
  body.style.background = '';
  body.dataset.bg = '';
  body.classList.remove('has-bg-image');

  if (bgImageUrl) {
    body.classList.add('has-bg-image');
    body.style.setProperty('--bg-image', 'url("' + bgImageUrl.replace(/"/g, '\\"') + '")');
    let style = document.getElementById('bgImageStyle');
    if (!style) { style = document.createElement('style'); style.id = 'bgImageStyle'; document.head.appendChild(style); }
    style.textContent = 'body.has-bg-image::before { background-image: url("' + bgImageUrl.replace(/"/g, '\\"') + '") !important; }';
  } else {
    body.dataset.bg = bgPreset;
    const style = document.getElementById('bgImageStyle');
    if (style) style.remove();
  }
}

function setBgPreset(preset) {
  bgPreset = preset;
  bgImageUrl = null;
  if (preset === 'light') theme = 'light';
  if (preset === 'dark') theme = 'dark';
  applyTheme();
  saveSettings();
  document.querySelectorAll('.bg-preset').forEach(b => b.classList.toggle('active', b.dataset.bg === preset));
}

function setBgImage(url) {
  if (!url) return;
  bgImageUrl = url;
  bgPreset = 'default';
  applyBackground();
  saveSettings();
  document.querySelectorAll('.bg-preset').forEach(b => b.classList.remove('active'));
}

function resetBg() {
  bgImageUrl = null;
  bgPreset = 'default';
  applyBackground();
  saveSettings();
  document.querySelectorAll('.bg-preset').forEach(b => b.classList.toggle('active', b.dataset.bg === 'default'));
}

/* ===== Search ===== */
function matchesSearch(folder) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  if (folder.title.toLowerCase().includes(q)) return true;
  return folder.bookmarks.some(b => b.title.toLowerCase().includes(q));
}

function hasMatchingBookmarks(folder) {
  if (!searchQuery) return false;
  const q = searchQuery.toLowerCase();
  return folder.bookmarks.some(b => b.title.toLowerCase().includes(q));
}

function highlightText(text, query) {
  if (!query) return text;
  var idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.substring(0, idx) + '<mark>' + text.substring(idx, idx + query.length) + '</mark>' + text.substring(idx + query.length);
}

function performSearch() {
  searchQuery = document.getElementById('searchInput').value.trim();
  renderGroups();
}

/* ===== Stats ===== */
function updateStats() {
  document.getElementById('statsTotal').textContent = '共 ' + allFolders.length + ' 个分组 · ' + allBookmarks.length + ' 个书签';
}

function updateActiveFilter() {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const a = document.querySelector('.filter-btn[data-filter="' + currentFilter + '"]');
  if (a) a.classList.add('active');
}

/* ===== Events ===== */
function setupEventListeners() {
  document.getElementById('editToggle').addEventListener('click', toggleEditMode);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Delegated error handler for favicon images (CSP-safe, no inline onerror)
  document.getElementById('groupsContainer').addEventListener('error', e => {
    if (e.target.tagName === 'IMG') e.target.style.display = 'none';
  }, true);

  const bgBtn = document.getElementById('bgSettingsBtn');
  const bgPanel = document.getElementById('bgSettings');
  bgBtn.addEventListener('click', () => { bgPanel.hidden = !bgPanel.hidden; });
  document.getElementById('bgSettingsClose').addEventListener('click', () => { bgPanel.hidden = true; });

  document.querySelectorAll('.bg-preset').forEach(b => b.addEventListener('click', () => setBgPreset(b.dataset.bg)));

  document.getElementById('bgFileBtn').addEventListener('click', () => document.getElementById('bgFileInput').click());
  document.getElementById('bgFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setBgImage(ev.target.result); document.getElementById('bgUrlInput').value = ''; };
    reader.readAsDataURL(file);
  });

  document.getElementById('bgApplyUrl').addEventListener('click', () => {
    const url = document.getElementById('bgUrlInput').value.trim();
    if (url) setBgImage(url);
  });
  document.getElementById('bgUrlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const url = e.target.value.trim(); if (url) setBgImage(url); }
  });

  document.getElementById('bgResetBtn').addEventListener('click', resetBg);

  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(performSearch, 250);
  });

  document.addEventListener('click', (e) => {
    if (!bgPanel.hidden && !bgPanel.contains(e.target) && e.target !== bgBtn && !bgBtn.contains(e.target)) {
      bgPanel.hidden = true;
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); document.getElementById('searchInput').focus(); }
    if (e.key === 'Escape') {
      document.getElementById('bgSettings').hidden = true;
      document.getElementById('searchInput').blur();
      document.getElementById('activePreview').classList.remove('visible');
      document.getElementById('donateModal').hidden = true;
      closeModal();
      closeFolderModal();
      hideDeleteToast();
    }
  });

  // --- Modal events ---
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveBookmark);
  document.getElementById('bookmarkModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modalTitleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('modalUrlInput').focus();
  });
  document.getElementById('modalUrlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBookmark();
  });
  // Reset input border color on focus
  document.getElementById('modalTitleInput').addEventListener('focus', () => {
    document.getElementById('modalTitleInput').style.borderColor = '';
  });
  document.getElementById('modalUrlInput').addEventListener('focus', () => {
    document.getElementById('modalUrlInput').style.borderColor = '';
  });

  // --- Delete toast events ---
  document.getElementById('deleteConfirm').addEventListener('click', () => {
    const toast = document.getElementById('deleteToast');
    const folderId = toast.dataset.folderId;
    const bmId = toast.dataset.bmId;
    if (folderId) deleteFolder(folderId);
    else if (bmId) deleteBookmark(bmId);
  });
  document.getElementById('deleteCancel').addEventListener('click', hideDeleteToast);

  // --- FAB ---
  document.getElementById('addFab').addEventListener('click', () => openAddModal());

  // --- Add Folder ---
  document.getElementById('addFolderBtn').addEventListener('click', openAddFolderModal);
  document.getElementById('folderModalClose').addEventListener('click', closeFolderModal);
  document.getElementById('folderModalCancel').addEventListener('click', closeFolderModal);
  document.getElementById('folderModalSave').addEventListener('click', createFolder);
  document.getElementById('folderModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFolderModal();
  });
  document.getElementById('folderNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createFolder();
  });

  // --- Donate ---
  document.getElementById('donateBtn').addEventListener('click', () => {
    document.getElementById('donateModal').hidden = false;
  });
  document.getElementById('donateModalClose').addEventListener('click', () => {
    document.getElementById('donateModal').hidden = true;
  });
  document.getElementById('donateModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('donateModal').hidden = true;
  });


  // --- Delegated click handler for bookmark management ---
  document.getElementById('groupsContainer').addEventListener('click', (e) => {
    // In edit mode, block bookmark navigation but allow folder navigation
    if (editMode) {
      const bookmarkLink = e.target.closest('.bookmark-card, .pinned-bookmark');
      if (bookmarkLink) {
        e.preventDefault();
        // Still allow action buttons inside bookmarks
        if (!e.target.closest('.bookmark-action-btn, .pinned-action-btn')) {
          return;
        }
      }
    }

    // Pinned bookmark action buttons (edit/delete)
    const pinnedAction = e.target.closest('.pinned-action-btn');
    if (pinnedAction) {
      e.preventDefault();
      const pinned = pinnedAction.closest('.pinned-bookmark');
      if (!pinned) return;
      const bmId = pinned.dataset.bmId;
      const title = pinned.dataset.bmTitle;
      const url = pinned.dataset.bmUrl;
      if (pinnedAction.classList.contains('edit') && bmId) {
        openEditModal(bmId, title, url);
      } else if (pinnedAction.classList.contains('delete') && bmId) {
        showDeleteToast(bmId, title);
      }
      return;
    }

    // "add-folder-btn" inside folder detail
    const addBtn = e.target.closest('.add-folder-btn');
    if (addBtn) {
      e.preventDefault();
      const folderId = addBtn.dataset.folderId;
      if (folderId) openAddModal(folderId);
      return;
    }

    // Group card delete button in edit mode
    const groupDeleteBtn = e.target.closest('.group-card-delete');
    if (groupDeleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const groupCard = groupDeleteBtn.closest('.group-card');
      if (groupCard) {
        const folderId = groupCard.dataset.folderId;
        const folder = allFolders.find(f => f.id === folderId);
        if (folder) {
          const hasBookmarks = folder.bookmarks.length > 0 || folder.subFolders.some(sub => {
            const sf = allFolders.find(f => f.id === sub.id);
            return sf && sf.bookmarks.length > 0;
          });
          if (hasBookmarks) {
            alert('请先删除分组内的所有书签，再删除分组。');
            return;
          }
          showDeleteFolderToast(folderId, folder.title);
        }
      }
      return;
    }

    const card = e.target.closest('.bookmark-card');
    if (!card) return;

    const editBtn = e.target.closest('.bookmark-action-btn.edit');
    const deleteBtn = e.target.closest('.bookmark-action-btn.delete');

    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      const bmId = card.dataset.bmId;
      const title = card.dataset.bmTitle;
      const url = card.dataset.bmUrl;
      const folderId = card.dataset.folderId;
      if (bmId) openEditModal(bmId, title, url, folderId);
    } else if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const bmId = card.dataset.bmId;
      const title = card.dataset.bmTitle;
      if (bmId) showDeleteToast(bmId, title);
    }
  });
}

/* ===== Drag & Drop Sorting ===== */
let dragData = null;
let _dragState = null;

function setupDragDrop() {
  const container = document.getElementById('groupsContainer');
  if (container._dragEventsAttached) return;
  container._dragEventsAttached = true;

  // Create a single reusable placeholder element
  const placeholder = document.createElement('div');
  placeholder.className = 'drop-placeholder';

  // Prevent native HTML5 drag from interfering with mouse-based drag
  document.addEventListener('dragstart', (e) => {
    if (editMode) {
      e.preventDefault();
      return false;
    }
  });

  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!editMode) return;
    const card = e.target.closest('.group-card, .bookmark-card, .pinned-bookmark');
    if (!card) return;
    // Don't start drag on action buttons
    if (e.target.closest('.group-card-delete, .bookmark-action-btn, .pinned-action-btn')) return;

    _dragState = {
      element: card,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      type: card.classList.contains('group-card') ? 'group' : 'bookmark',
      id: card.dataset.bmId || card.dataset.folderId,
      folderId: card.dataset.bmFolderId || card.dataset.folderId,
      clone: null,
      origRect: null,
      dropTargetId: null,
      dropPosition: 'before'
    };
  });

  document.addEventListener('mousemove', (e) => {
    if (!_dragState || !editMode) return;

    const dx = e.clientX - _dragState.startX;
    const dy = e.clientY - _dragState.startY;

    if (!_dragState.active && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      // Activate drag
      _dragState.active = true;

      const orig = _dragState.element;
      const rect = orig.getBoundingClientRect();
      _dragState.origRect = rect;

      // Collapse original in layout so it doesn't leave an empty gap
      _dragState.origDisplay = orig.style.display;
      orig.style.display = 'none';

      // Create visual clone using saved dimensions
      const clone = orig.cloneNode(true);
      // Remove cloned display:none so the clone is visible
      clone.style.display = '';
      clone.style.position = 'fixed';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '99999';
      clone.style.opacity = '0.85';
      clone.style.width = rect.width + 'px';
      clone.style.transform = 'scale(1.05) rotate(1deg)';
      clone.style.borderRadius = '12px';
      clone.style.boxShadow = '0 16px 48px rgba(0,0,0,0.3)';
      clone.style.transition = 'none';
      const btns = clone.querySelectorAll('.group-card-delete, .bookmark-action-btn, .pinned-action-btn');
      btns.forEach(b => b.remove());
      clone.style.left = rect.left + 'px';
      clone.style.top = rect.top + 'px';
      clone.classList.add('drag-clone');
      document.body.appendChild(clone);
      _dragState.clone = clone;

      dragData = { type: _dragState.type, id: _dragState.id, folderId: _dragState.folderId };
    }

    if (_dragState.active && _dragState.clone) {
      // Move clone to follow cursor
      const startRect = _dragState.origRect;
      _dragState.clone.style.left = (startRect.left + dx) + 'px';
      _dragState.clone.style.top = (startRect.top + dy) + 'px';

      // Find closest card by distance (stable — not affected by layout shifts)
      const closest = findClosestCard(e.clientX, e.clientY, _dragState.type);
      let foundValidTarget = false;

      if (closest && isValidDropTarget(closest)) {
        const rect = closest.getBoundingClientRect();
        const newPosition = _dragState.type === 'group'
          ? (e.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
          : (e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
        const newId = closest.dataset.bmId || closest.dataset.folderId;

        if (newId === _dragState.dropTargetId && newPosition === _dragState.dropPosition) {
          // Same target, same side — do nothing to avoid flicker
          foundValidTarget = true;
        } else {
          // Target or position changed — update placeholder
          if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
          document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

          placeholder.style.width = rect.width + 'px';
          placeholder.style.height = rect.height + 'px';
          closest.classList.add('drag-over');

          if (newPosition === 'before') {
            closest.parentNode.insertBefore(placeholder, closest);
          } else {
            closest.parentNode.insertBefore(placeholder, closest.nextElementSibling);
          }

          _dragState.dropTargetId = newId;
          _dragState.dropPosition = newPosition;
          foundValidTarget = true;
        }
      }

      if (!foundValidTarget) {
        // Not over a valid drop zone — clear placeholder
        if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        _dragState.dropTargetId = null;
      }
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!_dragState) return;

    // Remove placeholder from DOM
    if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);

    // Restore original card display before any re-render
    if (_dragState.element && _dragState.origDisplay !== undefined) {
      _dragState.element.style.display = _dragState.origDisplay;
    }

    if (_dragState.active && _dragState.clone && _dragState.dropTargetId) {
      const targetId = _dragState.dropTargetId;
      if (targetId !== _dragState.id) {
        if (_dragState.type === 'group') {
          reorderGroups(_dragState.id, targetId, _dragState.dropPosition);
        } else {
          reorderBookmarks(_dragState.id, targetId, _dragState.folderId, _dragState.dropPosition);
        }
      }
    }

    // Cleanup
    if (_dragState.clone && _dragState.clone.parentNode) {
      _dragState.clone.parentNode.removeChild(_dragState.clone);
    }
    document.querySelectorAll('.dragging, .drag-clone').forEach(el => el.classList.remove('dragging', 'drag-clone'));
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    dragData = null;
    _dragState = null;
  });
}

function findClosestCard(x, y, dragType) {
  const selector = dragType === 'group' ? '.group-card' : '.bookmark-card, .pinned-bookmark';
  const items = document.querySelectorAll(selector);
  let closest = null;
  let minDist = Infinity;
  for (const item of items) {
    if (item.classList.contains('dragging') || item.classList.contains('drag-clone')) continue;
    const r = item.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < minDist) { minDist = d; closest = item; }
  }
  return closest;
}

function isValidDropTarget(target) {
  if (!_dragState || !dragData) return false;
  const isTargetGroup = target.classList.contains('group-card');
  if (dragData.type === 'group') return isTargetGroup;
  return target.classList.contains('bookmark-card') || target.classList.contains('pinned-bookmark');
}

async function reorderGroups(fromId, toId, position) {
  const fromIdx = allFolders.findIndex(f => f.id === fromId);
  const toIdx = allFolders.findIndex(f => f.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;

  const [moved] = allFolders.splice(fromIdx, 1);
  const newToIdx = allFolders.findIndex(f => f.id === toId);
  if (newToIdx !== -1) {
    if (position === 'after') {
      allFolders.splice(newToIdx + 1, 0, moved);
    } else {
      allFolders.splice(newToIdx, 0, moved);
    }
  }

  // Try Chrome API
  try {
    const parentId = moved.parentTitle === '' ? '1' : allFolders.find(f => f.title === moved.parentTitle)?.id;
    if (parentId) {
      await chrome.bookmarks.move(fromId, { parentId, index: newToIdx });
    }
  } catch { /* demo mode, ignore */ }

  renderGroups();
  updateStats();
}

async function reorderBookmarks(fromId, toId, folderId, position) {
  const srcFolder = allFolders.find(f => f.id === folderId);
  if (!srcFolder) return;

  const bmIdx = srcFolder.bookmarks.findIndex(b => b.id === fromId);
  if (bmIdx === -1) return;

  const [movedBm] = srcFolder.bookmarks.splice(bmIdx, 1);

  const toBmIdx = srcFolder.bookmarks.findIndex(b => b.id === toId);
  if (toBmIdx !== -1) {
    if (position === 'after') {
      srcFolder.bookmarks.splice(toBmIdx + 1, 0, movedBm);
    } else {
      srcFolder.bookmarks.splice(toBmIdx, 0, movedBm);
    }
  } else {
    srcFolder.bookmarks.push(movedBm);
  }

  // Try Chrome API
  try {
    const newIdx = srcFolder.bookmarks.findIndex(b => b.id === fromId);
    if (newIdx !== -1) {
      await chrome.bookmarks.move(fromId, { parentId: srcFolder.id, index: newIdx });
    }
  } catch { /* demo mode, ignore */ }

  if (currentFilter !== 'all') {
    const folder = allFolders.find(f => f.id === currentFilter);
    if (folder) { renderFilteredView(folder); updateStats(); return; }
  }
  renderGroups();
  updateStats();
}

/* ===== Dev Demo Data ===== */
function renderDemoData() {
  allFolders = [
    { id: 'devbar', title: '书签栏', parentTitle: '', bookmarks: [
      { id: 'b_p1', title: 'Google', url: 'https://google.com' },
      { id: 'b_p2', title: 'Gmail', url: 'https://mail.google.com' },
      { id: 'b_p3', title: 'GitHub', url: 'https://github.com' },
      { id: 'b_p4', title: 'ChatGPT', url: 'https://chatgpt.com' },
    ], subFolders: [{ id: 'dev1', title: '开发工具' }, { id: 'dev2', title: '设计资源' }, { id: 'dev3', title: '新闻与博客' }, { id: 'dev4', title: '娱乐' }, { id: 'dev5', title: 'AI 工具' }] },
    { id: 'dev1', title: '开发工具', parentTitle: '书签栏', bookmarks: [
      { id: 'b1', title: 'GitHub', url: 'https://github.com' },
      { id: 'b2', title: 'Stack Overflow', url: 'https://stackoverflow.com' },
      { id: 'b3', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
      { id: 'b4', title: 'CodeSandbox', url: 'https://codesandbox.io' },
      { id: 'b5', title: 'npm', url: 'https://www.npmjs.com' },
    ], subFolders: [{ id: 'devsub1', title: 'React 资源' }, { id: 'devsub2', title: 'CSS 工具' }] },
    { id: 'devsub1', title: 'React 资源', parentTitle: '开发工具', bookmarks: [
      { id: 'b6', title: 'React 官方文档', url: 'https://react.dev' },
      { id: 'b7', title: 'Next.js', url: 'https://nextjs.org' },
    ], subFolders: [] },
    { id: 'devsub2', title: 'CSS 工具', parentTitle: '开发工具', bookmarks: [
      { id: 'b8', title: 'Tailwind CSS', url: 'https://tailwindcss.com' },
      { id: 'b9', title: 'CSS-Tricks', url: 'https://css-tricks.com' },
    ], subFolders: [] },
    { id: 'dev2', title: '设计资源', parentTitle: '书签栏', bookmarks: [
      { id: 'b10', title: 'Figma', url: 'https://figma.com' },
      { id: 'b11', title: 'Dribbble', url: 'https://dribbble.com' },
      { id: 'b12', title: 'Behance', url: 'https://behance.net' },
      { id: 'b13', title: 'Unsplash', url: 'https://unsplash.com' },
    ], subFolders: [] },
    { id: 'dev3', title: '新闻与博客', parentTitle: '书签栏', bookmarks: [
      { id: 'b14', title: 'Hacker News', url: 'https://news.ycombinator.com' },
      { id: 'b15', title: '掘金', url: 'https://juejin.cn' },
      { id: 'b16', title: '知乎', url: 'https://zhihu.com' },
    ], subFolders: [{ id: 'devsub3', title: '技术博客' }] },
    { id: 'devsub3', title: '技术博客', parentTitle: '新闻与博客', bookmarks: [
      { id: 'b17', title: 'Overreacted', url: 'https://overreacted.io' },
      { id: 'b18', title: 'Kent C. Dodds', url: 'https://kentcdodds.com/blog' },
    ], subFolders: [] },
    { id: 'dev4', title: '娱乐', parentTitle: '书签栏', bookmarks: [
      { id: 'b19', title: 'YouTube', url: 'https://youtube.com' },
      { id: 'b20', title: 'Bilibili', url: 'https://bilibili.com' },
      { id: 'b21', title: 'Netflix', url: 'https://netflix.com' },
    ], subFolders: [] },
    { id: 'dev5', title: 'AI 工具', parentTitle: '书签栏', bookmarks: [
      { id: 'b22', title: 'ChatGPT', url: 'https://chatgpt.com' },
      { id: 'b23', title: 'Claude', url: 'https://claude.ai' },
      { id: 'b24', title: 'Midjourney', url: 'https://midjourney.com' },
      { id: 'b25', title: 'Hugging Face', url: 'https://huggingface.co' },
    ], subFolders: [] },
  ];

  allBookmarks = allFolders.flatMap(f => f.bookmarks.map(b => ({ ...b, parentTitle: f.title })));
  updateStats();
  renderGroups();
}

/* ===== Bookmark CRUD ===== */
let modalMode = 'add'; // 'add' or 'edit'
let editingBookmarkId = null;
let editingFolderId = null;

function openAddModal(folderId) {
  modalMode = 'add';
  editingBookmarkId = null;
  editingFolderId = folderId || null;
  document.getElementById('modalTitle').textContent = '添加书签';
  document.getElementById('modalTitleInput').value = '';
  document.getElementById('modalUrlInput').value = '';
  populateFolderSelect(folderId);
  document.getElementById('bookmarkModal').hidden = false;
  setTimeout(() => document.getElementById('modalTitleInput').focus(), 100);
}

function openEditModal(bmId, title, url, folderId) {
  modalMode = 'edit';
  editingBookmarkId = bmId;
  editingFolderId = folderId;
  document.getElementById('modalTitle').textContent = '编辑书签';
  document.getElementById('modalTitleInput').value = title;
  document.getElementById('modalUrlInput').value = url;
  populateFolderSelect(folderId);
  document.getElementById('modalFolder').disabled = true;
  document.getElementById('bookmarkModal').hidden = false;
  setTimeout(() => document.getElementById('modalTitleInput').focus(), 100);
}

function closeModal() {
  document.getElementById('bookmarkModal').hidden = true;
  document.getElementById('modalFolder').disabled = false;
}

function populateFolderSelect(selectedId) {
  const sel = document.getElementById('modalFolder');
  sel.innerHTML = '';
  for (const f of allFolders) {
    if (!f.parentTitle && f.parentTitle !== '') continue; // skip root
    const opt = document.createElement('option');
    opt.value = f.id;
    if (f.parentTitle === '') {
      opt.textContent = f.title;
    } else {
      opt.textContent = '  ' + f.title;
    }
    if (selectedId && f.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function saveBookmark() {
  const title = document.getElementById('modalTitleInput').value.trim();
  const url = document.getElementById('modalUrlInput').value.trim();
  const folderId = document.getElementById('modalFolder').value;

  if (!title) {
    document.getElementById('modalTitleInput').focus();
    document.getElementById('modalTitleInput').style.borderColor = 'var(--danger)';
    return;
  }
  if (!url) {
    document.getElementById('modalUrlInput').focus();
    document.getElementById('modalUrlInput').style.borderColor = 'var(--danger)';
    return;
  }

  let finalUrl = url;
  if (!/^https?:\/\//i.test(url)) finalUrl = 'https://' + url;

  try {
    if (modalMode === 'add') {
      await chrome.bookmarks.create({ parentId: folderId, title, url: finalUrl });
    } else {
      await chrome.bookmarks.update(editingBookmarkId, { title, url: finalUrl });
    }
    closeModal();
    loadBookmarks();
  } catch {
    handleDemoCrud(modalMode, { id: editingBookmarkId, title, url: finalUrl, parentId: folderId });
    closeModal();
    loadBookmarks();
  }
}

function handleDemoCrud(mode, data) {
  if (mode === 'add') {
    const folder = allFolders.find(f => f.id === data.parentId);
    if (folder) {
      const newId = 'demo_' + Date.now();
      folder.bookmarks.push({ id: newId, title: data.title, url: data.url });
      allBookmarks.push({ id: newId, title: data.title, url: data.url, parentTitle: folder.title });
    }
  } else if (mode === 'edit') {
    for (const folder of allFolders) {
      const bm = folder.bookmarks.find(b => b.id === data.id);
      if (bm) { bm.title = data.title; bm.url = data.url; break; }
    }
    const bm = allBookmarks.find(b => b.id === data.id);
    if (bm) { bm.title = data.title; bm.url = data.url; }
  } else if (mode === 'delete') {
    for (const folder of allFolders) {
      const idx = folder.bookmarks.findIndex(b => b.id === data.id);
      if (idx !== -1) { folder.bookmarks.splice(idx, 1); break; }
    }
    const bmIdx = allBookmarks.findIndex(b => b.id === data.id);
    if (bmIdx !== -1) allBookmarks.splice(bmIdx, 1);
  }
}

async function deleteBookmark(bmId) {
  try {
    await chrome.bookmarks.remove(bmId);
  } catch {
    handleDemoCrud('delete', { id: bmId });
  }
  hideDeleteToast();
  loadBookmarks();
}

function showDeleteToast(bmId, title) {
  const toast = document.getElementById('deleteToast');
  toast.querySelector('.delete-toast-msg').textContent = '确定删除「' + title + '」？';
  toast.dataset.bmId = bmId;
  toast.hidden = false;
}

function hideDeleteToast() {
  const toast = document.getElementById('deleteToast');
  delete toast.dataset.folderId;
  toast.hidden = true;
}

async function deleteFolder(folderId) {
  try {
    await chrome.bookmarks.removeTree(folderId);
  } catch {
    // Demo mode: remove folder and its bookmarks from local state
    const folder = allFolders.find(f => f.id === folderId);
    if (folder) {
      for (const bm of folder.bookmarks) {
        const bmIdx = allBookmarks.findIndex(b => b.id === bm.id);
        if (bmIdx !== -1) allBookmarks.splice(bmIdx, 1);
      }
      // Also remove bookmarks in subfolders
      for (const sub of folder.subFolders) {
        const sf = allFolders.find(f => f.id === sub.id);
        if (sf) {
          for (const bm of sf.bookmarks) {
            const bmIdx = allBookmarks.findIndex(b => b.id === bm.id);
            if (bmIdx !== -1) allBookmarks.splice(bmIdx, 1);
          }
          const sfIdx = allFolders.findIndex(f => f.id === sub.id);
          if (sfIdx !== -1) allFolders.splice(sfIdx, 1);
        }
      }
      const fIdx = allFolders.findIndex(f => f.id === folderId);
      if (fIdx !== -1) allFolders.splice(fIdx, 1);
    }
  }
  hideDeleteToast();
  loadBookmarks();
}

function showDeleteFolderToast(folderId, title) {
  const toast = document.getElementById('deleteToast');
  toast.querySelector('.delete-toast-msg').textContent = '确定删除分组「' + title + '」及其所有书签？';
  toast.dataset.folderId = folderId;
  toast.hidden = false;
}

/* ===== Folder Creation ===== */
function openAddFolderModal() {
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderNameInput').style.borderColor = '';
  document.getElementById('folderModal').hidden = false;
  setTimeout(() => document.getElementById('folderNameInput').focus(), 100);
}

function closeFolderModal() {
  document.getElementById('folderModal').hidden = true;
}

async function createFolder() {
  const name = document.getElementById('folderNameInput').value.trim();
  if (!name) {
    document.getElementById('folderNameInput').focus();
    document.getElementById('folderNameInput').style.borderColor = 'var(--danger)';
    return;
  }
  try {
    // Create in bookmarks bar (parentId '1') for top-level folders
    await chrome.bookmarks.create({ parentId: '1', title: name });
  } catch {
    // Demo mode
    const newId = 'demo_folder_' + Date.now();
    allFolders.push({ id: newId, title: name, parentTitle: '书签栏', bookmarks: [], subFolders: [] });
  }
  closeFolderModal();
  loadBookmarks();
}

/* ===== Icon Helper ===== */
function icon(name) {
  return '<i class="icon-' + name + '"></i>';
}

/* ===== Utility ===== */
function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ===== State ===== */
let allFolders = [];
let allBookmarks = [];
let currentFilter = 'all';
let theme = 'light';
let bgPreset = 'default';
let bgImageUrl = null;
let searchQuery = '';

/* ===== Initialize ===== */
function init() {
  loadSettings().then(() => {
    loadBookmarks();
    setupEventListeners();
    applyTheme();
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
    theme = result.theme || 'light';
    bgPreset = result.bgPreset || 'default';
    bgImageUrl = result.bgImageUrl || null;
  } catch {
    theme = localStorage.getItem('bm_theme') || 'light';
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
    container.innerHTML = '<div class="loading">📭 没有找到匹配的书签</div>';
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
        pinnedBms.push(bm);
      }
    }
    if (pinnedBms.length > 0) {
      const ps = document.createElement('div');
      ps.className = 'pinned-bookmarks glass';
      for (const bm of pinnedBms) {
        try {
          const url = new URL(bm.url);
          const link = document.createElement('a');
          link.className = 'pinned-bookmark';
          link.href = bm.url;
          link.target = '_blank';
          link.innerHTML = '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(url.hostname) + '&sz=32" alt=""> <span>' + esc(bm.title || url.hostname) + '</span>';
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
      card.innerHTML = `
        <div class="group-card-icon">📁</div>
        <div class="group-card-title">${esc(folder.title)}</div>
        <div class="group-card-count">${folder.bookmarks.length} 个书签${folder.subFolders.length ? ' · ' + folder.subFolders.length + ' 个子分组' : ''}</div>
      `;
      card.addEventListener('mouseenter', () => showPreview(folder, card));
      card.addEventListener('mouseleave', () => scheduleHidePreview());
      card.addEventListener('click', () => {
        currentFilter = folder.id;
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
          + '<span class="folder-detail-icon">📁</span>'
          + '<span class="folder-detail-title">' + esc(folder.title) + '</span>'
          + '<span class="folder-detail-count">' + folder.bookmarks.length + ' 个书签</span>'
          + '</div>';

        html += '<div class="folder-detail-links">';
        const q = searchQuery.toLowerCase();
        for (const bm of folder.bookmarks) {
          if (bm.title.toLowerCase().includes(q)) {
            try {
              const url = new URL(bm.url);
              html += '<a href="' + esc(bm.url) + '" class="bookmark-card glass" target="_blank">'
                + '<img class="bookmark-card-favicon" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(url.hostname) + '&sz=32" alt="">'
                + '<div class="bookmark-card-info">'
                + '<div class="bookmark-card-title">' + highlightText(esc(bm.title), esc(q)) + '</div>'
                + '<div class="bookmark-card-url">' + esc(url.hostname) + '</div>'
                + '</div></a>';
            } catch {}
          }
        }
        html += '</div>';

        for (const sub of folder.subFolders) {
          const sf = allFolders.find(f => f.id === sub.id);
          if (sf && (sub.title.toLowerCase().includes(q) || hasMatchingBookmarks(sf))) {
            html += '<div class="search-sub-ref" data-folder-id="' + sub.id + '">'
              + '📂 ' + esc(sub.title) + ' →</div>';
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
        card.innerHTML = `
          <div class="group-card-icon">📁</div>
          <div class="group-card-title">${highlightText(esc(folder.title), esc(searchQuery))}</div>
          <div class="group-card-count">${folder.bookmarks.length} 个书签${folder.subFolders.length ? ' · ' + folder.subFolders.length + ' 个子分组' : ''}</div>
        `;
        card.addEventListener('mouseenter', () => showPreview(folder, card));
        card.addEventListener('mouseleave', () => scheduleHidePreview());
        card.addEventListener('click', () => {
          currentFilter = folder.id;
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

  const backBtn = document.createElement('button');
  backBtn.className = 'filter-back-btn glass';
  backBtn.innerHTML = '← 返回全部分组';
  backBtn.addEventListener('click', () => {
    currentFilter = 'all';
    updateActiveFilter();
    renderGroups();
  });
  container.appendChild(backBtn);

  const detail = document.createElement('div');
  detail.className = 'folder-detail glass';
  detail.innerHTML = `
    <div class="folder-detail-header">
      <span class="folder-detail-icon">📁</span>
      <span class="folder-detail-title">${esc(folder.title)}</span>
    </div>
  `;

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
        <div class="group-card-icon">📂</div>
        <div class="group-card-title">${esc(sub.title)}</div>
        <div class="group-card-count">${sf ? sf.bookmarks.length : 0} 个书签</div>
      `;
      if (sf) {
        sc.addEventListener('mouseenter', () => showPreview(sf, sc));
        sc.addEventListener('mouseleave', () => scheduleHidePreview());
        sc.addEventListener('click', (e) => { e.stopPropagation(); renderFilteredView(sf); });
      }
      subGrid.appendChild(sc);
    }
    subsDiv.appendChild(subGrid);
    detail.appendChild(subsDiv);
  }

  if (folder.bookmarks.length > 0) {
    const linksDiv = document.createElement('div');
    linksDiv.className = 'folder-detail-links';
    const lt = document.createElement('div');
    lt.className = 'folder-detail-section-title';
    lt.textContent = '书签';
    linksDiv.appendChild(lt);

    for (const bm of folder.bookmarks) {
      try {
        const url = new URL(bm.url);
        const el = document.createElement('a');
        el.className = 'bookmark-card glass';
        el.href = bm.url;
        el.target = '_blank';
        el.innerHTML = `
          <img class="bookmark-card-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=32" alt="">
          <div class="bookmark-card-info">
            <div class="bookmark-card-title">${esc(bm.title)}</div>
            <div class="bookmark-card-url">${esc(url.hostname)}</div>
          </div>
        `;
        linksDiv.appendChild(el);
      } catch { /* invalid url */ }
    }
    detail.appendChild(linksDiv);
  }

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

  let html = '<div class="group-preview-title">📁 ' + esc(folder.title) + '</div>';

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
        + '<span class="arrow">▶</span> 📂 ' + esc(sub.title) + (sf ? ' (' + sf.bookmarks.length + ')' : '')
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
    if (p && !p.matches(':hover')) p.classList.remove('visible');
  }, 200);
}

document.getElementById('activePreview').addEventListener('mouseenter', () => clearTimeout(previewTimeout));
document.getElementById('activePreview').addEventListener('mouseleave', () => {
  document.getElementById('activePreview').classList.remove('visible');
});

/* ===== Theme ===== */
function applyTheme() {
  document.getElementById('appBody').dataset.theme = theme;
  document.getElementById('themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
  applyBackground();
}

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveSettings();
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
  document.getElementById('statsTotal').textContent = '📊 共 ' + allFolders.length + ' 个分组 · ' + allBookmarks.length + ' 个书签';
}

function updateActiveFilter() {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const a = document.querySelector('.filter-btn[data-filter="' + currentFilter + '"]');
  if (a) a.classList.add('active');
}

/* ===== Events ===== */
function setupEventListeners() {
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
    }
  });
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

/* ===== Utility ===== */
function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

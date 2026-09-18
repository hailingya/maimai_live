// ════════════════════════════════════════════════
//  舞萌DX 直播点歌器 - 控制面板逻辑
// ════════════════════════════════════════════════

const DIFF_COLORS = {
  0: { name: 'BASIC',     color: '#1ec020' },
  1: { name: 'ADVANCED',  color: '#ff9a00' },
  2: { name: 'EXPERT',    color: '#ff3030' },
  3: { name: 'MASTER',    color: '#9e45ec' },
  4: { name: 'Re:MASTER', color: '#e0d0f5' },
  '-1': { name: 'UTAGE',  color: '#ff69b4' }
};

let playlist = [];
let currentIndex = -1;
let paused = false;

// ── DOM ──────────────────────────────────────────
const $ = id => document.getElementById(id);
const streamUrl = $('streamUrl');
const streamFrame = $('streamFrame');
const iframePlaceholder = $('iframePlaceholder');
const searchInput = $('searchInput');
const searchResults = $('searchResults');
const playlistView = $('playlistView');
const pauseBtn = $('pauseBtn');

// ── 直播间嵌入 ────────────────────────────────────
function loadStream() {
  const url = streamUrl.value.trim();
  if (!url) return;
  try {
    streamFrame.src = url;
    iframePlaceholder.classList.add('hidden');
    localStorage.setItem('streamUrl', url);
  } catch (e) {
    alert('链接加载失败，请检查 URL');
  }
}

$('loadStream').addEventListener('click', loadStream);
streamUrl.addEventListener('keydown', e => { if (e.key === 'Enter') loadStream(); });

// 恢复上次链接
const savedUrl = localStorage.getItem('streamUrl');
if (savedUrl) {
  streamUrl.value = savedUrl;
}

// ── 搜索（防抖）──────────────────────────────────
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) {
    searchResults.innerHTML = '<div class="empty-hint">输入关键词开始搜索</div>';
    return;
  }
  searchTimer = setTimeout(() => doSearch(q), 600);
});

$('searchBtn').addEventListener('click', () => doSearch(searchInput.value.trim()));

async function doSearch(q) {
  if (!q) return;
  searchResults.innerHTML = '<div class="loading">搜索中</div>';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderSearchResults(data.songs || []);
  } catch (e) {
    searchResults.innerHTML = '<div class="empty-hint">搜索失败，请检查服务器是否运行</div>';
  }
}

function renderSearchResults(songs) {
  if (songs.length === 0) {
    searchResults.innerHTML = '<div class="empty-hint">未找到匹配的歌曲</div>';
    return;
  }

  searchResults.innerHTML = '';
  songs.forEach(song => {
    const div = document.createElement('div');
    div.className = 'song-item';

    let coverHtml = '';
    if (song.cover) {
      coverHtml = `<img class="song-cover" src="/api/cover/${song.cover}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="song-cover-placeholder" style="display:none">♪</div>`;
    } else {
      coverHtml = '<div class="song-cover-placeholder">♪</div>';
    }

    const aliasBadge = song.matchedAlias
      ? `<span class="song-alias-badge">别名: ${escapeHtml(song.matchedAlias)}</span>` : '';

    const diffBtns = (song.difficulties || []).map(d => {
      const diffInfo = DIFF_COLORS[d.difficulty] || DIFF_COLORS['-1'];
      const typeTag = d.type === 'dx'
        ? '<span class="type-tag">DX</span>'
        : d.type === 'utage' ? '<span class="type-tag">宴</span>' : '';
      return `<button class="diff-btn" data-diff="${d.difficulty}"
        data-type="${d.type}" data-difficulty="${d.difficulty}"
        title="${d.typeLabel} ${diffInfo.name} ${d.level}">
        ${typeTag}<span class="diff-label">${diffInfo.name}</span>
        <span class="diff-level">${d.level}</span>
      </button>`;
    }).join('');

    div.innerHTML = `
      ${coverHtml}
      <div class="song-info">
        <div class="song-title">${escapeHtml(song.title)}${aliasBadge}</div>
        <div class="song-meta">${escapeHtml(song.artist || '')} · ${song.bpm || '?'} BPM</div>
      </div>
      <div class="diff-buttons">${diffBtns}</div>
    `;

    div.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        addToPlaylist(song, {
          type: btn.dataset.type,
          difficulty: parseInt(btn.dataset.difficulty)
        });
      });
    });

    searchResults.appendChild(div);
  });
}

// ── 添加到歌单 ───────────────────────────────────
async function addToPlaylist(song, selectedDiff) {
  const diff = song.difficulties.find(d =>
    d.type === selectedDiff.type && d.difficulty === selectedDiff.difficulty
  );
  if (!diff) return;

  try {
    const res = await fetch('/api/playlist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: song.id, type: selectedDiff.type, difficulty: selectedDiff.difficulty })
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    playlist = data.playlist;
    currentIndex = data.currentIndex;
    renderPlaylist();
  } catch (e) {
    alert('添加失败');
  }
}

// ── 歌单渲染 ─────────────────────────────────────
function renderPlaylist() {
  if (playlist.length === 0) {
    playlistView.innerHTML = '<div class="empty-hint">歌单为空，从左侧搜索添加歌曲</div>';
    return;
  }

  playlistView.innerHTML = '';
  playlist.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'playlist-item' + (idx === currentIndex ? ' current' : '');
    div.dataset.index = idx;

    const typeClass = item.type === 'dx' ? 'dx' : item.type === 'utage' ? 'utage' : 'std';
    const typeLabel = item.typeLabel || (item.type === 'dx' ? 'DX' : item.type === 'utage' ? '宴会' : '标准');

    div.innerHTML = `
      <span class="playlist-index">${idx + 1}</span>
      <div class="playlist-diff-bar" data-diff="${item.difficulty}"></div>
      <div class="playlist-song-info">
        <div class="playlist-song-title">${escapeHtml(item.title)}</div>
        <div class="playlist-song-meta">
          <span class="playlist-type-badge ${typeClass}">${typeLabel}</span>
          <span>${item.difficultyName} ${item.level}</span>
          ${idx === currentIndex && paused ? '<span class="paused-badge">已暂停</span>' : ''}
        </div>
      </div>
      <button class="playlist-remove" title="移除">×</button>
    `;

    div.addEventListener('click', e => {
      if (e.target.classList.contains('playlist-remove')) return;
      setCurrent(idx);
    });

    div.querySelector('.playlist-remove').addEventListener('click', e => {
      e.stopPropagation();
      removeFromPlaylist(idx);
    });

    playlistView.appendChild(div);
  });
}

async function setCurrent(idx) {
  try {
    const res = await fetch('/api/playlist/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx })
    });
    const data = await res.json();
    playlist = data.playlist;
    currentIndex = data.currentIndex;
    renderPlaylist();
  } catch (e) {}
}

async function removeFromPlaylist(idx) {
  try {
    const res = await fetch('/api/playlist/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx })
    });
    const data = await res.json();
    playlist = data.playlist;
    currentIndex = data.currentIndex;
    renderPlaylist();
  } catch (e) {}
}

async function playlistAction(action) {
  try {
    const res = await fetch(`/api/playlist/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await res.json();
    playlist = data.playlist;
    currentIndex = data.currentIndex;
    if (data.paused !== undefined) {
      paused = data.paused;
      updatePauseBtn();
    }
    renderPlaylist();
  } catch (e) {}
}

$('prevBtn').addEventListener('click', () => playlistAction('prev'));
$('nextBtn').addEventListener('click', () => playlistAction('next'));
$('clearBtn').addEventListener('click', () => {
  if (confirm('确定清空歌单？')) playlistAction('clear');
});

pauseBtn.addEventListener('click', async () => {
  try {
    const action = paused ? 'resume' : 'pause';
    const res = await fetch(`/api/playlist/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await res.json();
    paused = data.paused;
    updatePauseBtn();
  } catch (e) {}
});

function updatePauseBtn() {
  if (paused) {
    pauseBtn.textContent = '恢复';
    pauseBtn.title = '恢复播放';
    pauseBtn.classList.add('btn-primary');
  } else {
    pauseBtn.textContent = '暂停';
    pauseBtn.title = '暂停当前歌曲';
    pauseBtn.classList.remove('btn-primary');
  }
}

// ── 轮询同步歌单状态 ───────────────────────────────
async function syncState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    if (data.paused !== paused) {
      paused = data.paused;
      updatePauseBtn();
    }
    if (data.playlistTotal !== playlist.length || data.currentIndex !== currentIndex) {
      const stateRes = await fetch('/api/playlist');
      const stateData = await stateRes.json();
      playlist = stateData.playlist;
      currentIndex = stateData.currentIndex;
      paused = stateData.paused;
      updatePauseBtn();
      renderPlaylist();
    }
  } catch (e) {}
}

setInterval(syncState, 5000);

// ── 手机访问弹窗 ─────────────────────────────────
$('phoneAccessBtn').addEventListener('click', openPhoneModal);
$('closeModal').addEventListener('click', closePhoneModal);
$('modalBackdrop').addEventListener('click', closePhoneModal);

async function openPhoneModal() {
  const modal = $('phoneModal');
  const qr = $('qrCode');
  const urlsDiv = $('phoneUrls');
  urlsDiv.innerHTML = '<p style="color:#8a87a3">正在获取地址…</p>';
  qr.src = '';
  modal.classList.remove('hidden');

  try {
    const res = await fetch('/api/info');
    const data = await res.json();
    const urls = data.urls || [];
    if (urls.length === 0) {
      urlsDiv.innerHTML = '<p style="color:#8a87a3">未检测到局域网 IP，请检查网络连接</p>';
      return;
    }
    urlsDiv.innerHTML = '';
    urls.forEach(url => {
      const div = document.createElement('div');
      div.className = 'phone-url';
      div.textContent = url;
      urlsDiv.appendChild(div);
    });
    const firstUrl = urls[0];
    qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(firstUrl);
    qr.onerror = () => { qr.style.display = 'none'; };
  } catch (e) {
    urlsDiv.innerHTML = '<p style="color:#8a87a3">获取地址失败</p>';
  }
}

function closePhoneModal() {
  $('phoneModal').classList.add('hidden');
}

// ── 工具 ─────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── 初始化 ───────────────────────────────────────
(async function init() {
  try {
    const res = await fetch('/api/playlist');
    const data = await res.json();
    playlist = data.playlist;
    currentIndex = data.currentIndex;
    paused = data.paused || false;
    updatePauseBtn();
    renderPlaylist();
  } catch (e) {}
})();

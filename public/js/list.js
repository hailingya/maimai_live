// ════════════════════════════════════════════════
//  舞萌DX 歌单列表页 - 逻辑
// ════════════════════════════════════════════════

const $ = id => document.getElementById(id);

async function poll() {
  try {
    const res = await fetch('/api/playlist');
    const data = await res.json();
    renderList(data.playlist || [], data.currentIndex);
  } catch (e) {}
}

function renderList(playlist, currentIndex) {
  const container = $('playlist');
  $('totalCount').textContent = playlist.length;

  if (playlist.length === 0) {
    container.innerHTML = '<div class="empty-hint">等待点歌…</div>';
    return;
  }

  container.innerHTML = '';
  playlist.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'list-item' + (idx === currentIndex ? ' current' : '');

    const typeClass = item.type === 'dx' ? 'dx' : item.type === 'utage' ? 'utage' : 'std';
    const typeLabel = item.typeLabel || (item.type === 'dx' ? 'DX' : item.type === 'utage' ? '宴会' : '标准');

    div.innerHTML = `
      <span class="list-index">${idx + 1}</span>
      <div class="list-diff-bar" data-diff="${item.difficulty}"></div>
      <div class="list-song-info">
        <div class="list-song-title">${escapeHtml(item.title)}</div>
        <div class="list-song-meta">
          <span class="list-type-badge ${typeClass}">${typeLabel}</span>
          <span class="list-diff-name" data-diff="${item.difficulty}">${item.difficultyName}</span>
        </div>
      </div>
      <span class="list-level" data-diff="${item.difficulty}">${item.level}</span>
    `;

    container.appendChild(div);
  });

  // 自动滚动到当前歌曲
  const current = container.querySelector('.list-item.current');
  if (current) {
    current.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

setInterval(poll, 4000);
poll();

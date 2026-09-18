// ════════════════════════════════════════════════
//  舞萌DX 直播展示页 - 逻辑
// ════════════════════════════════════════════════

const $ = id => document.getElementById(id);

let lastSongId = null;
let lastDiff = null;

async function poll() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    updateDisplay(data);
  } catch (e) {}
}

function updateDisplay(data) {
  const current = data.current;
  const empty = $('emptyState');
  const songEl = $('currentSong');

  if (!current) {
    empty.classList.remove('hidden');
    songEl.classList.add('hidden');
    lastSongId = null;
    lastDiff = null;
    return;
  }

  const isNew = current.songId !== lastSongId ||
    current.difficulty !== lastDiff ||
    current.type !== lastDiff;

  empty.classList.add('hidden');
  songEl.classList.remove('hidden');

  if (isNew) {
    lastSongId = current.songId;
    lastDiff = current.difficulty;
  }

  // 封面
  const cover = $('cover');
  const coverPlaceholder = $('coverPlaceholder');
  if (current.cover) {
    cover.src = `/api/cover/${current.cover}`;
    cover.style.display = '';
    coverPlaceholder.style.display = 'none';
  } else {
    cover.style.display = 'none';
    coverPlaceholder.style.display = 'flex';
  }

  // 难度
  const diffBadge = $('diffBadge');
  diffBadge.textContent = current.difficultyName || 'MASTER';
  diffBadge.setAttribute('data-diff', current.difficulty);

  // 等级
  $('levelText').textContent = current.level || '?';

  // 谱面版本
  const typeBadge = $('typeBadge');
  typeBadge.textContent = current.typeLabel || '标准';
  typeBadge.className = 'type-badge ' + (
    current.type === 'dx' ? 'dx' :
    current.type === 'utage' ? 'utage' : 'std'
  );

  // 歌名
  $('songTitle').textContent = current.title || '';

  // 曲师
  $('artistText').textContent = current.artist || '';

  // BPM / 谱师
  $('bpmText').textContent = current.bpm ? `♪ ${current.bpm} BPM` : '';
  $('noteDesignerText').textContent = current.noteDesigner && current.noteDesigner !== '-'
    ? `谱师: ${current.noteDesigner}` : '';

  // 宴会谱描述
  if (current.type === 'utage' && current.utageDescription) {
    $('noteDesignerText').textContent = current.utageDescription;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 每 1.5 秒轮询
setInterval(poll, 3000);
poll();

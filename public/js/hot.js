// ════════════════════════════════════════════════
//  舞萌DX 热门点歌榜 - 逻辑
// ════════════════════════════════════════════════

const $ = id => document.getElementById(id);

let scrollTimer = null;

async function poll() {
  try {
    const res = await fetch('/api/hot');
    const data = await res.json();
    renderHot(data.songs || []);
  } catch (e) {}
}

function renderHot(songs) {
  const topThree = $('topThree');
  const scrollList = $('scrollList');

  if (songs.length === 0) {
    topThree.innerHTML = '<div class="empty-hint">暂无点歌数据</div>';
    scrollList.classList.add('hidden');
    return;
  }

  const top3 = songs.slice(0, 3);
  const rest = songs.slice(3);

  topThree.innerHTML = '';

  let arrangement;
  if (top3.length >= 3) {
    arrangement = [
      { song: top3[1], rank: 2 },
      { song: top3[0], rank: 1 },
      { song: top3[2], rank: 3 }
    ];
  } else if (top3.length === 2) {
    arrangement = [
      { song: top3[0], rank: 1 },
      { song: top3[1], rank: 2 }
    ];
  } else {
    arrangement = [
      { song: top3[0], rank: 1 }
    ];
  }

  arrangement.forEach(({ song, rank }) => {
    if (!song) return;

    const card = document.createElement('div');
    card.className = `podium-card rank-${rank}`;

    let coverHtml;
    if (song.cover) {
      coverHtml = `<img class="podium-cover" src="/api/cover/${song.cover}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="podium-cover-placeholder" style="display:none">♪</div>`;
    } else {
      coverHtml = '<div class="podium-cover-placeholder">♪</div>';
    }

    card.innerHTML = `
      <div class="podium-rank">${rank}</div>
      ${coverHtml}
      <div class="podium-title">${escapeHtml(song.title)}</div>
      <div class="podium-artist">${escapeHtml(song.artist || '')}</div>
      <div class="podium-count">${song.count} 次</div>
    `;

    topThree.appendChild(card);
  });

  if (rest.length > 0) {
    scrollList.classList.remove('hidden');
    renderScrollList(rest);
  } else {
    scrollList.classList.add('hidden');
  }
}

function renderScrollList(songs) {
  const track = $('scrollTrack');
  track.innerHTML = '';

  if (scrollTimer) {
    clearInterval(scrollTimer);
    scrollTimer = null;
  }

  songs.forEach((song, i) => {
    const rank = i + 4;

    const div = document.createElement('div');
    div.className = 'scroll-item';

    let coverHtml;
    if (song.cover) {
      coverHtml = `<img class="scroll-cover" src="/api/cover/${song.cover}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="scroll-cover-placeholder" style="display:none">♪</div>`;
    } else {
      coverHtml = '<div class="scroll-cover-placeholder">♪</div>';
    }

    div.innerHTML = `
      <span class="scroll-rank">${rank}</span>
      ${coverHtml}
      <div class="scroll-info">
        <div class="scroll-title">${escapeHtml(song.title)}</div>
        <div class="scroll-artist">${escapeHtml(song.artist || '')}</div>
      </div>
      <span class="scroll-count">${song.count}</span>
    `;

    track.appendChild(div);
  });

  if (songs.length <= 3) {
    track.style.transform = '';
    return;
  }

  const items = track.querySelectorAll('.scroll-item');
  if (items.length === 0) return;

  const itemHeight = items[0].offsetHeight || 64;
  const gap = 8;
  const stepHeight = itemHeight + gap;

  const clones = [];
  for (let i = 0; i < songs.length; i++) {
    const clone = items[i].cloneNode(true);
    clones.push(clone);
  }
  clones.forEach(c => track.appendChild(c));

  const totalHeight = songs.length * stepHeight;

  let offset = 0;
  scrollTimer = setInterval(() => {
    offset += 1;
    if (offset >= totalHeight) {
      offset = 0;
    }
    track.style.transform = `translateY(-${offset}px)`;
  }, 40);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

setInterval(poll, 10000);
poll();

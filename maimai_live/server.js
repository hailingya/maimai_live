const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// 封面目录：上级目录的 maimai_img
const COVER_DIR = path.join(ROOT, '..', 'maimai_img');

// ── 难度映射 ──────────────────────────────────────
const DIFF_MAP = {
  basic: 0,
  advanced: 1,
  expert: 2,
  master: 3,
  remaster: 4
};
const DIFF_NAMES = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];

// ── 加载数据 ──────────────────────────────────────
let rawData;
try {
  rawData = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'maimai_data.json'), 'utf8'));
} catch (e) {
  console.error('数据文件加载失败:', e.message);
  process.exit(1);
}

// ── 转换数据格式 ──────────────────────────────────
// 将 maimai_data.json 新格式转换为内部使用的格式
const songList = { songs: [] };
const idToSong = {};

rawData.songs.forEach((song, idx) => {
  const id = idx + 1; // 分配数字 id
  const difficulties = { standard: [], dx: [], utage: [] };

  (song.sheets || []).forEach(sheet => {
    const diffKey = sheet.difficulty;
    if (sheet.type === 'std') {
      if (DIFF_MAP.hasOwnProperty(diffKey)) {
        difficulties.standard.push({
          difficulty: DIFF_MAP[diffKey],
          level: sheet.level,
          level_value: sheet.levelValue || 0,
          note_designer: sheet.noteDesigner || '-',
          internalLevel: sheet.internalLevel || null,
          internalLevelValue: sheet.internalLevelValue || 0
        });
      }
    } else if (sheet.type === 'dx') {
      if (DIFF_MAP.hasOwnProperty(diffKey)) {
        difficulties.dx.push({
          difficulty: DIFF_MAP[diffKey],
          level: sheet.level,
          level_value: sheet.levelValue || 0,
          note_designer: sheet.noteDesigner || '-',
          internalLevel: sheet.internalLevel || null,
          internalLevelValue: sheet.internalLevelValue || 0
        });
      }
    } else if (sheet.type === 'utage') {
      // 宴会谱：difficulty 是特殊汉字（如【宴】【協】等）
      const kanji = diffKey.replace(/[【】]/g, '');
      difficulties.utage.push({
        difficulty: -1,
        kanji: kanji || '宴',
        level: sheet.level || '?',
        level_value: sheet.levelValue || 0,
        note_designer: sheet.noteDesigner || '-',
        description: sheet.internalLevel || ''
      });
    }
  });

  const songEntry = {
    id: id,
    songId: song.songId,
    title: song.title,
    artist: song.artist || '',
    genre: song.category || '',
    bpm: song.bpm || 0,
    imageName: song.imageName || '',
    version: song.version || '',
    difficulties: difficulties
  };

  songList.songs.push(songEntry);
  idToSong[id] = songEntry;
});

// 标题 → 封面文件名（直接用 imageName）
const titleToCover = {};
songList.songs.forEach(s => {
  if (s.imageName) titleToCover[s.title.toLowerCase()] = s.imageName;
});

// 别名（新数据暂无别名表，留空）
const aliasToSongId = {};

// ── 歌单状态 ──────────────────────────────────────
let playlist = [];
let currentIndex = -1;

// ── 工具函数 ──────────────────────────────────────
function getCoverForSong(song) {
  return titleToCover[song.title.toLowerCase()] || null;
}

function formatDifficulty(song) {
  const result = [];
  const diffs = song.difficulties || {};
  if (diffs.standard) {
    diffs.standard.forEach(d => {
      result.push({
        type: 'standard',
        typeLabel: '标准',
        difficulty: d.difficulty,
        difficultyName: DIFF_NAMES[d.difficulty] || 'UNKNOWN',
        level: d.level,
        levelValue: d.level_value,
        noteDesigner: d.note_designer || '-'
      });
    });
  }
  if (diffs.dx) {
    diffs.dx.forEach(d => {
      result.push({
        type: 'dx',
        typeLabel: 'DX',
        difficulty: d.difficulty,
        difficultyName: DIFF_NAMES[d.difficulty] || 'UNKNOWN',
        level: d.level,
        levelValue: d.level_value,
        noteDesigner: d.note_designer || '-'
      });
    });
  }
  if (diffs.utage) {
    diffs.utage.forEach(d => {
      result.push({
        type: 'utage',
        typeLabel: '宴会',
        difficulty: -1,
        difficultyName: 'UTAGE',
        level: d.kanji || '?',
        levelValue: 0,
        noteDesigner: '-',
        utageDescription: d.description || ''
      });
    });
  }
  return result;
}

function buildPlaylistItem(song, selectedDiff) {
  return {
    songId: song.id,
    title: song.title,
    artist: song.artist || '',
    genre: song.genre || '',
    bpm: song.bpm || 0,
    type: selectedDiff.type,
    typeLabel: selectedDiff.typeLabel,
    difficulty: selectedDiff.difficulty,
    difficultyName: selectedDiff.difficultyName,
    level: selectedDiff.level,
    levelValue: selectedDiff.levelValue,
    noteDesigner: selectedDiff.noteDesigner,
    cover: getCoverForSong(song),
    utageDescription: selectedDiff.utageDescription || ''
  };
}

function searchSongs(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results = [];
  const seen = new Set();

  songList.songs.forEach(song => {
    if (song.title.toLowerCase().includes(q) && !seen.has(song.id)) {
      seen.add(song.id);
      results.push({
        id: song.id,
        title: song.title,
        artist: song.artist || '',
        genre: song.genre || '',
        bpm: song.bpm || 0,
        cover: getCoverForSong(song),
        difficulties: formatDifficulty(song)
      });
    }
  });

  for (const [alias, songId] of Object.entries(aliasToSongId)) {
    if (alias.includes(q) && !seen.has(songId)) {
      seen.add(songId);
      const song = idToSong[songId];
      if (song) {
        results.push({
          id: song.id,
          title: song.title,
          artist: song.artist || '',
          genre: song.genre || '',
          bpm: song.bpm || 0,
          cover: getCoverForSong(song),
          difficulties: formatDifficulty(song),
          matchedAlias: alias
        });
      }
    }
  }

  return results.slice(0, 20);
}

// ── 从 API 获取歌曲（回退） ──────────────────────
function fetchSongFromAPI(id) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://maimai.lxns.net/api/v0/maimai/song/${id}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── HTTP 请求体读取 ──────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ── MIME 类型 ────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

// ── 静态文件服务 ──────────────────────────────────
function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

// ── JSON 响应 ────────────────────────────────────
function sendJSON(res, obj, status = 200) {
  const json = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(json);
}

// ── 路由 ──────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ── API 路由 ──
  if (pathname === '/api/search') {
    sendJSON(res, { songs: searchSongs(query.q || '') });
    return;
  }

  if (pathname === '/api/song/list') {
    const songs = songList.songs.map(s => ({
      id: s.id, title: s.title, artist: s.artist || '',
      cover: getCoverForSong(s), difficulties: formatDifficulty(s)
    }));
    sendJSON(res, { songs });
    return;
  }

  const songMatch = pathname.match(/^\/api\/song\/(\d+)$/);
  if (songMatch) {
    const id = parseInt(songMatch[1]);
    const song = idToSong[id];
    if (song) {
      sendJSON(res, {
        id: song.id, title: song.title, artist: song.artist || '',
        genre: song.genre || '', bpm: song.bpm || 0,
        cover: getCoverForSong(song), difficulties: formatDifficulty(song)
      });
      return;
    }
    // 回退到在线 API
    try {
      const apiRes = await fetchSongFromAPI(id);
      if (apiRes.code === 0 && apiRes.data) {
        sendJSON(res, apiRes.data);
      } else {
        sendJSON(res, { error: '未找到歌曲' }, 404);
      }
    } catch (e) {
      sendJSON(res, { error: 'API 请求失败: ' + e.message }, 502);
    }
    return;
  }

  // ── 歌单管理 ──
  if (pathname === '/api/playlist' && req.method === 'GET') {
    sendJSON(res, { playlist, currentIndex });
    return;
  }

  if (pathname === '/api/playlist/add' && req.method === 'POST') {
    const body = await readBody(req);
    const song = idToSong[body.songId];
    if (!song) { sendJSON(res, { error: '歌曲不存在' }, 400); return; }
    const diffs = formatDifficulty(song);
    const diff = diffs.find(d =>
      d.type === body.type && d.difficulty === body.difficulty
    );
    if (!diff) { sendJSON(res, { error: '难度不存在' }, 400); return; }
    const item = buildPlaylistItem(song, diff);
    playlist.push(item);
    if (currentIndex === -1) currentIndex = 0;
    sendJSON(res, { ok: true, playlist, currentIndex });
    return;
  }

  if (pathname === '/api/playlist/remove' && req.method === 'POST') {
    const body = await readBody(req);
    const idx = body.index;
    if (idx < 0 || idx >= playlist.length) {
      sendJSON(res, { error: '索引无效' }, 400); return;
    }
    playlist.splice(idx, 1);
    if (playlist.length === 0) {
      currentIndex = -1;
    } else if (idx < currentIndex) {
      currentIndex--;
    } else if (idx === currentIndex && currentIndex >= playlist.length) {
      currentIndex = playlist.length - 1;
    }
    sendJSON(res, { ok: true, playlist, currentIndex });
    return;
  }

  if (pathname === '/api/playlist/current' && req.method === 'POST') {
    const body = await readBody(req);
    const idx = body.index;
    if (idx < -1 || idx >= playlist.length) {
      sendJSON(res, { error: '索引无效' }, 400); return;
    }
    currentIndex = idx;
    sendJSON(res, { ok: true, playlist, currentIndex });
    return;
  }

  if (pathname === '/api/playlist/next' && req.method === 'POST') {
    if (currentIndex < playlist.length - 1) currentIndex++;
    else currentIndex = -1;
    sendJSON(res, { ok: true, playlist, currentIndex });
    return;
  }

  if (pathname === '/api/playlist/prev' && req.method === 'POST') {
    if (currentIndex > 0) currentIndex--;
    sendJSON(res, { ok: true, playlist, currentIndex });
    return;
  }

  if (pathname === '/api/playlist/clear' && req.method === 'POST') {
    playlist = [];
    currentIndex = -1;
    sendJSON(res, { ok: true, playlist, currentIndex });
    return;
  }

  if (pathname === '/api/playlist/reorder' && req.method === 'POST') {
    const body = await readBody(req);
    const { from, to } = body;
    if (from < 0 || from >= playlist.length || to < 0 || to >= playlist.length) {
      sendJSON(res, { error: '索引无效' }, 400); return;
    }
    const [item] = playlist.splice(from, 1);
    playlist.splice(to, 0, item);
    // 调整 currentIndex
    if (currentIndex === from) currentIndex = to;
    else if (from < currentIndex && to >= currentIndex) currentIndex--;
    else if (from > currentIndex && to <= currentIndex) currentIndex++;
    sendJSON(res, { ok: true, playlist, currentIndex });
    return;
  }

  // ── 服务器信息（供手机端获取地址） ──
  if (pathname === '/api/info') {
    const ips = [];
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    const urls = ips.map(ip => `http://${ip}:${PORT}`);
    sendJSON(res, { urls, port: PORT });
    return;
  }

  // ── 状态（供 live.html 轮询） ──
  if (pathname === '/api/state') {
    const current = currentIndex >= 0 && currentIndex < playlist.length
      ? playlist[currentIndex] : null;
    const upcoming = playlist.slice(currentIndex + 1, currentIndex + 4);
    sendJSON(res, { current, currentIndex, upcoming, playlistTotal: playlist.length });
    return;
  }

  // ── 封面图片 ──
  const coverMatch = pathname.match(/^\/api\/cover\/(.+)$/);
  if (coverMatch) {
    const filename = path.basename(coverMatch[1]);
    const filePath = path.join(COVER_DIR, filename);
    if (fs.existsSync(filePath)) {
      serveStatic(req, res, filePath);
    } else {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  // ── 字体文件 ──
  if (pathname.startsWith('/fonts/')) {
    const fname = path.basename(pathname);
    const fp = path.join(ROOT, fname);
    if (fs.existsSync(fp)) { serveStatic(req, res, fp); return; }
  }

  // ── 静态文件 ──
  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(req, res, path.join(PUBLIC_DIR, 'index.html'));
    return;
  }
  if (pathname === '/live' || pathname === '/live.html') {
    serveStatic(req, res, path.join(PUBLIC_DIR, 'live.html'));
    return;
  }
  if (pathname === '/list' || pathname === '/list.html') {
    serveStatic(req, res, path.join(PUBLIC_DIR, 'list.html'));
    return;
  }

  // 其他 public 文件
  const staticPath = path.join(PUBLIC_DIR, pathname);
  const relative = path.relative(PUBLIC_DIR, staticPath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      serveStatic(req, res, staticPath);
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  console.log('');
  console.log('  ========================================');
  console.log('    maimaiDX Live Song Requester');
  console.log('  ========================================');
  console.log('');
  console.log('  Control Panel: http://localhost:' + PORT);
  console.log('  Live Display:  http://localhost:' + PORT + '/live');
  console.log('  Song List:     http://localhost:' + PORT + '/list');
  console.log('');
  if (ips.length > 0) {
    console.log('  Phone access (same WiFi):');
    ips.forEach(ip => {
      console.log('    http://' + ip + ':' + PORT);
    });
    console.log('');
  }
  console.log('  Songs:  ' + songList.songs.length);
  console.log('  Covers: ' + Object.keys(titleToCover).length);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  // Auto-open browser
  const { exec } = require('child_process');
  const openCmd = process.platform === 'win32'
    ? 'start "" http://localhost:' + PORT
    : 'open http://localhost:' + PORT;
  exec(openCmd, () => {});
});

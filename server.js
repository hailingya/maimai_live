const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const COVER_DIR = path.join(ROOT, 'maimai_img');

// ── 加载数据 ──────────────────────────────────────
let songList;
try {
  const rawData = JSON.parse(fs.readFileSync(path.join(ROOT, 'maimai_data.json'), 'utf8'));
  const songArray = rawData.songs || rawData;

  // 将 maimai_data.json 转换为原始格式
  const songs = [];
  let idCounter = 1;

  songArray.forEach(item => {
    const song = {
      id: idCounter++,
      title: item.title || '',
      artist: item.artist || '',
      genre: item.category || '',
      bpm: item.bpm || 0,
      version: item.version || 0,
      difficulties: {
        standard: [],
        dx: [],
        utage: []
      }
    };

    // 转换铺面信息
    if (item.sheets && Array.isArray(item.sheets)) {
      item.sheets.forEach(sheet => {
        const diffMap = { basic: 0, advanced: 1, expert: 2, master: 3, remaster: 4 };
        const diffIndex = diffMap[sheet.difficulty] !== undefined ? diffMap[sheet.difficulty] : 0;

        const diffEntry = {
          type: sheet.type === 'dx' ? 'dx' : (sheet.type === 'utage' ? 'utage' : 'standard'),
          difficulty: diffIndex,
          level: sheet.level || '?',
          level_value: sheet.internalLevel ? parseFloat(sheet.internalLevel) : 0,
          note_designer: sheet.noteDesigner || '-',
          internalLevel: sheet.internalLevel || '',
          version: item.version || 0
        };

        if (sheet.type === 'dx') {
          song.difficulties.dx.push(diffEntry);
        } else if (sheet.type === 'utage') {
          song.difficulties.utage.push({
            kanji: sheet.level || '?',
            description: sheet.noteDesigner || ''
          });
        } else {
          song.difficulties.standard.push(diffEntry);
        }
      });
    }

    songs.push(song);
  });

  songList = { songs };

  // 构建标题 → 本地歌曲索引（用于别名匹配）
  const titleToLocalId = {};
  songs.forEach(s => {
    const key = s.title.toLowerCase().trim();
    if (!titleToLocalId[key]) {
      titleToLocalId[key] = s.id;
    }
  });

  // 加载别名库（anname_list.json 使用 lxns API 的 song_id，需要映射到本地 ID）
  let aliasToSongIdMap = {};
  try {
    const aliasData = JSON.parse(fs.readFileSync(path.join(ROOT, 'anname_list.json'), 'utf8'));
    if (aliasData.aliases) {
      // 尝试加载预构建的映射表
      try {
        const cachedMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'alias_map.json'), 'utf8'));
        if (cachedMap.aliasToSongId) {
          aliasToSongIdMap = cachedMap.aliasToSongId;
          console.log(`  别名映射（缓存）: ${Object.keys(aliasToSongIdMap).length} 条`);
        }
      } catch (_) {
        // 缓存不存在，需要从 API 构建
      }

      // 如果没有缓存，尝试从 API 构建
      if (Object.keys(aliasToSongIdMap).length === 0) {
        console.log('  正在从 lxns API 构建别名映射...');
        // 同步构建会阻塞，我们使用一个标志位，在异步加载完成后填充
        global._pendingAliasBuild = { aliasData, titleToLocalId };
      }
    }
  } catch (e) {
    console.warn('别名库加载失败:', e.message);
  }

  // 存到全局供后续使用
  global._aliasToSongId = aliasToSongIdMap;

  // 构建标题 → 封面映射（用 imageName）
  const titleToCover = {};
  songArray.forEach(item => {
    if (item.imageName && item.title) {
      titleToCover[item.title.toLowerCase()] = item.imageName;
    }
  });
  // 存到全局供后续使用
  global._titleToCover = titleToCover;

} catch (e) {
  console.error('数据文件加载失败:', e.message);
  process.exit(1);
}

// ── 构建索引 ──────────────────────────────────────
// id → 歌曲
const idToSong = {};
songList.songs.forEach(s => { idToSong[s.id] = s; });

// 标题(小写) → 封面文件名
const titleToCover = global._titleToCover || {};
delete global._titleToCover;

// 别名(小写) → song_id（使用预构建的映射表，已映射到本地歌曲 ID）
let aliasToSongId = global._aliasToSongId || {};
delete global._aliasToSongId;

// 异步构建别名映射（从 lxns API 获取歌曲列表，匹配 anname_list.json 中的 song_id）
async function buildAliasMap() {
  const pending = global._pendingAliasBuild;
  delete global._pendingAliasBuild;
  if (!pending) return;

  const { aliasData, titleToLocalId } = pending;
  try {
    const apiData = await new Promise((resolve, reject) => {
      const req = https.get('https://maimai.lxns.net/api/v0/maimai/song/list', res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    const apiSongs = apiData.songs || apiData;
    const songIdToTitle = {};
    apiSongs.forEach(s => { songIdToTitle[s.id] = s.title; });

    const newMap = {};
    let matched = 0;
    aliasData.aliases.forEach(entry => {
      const apiTitle = songIdToTitle[entry.song_id];
      if (!apiTitle) return;
      const localId = titleToLocalId[apiTitle.toLowerCase().trim()];
      if (!localId) return;
      entry.aliases.forEach(al => { newMap[al.toLowerCase()] = localId; });
      matched++;
    });

    aliasToSongId = newMap;
    console.log(`  别名映射构建完成: ${Object.keys(newMap).length} 个别名 / ${matched} 首歌曲`);

    // 缓存到文件
    try {
      fs.writeFileSync(
        path.join(ROOT, 'alias_map.json'),
        JSON.stringify({ aliasToSongId: newMap }, null, 2),
        'utf8'
      );
    } catch (_) { /* 忽略缓存写入错误 */ }
  } catch (e) {
    console.warn('  别名映射构建失败:', e.message);
  }
}
// 启动异步构建
buildAliasMap();

const DIFF_NAMES = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];

// ── 歌单状态 ──────────────────────────────────────
let playlist = [];
let currentIndex = -1;
let paused = false;

// ── 点歌次数统计 ───────────────────────────────────
const HOT_FILE = path.join(ROOT, 'hot_songs.json');
let hotCount = {}; // { songId: count }

try {
  const raw = fs.readFileSync(HOT_FILE, 'utf8');
  hotCount = JSON.parse(raw) || {};
  console.log(`  热门统计: ${Object.keys(hotCount).length} 首歌曲`);
} catch (_) {
  hotCount = {};
}

function saveHotCount() {
  try {
    fs.writeFileSync(HOT_FILE, JSON.stringify(hotCount), 'utf8');
  } catch (_) {}
}

function getHotList(limit = 10) {
  const entries = Object.entries(hotCount)
    .map(([songId, count]) => {
      const song = idToSong[parseInt(songId)];
      if (!song) return null;
      return {
        songId: song.id,
        title: song.title,
        artist: song.artist || '',
        cover: getCoverForSong(song),
        count,
        difficulties: formatDifficulty(song)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  return entries;
}

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
    sendJSON(res, { playlist, currentIndex, paused });
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
    hotCount[song.id] = (hotCount[song.id] || 0) + 1;
    saveHotCount();
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
    paused = false;
    sendJSON(res, { ok: true, playlist, currentIndex, paused });
    return;
  }

  if (pathname === '/api/playlist/pause' && req.method === 'POST') {
    paused = true;
    sendJSON(res, { ok: true, paused });
    return;
  }

  if (pathname === '/api/playlist/resume' && req.method === 'POST') {
    paused = false;
    sendJSON(res, { ok: true, paused });
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
    const current = !paused && currentIndex >= 0 && currentIndex < playlist.length
      ? playlist[currentIndex] : null;
    const upcoming = playlist.slice(currentIndex + 1, currentIndex + 4);
    sendJSON(res, { current, currentIndex, upcoming, playlistTotal: playlist.length, paused });
    return;
  }

  // ── 热门点歌榜 ──
  if (pathname === '/api/hot') {
    sendJSON(res, { songs: getHotList(10) });
    return;
  }

  if (pathname === '/api/hot/reset' && req.method === 'POST') {
    hotCount = {};
    saveHotCount();
    sendJSON(res, { ok: true });
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
  if (pathname === '/hot' || pathname === '/hot.html') {
    serveStatic(req, res, path.join(PUBLIC_DIR, 'hot.html'));
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
  console.log('  Hot Ranking:   http://localhost:' + PORT + '/hot');
  console.log('');
  if (ips.length > 0) {
    console.log('  Phone access (same WiFi):');
    ips.forEach(ip => {
      console.log('    http://' + ip + ':' + PORT);
    });
    console.log('');
  }
  console.log('  Songs:  ' + songList.songs.length);
  console.log('  Aliases: ' + Object.keys(aliasToSongId).length);
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

/* global Logic, deck */
const $ = (id) => document.getElementById(id);
const audio = $('audio');

const state = { tracks: [], order: [], cur: -1, shuffle: false, repeat: 'off', volume: 0.7, failed: 0, loadId: 0 };
const REPEAT_NEXT = { off: 'all', all: 'one', one: 'off' };

// ---------- LCD text ----------
function setTitle(text) {
  const el = $('title');
  el.classList.remove('scroll');
  el.textContent = text;
  requestAnimationFrame(() => {
    const over = el.scrollWidth - el.parentElement.clientWidth;
    if (over > 0) {
      el.style.setProperty('--shift', `${-(over + 20)}px`);
      el.style.setProperty('--dur', `${Math.max(6, over / 25)}s`);
      el.classList.add('scroll');
    }
  });
}

function showTrack() {
  const t = state.tracks[state.cur];
  $('trkNo').textContent = t ? String(state.cur + 1).padStart(2, '0') : '--';
  $('trkTotal').textContent = state.tracks.length ? String(state.tracks.length).padStart(2, '0') : '--';
  if (!t) {
    setTitle('NO DISC');
    $('artist').textContent = 'PRESS OPEN';
    $('album').textContent = '';
    $('cover').removeAttribute('src');
    return;
  }
  setTitle(t.title || t.name);
  $('artist').textContent = t.artist || 'UNKNOWN ARTIST';
  $('album').textContent = t.album || '';
  if (t.cover) $('cover').src = t.cover; else $('cover').removeAttribute('src');
  renderList();
}

function showStatus() {
  const playing = !audio.paused && state.cur >= 0;
  const paused = audio.paused && audio.currentTime > 0;
  $('stState').textContent = playing ? 'PLAY' : paused ? 'PAUSE' : 'STOP';
  $('lcdTime').classList.toggle('blink', paused);
  $('lamp').classList.toggle('on', playing);
  document.body.classList.toggle('playing', playing);
  $('kPlay').classList.toggle('down', playing);
  $('kShuf').classList.toggle('down', state.shuffle);
  $('stShuf').classList.toggle('on', state.shuffle);
  $('kRep').classList.toggle('down', state.repeat !== 'off');
  $('stRep').classList.toggle('on', state.repeat !== 'off');
  $('stRep').textContent = state.repeat === 'one' ? 'RPT1' : 'RPT';
  $('repLabel').textContent = state.repeat.toUpperCase();
  $('repTag').textContent = state.repeat.toUpperCase();
  document.dispatchEvent(new Event('player-status'));
}

function showTime() {
  const d = audio.duration || state.tracks[state.cur]?.duration || 0;
  const t = audio.currentTime || 0;
  const f = d ? Math.min(1, t / d) : 0;
  $('lcdTime').textContent = Logic.fmt(t);
  $('elapsed').textContent = Logic.fmt(t);
  $('remain').textContent = '-' + Logic.fmt(d - t);
  $('needle').style.left = `calc(8px + (100% - 18px) * ${f})`;
  $('bandFill').style.width = `${f * 100}%`;
}

// Themes live in themes.css as body[data-theme] blocks; 'cream' is the plain style.css look.
const THEMES = ['cream', 'clear', 'deck', 'graphite', 'silver', 'neon', 'turntable'];
function setTheme(name, save = true) {
  if (!THEMES.includes(name)) name = 'cream';
  document.body.dataset.theme = name;
  $('volRead').textContent = name.toUpperCase();
  $('volRead').classList.add('show');
  clearTimeout(volTimer);
  volTimer = setTimeout(() => $('volRead').classList.remove('show'), 1200);
  if (save) deck.setConfig({ theme: name });
}
$('btnTheme').onclick = () => setTheme(THEMES[(THEMES.indexOf(document.body.dataset.theme) + 1) % THEMES.length]);

let volTimer;
function setVolume(v, save = true) {
  state.volume = Math.min(1, Math.max(0, v));
  audio.volume = state.volume;
  $('knob').style.transform = `rotate(${-135 + state.volume * 270}deg)`;
  document.dispatchEvent(new Event('player-volume'));
  $('volRead').textContent = `VOL ${Math.round(state.volume * 100)}`;
  $('volRead').classList.add('show');
  clearTimeout(volTimer);
  volTimer = setTimeout(() => {
    $('volRead').classList.remove('show');
    if (save) deck.setConfig({ volume: state.volume });
  }, 900);
}

// ---------- playlist ----------
function renderList() {
  const ol = $('listView');
  ol.replaceChildren(...(state.tracks.length ? state.tracks.map((t, i) => {
    const li = document.createElement('li');
    li.textContent = t.artist ? `${t.title || t.name} — ${t.artist}` : (t.title || t.name);
    li.classList.toggle('cur', i === state.cur);
    li.onclick = () => play(i);
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty', textContent: 'NO TRACKS — PRESS OPEN' })]));
  document.dispatchEvent(new Event('player-tracks'));
}

async function loadTracks(list, autoplay) {
  if (!list?.length) return;
  const id = ++state.loadId;
  audio.pause();
  state.tracks = list;
  state.cur = 0;
  state.order = Logic.makeOrder(list.length, state.shuffle, 0);
  select(0);
  if (autoplay) play(0);
  showStatus();
  // Fill in tags for the list in the background.
  for (const t of list) {
    if (id !== state.loadId) return;
    Object.assign(t, await deck.readTags(t.path, false));
  }
  if (id === state.loadId) { renderList(); showTrack(); }
}

async function select(i) {
  state.cur = i;
  const t = state.tracks[i];
  audio.src = t.url;
  showTrack();
  showTime();
  const tags = await deck.readTags(t.path, true);
  if (state.tracks[i] === t) { Object.assign(t, tags); if (state.cur === i) showTrack(); }
}

// ---------- transport ----------
let actx, analyser, bins;
function ensureAudioGraph() {
  if (actx) return;
  actx = new AudioContext();
  analyser = actx.createAnalyser();
  analyser.fftSize = 2048; // ~21 Hz per bin, fine enough to separate kick/bass
  analyser.smoothingTimeConstant = 0.6;
  bins = new Uint8Array(analyser.frequencyBinCount);
  actx.createMediaElementSource(audio).connect(analyser).connect(actx.destination);
}

function play(i) {
  if (!state.tracks.length) return openFiles();
  ensureAudioGraph();
  if (i !== undefined && i !== state.cur) select(i);
  audio.play().catch(() => {});
}

function stop() {
  audio.pause();
  audio.currentTime = 0;
  showTime();
  showStatus();
}

function go(dir) {
  if (!state.tracks.length) return;
  if (dir < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
  const n = Logic.step(state.order, state.cur, dir, state.repeat === 'one' ? 'all' : state.repeat);
  if (n < 0) return;
  const wasPlaying = !audio.paused;
  select(n);
  if (wasPlaying) play();
}

audio.addEventListener('play', showStatus);
audio.addEventListener('pause', showStatus);
audio.addEventListener('playing', () => { state.failed = 0; });
audio.addEventListener('timeupdate', showTime);
audio.addEventListener('loadedmetadata', showTime);
audio.addEventListener('ended', () => {
  if (state.repeat === 'one') { audio.currentTime = 0; play(); return; }
  const n = Logic.step(state.order, state.cur, 1, state.repeat);
  if (n < 0) { select(state.order[0]); showStatus(); return; }
  select(n);
  play();
});
audio.addEventListener('error', () => {
  // Unplayable file: skip it, but give up once every track has failed.
  if (++state.failed >= state.tracks.length) { state.failed = 0; stop(); return; }
  const n = Logic.step(state.order, state.cur, 1, 'all');
  select(n);
  play();
});

// ---------- controls ----------
async function openFiles() { loadTracks(await deck.openFiles(), true); }
$('btnOpen').onclick = openFiles;
$('btnFolder').onclick = async () => loadTracks(await deck.openFolder(), true);
$('btnMin').onclick = () => deck.minimize();
$('btnOff').onclick = () => deck.quit();

$('kPlay').onclick = () => (audio.paused ? play() : audio.pause());
$('kStop').onclick = stop;
$('kPrev').onclick = () => go(-1);
$('kNext').onclick = () => go(1);
$('kShuf').onclick = () => {
  state.shuffle = !state.shuffle;
  state.order = Logic.makeOrder(state.tracks.length, state.shuffle, state.cur);
  showStatus();
};
$('kRep').onclick = () => { state.repeat = REPEAT_NEXT[state.repeat]; showStatus(); };
$('swList').onclick = () => {
  const on = $('swList').classList.toggle('on');
  $('listView').hidden = !on;
  $('nowView').hidden = on;
  if (on) { renderList(); $('listView').querySelector('.cur')?.scrollIntoView({ block: 'center' }); }
};

// Seek by clicking or dragging on the tuner scale.
const scale = $('scale');
function seekAt(e) {
  const r = scale.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - r.left - 8) / (r.width - 18)));
  if (audio.duration) { audio.currentTime = f * audio.duration; showTime(); }
}
scale.addEventListener('pointerdown', (e) => { scale.setPointerCapture(e.pointerId); seekAt(e); });
scale.addEventListener('pointermove', (e) => { if (scale.hasPointerCapture(e.pointerId)) seekAt(e); });

// Volume knob: drag up/down or scroll.
const knob = $('knob');
let drag = null;
knob.addEventListener('pointerdown', (e) => { knob.setPointerCapture(e.pointerId); drag = { y: e.clientY, v: state.volume }; });
knob.addEventListener('pointermove', (e) => { if (drag) setVolume(drag.v + (drag.y - e.clientY) / 180); });
knob.addEventListener('pointerup', () => { drag = null; });
document.addEventListener('wheel', (e) => {
  if (document.body.dataset.view !== 'library') setVolume(state.volume - Math.sign(e.deltaY) * 0.04);
}, { passive: true });

document.addEventListener('keydown', (e) => {
  const keys = {
    ' ': () => $('kPlay').click(),
    ArrowRight: () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); },
    ArrowLeft: () => { audio.currentTime = Math.max(0, audio.currentTime - 5); },
    ArrowUp: () => setVolume(state.volume + 0.05),
    ArrowDown: () => setVolume(state.volume - 0.05),
  };
  if (e.target.matches('input')) return;
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});

// Drag & drop files or folders onto the device.
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drop'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drop'); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('drop');
  const paths = [...e.dataTransfer.files].map((f) => deck.pathOf(f)).filter(Boolean);
  loadTracks(await deck.expand(paths), true);
});

// ---------- meters: VU window + speaker cones ----------
const vu = $('vu');
const bars = Array.from({ length: 10 }, () => vu.appendChild(document.createElement('i')));
(function meter() {
  requestAnimationFrame(meter);
  const root = document.documentElement.style;
  if (!analyser || audio.paused) {
    bars.forEach((b) => { b.style.height = '8%'; });
    root.setProperty('--pump', 1);
    return;
  }
  analyser.getByteFrequencyData(bins);
  const levels = Logic.bands(bins, actx.sampleRate, bars.length);
  bars.forEach((b, i) => { b.style.height = `${8 + levels[i] * 92}%`; });
  // Speakers follow the same two bass bars shown in the meter; below 35% they rest, so they kick on beats.
  const bass = (levels[0] + levels[1]) / 2;
  root.setProperty('--pump', 1 + Math.max(0, bass - 0.35) / 0.65 * 0.12);
})();

// ---------- start ----------
(async () => {
  const cfg = await deck.getConfig();
  setTheme(cfg.theme, false);
  setVolume(cfg.volume ?? 0.7, false);
  $('volRead').classList.remove('show');
  showTrack();
  showStatus();
  showTime();
  loadTracks(cfg.tracks, false);
})();

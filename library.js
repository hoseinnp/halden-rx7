/* global $, audio, state, play, setVolume, openFiles, loadTracks, Logic, deck */
// Library view: same player state as the device (renderer.js), different layout.

const lib = { genre: 'All', query: '', peaks: new Map(), peaksFor: null };

function setView(view, save = true) {
  document.body.dataset.view = view;
  deck.setView(view);
  if (save) deck.setConfig({ view });
  if (view === 'library') { renderBrowse(); renderNow(); }
}
function setDark(on, save = true) {
  document.body.classList.toggle('lib-dark', on);
  if (save) deck.setConfig({ dark: on });
}

$('btnLib').onclick = () => setView('library');
$('libBack').onclick = () => setView('device');
$('libOpen').onclick = openFiles;
$('libFolder').onclick = async () => loadTracks(await deck.openFolder(), true);
$('libDark').onclick = () => setDark(!document.body.classList.contains('lib-dark'));
$('libMin').onclick = () => deck.minimize();
$('libClose').onclick = () => deck.quit();
// Transport reuses the device keys so both views stay in the same state.
$('libPlay').onclick = $('ttStart').onclick = () => $('kPlay').click();
$('libPrev').onclick = () => $('kPrev').click();
$('libNext').onclick = () => $('kNext').click();
$('libShuf').onclick = () => $('kShuf').click();
$('libRep').onclick = () => $('kRep').click();
$('libSearch').oninput = (e) => { lib.query = e.target.value.trim().toLowerCase(); renderTracks(); };

const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
const label = (t) => t.title || t.name;

// ---------- now playing ----------
function renderNow() {
  const t = state.tracks[state.cur];
  $('libTitle').textContent = t ? label(t) : 'No disc';
  $('libArtist').textContent = t ? [t.artist || 'Unknown artist', t.album].filter(Boolean).join(' · ') : 'Open a folder to start';
  $('libGenre').hidden = !t?.genre;
  $('libGenre').textContent = t?.genre || '';
  $('libPos').textContent = t ? `${state.cur + 1} / ${state.tracks.length}` : '';
  if (t?.cover) $('ttCover').src = t.cover; else $('ttCover').removeAttribute('src');
  if (t && lib.peaksFor !== t.url) loadPeaks(t);
  drawProgress();
}

function renderStatus() {
  const playing = !audio.paused && state.cur >= 0;
  $('libPlay').classList.toggle('on', playing);
  $('ttStart').classList.toggle('on', playing);
  $('libShuf').classList.toggle('on', state.shuffle);
  $('libRep').classList.toggle('on', state.repeat !== 'off');
  $('libRepOne').hidden = state.repeat !== 'one';
  drawProgress();
}

// ---------- waveform ----------
// Real peaks from the decoded file; cached per track.
// shortcut: decodes the whole file in memory (fine for songs, heavy for hour-long mixes); stream it if that matters.
async function loadPeaks(t) {
  lib.peaksFor = t.url;
  if (!lib.peaks.has(t.url)) {
    let peaks = null;
    try {
      const buf = await (await fetch(t.url)).arrayBuffer();
      const data = (await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf)).getChannelData(0);
      const n = 90, step = Math.floor(data.length / n);
      peaks = Array.from({ length: n }, (_, i) => {
        let m = 0;
        for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(data[j]));
        return m;
      });
      const top = Math.max(...peaks) || 1;
      peaks = peaks.map((p) => p / top);
    } catch { /* unreadable: flat line */ }
    lib.peaks.set(t.url, peaks);
  }
  if (lib.peaksFor === t.url) drawProgress();
}

function drawProgress() {
  const t = state.tracks[state.cur];
  const d = audio.duration || t?.duration || 0;
  const f = d ? Math.min(1, audio.currentTime / d) : 0;
  $('libEl').textContent = Logic.fmt(audio.currentTime);
  $('libDur').textContent = Logic.fmt(d);
  // Tonearm: parked off the record when stopped, then sweeps inward with progress.
  const parked = audio.paused && audio.currentTime === 0;
  $('ttArm').style.transform = `rotate(${parked ? 8 : 30 + f * 14}deg)`;

  const c = $('wave'), g = c.getContext('2d');
  const cs = getComputedStyle(document.body);
  const peaks = t && lib.peaks.get(t.url);
  const n = 90, w = c.width / n;
  g.clearRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) {
    const h = Math.max(3, (peaks ? peaks[i] : 0.08) * (c.height - 6));
    g.fillStyle = i / n < f ? cs.getPropertyValue('--l-fg') : cs.getPropertyValue('--l-mute');
    g.fillRect(i * w + 1, (c.height - h) / 2, w - 2.5, h);
  }
}
$('wave').addEventListener('pointerdown', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
  drawProgress();
});
audio.addEventListener('timeupdate', () => { if (document.body.dataset.view === 'library') drawProgress(); });

// ---------- volume fader ----------
const fader = $('ttFader');
const faderAt = (e) => {
  const r = fader.getBoundingClientRect();
  setVolume(1 - (e.clientY - r.top - 12) / (r.height - 24));
};
fader.addEventListener('pointerdown', (e) => { fader.setPointerCapture(e.pointerId); faderAt(e); });
fader.addEventListener('pointermove', (e) => { if (fader.hasPointerCapture(e.pointerId)) faderAt(e); });
document.addEventListener('player-volume', () => {
  $('ttFaderCap').style.top = `${(1 - state.volume) * (fader.clientHeight - 24)}px`;
});

// ---------- browse: genres, albums, tracks ----------
function renderBrowse() {
  const genres = ['All', ...new Set(state.tracks.map((t) => t.genre).filter(Boolean))];
  if (!genres.includes(lib.genre)) lib.genre = 'All';
  $('libChips').replaceChildren(...genres.map((g) => {
    const b = el('button', 'chip' + (g === lib.genre ? ' dark' : ''), g);
    b.onclick = () => { lib.genre = g; renderBrowse(); };
    return b;
  }));

  const albums = new Map();
  state.tracks.forEach((t, i) => {
    if (lib.genre !== 'All' && t.genre !== lib.genre) return;
    const key = t.album || 'Singles';
    if (!albums.has(key)) albums.set(key, { name: key, artist: t.artist, first: i });
  });
  $('libAlbums').replaceChildren(...[...albums.values()].map((a) => {
    const card = el('button', 'album');
    const art = el('div', 'album-art');
    const t = state.tracks[a.first];
    const setArt = () => { if (t.cover) art.style.backgroundImage = `url("${t.cover}")`; };
    setArt();
    if (t.cover === undefined) deck.readTags(t.path, true).then((tags) => { t.cover = tags.cover || null; setArt(); });
    card.append(art, el('b', '', a.name), el('small', '', a.artist ? `by ${a.artist}` : ''));
    card.onclick = () => play(a.first);
    return card;
  }));
  renderTracks();
}

function renderTracks() {
  const q = lib.query;
  const rows = [];
  state.tracks.forEach((t, i) => {
    if (lib.genre !== 'All' && t.genre !== lib.genre) return;
    if (q && ![label(t), t.artist, t.album].some((s) => s?.toLowerCase().includes(q))) return;
    const li = el('li', i === state.cur ? 'cur' : '');
    const btn = el('button', 'row-play');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 7l9 5-9 5z"/></svg>';
    btn.title = 'Play';
    btn.onclick = (e) => { e.stopPropagation(); play(i); };
    const info = el('div', 'row-info');
    info.append(el('b', '', label(t)), el('small', '', [t.artist, t.album].filter(Boolean).join(' · ') || ' '));
    li.append(el('span', 'row-no', String(i + 1).padStart(2, '0')), info, el('span', 'row-dur', t.duration ? Logic.fmt(t.duration) : ''), btn);
    li.ondblclick = () => play(i);
    rows.push(li);
  });
  $('libTracks').replaceChildren(...(rows.length ? rows : [el('li', 'empty', state.tracks.length ? 'Nothing matches your search' : 'No tracks yet. Open files or a folder.')]));
  $('libCount').textContent = `(${rows.length})`;
}

document.addEventListener('player-tracks', () => {
  if (document.body.dataset.view !== 'library') return;
  renderBrowse(); // also picks up genres/albums once background tag reading finishes
  renderNow();
});
document.addEventListener('player-status', renderStatus);

(async () => {
  const cfg = await deck.getConfig();
  setDark(!!cfg.dark, false);
  setView(cfg.view === 'library' ? 'library' : 'device', false);
})();

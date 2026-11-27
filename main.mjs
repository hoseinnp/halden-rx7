import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron';
import { parseFile } from 'music-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const AUDIO = /\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|webm)$/i;
const configFile = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { return {}; }
}

function writeConfig(patch) {
  const cfg = { ...readConfig(), ...patch };
  fs.writeFileSync(configFile(), JSON.stringify(cfg));
  return cfg;
}

// Files stay files, folders are walked recursively; result is sorted audio files.
function expand(paths) {
  const out = [];
  for (const p of paths) {
    let stat;
    try { stat = fs.statSync(p); } catch { continue; }
    if (stat.isDirectory()) {
      for (const rel of fs.readdirSync(p, { recursive: true })) {
        if (AUDIO.test(rel)) out.push(path.join(p, rel));
      }
    } else if (AUDIO.test(p)) out.push(p);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(p => ({ path: p, url: pathToFileURL(p).href, name: path.parse(p).name }));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 800,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'HALDEN RX-7',
    webPreferences: { preload: path.join(dir, 'preload.js') },
  });
  win.loadFile(path.join(dir, 'index.html'));
}

ipcMain.handle('open-files', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'webm'] }],
  });
  return r.canceled ? null : expand(r.filePaths);
});

ipcMain.handle('open-folder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory'] });
  if (r.canceled) return null;
  writeConfig({ lastFolder: r.filePaths[0] });
  return expand(r.filePaths);
});

ipcMain.handle('expand', (_e, paths) => expand(paths));

ipcMain.handle('read-tags', async (_e, file, withCover) => {
  try {
    const { common, format } = await parseFile(file, { skipCovers: !withCover, duration: false });
    const pic = withCover && common.picture?.[0];
    return {
      title: common.title, artist: common.artist, album: common.album, duration: format.duration,
      genre: common.genre?.[0], year: common.year,
      cover: pic ? `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}` : null,
    };
  } catch { return {}; }
});

ipcMain.handle('get-config', () => {
  const cfg = readConfig();
  return { volume: cfg.volume, theme: cfg.theme, view: cfg.view, dark: cfg.dark, tracks: cfg.lastFolder ? expand([cfg.lastFolder]) : [] };
});
ipcMain.handle('set-config', (_e, patch) => { writeConfig(patch); });
// Device and library views share one window; resize around its current centre.
const VIEW_SIZE = { device: [440, 800], library: [1180, 760] };
ipcMain.on('set-view', (e, view) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const [w, h] = VIEW_SIZE[view] ?? VIEW_SIZE.device;
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const x = Math.round(b.x + b.width / 2 - w / 2), y = Math.round(b.y + b.height / 2 - h / 2);
  win.setBounds({
    x: Math.min(Math.max(x, area.x), area.x + area.width - w),
    y: Math.min(Math.max(y, area.y), area.y + area.height - h),
    width: w, height: h,
  });
});
ipcMain.on('minimize', (e) => BrowserWindow.fromWebContents(e.sender).minimize());
ipcMain.on('quit', () => app.quit());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

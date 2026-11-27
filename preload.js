const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('deck', {
  openFiles: () => ipcRenderer.invoke('open-files'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  expand: (paths) => ipcRenderer.invoke('expand', paths),
  readTags: (file, withCover) => ipcRenderer.invoke('read-tags', file, withCover),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  pathOf: (file) => webUtils.getPathForFile(file),
  setView: (view) => ipcRenderer.send('set-view', view),
  minimize: () => ipcRenderer.send('minimize'),
  quit: () => ipcRenderer.send('quit'),
});

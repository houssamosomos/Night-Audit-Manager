const { contextBridge } = require('electron');

// Minimal, safe bridge. No Node APIs are exposed to the renderer.
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
});

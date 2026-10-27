const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("lumen", {
  platform: process.platform,

  getState: () => invoke("lumen:get-state"),

  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("lumen:state", listener);
    return () => ipcRenderer.removeListener("lumen:state", listener);
  },

  onUiEvent: (callback) => {
    const listener = (_event, name) => callback(name);
    ipcRenderer.on("lumen:ui-event", listener);
    return () => ipcRenderer.removeListener("lumen:ui-event", listener);
  },

  newTab: (url) => invoke("lumen:new-tab", url || null),
  activateTab: (id) => invoke("lumen:activate-tab", id),
  closeTab: (id) => invoke("lumen:close-tab", id),
  navigate: (input, tabId) => invoke("lumen:navigate", { input, tabId }),
  goNewTab: () => invoke("lumen:go-newtab"),
  back: () => invoke("lumen:back"),
  forward: () => invoke("lumen:forward"),
  reload: () => invoke("lumen:reload"),
  stop: () => invoke("lumen:stop"),
  reopenClosed: () => invoke("lumen:reopen-closed"),
  openTabs: (urls) => invoke("lumen:open-tabs", urls),

  saveSpace: (payload) => invoke("lumen:save-space", payload),
  openSpace: (id) => invoke("lumen:open-space", id),
  deleteSpace: (id) => invoke("lumen:delete-space", id),

  saveNote: (payload) => invoke("lumen:save-note", payload),
  removeNote: (id) => invoke("lumen:remove-note", id),
  resetShield: () => invoke("lumen:reset-shield"),

  toggleBookmark: () => invoke("lumen:toggle-bookmark"),
  removeBookmark: (id) => invoke("lumen:remove-bookmark", id),
  removeHistory: (id) => invoke("lumen:remove-history", id),
  clearHistory: () => invoke("lumen:clear-history"),
  clearDownloads: () => invoke("lumen:clear-downloads"),

  updateSettings: (patch) => invoke("lumen:update-settings", patch),

  openDownload: (path) => invoke("lumen:open-download", path),
  showDownload: (path) => invoke("lumen:show-download", path),
  openExternal: (url) => invoke("lumen:open-external", url),

  setContentBounds: (bounds) => ipcRenderer.send("lumen:content-bounds", bounds),
  setOverlay: (open) => ipcRenderer.send("lumen:overlay", Boolean(open)),

  windowControl: (action) => ipcRenderer.send("lumen:window", action)
});

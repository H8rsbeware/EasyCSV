const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld("windowControls", {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
});

contextBridge.exposeInMainWorld('theme', {
    get: () => ipcRenderer.invoke('theme:get'),
    set: (mode) => ipcRenderer.invoke('theme:set', mode),
});

contextBridge.exposeInMainWorld('menuApi', {
  getBlueprint: () => ipcRenderer.invoke("menu:getBlueprint"),
  sendCommand: (command) => ipcRenderer.send("menu:command", command)
})  
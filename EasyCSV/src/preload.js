const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowControls', {
	minimize: () => ipcRenderer.send('window:minimize'),
	maximize: () => ipcRenderer.send('window:maximize'),
	close: () => ipcRenderer.send('window:close'),
});

contextBridge.exposeInMainWorld('theme', {
	get: () => ipcRenderer.invoke('theme:get'),
	set: (mode) => ipcRenderer.invoke('theme:set', mode),
});

contextBridge.exposeInMainWorld('menuApi', {
	getBlueprint: () => ipcRenderer.invoke('menu:getBlueprint'),
	sendCommand: (command) => ipcRenderer.send('menu:command', command),
});

contextBridge.exposeInMainWorld('layoutApi', {
	get: () => ipcRenderer.invoke('layout:get'),
	sendCommand: (cmd) => ipcRenderer.send('layout:command', cmd),
	onUpdated: (handler) => {
		ipcRenderer.on('layout:updated', (_event, layout) => {
			handler(layout);
		});
	},
});

contextBridge.exposeInMainWorld('projectApi', {
	openDialog: () => ipcRenderer.invoke('project:openDialog'),
	listChildren: (rootPath, dirPath) =>
		ipcRenderer.invoke('project:listChildren', { rootPath, dirPath }),
	openPath: (path) => ipcRenderer.invoke('project:openPath', { path }),
});

contextBridge.exposeInMainWorld('docApi', {
	open: (filePath) => ipcRenderer.invoke('doc:open', { filePath }),
	save: (filePath, text, expectedMtimeMs) =>
		ipcRenderer.invoke('doc:save', { filePath, text, expectedMtimeMs }),
	openDialog: () => ipcRenderer.invoke('doc:openDialog'),
});

contextBridge.exposeInMainWorld('userApi', {
	getRecentProjects: () => ipcRenderer.invoke('user:getRecentProjects'),
});

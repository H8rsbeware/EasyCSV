const {
	app,
	BrowserWindow,
	ipcMain,
	globalShortcut,
	dialog,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const pm = require('./backend/project_manager/projectManager.js');

const utils = require('./backend/utils.js');
const usm = require('./backend/user_state/userStateManager.js');
const msm = require('./backend/menu_state/menuStateManager.js');
const lym = require('./backend/layout/layoutManager.js');
const dm = require('./backend/project_manager/documentManager.js');
const ipc_on = require('./backend/ipc_on.js');

let mainWindow;
let settings;
let usersState;
let menuState;
let layoutState;
let projectManager;
let documentManager;
let defaultUserSettings = null;
let settingsSchema = null;

function rememberRecentProject(rootPath) {
	const existing = usersState.GetState('recently_opened') || [];
	const name = path.basename(rootPath.replace(/[/\\]+$/, '')) || rootPath;
	const now = new Date().toISOString();

	const next = [
		{ prj_name: name, prj_path: rootPath, last_opened: now },
		...existing.filter((p) => p && p.prj_path !== rootPath),
	].slice(0, 10);

	usersState.SetState('recently_opened', next);
	usersState.SaveState();
}

async function openProjectFromDialog(win) {
	const res = await dialog.showOpenDialog(win, {
		title: 'Open Folder',
		properties: ['openDirectory'],
	});

	if (res.canceled || !res.filePaths?.length) {
		return { ok: false };
	}

	const path = res.filePaths[0];

	await projectManager.openProject(path);
	rememberRecentProject(path);

	layoutState.ApplyLayoutCommand({
		type: 'workspace.openProject',
		path,
	});

	win.webContents.send('layout:updated', layoutState.get().toJSON());

	return { ok: true, path };
}

async function openFileFromDialog(win) {
	const res = await dialog.showOpenDialog(win, {
		title: 'Open File',
		properties: ['openFile'],
	});

	if (res.canceled || !res.filePaths?.length) {
		return { ok: false };
	}

	const filePath = res.filePaths[0];

	layoutState.ApplyLayoutCommand({
		type: 'tab.openFile',
		filePath,
	});

	win.webContents.send('layout:updated', layoutState.get().toJSON());

	return { ok: true, path: filePath };
}

function createWindow() {
	mainWindow = new BrowserWindow({
		/**  sizing **/
		width: 1200,
		height: 800,
		frame: false,
		resizable: true,
		minWidth: 500,
		minHeight: 400,
		/** titlebar **/
		titleBarStyle: 'hidden',
		titleBarOverlay: false,
		devTools: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	mainWindow.loadFile('templates/index.html');

	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools();
	}

	mainWindow.on('closed', function () {
		mainWindow = null;
	});
}

function invertTheme(mode) {
	return mode === 'light' ? 'dark' : 'light';
}

app.whenReady().then(() => {
	createWindow();

	settings = utils.unpackSettings(app);
	defaultUserSettings = JSON.parse(
		fs.readFileSync(settings.UserStateDefaultPath(), 'utf8')
	);
	try {
		settingsSchema = JSON.parse(
			fs.readFileSync(
				path.join(__dirname, 'backend', 'user_state', 'settings_schema.json'),
				'utf8'
			)
		);
	} catch (err) {
		console.warn('Failed to load settings schema:', err);
		settingsSchema = { sections: [] };
	}
	usersState = new usm.UserState(settings);
	menuState = new msm.MenuState(settings);
	layoutState = new lym.LayoutManager(usersState);
	projectManager = new pm.ProjectManager();
	documentManager = new dm.DocumentManager();

	ipc_on.init(ipcMain, app, BrowserWindow, globalShortcut);
});

// theme control handling
ipcMain.handle('theme:get', () => {
	const stored = usersState.GetState('preferences.theme');
	return invertTheme(stored);
});

ipcMain.handle('theme:set', (_, mode) => {
	if (['light', 'dark'].includes(mode)) {
		usersState.SetState('preferences.theme', invertTheme(mode));
		usersState.SaveState();
		return true;
	}
	return false;
});

ipcMain.handle('menu:getBlueprint', () => {
	return menuState.menu_state;
});

function loadMenuShortcuts() {
	if (!settings) return {};
	const defaultsPath = settings.UserMenuShortcutsDefaultPath();
	const userPath = settings.UserMenuShortcutsPath();

	let defaults = {};
	let user = {};

	try {
		if (fs.existsSync(defaultsPath)) {
			defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
		}
	} catch (err) {
		defaults = {};
	}

	try {
		if (fs.existsSync(userPath)) {
			user = JSON.parse(fs.readFileSync(userPath, 'utf8'));
		}
	} catch (err) {
		user = {};
	}

	return { ...defaults, ...user };
}

function loadUserShortcuts() {
	if (!settings) return {};
	const userPath = settings.UserMenuShortcutsPath();
	try {
		if (fs.existsSync(userPath)) {
			return JSON.parse(fs.readFileSync(userPath, 'utf8'));
		}
	} catch (err) {
		return {};
	}
	return {};
}

function saveUserShortcuts(next) {
	if (!settings) return false;
	const userPath = settings.UserMenuShortcutsPath();
	try {
		fs.writeFileSync(userPath, JSON.stringify(next, null, 2), 'utf8');
		return true;
	} catch (err) {
		return false;
	}
}

ipcMain.handle('menu:getShortcuts', () => {
	return loadMenuShortcuts();
});

ipcMain.handle('menu:setShortcut', (_event, payload = {}) => {
	const command = payload?.command;
	if (typeof command !== 'string' || !command.trim()) {
		return { ok: false, reason: 'Invalid command.' };
	}

	const shortcut = typeof payload?.shortcut === 'string' ? payload.shortcut : '';
	const trimmed = shortcut.trim();
	const userShortcuts = loadUserShortcuts();

	if (!trimmed) {
		delete userShortcuts[command];
	} else {
		userShortcuts[command] = trimmed;
	}

	const saved = saveUserShortcuts(userShortcuts);
	if (!saved) return { ok: false, reason: 'Failed to save shortcut.' };

	if (menuState?.InitMenuState) {
		try {
			menuState.menu_state = menuState.InitMenuState();
		} catch (err) {
			// Ignore rebuild failures; file is still saved.
		}
	}

	const resolved = loadMenuShortcuts();
	return { ok: true, value: resolved[command] || '' };
});

ipcMain.handle('layout:get', () => {
	return layoutState.get().toJSON();
});

ipcMain.on('layout:command', (event, cmd) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	if (!win) return;

	layoutState.ApplyLayoutCommand(cmd);
	win.webContents.send('layout:updated', layoutState.get().toJSON());
});

ipcMain.on('menu:command', async (event, command) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	if (!win) return;

	ipc_on.handleMenuCommand(command, app, win, {
		onFileCommand: async (cmd, targetWin) => {
			if (cmd === 'file.open') {
				await openFileFromDialog(targetWin);
				return;
			}
			if (cmd === 'file.newProject') {
				await openProjectFromDialog(targetWin);
				return;
			}
			if (cmd === 'file.newFile') {
				layoutState.ApplyLayoutCommand({ type: 'tab.newFile' });
				targetWin.webContents.send(
					'layout:updated',
					layoutState.get().toJSON()
				);
				return;
			}
			if (cmd === 'file.save') {
				targetWin.webContents.send('file:save');
				return;
			}
			if (cmd === 'file.saveAs') {
				targetWin.webContents.send('file:saveAs');
				return;
			}
			if (cmd === 'file.closeTab') {
				const activeId = layoutState.get().activeTabId;
				if (!activeId) return;
				layoutState.ApplyLayoutCommand({
					type: 'tab.close',
					id: activeId,
				});
				targetWin.webContents.send(
					'layout:updated',
					layoutState.get().toJSON()
				);
				return;
			}
			console.warn('Unhandled file command:', cmd);
		},
		onToolsCommand: (cmd, targetWin) => {
			if (cmd === 'tools.settings') {
				layoutState.ApplyLayoutCommand({ type: 'tab.openSettings' });
				targetWin.webContents.send(
					'layout:updated',
					layoutState.get().toJSON()
				);
				return;
			}
			console.warn('Unhandled tools command:', cmd);
		},
	});
});

ipcMain.handle('user:getRecentProjects', () => {
	return usersState.GetState('recently_opened') || [];
});

ipcMain.handle('user:getCsvSettings', () => {
	const stored = usersState.GetState('preferences.csv');
	if (stored) return stored;
	return defaultUserSettings?.preferences?.csv || {};
});

ipcMain.handle('user:setCsvSettings', (_event, payload = {}) => {
	const next = payload?.settings || {};
	const current = usersState.GetState('preferences.csv') || {};
	const merged = { ...current, ...next };
	usersState.SetState('preferences.csv', merged);
	usersState.SaveState();
	return merged;
});

ipcMain.handle('user:getSettingsSchema', () => {
	return settingsSchema || { sections: [] };
});

ipcMain.handle('user:getSettings', () => {
	return usersState?.state || {};
});

ipcMain.handle('user:setSetting', (_event, payload = {}) => {
	const keyPath = payload?.path;
	if (typeof keyPath !== 'string' || !keyPath.trim()) {
		return { ok: false, reason: 'Invalid setting path.' };
	}

	const ok = usersState.SetState(keyPath, payload?.value);
	if (!ok) {
		return { ok: false, reason: 'Unknown setting path.' };
	}

	usersState.SaveState();
	return { ok: true, value: usersState.GetState(keyPath) };
});

ipcMain.handle('doc:open', async (_e, { filePath }) => {
	return await documentManager.open(filePath);
});

ipcMain.handle('doc:openDialog', async (event) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	const res = await dialog.showOpenDialog(win, {
		title: 'Open File',
		properties: ['openFile'],
	});

	if (res.canceled || !res.filePaths?.length) {
		return { ok: false };
	}

	return { ok: true, path: res.filePaths[0] };
});

ipcMain.handle('doc:saveDialog', async (event, { defaultPath } = {}) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	const res = await dialog.showSaveDialog(win, {
		title: 'Save As',
		defaultPath: defaultPath || undefined,
	});

	if (res.canceled || !res.filePath) {
		return { ok: false };
	}

	return { ok: true, path: res.filePath };
});

ipcMain.handle('doc:save', async (_e, { filePath, text, expectedMtimeMs }) => {
	return await documentManager.save(filePath, text, expectedMtimeMs);
});

ipcMain.handle('doc:saveAs', async (_e, { filePath, text }) => {
	return await documentManager.saveAs(filePath, text);
});

ipcMain.handle('project:openDialog', async (event) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	return await openProjectFromDialog(win);
});

ipcMain.handle(
	'project:listChildren',
	async (_event, { rootPath, dirPath }) => {
		const nodes = await projectManager.listChildren(rootPath, dirPath);
		return nodes; // plain JSON DTOs
	}
);

ipcMain.handle('project:openPath', async (event, { path: rootPath }) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	if (!rootPath) return { ok: false };

	await projectManager.openProject(rootPath);
	rememberRecentProject(rootPath);

	layoutState.ApplyLayoutCommand({
		type: 'workspace.openProject',
		path: rootPath,
	});

	win.webContents.send('layout:updated', layoutState.get().toJSON());
	return { ok: true, path: rootPath };
});

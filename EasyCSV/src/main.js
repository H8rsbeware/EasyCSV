const {
	app,
	BrowserWindow,
	ipcMain,
	globalShortcut,
	dialog,
} = require('electron');
const path = require('node:path');

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

app.whenReady().then(() => {
	createWindow();

	settings = utils.unpackSettings(app);
	usersState = new usm.UserState(settings);
	menuState = new msm.MenuState(settings);
	layoutState = new lym.LayoutManager(usersState);
	projectManager = new pm.ProjectManager();
	documentManager = new dm.DocumentManager();

	ipc_on.init(ipcMain, app, BrowserWindow, globalShortcut);
});

// theme control handling
ipcMain.handle('theme:get', () => {
	return usersState.GetState('preferences.theme');
});

ipcMain.handle('theme:set', (_, mode) => {
	if (['light', 'dark'].includes(mode)) {
		usersState.SetState('preferences.theme', mode);
		return true;
	}
	return false;
});

ipcMain.handle('menu:getBlueprint', () => {
	return menuState.menu_state;
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

ipcMain.handle('doc:open', async (_e, { filePath }) => {
	return await documentManager.open(filePath);
});

ipcMain.handle('doc:save', async (_e, { filePath, text, expectedMtimeMs }) => {
	return await documentManager.save(filePath, text, expectedMtimeMs);
});

ipcMain.handle('project:openDialog', async (event) => {
	const win = BrowserWindow.fromWebContents(event.sender);

	const res = await dialog.showOpenDialog(win, {
		title: 'Open Project',
		properties: ['openDirectory'],
	});

	if (res.canceled || !res.filePaths?.length) {
		return { ok: false };
	}

	const rootPath = res.filePaths[0];

	// Register project state
	await projectManager.openProject(rootPath);

	// Update layout state via the deterministic layout command
	layoutState.ApplyLayoutCommand({
		type: 'workspace.openProject',
		path: rootPath,
	});

	// Push update
	win.webContents.send('layout:updated', layoutState.get().toJSON());

	return { ok: true, rootPath };
});

ipcMain.handle(
	'project:listChildren',
	async (_event, { rootPath, dirPath }) => {
		const nodes = await projectManager.listChildren(rootPath, dirPath);
		return nodes; // plain JSON DTOs
	}
);

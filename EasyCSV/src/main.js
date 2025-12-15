const {
	app,
	BrowserWindow,
	ipcMain,
	globalShortcut,
} = require("electron");
const path = require("node:path");

const utils = require("./backend/utils.js");
const usm = require("./backend/user_state/user_state_manager.js");
const msm = require("./backend/menu_state/menu_state_manager.js");
const lym = require("./backend/layout/layout_manager.js");
const ipc_on = require("./backend/ipc_on.js");

let mainWindow;
let settings;
let usersState;
let menuState;
let layoutState;


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
		titleBarStyle: "hidden",
		titleBarOverlay: false,
		devTools: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	mainWindow.loadFile("templates/index.html");

	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools();
	}

	mainWindow.on("closed", function () {
		mainWindow = null;
	});
}


app.whenReady().then(() => {
	createWindow();

	settings = utils.unpackSettings(app);
	usersState = new usm.UserState(settings);
	menuState = new msm.MenuState(settings);
	layoutState = new 






	ipc_on.init(ipcMain, app, BrowserWindow, globalShortcut);
});





// theme control handling
ipcMain.handle("theme:get", () => {
	return usersState.GetState("preferences.theme");
});

ipcMain.handle("theme:set", (_, mode) => {
	if (["light", "dark"].includes(mode)) {
		usersState.SetState("preferences.theme", mode);
		return true;
	}
	return false;
});

ipcMain.handle("menu:getBlueprint", () => {
	return menuState.menu_state;
});

ipcMain.handle("layout:get", () => {
	// get menu state
})




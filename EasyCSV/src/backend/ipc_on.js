
function init(ipcMain, app, BrowserWindow, globalShortcut){

    ipcMain.on("window:minimize", (event) => {
        BrowserWindow.fromWebContents(event.sender).minimize();
    });
    
    ipcMain.on("window:maximize", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    
    ipcMain.on("window:close", (event) => {
        BrowserWindow.fromWebContents(event.sender).close();
    });

    app.on("window-all-closed", function () {
        if (process.platform !== "darwin") app.quit();
    });
    
    app.on("will-quit", () => {
        globalShortcut.unregisterAll();
    });
    
    app.on("activate", function () {
        if (mainWindow === null) createWindow();
    });

    ipcMain.on("menu:command", (event, command) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;

        // Route by "namespace" (app., view., edit., file., tools.)
        if (command.startsWith("app.")) {
            handleAppCommand(command, app);
        } else if (command.startsWith("view.")) {
            handleViewCommand(command, win);
        } else if (command.startsWith("edit.")) {
            handleEditCommand(command, win);
        } else if (command.startsWith("file.")) {
            handleFileCommand(command, win);
        } else if (command.startsWith("tools.")) {
            handleToolsCommand(command, win);
        } else {
            console.warn("Unknown menu command:", command);
        }
    });

}

const handleAppCommand = (command, app) => {
    switch (command) {
        case "app.exit":
            app.quit();
            break;
        default:
            console.warn("Unhandled app command:", command);
  }
}

const handleViewCommand = (command, win) => {
  const wc = win.webContents;

  switch (command) {
    case "view.toggleDevTools":
      wc.toggleDevTools();
      break;

    case "view.reload":
      wc.reload();
      break;

    default:
      console.warn("Unhandled view command:", command);
  }
};

const handleEditCommand = (command, win) => {
  const wc = win.webContents;

  switch (command) {
    case "edit.undo":
      wc.undo();
      break;
    case "edit.redo":
      wc.redo();
      break;
    case "edit.cut":
      wc.cut();
      break;
    case "edit.copy":
      wc.copy();
      break;
    case "edit.paste":
      wc.paste();
      break;
    default:
      console.warn("Unhandled edit command:", command);
  }
};

const handleFileCommand = (command, win) => {
  switch (command) {
    case "file.newProject":
    case "file.open":
      console.log("[TODO] implement", command);
      // later: show open dialog, talk to your project loader, etc.
      break;

    default:
      console.warn("Unhandled file command:", command);
  }
};

const handleToolsCommand = (command, win) => {
  switch (command) {
    case "tools.settings":
      console.log("[TODO] open settings UI");
      // later: open a settings window or tab
      break;

    default:
      console.warn("Unhandled tools command:", command);
  }
};


module.exports = {init: init}
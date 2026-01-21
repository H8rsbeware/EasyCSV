# Command Map

Single source of truth for commands, IPC channels, and side effects.

## Layout commands (renderer -> main)

| Name | Direction | Transport | Payload schema | Handled in | Side effects |
| --- | --- | --- | --- | --- | --- |
| workspace.openProject | renderer -> main | layout:command (send) | { type, path } | src/backend/layout/layoutManager.js ApplyLayoutCommand | Mutates layout.workspace, updates sidebar.projectRoot, emits layout:updated |
| workspace.setActiveProject | renderer -> main | layout:command (send) | { type, path } | src/backend/layout/layoutManager.js ApplyLayoutCommand | Updates activeProjectRoot and sidebar.projectRoot, emits layout:updated |
| tab.openFile | renderer -> main | layout:command (send) | { type, filePath } | src/backend/layout/layoutManager.js ApplyLayoutCommand | Adds/activates file tab, emits layout:updated |
| tab.activate | renderer -> main | layout:command (send) | { type, id } | src/backend/layout/layoutManager.js ApplyLayoutCommand | Sets activeTabId, emits layout:updated |
| tab.close | renderer -> main | layout:command (send) | { type, id } | src/backend/layout/layoutManager.js ApplyLayoutCommand | Removes tab, updates activeTabId, emits layout:updated |
| sidebar.setMode | renderer -> main | layout:command (send) | { type, mode } | src/backend/layout/layoutManager.js ApplyLayoutCommand | Updates sidebar.mode, emits layout:updated |

## Layout data flow

| Name | Direction | Transport | Payload schema | Handled in | Side effects |
| --- | --- | --- | --- | --- | --- |
| layout:get | renderer -> main | layout:get (invoke/handle) | {} | src/main.js ipcMain.handle | Returns layout snapshot |
| layout:updated | main -> renderer | layout:updated (webContents.send) | layout snapshot | src/main.js layout:command handler | Notifies renderer of layout changes |

## IO commands (renderer -> main)

| Name | Direction | Transport | Payload schema | Handled in | Side effects |
| --- | --- | --- | --- | --- | --- |
| project:openDialog | renderer -> main | project:openDialog (invoke/handle) | {} | src/main.js ipcMain.handle | Shows dialog, opens project, applies workspace.openProject, emits layout:updated |
| project:listChildren | renderer -> main | project:listChildren (invoke/handle) | { rootPath, dirPath } | src/main.js ipcMain.handle | Reads filesystem, returns TreeNode[] |
| doc:open | renderer -> main | doc:open (invoke/handle) | { filePath } | src/main.js ipcMain.handle | Reads file, returns { ok, text, mtimeMs } |
| doc:save | renderer -> main | doc:save (invoke/handle) | { filePath, text, expectedMtimeMs } | src/main.js ipcMain.handle | Writes file, returns { ok, newMtimeMs } or { ok:false, conflict:true, diskMtimeMs } |

## Menu commands (renderer -> main)

| Name | Direction | Transport | Payload schema | Handled in | Side effects |
| --- | --- | --- | --- | --- | --- |
| app.exit | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Quits app |
| view.toggleDevTools | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Toggles devtools |
| view.reload | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Reloads window |
| edit.undo | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Undo in focused webContents |
| edit.redo | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Redo in focused webContents |
| edit.cut | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Cut in focused webContents |
| edit.copy | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Copy in focused webContents |
| edit.paste | renderer -> main | menu:command (send) | command string | src/backend/ipc_on.js handleMenuCommand | Paste in focused webContents |
| file.open | renderer -> main | menu:command (send) | command string | src/main.js menu:command handler | Calls project:openDialog logic and applies workspace.openProject |
| file.newProject | renderer -> main | menu:command (send) | command string | src/main.js menu:command handler | Calls project:openDialog logic and applies workspace.openProject |
| tools.settings | renderer -> main | menu:command (send) | command string | src/main.js menu:command handler | Placeholder (no-op) |

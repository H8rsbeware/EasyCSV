# Backend Overview

This document explains the backend modules under `src/backend`, how they fit
together, and the expectations they enforce.

## Purpose and boundaries

- The backend is the Electron main-process layer that owns state, filesystem
  access, and IPC command handling.
- Rendering/UI is handled elsewhere; backend classes keep state shape stable
  and provide deterministic commands to mutate it.

## Module map

Backend entry points:

- `src/backend/utils.js` - Settings loader (`unpackSettings`) that resolves
  relative paths to absolute paths.
- `src/backend/ipc_on.js` - Menu/Window IPC handlers and command routing.

State managers:

- `src/backend/layout/layoutManager.js`
  - Owns layout state (tabs/sidebar/workspace).
  - Applies layout commands deterministically via `ApplyLayoutCommand`.
- `src/backend/user_state/userStateManager.js`
  - Loads, merges, and persists user settings JSON.
  - Ensures defaults exist and merges missing keys on startup.
- `src/backend/menu_state/menuStateManager.js`
  - Loads menu state definitions and merges shortcuts from defaults/user
    overrides.
  - Creates user shortcut file on first run if missing.

Project + document IO:

- `src/backend/project_manager/projectManager.js`
  - Tracks open projects and lists filesystem nodes under the project root.
  - Enforces path boundary checks to prevent traversal outside the root.
- `src/backend/project_manager/documentManager.js`
  - Opens and saves document files with mtime-based conflict detection.

Layout blueprints (shape guards):

- `src/backend/layout/objects/*Blueprint.js`
  - Validate and normalize layout data.
  - `LayoutBlueprint` ensures unique tab IDs and a valid active tab.
  - `SidebarBlueprint` enforces allowed modes.
  - `WorkspaceBlueprint` enforces projects/root shape.

## Settings and file locations

Settings are defined in `src/settings.json` and loaded via `unpackSettings`.
In dev mode, relative paths are resolved against `src/settings.json` so they
become absolute at runtime.

State files used by the backend:

- User state: `C:/ProgramData/EasyCSV/.userstate.json`
- User shortcuts: `C:/ProgramData/EasyCSV/.shortcuts.json`
- Defaults live under `src/backend/user_state/defaults` and
  `src/backend/menu_state/schema`.

## Key behaviors and contracts

LayoutManager:

- `workspace.openProject` adds a project if missing and sets it active.
- `tab.openFile` dedupes by file path (existing tab becomes active).
- `tab.newFile` allocates incrementing `untitled:<n>` IDs.
- `tab.saveAs` renames tabs based on file path and resolves duplicates.
- `tab.setDirty` updates a tab by ID or file path.

ProjectManager:

- `openProject` must be called before listing children.
- `assertWithinRoot` prevents accessing paths outside the root.
- `listChildren` returns directories first, then files, sorted by name.
- Symlinks are visible but never expandable.

DocumentManager:

- `open` requires a file; returns `{ ok, text, mtimeMs, sizeBytes }`.
- `save` can return `{ ok:false, conflict:true }` when mtimes mismatch.
- `saveAs` validates a non-empty path and always writes the file.

UserState:

- Missing user state is bootstrapped from defaults.
- Defaults are merged into existing state on startup.
- `SetState` only updates existing keys; it will not create new ones.

MenuState:

- First run copies default shortcuts to the user shortcuts file.
- Menu definitions get shortcuts from user overrides, falling back to defaults.

## Testing

Backend tests live under `testing/Backend` and use the Node test runner:

```sh
node --test "testing/**/*.test.js"
```

Each test includes the required 5-line comment header from `testing/.structure`.

## Common development notes

- Backend modules are CommonJS (`require/module.exports`).
- Avoid module-level mocks in production code; prefer dependency injection.
- When adding new commands, document them in `docs/commands.md`.

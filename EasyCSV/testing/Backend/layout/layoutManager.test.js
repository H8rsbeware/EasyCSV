const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { LayoutManager } = require('../../../src/backend/layout/layoutManager.js');
const { UserState } = require('../../../src/backend/user_state/userStateManager.js');

describe('LayoutManager', () => {
  let tempDir;
  let statePath;
  let defaultPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easycsv-layout-'));
    statePath = path.join(tempDir, 'userstate.json');
    defaultPath = path.join(tempDir, 'default_userstate.json');

    const defaults = { preferences: { theme: 'dark' } };
    fs.writeFileSync(defaultPath, JSON.stringify(defaults, null, 2), 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeUserState = () =>
    new UserState({
      UserStatePath: () => statePath,
      UserStateDefaultPath: () => defaultPath,
    });

  it('opens a project and updates workspace + sidebar', () => {
    // LayoutManager.ApplyLayoutCommand - opens project and sets active root
    // Input - cmd: { type: "workspace.openProject", path: "C:/Projects/Demo" }
    // Output - workspace.activeProjectRoot updated and sidebar stays in explorer mode
    // Notes - SidebarBlueprint currently only preserves mode (projectRoot ignored)
    // Importance - High (Shape: Stable). Project navigation depends on this.

    const userState = makeUserState();
    const manager = new LayoutManager(userState);
    const projectPath = path.join('C:', 'Projects', 'Demo');

    const state = manager.ApplyLayoutCommand({
      type: 'workspace.openProject',
      path: projectPath,
    });

    assert.equal(state.workspace.activeProjectRoot, projectPath);
    assert.equal(state.workspace.projects[0].root, projectPath);
    assert.equal(state.workspace.projects[0].name, 'Demo');
    assert.equal(state.sidebar.mode, 'explorer');
  });

  it('dedupes file tabs when opening the same path', () => {
    // LayoutManager.ApplyLayoutCommand - reuses existing file tabs
    // Input - cmd: { type: "tab.openFile", filePath: "C:/Docs/a.csv" } twice
    // Output - only one file tab and activeTabId updated to existing tab
    // Notes - prevents duplicate tabs for same file path
    // Importance - Medium (Shape: Stable). Tab dedupe is UX-critical.

    const userState = makeUserState();
    const manager = new LayoutManager(userState);
    const filePath = path.join('C:', 'Docs', 'a.csv');

    manager.ApplyLayoutCommand({ type: 'tab.openFile', filePath });
    const state2 = manager.ApplyLayoutCommand({ type: 'tab.openFile', filePath });

    const fileTabs = state2.tabs.filter((t) => t.kind === 'file');

    assert.equal(fileTabs.length, 1);
    assert.equal(state2.activeTabId, `file:${filePath}`);
  });

  it('creates incrementing untitled tabs for new files', () => {
    // LayoutManager.ApplyLayoutCommand - allocates incremental untitled IDs
    // Input - cmd: { type: "tab.newFile" } twice
    // Output - tabs with ids untitled:1 and untitled:2
    // Notes - relies on __nextUntitledIndex scan
    // Importance - Medium (Shape: Flexible). ID format may evolve.

    const userState = makeUserState();
    const manager = new LayoutManager(userState);

    manager.ApplyLayoutCommand({ type: 'tab.newFile' });
    const state = manager.ApplyLayoutCommand({ type: 'tab.newFile' });

    const untitledIds = state.tabs
      .filter((t) => typeof t.id === 'string' && t.id.startsWith('untitled:'))
      .map((t) => t.id);

    assert.deepEqual(untitledIds, ['untitled:1', 'untitled:2']);
  });
});

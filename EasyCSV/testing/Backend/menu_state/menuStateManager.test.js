const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { MenuState } = require('../../../src/backend/menu_state/menuStateManager.js');

describe('MenuState', () => {
  let tempDir;
  let shortcutsPath;
  let defaultShortcutsPath;
  let menuStatePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easycsv-menustate-'));
    shortcutsPath = path.join(tempDir, 'user_shortcuts.json');
    defaultShortcutsPath = path.join(tempDir, 'default_shortcuts.json');
    menuStatePath = path.join(tempDir, 'menu_state.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeSettings = () => ({
    UserMenuShortcutsPath: () => shortcutsPath,
    UserMenuShortcutsDefaultPath: () => defaultShortcutsPath,
    MenuStatePath: () => menuStatePath,
  });

  it('throws when required settings are missing', () => {
    // MenuState.constructor - rejects settings missing required accessors
    // Input - settings missing path accessors
    // Output - throws EvalError
    // Notes - guards against partial config injection
    // Importance - Medium (Shape: Stable). Constructor contract.

    assert.throws(() => new MenuState({}), { name: 'EvalError' });
  });

  it('copies default shortcuts when user shortcuts are missing', () => {
    // MenuState.CheckStateExists - copies defaults into user shortcuts file
    // Input - missing user shortcuts, existing default shortcuts
    // Output - user shortcuts file created and used
    // Notes - uses filesystem copy
    // Importance - High (Shape: Stable). First-run bootstrap.

    const menuState = {
      File: {
        items: [{ label: 'Open', command: 'file.open' }],
      },
    };
    const defaults = { 'file.open': 'Ctrl+O' };

    fs.writeFileSync(menuStatePath, JSON.stringify(menuState, null, 2), 'utf8');
    fs.writeFileSync(defaultShortcutsPath, JSON.stringify(defaults, null, 2), 'utf8');

    const ms = new MenuState(makeSettings());

    const userShortcuts = JSON.parse(fs.readFileSync(shortcutsPath, 'utf8'));
    assert.equal(userShortcuts['file.open'], 'Ctrl+O');
    assert.equal(ms.menu_state.File.items[0].shortcut, 'Ctrl+O');
  });

  it('prefers user shortcuts over defaults', () => {
    // MenuState.InitMenuState - applies user shortcut overrides
    // Input - user shortcuts define command override
    // Output - menu_state command uses user shortcut
    // Notes - keeps default fallback for other commands
    // Importance - Medium (Shape: Stable). Custom shortcuts are user-facing.

    const menuState = {
      File: {
        items: [{ label: 'Open', command: 'file.open' }],
      },
    };

    fs.writeFileSync(menuStatePath, JSON.stringify(menuState, null, 2), 'utf8');
    fs.writeFileSync(defaultShortcutsPath, JSON.stringify({ 'file.open': 'Ctrl+O' }, null, 2), 'utf8');
    fs.writeFileSync(shortcutsPath, JSON.stringify({ 'file.open': 'Ctrl+Shift+O' }, null, 2), 'utf8');

    const ms = new MenuState(makeSettings());

    assert.equal(ms.menu_state.File.items[0].shortcut, 'Ctrl+Shift+O');
  });
});

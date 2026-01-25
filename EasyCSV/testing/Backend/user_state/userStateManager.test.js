const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { UserState } = require('../../../src/backend/user_state/userStateManager.js');

describe('UserState', () => {
  let tempDir;
  let statePath;
  let defaultPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easycsv-userstate-'));
    statePath = path.join(tempDir, 'userstate.json');
    defaultPath = path.join(tempDir, 'default_userstate.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeSettings = () => ({
    UserStatePath: () => statePath,
    UserStateDefaultPath: () => defaultPath,
  });

  it('creates user state from defaults when missing', () => {
    // UserState.constructor - copies default state when user file missing
    // Input - settings with default file and missing user file
    // Output - user state file created with default contents
    // Notes - relies on filesystem copy path
    // Importance - High (Shape: Stable). Bootstraps first-run state.

    const defaults = { preferences: { theme: 'dark' }, recent: [] };
    fs.writeFileSync(defaultPath, JSON.stringify(defaults, null, 2), 'utf8');

    const userState = new UserState(makeSettings());

    assert.equal(fs.existsSync(statePath), true);
    assert.equal(userState.GetState('preferences.theme'), 'dark');
  });

  it('merges missing defaults into existing state and saves', () => {
    // UserState.MergeDefaults - adds missing keys and persists
    // Input - state missing nested keys, defaults include nested object
    // Output - saved state includes missing defaults
    // Notes - validates merge + SaveState side effects
    // Importance - High (Shape: Stable). Prevents missing config crashes.

    const defaults = {
      preferences: {
        theme: 'dark',
        fonts: { interface: 'EasySans' },
      },
      recent: [],
    };

    fs.writeFileSync(defaultPath, JSON.stringify(defaults, null, 2), 'utf8');
    fs.writeFileSync(
      statePath,
      JSON.stringify({ preferences: { theme: 'light' } }, null, 2),
      'utf8'
    );

    new UserState(makeSettings());

    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(saved.preferences.theme, 'light');
    assert.equal(saved.preferences.fonts.interface, 'EasySans');
  });

  it('sets and reads nested state values', () => {
    // UserState.SetState - updates existing nested keys
    // Input - setting_str: "preferences.theme", value: "light"
    // Output - SetState returns true and GetState returns new value
    // Notes - ignores unknown keys rather than creating new shape
    // Importance - Medium (Shape: Stable). Used by settings UI.

    const defaults = { preferences: { theme: 'dark' }, recent: [] };
    fs.writeFileSync(defaultPath, JSON.stringify(defaults, null, 2), 'utf8');

    const userState = new UserState(makeSettings());

    const ok = userState.SetState('preferences.theme', 'light');
    userState.SaveState();

    assert.equal(ok, true);
    assert.equal(userState.GetState('preferences.theme'), 'light');
    assert.equal(userState.SetState('preferences.missing', 'x'), false);
  });
});

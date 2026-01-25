const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { unpackSettings } = require('../../../src/backend/utils.js');

describe('utils', () => {
  describe('unpackSettings', () => {
    it('returns accessor functions and resolves relative paths', () => {
      // unpackSettings - resolves settings file values into accessors
      // Input - app: { isPackaged: false }
      // Output - settings object with function values and __options list
      // Notes - uses repo settings.json in dev mode
      // Importance - High (Shape: Stable). Settings drives multiple backend managers.

      const settings = unpackSettings({ isPackaged: false });

      assert.equal(typeof settings.UserStatePath, 'function');
      assert.equal(typeof settings.MenuStatePath, 'function');
      assert.equal(Array.isArray(settings.__options), true);
      assert.equal(settings.__options.includes('UserStatePath'), true);
      assert.equal(path.isAbsolute(settings.MenuStatePath()), true);
      assert.equal(
        settings.MenuStatePath().includes(
          path.join('backend', 'menu_state', 'schema', 'menu_state.json')
        ),
        true
      );
    });

    it('throws when settings file is missing', () => {
      // unpackSettings - throws when settings.json cannot be located
      // Input - app: { isPackaged: false }, fs.existsSync: false
      // Output - throws ReferenceError with missing settings path context
      // Notes - mock fs.existsSync to avoid touching the filesystem
      // Importance - Medium (Shape: Stable). Error path guards startup.

      const originalExistsSync = fs.existsSync;
      fs.existsSync = () => false;

      try {
        assert.throws(() => unpackSettings({ isPackaged: false }), {
          name: 'ReferenceError',
        });
        assert.throws(
          () => unpackSettings({ isPackaged: false }),
          /settings file/i
        );
      } finally {
        fs.existsSync = originalExistsSync;
      }
    });
  });
});

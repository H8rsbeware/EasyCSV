const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { handleMenuCommand } = require('../../../src/backend/ipc_on.js');

describe('ipc_on', () => {
  describe('handleMenuCommand', () => {
    it('routes app.exit to app.quit', () => {
      // handleMenuCommand - forwards app.exit to app.quit
      // Input - command: "app.exit", app: { quit: fn }, win: stub
      // Output - app.quit called once
      // Notes - win is unused for app.* commands
      // Importance - High (Shape: Stable). App exit must be reliable.

      let quitCalls = 0;
      const app = { quit: () => (quitCalls += 1) };
      const win = {};

      handleMenuCommand('app.exit', app, win);

      assert.equal(quitCalls, 1);
    });

    it('routes view.reload to webContents.reload', () => {
      // handleMenuCommand - forwards view.reload to webContents.reload
      // Input - command: "view.reload", win: { webContents: { reload: fn } }
      // Output - win.webContents.reload called once
      // Notes - no app dependency for view.* commands
      // Importance - Medium (Shape: Stable). View commands are user-facing.

      let reloadCalls = 0;
      const app = {};
      const win = { webContents: { reload: () => (reloadCalls += 1) } };

      handleMenuCommand('view.reload', app, win);

      assert.equal(reloadCalls, 1);
    });

    it('prefers custom file command handler when provided', () => {
      // handleMenuCommand - delegates file.* to custom handler if provided
      // Input - command: "file.open", menuHandlers.onFileCommand: fn
      // Output - onFileCommand called with command and win
      // Notes - avoids default console logging
      // Importance - Medium (Shape: Flexible). Extension point for app actions.

      const app = {};
      const win = { webContents: {} };
      let received;
      const onFileCommand = (command, winArg) => {
        received = [command, winArg];
      };

      handleMenuCommand('file.open', app, win, { onFileCommand });

      assert.deepEqual(received, ['file.open', win]);
    });
  });
});

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { DocumentManager } = require('../../../src/backend/project_manager/documentManager.js');

describe('DocumentManager', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easycsv-docs-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('open', () => {
    it('returns file contents and metadata', async () => {
      // DocumentManager.open - reads a file and returns text + metadata
      // Input - filePath: temp file with "hello"
      // Output - { ok: true, text, mtimeMs, sizeBytes }
      // Notes - uses real filesystem to verify stat handling
      // Importance - High (Shape: Stable). Document open is core editor flow.

      const filePath = path.join(tempDir, 'note.txt');
      fs.writeFileSync(filePath, 'hello', 'utf8');

      const dm = new DocumentManager();
      const result = await dm.open(filePath);

      assert.equal(result.ok, true);
      assert.equal(result.text, 'hello');
      assert.equal(typeof result.mtimeMs, 'number');
      assert.equal(result.sizeBytes, 5);
    });

    it('throws when target is not a file', async () => {
      // DocumentManager.open - rejects when path is a directory
      // Input - filePath: temp directory
      // Output - throws TypeError("Not a file")
      // Notes - ensures validation before read
      // Importance - Medium (Shape: Stable). Guards against misuse.

      const dm = new DocumentManager();

      await assert.rejects(() => dm.open(tempDir), { name: 'TypeError' });
      await assert.rejects(() => dm.open(tempDir), /not a file/i);
    });
  });

  describe('save', () => {
    it('returns conflict when mtime mismatches', async () => {
      // DocumentManager.save - detects write conflicts via mtime
      // Input - filePath: temp file, expectedMtimeMs: mismatched number
      // Output - { ok: false, conflict: true, diskMtimeMs }
      // Notes - avoids overwriting when disk changed
      // Importance - High (Shape: Stable). Prevents lost edits.

      const filePath = path.join(tempDir, 'conflict.txt');
      fs.writeFileSync(filePath, 'a', 'utf8');
      const st = fs.statSync(filePath);

      const dm = new DocumentManager();
      const result = await dm.save(filePath, 'b', st.mtimeMs + 1);

      assert.equal(result.ok, false);
      assert.equal(result.conflict, true);
      assert.equal(typeof result.diskMtimeMs, 'number');
    });

    it('writes and returns new mtime when no conflict', async () => {
      // DocumentManager.save - writes content when mtime matches
      // Input - filePath: temp file, text: "updated", expectedMtimeMs: current
      // Output - { ok: true, newMtimeMs }
      // Notes - uses stat to verify mtime changes
      // Importance - High (Shape: Stable). Save must be reliable.

      const filePath = path.join(tempDir, 'save.txt');
      fs.writeFileSync(filePath, 'old', 'utf8');
      const st = fs.statSync(filePath);

      const dm = new DocumentManager();
      const result = await dm.save(filePath, 'updated', st.mtimeMs);

      const finalText = fs.readFileSync(filePath, 'utf8');
      assert.equal(result.ok, true);
      assert.equal(typeof result.newMtimeMs, 'number');
      assert.equal(finalText, 'updated');
    });
  });

  describe('saveAs', () => {
    it('throws when file path is invalid', async () => {
      // DocumentManager.saveAs - rejects empty file paths
      // Input - filePath: "" (empty), text: "x"
      // Output - throws TypeError("Invalid file path")
      // Notes - protects against bad user input
      // Importance - Medium (Shape: Stable). Path validation is fundamental.

      const dm = new DocumentManager();

      await assert.rejects(() => dm.saveAs('', 'x'), { name: 'TypeError' });
      await assert.rejects(() => dm.saveAs('', 'x'), /invalid file path/i);
    });

    it('writes a new file and returns new mtime', async () => {
      // DocumentManager.saveAs - writes a new file
      // Input - filePath: new path, text: "new file"
      // Output - { ok: true, newMtimeMs }
      // Notes - uses real filesystem to validate outcome
      // Importance - High (Shape: Stable). Save As drives new documents.

      const dm = new DocumentManager();
      const filePath = path.join(tempDir, 'new.txt');

      const result = await dm.saveAs(filePath, 'new file');

      const finalText = fs.readFileSync(filePath, 'utf8');
      assert.equal(result.ok, true);
      assert.equal(typeof result.newMtimeMs, 'number');
      assert.equal(finalText, 'new file');
    });
  });
});

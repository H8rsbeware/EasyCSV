const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { ProjectManager } = require('../../../src/backend/project_manager/projectManager.js');

describe('ProjectManager', () => {
  let tempDir;
  let projectRoot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easycsv-proj-'));
    projectRoot = path.join(tempDir, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('openProject', () => {
    it('throws when root is not a directory', async () => {
      // ProjectManager.openProject - rejects non-directory roots
      // Input - rootPath: temp file path
      // Output - throws TypeError("Project root is not a directory")
      // Notes - ensures caller passes a directory
      // Importance - High (Shape: Stable). Protects project boundary.

      const filePath = path.join(tempDir, 'not-dir.txt');
      fs.writeFileSync(filePath, 'x', 'utf8');

      const pm = new ProjectManager();

      await assert.rejects(() => pm.openProject(filePath), { name: 'TypeError' });
    });

    it('tracks opened projects', async () => {
      // ProjectManager.openProject - records opened roots
      // Input - rootPath: existing directory
      // Output - isOpen(rootPath) === true
      // Notes - relies on internal openProjects map
      // Importance - Medium (Shape: Stable). Required for listChildren.

      const pm = new ProjectManager();
      const result = await pm.openProject(projectRoot);

      assert.equal(result, projectRoot);
      assert.equal(pm.isOpen(projectRoot), true);
    });
  });

  describe('assertWithinRoot', () => {
    it('throws for paths outside the root', () => {
      // ProjectManager.assertWithinRoot - blocks traversal outside root
      // Input - rootPath: project dir, targetPath: sibling path
      // Output - throws Error("Refusing to access path outside project root")
      // Notes - uses resolved absolute paths
      // Importance - Critical (Shape: Stable). Security boundary check.

      const pm = new ProjectManager();
      const outside = path.join(tempDir, 'outside');

      assert.throws(() => pm.assertWithinRoot(projectRoot, outside), /outside project root/i);
    });
  });

  describe('listChildren', () => {
    it('returns directories first, then files, sorted by name', async () => {
      // ProjectManager.listChildren - lists entries with dirs first then files
      // Input - rootPath: open project, dirPath: root with dirs/files
      // Output - ordered TreeNode list: aDir, bDir, a.txt, b.txt
      // Notes - uses real filesystem to verify ordering
      // Importance - Medium (Shape: Stable). Ordering affects UI stability.

      const pm = new ProjectManager();
      await pm.openProject(projectRoot);

      fs.mkdirSync(path.join(projectRoot, 'bDir'));
      fs.mkdirSync(path.join(projectRoot, 'aDir'));
      fs.writeFileSync(path.join(projectRoot, 'b.txt'), 'b', 'utf8');
      fs.writeFileSync(path.join(projectRoot, 'a.txt'), 'a', 'utf8');

      const nodes = await pm.listChildren(projectRoot, projectRoot);
      const names = nodes.map((n) => `${n.type}:${n.name}`);

      assert.deepEqual(names, [
        'dir:aDir',
        'dir:bDir',
        'file:a.txt',
        'file:b.txt',
      ]);
    });
  });
});

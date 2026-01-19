const fs = require('node:fs/promises');
const path = require('node:path');
const { TreeNode } = require('./objects/TreeNode.js');

class ProjectManager {
	constructor() {
		this.openProjects = new Map(); // rootPath -> { rootPath, openedAt }
	}

	async openProject(rootPath) {
		const st = await fs.stat(rootPath);
		if (!st.isDirectory()) {
			throw new TypeError(`Project root is not a directory: ${rootPath}`);
		}

		if (!this.openProjects.has(rootPath)) {
			this.openProjects.set(rootPath, { rootPath, openedAt: Date.now() });
		}

		return rootPath;
	}

	isOpen(rootPath) {
		return this.openProjects.has(rootPath);
	}

	assertWithinRoot(rootPath, targetPath) {
		const root = path.resolve(rootPath);
		const target = path.resolve(targetPath);

		// allow root itself or anything inside it
		if (!(target === root || target.startsWith(root + path.sep))) {
			throw new Error('Refusing to access path outside project root.');
		}
	}

	async listChildren(rootPath, dirPath) {
		if (!this.isOpen(rootPath)) {
			throw new Error(`Project is not open: ${rootPath}`);
		}

		this.assertWithinRoot(rootPath, dirPath);

		const entries = await fs.readdir(dirPath, { withFileTypes: true });

		const nodes = [];
		for (const ent of entries) {
			const fullPath = path.join(dirPath, ent.name);

			// Contract: symlinks are visible but never expandable (prevents recursion)
			if (ent.isSymbolicLink()) {
				nodes.push(
					new TreeNode({
						name: ent.name,
						path: fullPath,
						type: 'file',
						hasChildren: false,
						isSymlink: true,
					})
				);
				continue;
			}

			if (ent.isDirectory()) {
				// Cheap hasChildren hint
				const sub = await fs.readdir(fullPath, { withFileTypes: true });
				const hasChildren = sub.length > 0;

				nodes.push(
					new TreeNode({
						name: ent.name,
						path: fullPath,
						type: 'dir',
						hasChildren,
						isSymlink: false,
					})
				);
				continue;
			}

			if (ent.isFile()) {
				nodes.push(
					new TreeNode({
						name: ent.name,
						path: fullPath,
						type: 'file',
						hasChildren: false,
						isSymlink: false,
					})
				);
			}
		}

		// Nice UX: dirs first, then files, then alpha
		nodes.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return nodes;
	}
}

module.exports = { ProjectManager };

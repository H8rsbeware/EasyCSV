const fs = require('fs/promises');
const pathMod = require('path');

class TreeNode {
	static KINDS = ['dir', 'file'];

	constructor({ name, path, type, hasChildren = null, isSymlink = false }) {
		if (!TreeNode.KINDS.includes(type)) {
			throw new ReferenceError(
				`TreeNode kind must be only ${TreeNode.KINDS.join(', ')}`
			);
		}
		this.name = name;
		this.path = path;
		this.type = type; // "dir" | "file" (what we will treat it as in the tree)
		this.hasChildren = hasChildren; // boolean for dir, false for file, or null if unknown
		this.isSymlink = isSymlink; // whether the node itself is a symlink
	}

	/**
	 * Validates abs path and checks for children.
	 * @param {string} fullPath - absolute file path as str
	 * @returns {TreeNode}
	 *
	 * Usage:\
	 *   const node = await TreeNode.fromPath("C:\\Projects\\EasyCSV\\src");
	 */
	static async fromPath(fullPath) {
		const st = await fs.lstat(fullPath);
		const isSymlink = st.isSymbolicLink();

		// Decide what "type" means for a symlink node:
		// Option A (simple): treat symlink as "file" (leaf) until expanded.
		// Option B (better): resolve on demand to classify as dir/file.
		let type;
		if (st.isDirectory()) type = 'dir';
		else if (st.isFile()) type = 'file';
		else if (isSymlink) type = 'file';
		else throw new TypeError(`Unsupported node type: ${fullPath}`);

		const name = pathMod.basename(fullPath);

		let hasChildren = false;
		if (type === 'dir') {
			// "children exist" means "directory is non-empty", including symlinks
			const entries = await fs.readdir(fullPath, { withFileTypes: true });
			hasChildren = entries.length > 0;
		}

		return new TreeNode({
			name,
			path: fullPath,
			type,
			hasChildren,
			isSymlink,
		});
	}
}

module.exports = { TreeNode };

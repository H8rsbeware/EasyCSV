import { cloneTemplate, wireActions } from '../ui/templates.js';

// Sidebar view is UI-only; it reflects layout.workspace and never writes state directly.
export class SidebarView {
	constructor(rootEl) {
		this.rootEl = rootEl;

		// Workspace/project context (the only "state" we accept from layout).
		this.projectRoot = null;

		// UI-only state that can be rebuilt at any time.
		this.expanded = new Set(); // set of expanded directory paths
		this.childrenCache = new Map(); // dirPath -> TreeNode[]
		this.selectedPath = null; // currently selected node path (dir or file)
		this.dirtyFiles = new Set();
		this.dirtyDirs = new Set();
		this.selectedRowEl = null;
		this.hasRendered = false;
		this.rowMap = new Map(); // path -> row element
		this.dirtyChangedPaths = new Set();
	}

	syncFromLayout(sidebar, workspace, tabs, activeTabId) {
		const nextRoot = workspace?.activeProjectRoot ?? null;
		const rootChanged = nextRoot !== this.projectRoot;

		// On project change, reset UI state and seed root as expanded.
		// This is intentional so the first tree load is visible immediately.
		if (rootChanged) {
			this.projectRoot = nextRoot;
			this.expanded.clear();
			this.childrenCache.clear();
			this.selectedPath = null;

			if (this.projectRoot) {
				this.expanded.add(this.projectRoot);
				this.selectedPath = this.projectRoot;
			}
		}

		const dirtyChanged = this.updateDirtyState(tabs);

		if (rootChanged || !this.hasRendered) {
			this.render();
			return;
		}

		if (dirtyChanged) {
			this.applyDirtyClasses();
		}
	}

	async render() {
		if (!this.rootEl) return;

		this.rootEl.innerHTML = '';
		this.selectedRowEl = null;
		this.hasRendered = false;
		this.rowMap.clear();
		this.dirtyChangedPaths.clear();

		const view = cloneTemplate('tpl-sidebar');

		wireActions(view, {
			'new-file': () => {
				if (window?.layoutApi?.sendCommand) {
					window.layoutApi.sendCommand({ type: 'tab.newFile' });
				}
			},
			'open-project': async () => {
				await window.projectApi.openDialog();
			},
		});

		this.rootEl.appendChild(view);

		const treeEl = view.querySelector('.sidebar__tree');
		if (!treeEl) return;

		if (!this.projectRoot) {
			this.renderEmptyState(treeEl);
			this.hasRendered = true;
			return;
		}

		// Root row (collapsible + selectable).
		const rootRow = cloneTemplate('tpl-tree-row');
		rootRow.dataset.path = this.projectRoot;
		rootRow.style.setProperty('--depth', 0);
		rootRow.classList.add('tree-row--dir', 'tree-row--sticky');

		const rootArrow = rootRow.querySelector('.tree-row__arrow');
		const rootLabel = rootRow.querySelector('.tree-row__label');
		const rootIcon = rootRow.querySelector('.tree-row__icon');

		const rootExpanded = this.expanded.has(this.projectRoot);
		if (rootArrow) {
			rootArrow.classList.add('material-symbols-rounded');
			rootArrow.textContent = rootExpanded ? 'expand_more' : 'chevron_right';
		}
		if (rootLabel) rootLabel.textContent = this.projectRoot;
		if (rootIcon) rootIcon.textContent = rootExpanded ? 'folder_open' : 'folder';

		if (this.selectedPath === this.projectRoot) {
			rootRow.classList.add('tree-row__selected');
			this.selectedRowEl = rootRow;
		}
		if (this.dirtyDirs.has(this.projectRoot)) {
			rootRow.classList.add('tree-row--dirty');
		}
		this.rowMap.set(this.projectRoot, rootRow);

		rootRow.addEventListener('click', async (ev) => {
			ev.stopPropagation();

			this.selectedPath = this.projectRoot;

			if (this.expanded.has(this.projectRoot))
				this.expanded.delete(this.projectRoot);
			else this.expanded.add(this.projectRoot);

			await this.render();
		});

		treeEl.appendChild(rootRow);

		// Children are only fetched if the root is expanded.
		if (rootExpanded) {
			await this.renderDir(treeEl, this.projectRoot, 1);
		}
		this.hasRendered = true;
	}

	isExpandable(node) {
		return (
			node.type === 'dir' &&
			node.hasChildren === true &&
			node.isSymlink === false
		);
	}

	async getChildren(dirPath) {
		// Cache avoids re-walking the same directory on repeated expands.
		if (this.childrenCache.has(dirPath)) {
			return this.childrenCache.get(dirPath);
		}

		const nodes = await window.projectApi.listChildren(
			this.projectRoot,
			dirPath,
		);
		this.childrenCache.set(dirPath, nodes);
		return nodes;
	}

	async renderDir(container, dirPath, depth) {
		const nodes = await this.getChildren(dirPath);

		for (const node of nodes) {
			const row = cloneTemplate('tpl-tree-row');

			row.style.setProperty('--depth', depth);
			row.dataset.path = node.path;

			const arrow = row.querySelector('.tree-row__arrow');
			const label = row.querySelector('.tree-row__label');
			const icon = row.querySelector('.tree-row__icon');

			if (label) label.textContent = node.name;

			const expandable = this.isExpandable(node);
			const expanded = this.expanded.has(node.path);

			if (arrow) {
				arrow.classList.add('material-symbols-rounded');
				arrow.textContent = expandable
					? expanded
						? 'expand_more'
						: 'chevron_right'
					: '';
			}
			if (icon) {
				icon.textContent = this.getIconForNode(node, expanded);
			}

			if (node.type === 'dir') {
				row.classList.add('tree-row--dir', 'tree-row--sticky');
			}

			if (this.selectedPath === node.path) {
				row.classList.add('tree-row__selected');
				this.selectedRowEl = row;
			}
			if (
				(node.type === 'file' && this.dirtyFiles.has(node.path)) ||
				(node.type === 'dir' && this.dirtyDirs.has(node.path))
			) {
				row.classList.add('tree-row--dirty');
			}

			row.addEventListener('click', async (ev) => {
				ev.stopPropagation();

				// Selection always updates, regardless of node type.
				this.selectedPath = node.path;

				if (expandable) {
					if (this.expanded.has(node.path))
						this.expanded.delete(node.path);
					else this.expanded.add(node.path);

					await this.render();
					return;
				}

				// File open (and symlink treated as file).
				if (node.type === 'file' && window?.layoutApi?.sendCommand) {
					this.setSelectedRow(row);
					window.layoutApi.sendCommand({
						type: 'tab.openFile',
						filePath: node.path,
					});
					return;
				}

				// Non-expandable dir: just update selection.
				this.setSelectedRow(row);
			});

			container.appendChild(row);
			this.rowMap.set(node.path, row);

			if (expanded && expandable) {
				await this.renderDir(container, node.path, depth + 1);
			}
		}
	}

	setSelectedRow(row) {
		if (this.selectedRowEl && this.selectedRowEl !== row) {
			this.selectedRowEl.classList.remove('tree-row__selected');
		}
		row.classList.add('tree-row__selected');
		this.selectedRowEl = row;
	}

	renderEmptyState(container) {
		container.innerHTML = '';

		const empty = document.createElement('div');
		empty.className = 'sidebar__empty';
		empty.textContent = 'Open a folder to see your files.';

		const action = document.createElement('button');
		action.type = 'button';
		action.textContent = 'Open Folder';
		action.addEventListener('click', async () => {
			await window.projectApi.openDialog();
		});

		container.appendChild(empty);
		container.appendChild(action);
	}

	updateDirtyState(tabs) {
		const prevFiles = this.dirtyFiles;
		const prevDirs = this.dirtyDirs;
		const dirtyFiles = new Set();

		for (const tab of tabs || []) {
			if (tab?.dirty === true && tab.filePath) {
				dirtyFiles.add(tab.filePath);
			}
		}

		this.dirtyFiles = dirtyFiles;
		this.dirtyDirs = this.getDirtyDirs(dirtyFiles);
		this.dirtyChangedPaths = this.getDirtyChangedPaths(
			prevFiles,
			this.dirtyFiles,
			prevDirs,
			this.dirtyDirs
		);
		return this.dirtyChangedPaths.size > 0;
	}

	getDirtyDirs(dirtyFiles) {
		const dirs = new Set();
		if (!this.projectRoot) return dirs;

		const root = this.projectRoot.replace(/[/\\]+$/, '');
		for (const filePath of dirtyFiles) {
			if (typeof filePath !== 'string') continue;
			if (!filePath.startsWith(root)) continue;

			let current = filePath;
			while (true) {
				const lastSlash = Math.max(
					current.lastIndexOf('/'),
					current.lastIndexOf('\\')
				);
				if (lastSlash <= root.length) {
					dirs.add(root);
					break;
				}
				current = current.slice(0, lastSlash);
				dirs.add(current);
			}
		}
		return dirs;
	}

	getIconForNode(node, expanded) {
		if (node.type === 'dir') {
			return expanded ? 'folder_open' : 'folder';
		}

		const name = node.name || '';
		const ext = this.getExtension(name);

		if (ext === 'csv' || ext === 'tsv') return 'table_chart';
		if (
			['txt', 'md', 'json', 'js', 'ts', 'css', 'html', 'xml', 'yml', 'yaml']
				.includes(ext)
		)
			return 'text_fields';

		return 'help';
	}

	getExtension(fileName) {
		const match = /\.([^.]+)$/.exec(fileName);
		return match ? match[1].toLowerCase() : '';
	}

	applyDirtyClasses() {
		if (!this.rootEl) return;
		const changed = this.dirtyChangedPaths;
		if (!changed || changed.size === 0) return;

		for (const path of changed) {
			const row = this.rowMap.get(path);
			if (!row) continue;
			const isDir = row.classList.contains('tree-row--dir');
			const dirty =
				(isDir && this.dirtyDirs.has(path)) ||
				(!isDir && this.dirtyFiles.has(path));
			row.classList.toggle('tree-row--dirty', dirty);
		}
		this.dirtyChangedPaths.clear();
	}

	setsEqual(a, b) {
		if (a === b) return true;
		if (!a || !b || a.size !== b.size) return false;
		for (const v of a) {
			if (!b.has(v)) return false;
		}
		return true;
	}

	getDirtyChangedPaths(prevFiles, nextFiles, prevDirs, nextDirs) {
		const changed = new Set();

		for (const p of prevFiles || []) {
			if (!nextFiles?.has(p)) changed.add(p);
		}
		for (const p of nextFiles || []) {
			if (!prevFiles?.has(p)) changed.add(p);
		}
		for (const p of prevDirs || []) {
			if (!nextDirs?.has(p)) changed.add(p);
		}
		for (const p of nextDirs || []) {
			if (!prevDirs?.has(p)) changed.add(p);
		}

		return changed;
	}
}

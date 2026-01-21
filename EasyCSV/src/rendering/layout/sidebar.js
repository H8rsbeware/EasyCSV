import { cloneTemplate, wireActions } from '../ui/templates.js';

export class SidebarView {
	constructor(rootEl) {
		this.rootEl = rootEl;

		// Workspace/project context
		this.projectRoot = null;

		// UI-only state
		this.expanded = new Set(); // set of expanded directory paths
		this.childrenCache = new Map(); // dirPath -> TreeNode[]
		this.selectedPath = null; // currently selected node path (dir or file)
	}

	syncFromLayout(sidebar, workspace, tabs, activeTabId) {
		const nextRoot = workspace?.activeProjectRoot ?? null;

		// On project change, reset UI state and seed root as expanded (user can still collapse it)
		if (nextRoot !== this.projectRoot) {
			this.projectRoot = nextRoot;
			this.expanded.clear();
			this.childrenCache.clear();
			this.selectedPath = null;

			if (this.projectRoot) {
				this.expanded.add(this.projectRoot);
				this.selectedPath = this.projectRoot;
			}
		}

		this.render();
	}

	async render() {
		if (!this.rootEl) return;

		this.rootEl.innerHTML = '';

		const view = cloneTemplate('tpl-sidebar');

		wireActions(view, {
			'open-project': async () => {
				await window.projectApi.openDialog();
			},
		});

		this.rootEl.appendChild(view);

		if (!this.projectRoot) return;

		const treeEl = view.querySelector('.sidebar__tree');
		if (!treeEl) return;

		// Root row (collapsible + selectable)
		const rootRow = cloneTemplate('tpl-tree-row');
		rootRow.style.paddingLeft = '0px';
		rootRow.dataset.path = this.projectRoot;

		const rootArrow = rootRow.querySelector('.tree-row__arrow');
		const rootLabel = rootRow.querySelector('.tree-row__label');

		const rootExpanded = this.expanded.has(this.projectRoot);
		if (rootArrow) rootArrow.textContent = rootExpanded ? '▾' : '▸';
		if (rootLabel) rootLabel.textContent = this.projectRoot;

		if (this.selectedPath === this.projectRoot) {
			rootRow.classList.add('tree-row__selected');
		}

		rootRow.addEventListener('click', async (ev) => {
			ev.stopPropagation();

			this.selectedPath = this.projectRoot;

			if (this.expanded.has(this.projectRoot))
				this.expanded.delete(this.projectRoot);
			else this.expanded.add(this.projectRoot);

			await this.render();
		});

		treeEl.appendChild(rootRow);

		// Children (only if root expanded)
		if (rootExpanded) {
			await this.renderDir(treeEl, this.projectRoot, 1);
		}
	}

	isExpandable(node) {
		return (
			node.type === 'dir' &&
			node.hasChildren === true &&
			node.isSymlink === false
		);
	}

	async getChildren(dirPath) {
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

			row.style.paddingLeft = `${depth * 12}px`;
			row.dataset.path = node.path;

			const arrow = row.querySelector('.tree-row__arrow');
			const label = row.querySelector('.tree-row__label');

			if (label) label.textContent = node.name;

			const expandable = this.isExpandable(node);
			const expanded = this.expanded.has(node.path);

			if (arrow)
				arrow.textContent = expandable ? (expanded ? '▾' : '▸') : '';

			if (this.selectedPath === node.path) {
				row.classList.add('tree-row__selected');
			}

			row.addEventListener('click', async (ev) => {
				ev.stopPropagation();

				// selection always updates, regardless of node type
				this.selectedPath = node.path;

				if (expandable) {
					if (this.expanded.has(node.path))
						this.expanded.delete(node.path);
					else this.expanded.add(node.path);

					await this.render();
					return;
				}

				// File open (and symlink treated as file)
				if (node.type === 'file' && window?.layoutApi?.sendCommand) {
					window.layoutApi.sendCommand({
						type: 'tab.openFile',
						filePath: node.path,
					});
				}

				// Re-render to apply selection highlight immediately
				await this.render();
			});

			container.appendChild(row);

			if (expanded && expandable) {
				await this.renderDir(container, node.path, depth + 1);
			}
		}
	}
}

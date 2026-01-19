import { cloneTemplate, wireActions } from '../ui/templates.js';

export class SidebarView {
	constructor(rootEl) {
		this.rootEl = rootEl;
		this.projectRoot = null;
		this.expanded = new Set();
		this.childrenCache = new Map();
	}

	syncFromLayout(sidebar, workspace, tabs, activeTabId) {
		const nextRoot = workspace?.activeProjectRoot ?? null;
		if (nextRoot !== this.projectRoot) {
			this.projectRoot = nextRoot;
			this.expanded.clear();
			this.childrenCache.clear();
		}
		this.render();
	}

	async render() {
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
		const rootRow = cloneTemplate('tpl-tree-row');
		rootRow.style.paddingLeft = '0px';
		rootRow.querySelector('.tree-row__arrow').textContent = '▾';
		rootRow.querySelector('.tree-row__label').textContent =
			this.projectRoot;
		treeEl.appendChild(rootRow);
		await this.renderDir(treeEl, this.projectRoot, 1, true);
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
			dirPath
		);
		this.childrenCache.set(dirPath, nodes);
		return nodes;
	}

	async renderDir(container, dirPath, depth, forceExpanded = false) {
		const nodes = await this.getChildren(dirPath);
		for (const node of nodes) {
			const row = cloneTemplate('tpl-tree-row');
			row.style.paddingLeft = depth * 12 + 'px';
			const arrow = row.querySelector('.tree-row__arrow');
			const label = row.querySelector('.tree-row__label');
			label.textContent = node.name;

			const expandable = this.isExpandable(node);
			const expanded = forceExpanded || this.expanded.has(node.path);
			arrow.textContent = expandable ? (expanded ? '▾' : '▸') : '';

			row.addEventListener('click', async (ev) => {
				ev.stopPropagation();
				if (!expandable) {
					window.layoutApi.sendCommand({
						type: 'tab.openFile',
						filePath: node.path,
					});
					return;
				}

				if (this.expanded.has(node.path)) {
					this.expanded.delete(node.path);
				} else {
					this.expanded.add(node.path);
				}
				await this.render();
			});

			container.appendChild(row);

			if (expanded && expandable) {
				await this.renderDir(container, node.path, depth + 1);
			}
		}
	}
}

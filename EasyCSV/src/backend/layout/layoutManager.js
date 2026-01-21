const path = require('node:path');
const usm = require('../user_state/userStateManager.js');
const {
	TabBlueprint,
	SidebarBlueprint,
	LayoutBlueprint,
	WorkspaceBlueprint,
} = require('./objects/all.js');

class LayoutManager {
	constructor(usersState) {
		if (!(usersState instanceof usm.UserState)) {
			throw new ReferenceError(
				'userState must be a UserState Manager class.'
			);
		}

		if (usersState.GetState('layout_cache') == null) {
			this.layoutState = new LayoutBlueprint({
				tabs: [
					new TabBlueprint({
						id: 'welcome',
						kind: 'welcome',
						title: 'Welcome',
					}),
				],
				activeTabId: 'welcome',
				sidebar: new SidebarBlueprint({
					mode: 'explorer',
				}),
				workspace: {
					projects: [],
					activeProjectRoot: null,
				},
			});
		} else {
			throw new EvalError('Not currently supporting layout cache.');
		}
	}

	ApplyLayoutCommand(cmd) {
		// get current layout state, that being tabs, active tab, and sidebar
		const tabs = [...this.layoutState.tabs];
		let activeTabId = this.layoutState.activeTabId;
		let sidebar = new SidebarBlueprint({
			mode: this.layoutState.sidebar.mode,
		});
		let workspace = new WorkspaceBlueprint({
			projects: this.layoutState.workspace.projects,
			activeProjectRoot: this.layoutState.workspace.activeProjectRoot,
		});

		switch (cmd.type) {
			case 'workspace.openProject': {
				const path = cmd.path;
				const projects = [...(workspace.projects ?? [])];

				if (!projects.find((p) => p.root == path)) {
					projects.push({
						root: path,
						name: this.__extractProjectName(path),
					});
				}

				workspace = new WorkspaceBlueprint({
					projects,
					activeProjectRoot: path,
				});

				sidebar = new SidebarBlueprint({
					mode: sidebar.mode,
					projectRoot: path,
				});
				break;
			}

			case 'workspace.setActiveProject': {
				const path = cmd.path;
				const projects = [...(workspace.projects ?? [])];
				const exists = projects.find((p) => p.root == path);
				if (!exists) break;

				workspace = new WorkspaceBlueprint({
					projects,
					activeProjectRoot: path,
				});

				sidebar = new SidebarBlueprint({
					mode: sidebar.mode,
					projectRoot: path,
				});
				break;
			}

			case 'tab.activate': {
				const tab = tabs.find((t) => t.id === cmd.id);

				if (tab) {
					activeTabId = tab.id;
				}
				break;
			}

			case 'tab.openFile': {
				const filePath = cmd.filePath;
				if (typeof filePath !== 'string' || !filePath.trim()) break;

				const existing = tabs.find(
					(t) => t.kind === 'file' && t.filePath === filePath
				);
				if (existing) {
					activeTabId = existing.id;
					break;
				}

				const id = `file:${filePath}`;
				const title = path.basename(filePath);

				tabs.push(
					new TabBlueprint({
						id,
						kind: 'file',
						title,
						filePath,
					})
				);
				activeTabId = id;
				break;
			}

			case 'tab.close': {
				const index = tabs.findIndex((t) => t.id === cmd.id);
				if (index === -1) break;

				tabs.splice(index, 1);

				// if we close the active tab, choose a neighbour
				if (activeTabId === cmd.id) {
					const nextTab = tabs[index] || tabs[index - 1] || null;
					activeTabId = nextTab ? nextTab.id : null;
				}
				break;
			}

			case 'sidebar.setMode': {
				sidebar = new SidebarBlueprint({
					mode: cmd.mode,
				});
				break;
			}

			// TODO: tab.remove, tab.duplicate, tab.moveLeft, tab.moveRight, setProjectRoot, close all others.
			default:
				break;
		}

		// update internal layoutState so the manager reflects the applied command
		this.layoutState = new LayoutBlueprint({
			tabs,
			activeTabId,
			sidebar,
			workspace,
		});
		return this.layoutState;
	}

	__extractProjectName(path) {
		// take last folder in the path
		// TODO: handle edge cases, platform differences
		const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
		return parts[parts.length - 1] || path;
	}

	get() {
		return this.layoutState;
	}
}

module.exports = { LayoutManager };

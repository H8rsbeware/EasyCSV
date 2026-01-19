// LayoutBlueprint.js
const { SidebarBlueprint } = require('./SidebarBlueprint');
const { TabBlueprint } = require('./TabBlueprint');
const { WorkspaceBlueprint } = require('./WorkspaceBlueprint');

class LayoutBlueprint {
	constructor({
		tabs = [],
		activeTabId = null,
		sidebar = new SidebarBlueprint(),
		workspace = new WorkspaceBlueprint(),
	} = {}) {
		// Coerce tabs
		this.tabs = (Array.isArray(tabs) ? tabs : []).map((t) =>
			TabBlueprint.fromObject(t)
		);

		// Enforce unique tab IDs (bugs here are painful later)
		const ids = new Set();
		for (const t of this.tabs) {
			if (ids.has(t.id)) throw new Error(`Duplicate tab id: ${t.id}`);
			ids.add(t.id);
		}

		// Coerce sidebar
		this.sidebar = SidebarBlueprint.fromObject(sidebar);
		// Coerce workspace
		this.workspace = WorkspaceBlueprint.fromObject(workspace);

		// Active tab sanity
		const fallback = this.tabs.length ? this.tabs[0].id : null;
		const requested = activeTabId ?? fallback;

		this.activeTabId =
			requested && ids.has(requested) ? requested : fallback;
	}

	/**
	 * Factory for coercing a plain object into a LayoutBlueprint
	 * @param {object|LayoutBlueprint} obj
	 * @returns {LayoutBlueprint}
	 */
	static fromObject(obj) {
		if (obj instanceof LayoutBlueprint) return obj;
		return new LayoutBlueprint(obj ?? {});
	}

	getActiveTab() {
		return this.tabs.find((t) => t.id === this.activeTabId) ?? null;
	}

	toJSON() {
		return {
			tabs: this.tabs.map((t) => t.toJSON()),
			activeTabId: this.activeTabId,
			sidebar: this.sidebar.toJSON(),
			workspace: this.workspace.toJSON(),
		};
	}
}

module.exports = { LayoutBlueprint };

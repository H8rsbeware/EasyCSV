class ContentView {
	constructor(rootEl) {
		this.rootEl = rootEl;
		this.currentLayout = null;
	}

	syncFromLayout(layoutBlueprint) {
		this.currentLayout = layoutBlueprint;
		this.render();
	}

	render() {
		if (!this.rootEl || !this.currentLayout) return;

		const layout = this.currentLayout;
		const activeTab = layout.tabs.find((t) => t.id === layout.activeTabId);

		this.rootEl.innerHTML = '';

		if (!activeTab) {
			this.renderEmpty();
			return;
		}

		switch (activeTab.kind) {
			case 'welcome':
				this.renderWelcome(activeTab);
				break;
			case 'file':
				this.renderFile(activeTab);
				break;
			case 'settings':
				this.renderSettings(activeTab);
				break;
			default:
				this.renderUnknown(activeTab);
		}
	}

	renderEmpty() {
		this.rootEl.textContent = 'No tab open.';
	}

	renderWelcome(tab) {
		// Basic welcome page
		// LATER: buttons that send commands like tab.openProject, tools.settings, etc.
	}

	renderFile(tab) {
		// Show project main view
		// LATER:
		// - ask backend for project info
		// - embed explorers, editors, logs, etc.
	}

	renderSettings(tab) {
		// Config UI
		// LATER: read/write settings via a separate settings API
	}

	renderUnknown(tab) {
		this.rootEl.textContent = `Unknown tab kind: ${tab.kind}`;
	}
}

export { ContentView };

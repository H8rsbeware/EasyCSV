import { TabBar } from './tabbar.js';
import { SidebarView } from './sidebar.js';
import { ContentView } from './content.js';

const tabBarView = new TabBar(document.getElementById('tabbar'));
const sidebarView = new SidebarView(document.getElementById('sidebar'));
const contentView = new ContentView(document.getElementById('main-content'));

function renderLayout(layout) {
	tabBarView.syncFromLayout(layout.tabs, layout.activeTabId);
	sidebarView.syncFromLayout(
		layout.sidebar,
		layout.workspace,
		layout.tabs,
		layout.activeTabId
	);
	contentView.syncFromLayout(layout);
}

let currentLayout = null;

async function setupLayout() {
	currentLayout = await window.layoutApi.get();

	renderLayout(currentLayout);

	window.layoutApi.onUpdated((nextLayout) => {
		currentLayout = nextLayout;
		renderLayout(currentLayout);
	});
}

function getCurrentLayout() {
	return currentLayout;
}

export { setupLayout, getCurrentLayout, tabBarView, sidebarView, contentView };

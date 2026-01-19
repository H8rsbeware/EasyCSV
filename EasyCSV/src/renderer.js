async function onOpenProjectClicked() {
	// TODO: get a path (e.g., IPC dialog in main)
	// const path = await window.fileApi.pickDirectory();

	if (!path) return;

	window.layoutApi.sendCommand({
		type: 'workspace.openProject',
		path,
	});
}

import { setupTopbarUI } from './rendering/menus/setup.js';
import { setupLayout } from './rendering/layout/setup.js';

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', async () => {
		await setupLayout().then(() => {
			setupTopbarUI();
		});
	});
} else {
	(async () => {
		await setupLayout().then(() => {
			setupTopbarUI();
		});
	})();
}

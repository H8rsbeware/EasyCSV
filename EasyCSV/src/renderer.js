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
import { setupLayout, contentView } from './rendering/layout/setup.js';
import { applyFontSettings } from './rendering/settings/font_settings.js';

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', async () => {
		await setupLayout().then(() => {
			setupTopbarUI();
		});
		if (window.userApi?.getSettings) {
			const settings = await window.userApi.getSettings();
			applyFontSettings(settings);
		}
		window.fileApi?.onSave(() => {
			contentView?.saveActive?.();
		});
		window.fileApi?.onSaveAs(() => {
			contentView?.saveActiveAs?.();
		});
	});
} else {
	(async () => {
		await setupLayout().then(() => {
			setupTopbarUI();
		});
		if (window.userApi?.getSettings) {
			const settings = await window.userApi.getSettings();
			applyFontSettings(settings);
		}
		window.fileApi?.onSave(() => {
			contentView?.saveActive?.();
		});
		window.fileApi?.onSaveAs(() => {
			contentView?.saveActiveAs?.();
		});
	})();
}

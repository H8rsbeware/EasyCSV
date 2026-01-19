import { cloneTemplate, wireActions } from './ui/templates.js';

export function renderWelcome(rootEl) {
	rootEl.innerHTML = '';

	const view = cloneTemplate('tpl-welcome');

	wireActions(view, {
		'open-project': async () => {
			await window.projectApi.openDialog();
			// Layout update will arrive via layout:updated
		},
	});

	rootEl.appendChild(view);
}

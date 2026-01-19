import { MenuDefinition, MenuBar } from './menu_bar.js';
import {
	normalizeShortcutString,
	installShortcutHandler,
} from './shortcuts.js';

async function setupTopbarUI() {
	const menubarEl = document.getElementById('menubar');
	const dropdownRoot = document.getElementById('menubar-dropdown-root');

	const blueprint = await window.menuApi.getBlueprint();

	const menus = {};
	const shortcutMap = new Map();

	Object.entries(blueprint).forEach(([k, v]) => {
		const items = Array.from(v.items).map((def) => {
			if (def.type === 'separator') {
				return MenuDefinition.separator();
			}

			// If this item has a shortcut, register it
			if (def.shortcut && def.command) {
				const normalized = normalizeShortcutString(def.shortcut);
				if (normalized) {
					shortcutMap.set(normalized, def.command);
				}
			}

			return def;
		});

		menus[k] = new MenuDefinition(v.label, items);
	});

	console.log(menus);

	const commandHandler = (cmd) => {
		window.menuApi.sendCommand(cmd);
	};

	installShortcutHandler(shortcutMap, commandHandler);

	new MenuBar(menubarEl, dropdownRoot, menus, commandHandler);

	const themeBtn = document.getElementById('toggle-theme');
	if (themeBtn && window.theme?.get && window.theme?.set) {
		themeBtn.addEventListener('click', async () => {
			const current =
				document.documentElement.dataset.theme ||
				(await window.theme.get());

			const next = current === 'light' ? 'dark' : 'light';
			document.documentElement.dataset.theme = next;

			try {
				await window.theme.set(next);
			} catch (err) {
				console.error('Failed to persiit theme: ', err);
			}
		});
	}

	if (window.windowControls) {
		const minBtn = document.getElementById('min-btn');
		const maxBtn = document.getElementById('max-btn');
		const closeBtn = document.getElementById('close-btn');

		minBtn?.addEventListener('click', () => {
			window.windowControls.minimize?.();
		});
		maxBtn?.addEventListener('click', () => {
			window.windowControls.maximize?.();
		});
		closeBtn?.addEventListener('click', () => {
			window.windowControls.close?.();
		});
	}
}

export { setupTopbarUI };

// Pure UI representation of a menu and its items.
class MenuDefinition {
	constructor(name, items) {
		this.name = name;
		this.items = items;
	}

	static separator() {
		return { type: 'separator' };
	}

	// Builds DOM each time the menu is opened; this keeps it stateless.
	buildDOM(commandHandler) {
		const container = document.createElement('div');
		container.className = 'menu-dropdown';

		this.items.forEach((item) => {
			if (item.type === 'separator') {
				const sep = document.createElement('div');
				sep.className = 'menu-dropdown__separator';
				container.appendChild(sep);
				return;
			}

			const row = document.createElement('div');
			row.className = 'menu-dropdown__item';

			if (item.disabled) {
				row.classList.add('menu-dropdown__item--disabled');
			}

			row.dataset.command = item.command || '';

			row.innerHTML = `
                <span class="menu-dropdown__label">${item.label}</span>
                ${
					item.shortcut
						? `<span class="menu-dropdown__shortcut">${item.shortcut}</span>`
						: ''
				}
            `;

			row.addEventListener('click', (ev) => {
				ev.stopPropagation();
				if (!item.disabled && item.command && commandHandler) {
					commandHandler(item.command);
				}
			});

			// Prevent focus loss so selection stays intact in the editor.
			row.addEventListener('mousedown', (ev) => {
				ev.preventDefault();
			});

			container.appendChild(row);
		});

		return container;
	}
}

// Menu bar controller for mouse/keyboard interactions.
class MenuBar {
	constructor(rootEl, dropdownRoot, menus, commandHandler) {
		this.rootEl = rootEl;
		this.dropdownRoot = dropdownRoot;
		// Map of menu-name -> MenuDefinition.
		this.menus = menus;
		this.commandHandler = commandHandler;

		this.activeMenuName = null;
		this.activeDropdownEl = null;

		this._bindTopLevel();
		this._bindGlobalClose();
	}

	_bindTopLevel() {
		if (!this.rootEl) return;
		// Toggle open/close on click.
		this.rootEl.addEventListener('click', (ev) => {
			const item = ev.target.closest('.menubar__item');
			if (!item) return;

			const name = item.dataset.menu;
			if (this.activeMenuName === name) {
				this.closeMenu();
			} else {
				this.openMenu(name, item);
			}
		});
		// Hover opens menus without requiring focus (keeps text selection intact).
		this.rootEl.addEventListener('mouseover', (ev) => {
			const item = ev.target.closest('.menubar__item');
			if (!item) return;

			const name = item.dataset.menu;
			if (name) this.openMenu(name, item);
		});

		// Prevent titlebar clicks from stealing text selection in the editor.
		this.rootEl.addEventListener('mousedown', (ev) => {
			if (ev.target.closest('.menubar__item')) {
				ev.preventDefault();
			}
		});
	}

	_bindGlobalClose() {
		document.addEventListener('click', (ev) => {
			const inMenu =
				ev.target.closest('.menu-dropdown') ||
				ev.target.closest('.menubar__item');
			if (!inMenu) this.closeMenu();
		});

		document.addEventListener('keydown', (ev) => {
			if (ev.key === 'Escape') {
				this.closeMenu();
			}
		});
	}

	openMenu(name, anchorEl) {
		const def = this.menus[name];
		if (!def) return;

		this.closeMenu();

		this.rootEl
			.querySelectorAll('.menubar__item')
			.forEach((el) => el.classList.remove('is-open'));

		const btn = this.rootEl.querySelector(
			`.menubar__item[data-menu="${name}"]`
		);
		if (btn) btn.classList.add('is-open');

		const dropdownEl = def.buildDOM(this.commandHandler);
		this.dropdownRoot.appendChild(dropdownEl);

		const rect = anchorEl.getBoundingClientRect();
		dropdownEl.style.left = `${rect.left}px`;
		dropdownEl.style.top = `${rect.bottom}px`;

		this.activeMenuName = name;
		this.activeDropdownEl = dropdownEl;
	}

	closeMenu() {
		this.activeMenuName = null;

		if (this.activeDropdownEl) {
			this.activeDropdownEl.remove();
			this.activeDropdownEl = null;
		}

		if (this.rootEl) {
			this.rootEl
				.querySelectorAll('.menubar__item')
				.forEach((el) => el.classList.remove('is-open'));
		}
	}
}

export { MenuDefinition, MenuBar };

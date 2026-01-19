class MenuDefinition {
	constructor(name, items) {
		this.name = name;
		this.items = items;
	}

	static separator() {
		return { type: 'separator' };
	}

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

			container.appendChild(row);
		});

		return container;
	}
}

class MenuBar {
	constructor(rootEl, dropdownRoot, menus, commandHandler) {
		this.rootEl = rootEl;
		this.dropdownRoot = dropdownRoot;
		this.menus = menus; // {file: MenuDefinitions}
		this.commandHandler = commandHandler;

		this.activeMenuName = null;
		this.activeDropdownEl = null;

		this._bindTopLevel();
		this._bindGlobalClose();
	}

	_bindTopLevel() {
		if (!this.rootEl) return;
		// Bind the toggle open/close on click
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
		// Bind the highlight on mouse over
		this.rootEl.addEventListener('mouseenter', (ev) => {
			if (!this.activeMenuName) return;

			const item = ev.target.closest('.menubar__item');
			if (!item) return;

			const name = item.dataset.menu;
			if (name && name !== this.activeMenuName) {
				this.openMenu(name, item);
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

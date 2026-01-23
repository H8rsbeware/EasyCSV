// UI-only tab bar that mirrors layout state and emits layout commands.
class TabBar {
	constructor(rootEl) {
		this.rootEl = rootEl;
		this.tabs = [];
		this.activeId = null;
		this.lastSignature = null;
	}

	// Called by layout renderer; tab bar never owns the source of truth.
	syncFromLayout(tabs, activeTabId) {
		const signature = this.buildSignature(tabs, activeTabId);
		if (this.lastSignature === signature) {
			return;
		}
		this.lastSignature = signature;

		this.tabs = tabs;
		this.activeId = activeTabId;
		this.render();
	}

	render() {
		if (!this.rootEl) return;

		this.rootEl.innerHTML = '';

		const create_divider = () => {
			const divider = document.createElement('div');
			divider.className = 'tabbar__divider';
			return divider;
		};

		Array.from(this.tabs).forEach((tab) => {
			const el = document.createElement('div');
			el.className = 'tab';

			if (tab.id === this.activeId) {
				el.classList.add('tab--active');
			}
			el.dataset.tabId = tab.id;

			el.innerHTML = `
                <span class="tab__title" title="${tab.title}">${
					tab.title
				}</span>
                ${
					tab.closable === false
						? ''
						: '<button class="tab__close" aria-label="Close tab">×</button>'
				}
            `;

			// We only emit layout commands; main updates state and pushes layout.
			el.addEventListener('click', (ev) => {
				if (ev.target.classList.contains('tab__close')) return;
				window.layoutApi.sendCommand({
					type: 'tab.activate',
					id: tab.id,
				});
			});

			const closeBtn = el.querySelector('.tab__close');
			if (closeBtn) {
				closeBtn.addEventListener('click', (ev) => {
					ev.stopPropagation();
					window.layoutApi.sendCommand({
						type: 'tab.close',
						id: tab.id,
					});
				});
			}

			this.rootEl.appendChild(el);
			this.rootEl.appendChild(create_divider());
		});
	}

	closeTab(id) {
		window.layoutApi.sendCommand({ type: 'tab.close', id });
	}

	setActive(id) {
		window.layoutApi.sendCommand({ type: 'tab.activate', id });
	}

	buildSignature(tabs, activeTabId) {
		const parts = [`active:${activeTabId ?? ''}`];
		for (const tab of tabs || []) {
			parts.push(`${tab.id}:${tab.title}:${tab.kind}`);
		}
		return parts.join('|');
	}
}

export { TabBar };

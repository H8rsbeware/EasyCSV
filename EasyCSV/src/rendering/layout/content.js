// Renders the active tab content. It never mutates layout state directly.
import { cloneTemplate, wireActions } from '../ui/templates.js';
import { TextFileRenderer } from '../file_render/TextFileRenderer.js';
import { CsvFileRenderer } from '../file_render/CsvFileRenderer.js';
import { CsvTextRenderer } from '../file_render/CsvTextRenderer.js';
import { applyFontSettings } from '../settings/font_settings.js';

class ContentView {
	constructor(rootEl) {
		this.rootEl = rootEl;
		this.currentLayout = null;
		this.lastRenderKey = null;
		// Cache avoids re-reading files across tab switches.
		this.fileCache = new Map(); // filePath -> { text, mtimeMs }
		// Editor state stays local; backend only sees saves.
		this.editorState = new Map(); // filePath -> { text, mtimeMs, dirty }
		this.textRenderer = new TextFileRenderer({
			editorState: this.editorState,
			fileCache: this.fileCache,
		});
		this.csvRenderer = new CsvFileRenderer({ fileCache: this.fileCache });
		this.csvTextRenderer = new CsvTextRenderer({
			editorState: this.editorState,
			fileCache: this.fileCache,
			onTextChange: ({ filePath, text, delimiter }) => {
				this.csvRenderer.syncFromSourceEdit(filePath, text, delimiter);
			},
		});
		this.csvSettings = null;
		this.settingsSchema = null;
		this.settingsState = null;
		this.settingsTheme = null;
		this.settingsToken = 0;
		this.settingsListEl = null;
		this.settingsSearchEl = null;
		// In-flight reads are deduped so a fast re-render doesn't double-hit IPC.
		this.inflight = new Map(); // filePath -> Promise
		// Protects against out-of-order async renders after tab switches.
		this.renderToken = 0;
		this.welcomeToken = 0;
	}

	syncFromLayout(layoutBlueprint) {
		this.currentLayout = layoutBlueprint;

		const active = layoutBlueprint?.tabs?.find(
			(t) => t.id === layoutBlueprint.activeTabId
		);
		const nextKey = active
			? `${active.id}|${active.kind}|${active.filePath ?? ''}`
			: 'empty';

		if (this.lastRenderKey === nextKey) {
			return;
		}

		this.lastRenderKey = nextKey;
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
		const view = cloneTemplate('tpl-welcome');
		this.rootEl.appendChild(view);

		wireActions(view, {
			'new-file': () => {
				window.layoutApi.sendCommand({ type: 'tab.newFile' });
			},
			'open-file': async () => {
				const res = await window.docApi.openDialog();
				if (res?.ok && res.path) {
					window.layoutApi.sendCommand({
						type: 'tab.openFile',
						filePath: res.path,
					});
				}
			},
			'open-folder': async () => {
				await window.projectApi.openDialog();
			},
		});

		const recentList = view.querySelector('[data-role="recent-list"]');
		if (recentList) {
			recentList.textContent = 'Loading recent projects...';
			this.renderRecentProjects(recentList, ++this.welcomeToken);
		}
	}

	async saveActive() {
		if (!this.currentLayout) return;

		const activeTab = this.currentLayout.tabs.find(
			(t) => t.id === this.currentLayout.activeTabId
		);
		if (!activeTab || activeTab.kind !== 'file') return;
		if (!activeTab.filePath) {
			await this.saveActiveAs();
			return;
		}

		const ext = this.getExtension(activeTab.filePath);
		let res;
		if (ext === 'csv' || ext === 'tsv') {
			if (this.csvTextRenderer.hasActiveEditor()) {
				res = await this.csvTextRenderer.saveActiveFile();
			} else {
				const delimiter = ext === 'tsv' ? '\t' : ',';
				res = await this.csvRenderer.saveTableEdits(
					activeTab.filePath,
					delimiter
				);
			}
		} else {
			res = await this.textRenderer.saveActiveFile();
		}
		if (!res || res.ok !== false) return;
	}

	async saveActiveAs() {
		if (!this.currentLayout) return;

		const activeTab = this.currentLayout.tabs.find(
			(t) => t.id === this.currentLayout.activeTabId
		);
		if (!activeTab || activeTab.kind !== 'file') return;

		const pick = await window.docApi?.saveDialog?.(activeTab.filePath);
		if (!pick?.ok || !pick.path) return;

		const ext = this.getExtension(activeTab.filePath);
		let res;
		if (ext === 'csv' || ext === 'tsv') {
			if (this.csvTextRenderer.hasActiveEditor()) {
				res = await this.csvTextRenderer.saveActiveFileAs(pick.path);
			} else {
				const delimiter = ext === 'tsv' ? '\t' : ',';
				res = await this.csvRenderer.saveTableEditsAs(
					activeTab.filePath,
					pick.path,
					delimiter
				);
			}
		} else {
			res = await this.textRenderer.saveActiveFileAs(pick.path);
		}
		if (!res?.ok) return;

		window.layoutApi.sendCommand({
			type: 'tab.saveAs',
			id: activeTab.id,
			filePath: pick.path,
		});
	}

	renderFile(tab) {
		const filePath = tab.filePath;
		if (!filePath) {
			this.renderUntitled(tab);
			return;
		}

		const token = ++this.renderToken;

		const frame = document.createElement('div');
		frame.className = 'file-view';

		const header = document.createElement('div');
		header.className = 'file-view__header';

		const title = document.createElement('div');
		title.className = 'file-view__title';
		title.textContent = filePath;

		const status = document.createElement('div');
		status.className = 'file-view__status';
		status.textContent = 'Loading...';

		header.appendChild(title);
		header.appendChild(status);
		frame.appendChild(header);

		const body = document.createElement('div');
		body.className = 'file-view__body';
		frame.appendChild(body);

		this.rootEl.appendChild(frame);

		// Async load is isolated from the layout render, but guarded by token.
		const stopLoading = this.showLoadingOverlay(body);
		this.renderFileAsync(filePath, body, status, token, stopLoading);
	}

	async renderFileAsync(filePath, body, status, token, stopLoading) {
		const result = await this.loadFile(filePath);

		if (token !== this.renderToken) return;
		if (typeof stopLoading === 'function') stopLoading();

		if (!result || result.ok === false) {
			status.textContent = 'Failed to open file.';
			body.textContent = result?.reason || 'Unknown error.';
			return;
		}

		status.textContent = 'Loaded';

		const ext = this.getExtension(filePath);
		const text = result.text ?? '';

		if (ext === 'csv' || ext === 'tsv') {
			const delimiter = ext === 'tsv' ? '\t' : ',';
			if (!this.csvSettings && window?.userApi?.getCsvSettings) {
				try {
					this.csvSettings = await window.userApi.getCsvSettings();
				} catch (err) {
					this.csvSettings = null;
				}
			}
			this.textRenderer.clearActiveEditor();
			this.csvTextRenderer.setDelimiter(delimiter);
			this.csvRenderer.render(
				body,
				text,
				delimiter,
				filePath,
				this.csvSettings || {},
				{
					csvTextRenderer: this.csvTextRenderer,
					fileResult: result,
					showLoadingOverlay: () => this.showLoadingOverlay(body),
					updateCsvSettings: async (partial) => {
						if (!partial) return;
						const next = {
							...(this.csvSettings || {}),
							...partial,
						};
						this.csvSettings = next;
						if (window?.userApi?.setCsvSettings) {
							try {
								await window.userApi.setCsvSettings(partial);
							} catch (err) {
								// Ignore persistence errors; local state still applies.
							}
						}
					},
				}
			);
			return;
		}

		this.textRenderer.renderEditor(body, filePath, result);
	}

	showLoadingOverlay(body) {
		if (!body) return null;
		const overlay = document.createElement('div');
		overlay.className = 'file-loading';

		const spinner = document.createElement('div');
		spinner.className = 'file-loading__spinner';
		spinner.setAttribute('aria-hidden', 'true');

		overlay.appendChild(spinner);
		body.appendChild(overlay);

		return () => {
			overlay.remove();
		};
	}

	renderSettings(tab) {
		const view = document.createElement('div');
		view.className = 'settings';
		view.innerHTML = `
			<div class="settings__header">
				<div class="settings__title-wrap">
					<div class="settings__title">Settings</div>
					<div class="settings__subtitle">Search and edit your EasyCSV preferences.</div>
				</div>
				<label class="settings__search" aria-label="Search settings">
					<span class="material-symbols-rounded" aria-hidden="true">search</span>
					<input type="search" placeholder="Search settings" data-role="settings-search" />
				</label>
			</div>
			<div class="settings__body">
				<div class="settings__list" data-role="settings-list">Loading settings...</div>
			</div>
		`;

		this.rootEl.appendChild(view);
		this.renderSettingsAsync(view, ++this.settingsToken);
	}

	renderUnknown(tab) {
		this.rootEl.textContent = `Unknown tab kind: ${tab.kind}`;
	}

	renderUntitled(tab) {
		const view = cloneTemplate('tpl-file-editor');
		const title = view.querySelector('.editor__title');
		if (title) title.textContent = tab.title || 'Untitled';

		const status = view.querySelector('.editor__status');
		if (status) status.textContent = 'Unsaved file';

		const saveBtn = view.querySelector('[data-action="save"]');
		if (saveBtn) saveBtn.disabled = true;

		this.rootEl.appendChild(view);
	}

	async renderRecentProjects(listEl, token) {
		const items = (await window.userApi.getRecentProjects()) || [];

		if (token !== this.welcomeToken) return;

		listEl.innerHTML = '';

		if (!items.length) {
			const empty = document.createElement('div');
			empty.className = 'welcome__empty';
			empty.textContent = 'No recent projects yet.';
			listEl.appendChild(empty);
			return;
		}

		for (const item of items) {
			const row = document.createElement('button');
			row.className = 'welcome-recent';
			row.type = 'button';

			const name = document.createElement('div');
			name.className = 'welcome-recent__name';
			name.textContent = item.prj_name || item.prj_path;

			const path = document.createElement('div');
			path.className = 'welcome-recent__path';
			path.textContent = item.prj_path || '';

			const time = document.createElement('div');
			time.className = 'welcome-recent__time';
			time.textContent = item.last_opened
				? new Date(item.last_opened).toLocaleString()
				: '';

			row.appendChild(name);
			row.appendChild(path);
			row.appendChild(time);

			row.addEventListener('click', async () => {
				if (!item.prj_path) return;
				await window.projectApi.openPath(item.prj_path);
			});

			listEl.appendChild(row);
		}
	}

	async renderSettingsAsync(root, token) {
		if (!window?.userApi?.getSettingsSchema || !window?.userApi?.getSettings) {
			const listEl = root.querySelector('[data-role="settings-list"]');
			if (listEl) {
				listEl.textContent =
					'Settings API unavailable. Please reload the app.';
			}
			return;
		}

		const [schema, settings] = await Promise.all([
			window.userApi.getSettingsSchema(),
			window.userApi.getSettings(),
		]);

		const themeValue = window?.theme?.get
			? await window.theme.get()
			: this.getSettingValue(settings, 'preferences.theme');

		if (token !== this.settingsToken) return;

		this.settingsSchema = schema || { sections: [] };
		this.settingsState = settings || {};
		this.settingsTheme = themeValue;
		applyFontSettings(this.settingsState);

		const listEl = root.querySelector('[data-role="settings-list"]');
		const searchInput = root.querySelector('[data-role="settings-search"]');
		if (!listEl || !searchInput) return;

		this.settingsListEl = listEl;
		this.settingsSearchEl = searchInput;

		const renderList = () => {
			const query = searchInput.value || '';
			this.renderSettingsList(listEl, query);
		};

		searchInput.addEventListener('input', renderList);
		renderList();
	}

	renderSettingsList(listEl, query) {
		if (!listEl || !this.settingsSchema) return;

		const normalized = query.trim().toLowerCase();
		listEl.innerHTML = '';

		let matchCount = 0;
		const fragment = document.createDocumentFragment();

		const fontMode =
			this.getSettingValue(this.settingsState, 'preferences.fonts.mode') ||
			'simple';

		for (const section of this.settingsSchema.sections || []) {
			const items = (section.settings || []).filter((setting) => {
				if (!this.matchesSettingsQuery(setting, section, normalized)) {
					return false;
				}
				if (
					fontMode !== 'advanced' &&
					this.isAdvancedFontSetting(setting)
				) {
					return false;
				}
				return true;
			});
			if (!items.length) continue;

			const sectionEl = document.createElement('section');
			sectionEl.className = 'settings-section';

			const header = document.createElement('div');
			header.className = 'settings-section__header';
			header.innerHTML = `
				<div class="settings-section__title">${section.title || 'Settings'}</div>
				<div class="settings-section__desc">${
					section.description || ''
				}</div>
			`;
			sectionEl.appendChild(header);

			for (const setting of items) {
				sectionEl.appendChild(this.createSettingsRow(setting));
				matchCount += 1;
			}

			fragment.appendChild(sectionEl);
		}

		if (matchCount === 0) {
			const empty = document.createElement('div');
			empty.className = 'settings-empty';
			empty.textContent = normalized
				? 'No settings match your search.'
				: 'No settings available.';
			listEl.appendChild(empty);
			return;
		}

		listEl.appendChild(fragment);
	}

	createSettingsRow(setting) {
		const row = document.createElement('div');
		row.className = 'settings-row';

		const info = document.createElement('div');
		info.className = 'settings-row__info';

		const title = document.createElement('div');
		title.className = 'settings-row__title';
		title.textContent = setting.title || setting.key || 'Setting';

		const desc = document.createElement('div');
		desc.className = 'settings-row__desc';
		desc.textContent = setting.description || '';

		const meta = document.createElement('div');
		meta.className = 'settings-row__meta';

		const pathEl = document.createElement('span');
		pathEl.className = 'settings-row__path';
		pathEl.textContent = setting.key || '';

		const hint = document.createElement('span');
		hint.className = 'settings-row__hint';
		hint.textContent = this.buildSettingsHint(setting);

		meta.appendChild(pathEl);
		meta.appendChild(hint);

		const status = document.createElement('div');
		status.className = 'settings-row__status';

		info.appendChild(title);
		info.appendChild(desc);
		info.appendChild(meta);
		info.appendChild(status);

		const control = document.createElement('div');
		control.className = 'settings-row__control';

		const value = this.getSettingsDisplayValue(setting);
		const input = this.createSettingsInput(setting, value, {
			onSave: async (nextValue) => {
				status.textContent = '';
				row.classList.remove('is-error');
				const ok = await this.saveSettingValue(setting, nextValue);
				if (!ok) {
					row.classList.add('is-error');
					status.textContent = 'Failed to save setting.';
				}
			},
		});

		if (input) control.appendChild(input);

		row.appendChild(info);
		row.appendChild(control);
		return row;
	}

	createSettingsInput(setting, value, { onSave }) {
		const type = setting.type;

		if (type === 'boolean') {
			const label = document.createElement('label');
			label.className = 'settings-toggle';

			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = Boolean(value);

			const track = document.createElement('span');
			track.className = 'settings-toggle__track';
			const thumb = document.createElement('span');
			thumb.className = 'settings-toggle__thumb';
			track.appendChild(thumb);

			label.appendChild(checkbox);
			label.appendChild(track);

			checkbox.addEventListener('change', () => {
				onSave?.(checkbox.checked);
			});

			return label;
		}

		if (type === 'enum') {
			const select = document.createElement('select');
			select.className = 'settings-select';
			const options = Array.isArray(setting.options) ? setting.options : [];
			for (const opt of options) {
				const optionEl = document.createElement('option');
				if (typeof opt === 'string') {
					optionEl.value = opt;
					optionEl.textContent = opt;
				} else {
					optionEl.value = opt.value;
					optionEl.textContent = opt.label ?? opt.value;
				}
				if (String(optionEl.value) === String(value)) {
					optionEl.selected = true;
				}
				select.appendChild(optionEl);
			}

			select.addEventListener('change', () => {
				onSave?.(select.value);
			});

			return select;
		}

		if (type === 'number') {
			const input = document.createElement('input');
			input.type = 'number';
			input.className = 'settings-input';
			if (typeof setting.min === 'number') input.min = String(setting.min);
			if (typeof setting.max === 'number') input.max = String(setting.max);
			if (typeof setting.step === 'number')
				input.step = String(setting.step);
			input.value =
				typeof value === 'number' && Number.isFinite(value)
					? String(value)
					: '';

			const commit = () => {
				const raw = Number(input.value);
				if (!Number.isFinite(raw)) return;
				let next = raw;
				if (typeof setting.min === 'number') {
					next = Math.max(setting.min, next);
				}
				if (typeof setting.max === 'number') {
					next = Math.min(setting.max, next);
				}
				if (next !== raw) input.value = String(next);
				onSave?.(next);
			};

			input.addEventListener('change', commit);
			input.addEventListener('blur', commit);
			return input;
		}

		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'settings-input';
		input.value = value ?? '';

		const commit = () => {
			onSave?.(input.value);
		};

		input.addEventListener('change', commit);
		input.addEventListener('blur', commit);
		return input;
	}

	async saveSettingValue(setting, value) {
		if (setting.key === 'preferences.theme' && window?.theme?.set) {
			document.documentElement.dataset.theme = value;
			try {
				await window.theme.set(value);
				this.settingsTheme = value;
				return true;
			} catch (err) {
				console.error('Failed to persist theme setting:', err);
				return false;
			}
		}

		if (!window?.userApi?.setSetting) return false;

		const res = await window.userApi.setSetting(setting.key, value);
		if (!res?.ok) return false;

		this.applySettingValue(this.settingsState, setting.key, res.value);
		if (setting.key?.startsWith('preferences.fonts')) {
			applyFontSettings(this.settingsState);
			if (setting.key === 'preferences.fonts.mode') {
				const query = this.settingsSearchEl?.value || '';
				if (this.settingsListEl) {
					this.renderSettingsList(this.settingsListEl, query);
				}
			}
		}
		return true;
	}

	getSettingsDisplayValue(setting) {
		if (setting.key === 'preferences.theme') {
			return this.settingsTheme ?? 'light';
		}
		return this.getSettingValue(this.settingsState, setting.key);
	}

	getSettingValue(state, keyPath) {
		if (!state || !keyPath) return '';
		const parts = keyPath.split('.');
		let cursor = state;
		for (const part of parts) {
			if (!cursor || typeof cursor !== 'object') return '';
			cursor = cursor[part];
		}
		return cursor ?? '';
	}

	applySettingValue(state, keyPath, value) {
		if (!state || !keyPath) return;
		const parts = keyPath.split('.');
		let cursor = state;
		for (let i = 0; i < parts.length - 1; i += 1) {
			const part = parts[i];
			if (!cursor[part] || typeof cursor[part] !== 'object') {
				cursor[part] = {};
			}
			cursor = cursor[part];
		}
		cursor[parts[parts.length - 1]] = value;
	}

	matchesSettingsQuery(setting, section, query) {
		if (!query) return true;
		const target = [
			setting.title,
			setting.description,
			setting.key,
			section?.title,
			section?.description,
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();
		return target.includes(query);
	}

	isAdvancedFontSetting(setting) {
		const key = setting?.key || '';
		if (!key.startsWith('preferences.fonts.')) return false;
		return ![
			'preferences.fonts.mode',
			'preferences.fonts.interface',
			'preferences.fonts.editor',
		].includes(key);
	}

	buildSettingsHint(setting) {
		const parts = [];
		if (setting.type) {
			parts.push(`Type: ${setting.type}`);
		}
		if (setting.type === 'number') {
			const min = typeof setting.min === 'number' ? setting.min : '–';
			const max = typeof setting.max === 'number' ? setting.max : '–';
			parts.push(`Range: ${min}-${max}`);
		}
		if (setting.type === 'enum' && Array.isArray(setting.options)) {
			const values = setting.options
				.map((opt) => (typeof opt === 'string' ? opt : opt.value))
				.filter(Boolean)
				.join(', ');
			if (values) parts.push(`Values: ${values}`);
		}
		if (typeof setting.default !== 'undefined') {
			parts.push(`Default: ${setting.default}`);
		}
		return parts.join(' \u2022 ');
	}

	getExtension(filePath) {
		const match = /\.([^.\\/]+)$/.exec(filePath);
		return match ? match[1].toLowerCase() : '';
	}

	async loadFile(filePath) {
		if (this.fileCache.has(filePath)) {
			return { ok: true, ...this.fileCache.get(filePath) };
		}

		if (this.inflight.has(filePath)) {
			return await this.inflight.get(filePath);
		}

		// We keep the request promise so multiple renders can await the same IO.
		const promise = window.docApi
			.open(filePath)
			.then((res) => {
				if (res && res.ok) {
					this.fileCache.set(filePath, {
						text: res.text ?? '',
						mtimeMs: res.mtimeMs,
					});
				}
				return res;
			})
			.catch((err) => ({
				ok: false,
				reason: err?.message || String(err),
			}))
			.finally(() => {
				this.inflight.delete(filePath);
			});

		this.inflight.set(filePath, promise);
		return await promise;
	}

}

export { ContentView };

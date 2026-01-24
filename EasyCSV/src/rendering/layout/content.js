// Renders the active tab content. It never mutates layout state directly.
import { cloneTemplate, wireActions } from '../ui/templates.js';
import { TextFileRenderer } from '../file_render/TextFileRenderer.js';
import { CsvFileRenderer } from '../file_render/CsvFileRenderer.js';
import { CsvTextRenderer } from '../file_render/CsvTextRenderer.js';

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
		this.renderFileAsync(filePath, body, status, token);
	}

	async renderFileAsync(filePath, body, status, token) {
		const result = await this.loadFile(filePath);

		if (token !== this.renderToken) return;

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
				}
			);
			return;
		}

		this.textRenderer.renderEditor(body, filePath, result);
	}

	renderSettings(tab) {
		// Config UI
		// LATER: read/write settings via a separate settings API
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

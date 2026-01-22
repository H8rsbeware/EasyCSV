// Renders the active tab content. It never mutates layout state directly.
import { cloneTemplate, wireActions } from '../ui/templates.js';

class ContentView {
	constructor(rootEl) {
		this.rootEl = rootEl;
		this.currentLayout = null;
		// Cache avoids re-reading files across tab switches.
		this.fileCache = new Map(); // filePath -> { text, mtimeMs }
		// Editor state stays local; backend only sees saves.
		this.editorState = new Map(); // filePath -> { text, mtimeMs, dirty }
		// In-flight reads are deduped so a fast re-render doesn't double-hit IPC.
		this.inflight = new Map(); // filePath -> Promise
		// Protects against out-of-order async renders after tab switches.
		this.renderToken = 0;
		this.welcomeToken = 0;
	}

	syncFromLayout(layoutBlueprint) {
		this.currentLayout = layoutBlueprint;
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
			const rows = this.parseDelimited(text, delimiter);
			this.renderCsv(body, rows);
			return;
		}

		this.renderTextEditor(body, filePath, result);
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

	renderText(container, text) {
		container.innerHTML = '';

		const viewer = document.createElement('div');
		viewer.className = 'text-viewer';

		const lines = text.split(/\r?\n/);
		// Hard cap keeps very large files from freezing the renderer.
		const maxLines = 2000;
		const limited = lines.length > maxLines;
		const visibleLines = limited ? lines.slice(0, maxLines) : lines;

		for (let i = 0; i < visibleLines.length; i += 1) {
			const lineEl = document.createElement('div');
			lineEl.className = 'text-line';

			const lineNo = document.createElement('span');
			lineNo.className = 'text-line__no';
			lineNo.textContent = String(i + 1);

			const lineBody = document.createElement('span');
			lineBody.className = 'text-line__body';

			const tokens = this.tokenizeLine(visibleLines[i]);
			for (const t of tokens) {
				if (t.type === 'plain') {
					lineBody.appendChild(document.createTextNode(t.value));
				} else {
					const span = document.createElement('span');
					span.className = `tok-${t.type}`;
					span.textContent = t.value;
					lineBody.appendChild(span);
				}
			}

			lineEl.appendChild(lineNo);
			lineEl.appendChild(lineBody);
			viewer.appendChild(lineEl);
		}

		if (limited) {
			const note = document.createElement('div');
			note.className = 'text-viewer__note';
			note.textContent = `Showing first ${maxLines} lines (${lines.length} total).`;
			viewer.appendChild(note);
		}

		container.appendChild(viewer);
	}

	renderTextEditor(container, filePath, result) {
		container.innerHTML = '';

		const state =
			this.editorState.get(filePath) || {
				text: result.text ?? '',
				mtimeMs: result.mtimeMs ?? null,
				dirty: false,
			};

		// If this is the first time opening, seed editor state from disk.
		if (!this.editorState.has(filePath)) {
			this.editorState.set(filePath, state);
		}

		const editor = document.createElement('div');
		editor.className = 'text-editor';

		const gutter = document.createElement('div');
		gutter.className = 'text-editor__gutter';

		const textarea = document.createElement('textarea');
		textarea.className = 'text-editor__ta';
		textarea.spellcheck = false;
		textarea.value = state.text;

		const footer = document.createElement('div');
		footer.className = 'text-editor__footer';

		const status = document.createElement('div');
		status.className = 'text-editor__status';
		status.textContent = state.dirty ? 'Unsaved changes' : 'Saved';

		const saveBtn = document.createElement('button');
		saveBtn.type = 'button';
		saveBtn.textContent = 'Save';
		saveBtn.disabled = !state.dirty;

		footer.appendChild(status);
		footer.appendChild(saveBtn);

		editor.appendChild(gutter);
		editor.appendChild(textarea);
		container.appendChild(editor);
		container.appendChild(footer);

		const syncGutter = () => {
			const lines = textarea.value.split(/\r?\n/).length;
			gutter.innerHTML = '';
			for (let i = 1; i <= lines; i += 1) {
				const ln = document.createElement('div');
				ln.className = 'text-editor__line-no';
				ln.textContent = String(i);
				gutter.appendChild(ln);
			}
		};

		const markDirty = () => {
			state.text = textarea.value;
			state.dirty = true;
			this.editorState.set(filePath, state);
			status.textContent = 'Unsaved changes';
			saveBtn.disabled = false;
		};

		textarea.addEventListener('input', () => {
			syncGutter();
			markDirty();
		});

		textarea.addEventListener('scroll', () => {
			gutter.scrollTop = textarea.scrollTop;
		});

		saveBtn.addEventListener('click', async () => {
			const res = await window.docApi.save(
				filePath,
				state.text,
				state.mtimeMs
			);
			if (res?.ok) {
				state.mtimeMs = res.newMtimeMs;
				state.dirty = false;
				this.editorState.set(filePath, state);
				status.textContent = 'Saved';
				saveBtn.disabled = true;
				this.fileCache.set(filePath, {
					text: state.text,
					mtimeMs: state.mtimeMs,
				});
				return;
			}
			if (res?.conflict) {
				status.textContent = 'Conflict: file changed on disk';
				return;
			}
			status.textContent = 'Save failed';
		});

		syncGutter();
		// Focus editor so menu edit commands (cut/copy/paste/undo/redo) target it.
		requestAnimationFrame(() => textarea.focus());
	}

	// Minimal tokenizer for simple coloring: strings and numbers only.
	tokenizeLine(line) {
		const tokens = [];
		let i = 0;

		const pushPlain = (start, end) => {
			if (end > start) {
				tokens.push({ type: 'plain', value: line.slice(start, end) });
			}
		};

		while (i < line.length) {
			const ch = line[i];

			if (ch === '"' || ch === "'") {
				const quote = ch;
				let j = i + 1;
				while (j < line.length) {
					if (line[j] === quote && line[j - 1] !== '\\') break;
					j += 1;
				}
				const end = j < line.length ? j + 1 : line.length;
				pushPlain(0, i);
				tokens.push({ type: 'string', value: line.slice(i, end) });
				line = line.slice(end);
				i = 0;
				continue;
			}

			if ((ch >= '0' && ch <= '9') || (ch === '-' && line[i + 1] >= '0' && line[i + 1] <= '9')) {
				let j = i + 1;
				while (j < line.length) {
					const c = line[j];
					if ((c >= '0' && c <= '9') || c === '.' || c === '_') {
						j += 1;
						continue;
					}
					break;
				}
				pushPlain(0, i);
				tokens.push({ type: 'number', value: line.slice(i, j) });
				line = line.slice(j);
				i = 0;
				continue;
			}

			i += 1;
		}

		if (line.length) {
			tokens.push({ type: 'plain', value: line });
		}

		return tokens;
	}

	// Simple CSV/TSV parser with quote support and newline handling.
	parseDelimited(text, delimiter) {
		const rows = [];
		let row = [];
		let field = '';
		let inQuotes = false;

		for (let i = 0; i < text.length; i += 1) {
			const ch = text[i];

			if (inQuotes) {
				if (ch === '"') {
					const next = text[i + 1];
					if (next === '"') {
						field += '"';
						i += 1;
					} else {
						inQuotes = false;
					}
				} else {
					field += ch;
				}
				continue;
			}

			if (ch === '"') {
				inQuotes = true;
				continue;
			}

			if (ch === delimiter) {
				row.push(field);
				field = '';
				continue;
			}

			if (ch === '\r') {
				const next = text[i + 1];
				if (next === '\n') i += 1;
				row.push(field);
				rows.push(row);
				row = [];
				field = '';
				continue;
			}

			if (ch === '\n') {
				row.push(field);
				rows.push(row);
				row = [];
				field = '';
				continue;
			}

			field += ch;
		}

		row.push(field);
		rows.push(row);
		return rows;
	}

	renderCsv(container, rows) {
		container.innerHTML = '';

		const table = document.createElement('table');
		table.className = 'csv-table';

		// Keep tables lightweight; CSVs can be huge.
		const maxRows = 1000;
		const limited = rows.length > maxRows;
		const visibleRows = limited ? rows.slice(0, maxRows) : rows;

		const maxCols = visibleRows.reduce((m, r) => Math.max(m, r.length), 0);

		const thead = document.createElement('thead');
		const tbody = document.createElement('tbody');

		visibleRows.forEach((row, rowIndex) => {
			const tr = document.createElement('tr');

			const rowNum = document.createElement(rowIndex === 0 ? 'th' : 'td');
			rowNum.className = 'csv-table__rownum';
			rowNum.textContent = String(rowIndex + 1);
			tr.appendChild(rowNum);

			for (let c = 0; c < maxCols; c += 1) {
				const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
				cell.textContent = row[c] ?? '';
				tr.appendChild(cell);
			}

			if (rowIndex === 0) {
				thead.appendChild(tr);
			} else {
				tbody.appendChild(tr);
			}
		});

		table.appendChild(thead);
		table.appendChild(tbody);
		container.appendChild(table);

		if (limited) {
			const note = document.createElement('div');
			note.className = 'csv-table__note';
			note.textContent = `Showing first ${maxRows} rows (${rows.length} total).`;
			container.appendChild(note);
		}
	}
}

export { ContentView };

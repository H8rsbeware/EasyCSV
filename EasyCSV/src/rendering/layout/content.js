// Renders the active tab content. It never mutates layout state directly.
class ContentView {
	constructor(rootEl) {
		this.rootEl = rootEl;
		this.currentLayout = null;
		// Cache avoids re-reading files across tab switches.
		this.fileCache = new Map(); // filePath -> { text, mtimeMs }
		// In-flight reads are deduped so a fast re-render doesn't double-hit IPC.
		this.inflight = new Map(); // filePath -> Promise
		// Protects against out-of-order async renders after tab switches.
		this.renderToken = 0;
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
		// Basic welcome page
		// LATER: buttons that send commands like tab.openProject, tools.settings, etc.
	}

	renderFile(tab) {
		const filePath = tab.filePath;
		if (!filePath) {
			this.rootEl.textContent = 'No file path provided.';
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

		this.renderText(body, text);
	}

	renderSettings(tab) {
		// Config UI
		// LATER: read/write settings via a separate settings API
	}

	renderUnknown(tab) {
		this.rootEl.textContent = `Unknown tab kind: ${tab.kind}`;
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

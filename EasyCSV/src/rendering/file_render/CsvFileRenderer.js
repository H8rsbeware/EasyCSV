import { FileRenderBase } from './FileRenderBase.js';

class CsvFileRenderer extends FileRenderBase {
	constructor(options = {}) {
		super();
		// We keep CSV view settings centralized so UI/user-state can override them later.
		this.settings = {
			defaultMode: 'table',
			maxRows: 1000,
			maxCols: 200,
			maxSourceLines: 2000,
			rowHeight: 22,
			minRowHeight: 18,
			colWidth: 220,
			minColWidth: 80,
			rowNumWidth: 28,
			headerHeight: 28,
			hasHeader: true,
			tabSize: 4,
			typeHighlighting: false,
			...options.settings,
		};
		this.fileState = new Map();
		this.fileCache = options.fileCache || null;
	}

	getSettings(overrides = {}) {
		return { ...this.settings, ...overrides };
	}

	getFileState(filePath, settings) {
		const key = filePath || '__csv__';
		if (!this.fileState.has(key)) {
			this.fileState.set(key, {
				mode: settings.defaultMode || 'table',
				hasHeader:
					typeof settings.hasHeader === 'boolean'
						? settings.hasHeader
						: true,
				selection: null,
			});
		}
		return this.fileState.get(key);
	}

	applyViewVars(target, settings) {
		if (!target || !settings) return;
		const vars = [
			['--csv-row-height', settings.rowHeight, 'px'],
			['--csv-row-min-height', settings.minRowHeight, 'px'],
			['--csv-col-width', settings.colWidth, 'px'],
			['--csv-col-min-width', settings.minColWidth, 'px'],
			['--csv-rownum-width', settings.rowNumWidth, 'px'],
			['--csv-header-height', settings.headerHeight, 'px'],
			['--csv-tab-size', settings.tabSize, ''],
		];

		for (const [name, value, unit] of vars) {
			if (typeof value === 'number' && Number.isFinite(value)) {
				target.style.setProperty(name, `${value}${unit}`);
			} else if (value === null || value === undefined) {
				target.style.removeProperty(name);
			}
		}
	}

	// CSV/TSV parser with quote support and row/column limits.
	parseDelimited(text, delimiter, options = {}) {
		const maxRows = Number.isFinite(options.maxRows)
			? Math.max(0, options.maxRows)
			: Infinity;
		const maxCols = Number.isFinite(options.maxCols)
			? Math.max(0, options.maxCols)
			: Infinity;

		const rows = [];
		let row = [];
		let rowColCount = 0;
		let field = '';
		let inQuotes = false;
		let totalRows = 0;
		let maxColumns = 0;

		const commitField = () => {
			rowColCount += 1;
			if (rowColCount <= maxCols) {
				row.push(field);
			}
			field = '';
		};

		const commitRow = () => {
			commitField();
			totalRows += 1;
			if (rowColCount > maxColumns) maxColumns = rowColCount;
			if (totalRows <= maxRows) rows.push(row);
			row = [];
			rowColCount = 0;
		};

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
				commitField();
				continue;
			}

			if (ch === '\r') {
				const next = text[i + 1];
				if (next === '\n') i += 1;
				commitRow();
				continue;
			}

			if (ch === '\n') {
				commitRow();
				continue;
			}

			field += ch;
		}

		commitRow();

		return {
			rows,
			totalRows,
			maxColumns,
			limitedRows: totalRows > maxRows,
			limitedCols: maxColumns > maxCols,
		};
	}

	tokenizeSourceLine(line, delimiter) {
		const tokens = [];
		let inQuotes = false;
		let colIndex = 0;
		let fieldStart = 0;

		for (let i = 0; i < line.length; i += 1) {
			const ch = line[i];

			if (ch === '"') {
				if (inQuotes && line[i + 1] === '"') {
					i += 1;
				} else {
					inQuotes = !inQuotes;
				}
				continue;
			}

			if (ch === delimiter && !inQuotes) {
				tokens.push({
					type: 'field',
					value: line.slice(fieldStart, i),
					colIndex,
				});
				tokens.push({ type: 'delimiter', value: delimiter });
				colIndex += 1;
				fieldStart = i + 1;
			}
		}

		tokens.push({
			type: 'field',
			value: line.slice(fieldStart),
			colIndex,
		});

		return tokens;
	}

	render(container, text, delimiter, filePath, overrides = {}, helpers = {}) {
		container.innerHTML = '';

		try {
			const settings = this.getSettings(overrides);
			const state = this.getFileState(filePath, settings);
			if (helpers?.fileResult?.mtimeMs != null) {
				state.mtimeMs = helpers.fileResult.mtimeMs;
			}
			if (state.sourceText == null) {
				state.sourceText = text ?? '';
			}
			const effectiveText = state.sourceText ?? text ?? '';

			const root = document.createElement('div');
			root.className = 'csv-view';
			this.applyViewVars(root, settings);

			const parse = this.parseDelimited(effectiveText, delimiter, {
				maxRows: settings.maxRows,
				maxCols: settings.maxCols,
			});

			const stats = {
				totalRows: parse.totalRows,
				totalCols: parse.maxColumns,
				visibleRows: Math.min(parse.totalRows, settings.maxRows),
				visibleCols: Math.min(parse.maxColumns, settings.maxCols),
			};

			const viewHelpers = {
				...helpers,
				requestRerender: () => {
					this.render(
						container,
						state.sourceText ?? effectiveText,
						delimiter,
						filePath,
						settings,
						helpers
					);
				},
			};

			if (typeof state.hasHeader !== 'boolean') {
				state.hasHeader =
					typeof settings.hasHeader === 'boolean' ? settings.hasHeader : true;
			}

			const viewSettings = {
				...settings,
				hasHeader: state.hasHeader,
			};

			const toolbar = this.renderToolbar(
				root,
				state,
				stats,
				viewSettings,
				filePath,
				delimiter,
				viewHelpers,
				() => {
					this.render(
						container,
						effectiveText,
						delimiter,
						filePath,
						settings,
						helpers
					);
				}
			);

			const body = document.createElement('div');
			body.className = 'csv-view__body';

			const note = document.createElement('div');
			note.className = 'csv-view__note';

			if (state.mode === 'edit' && helpers?.csvTextRenderer) {
				// We route source editing through TextFileRenderer so save/dirty state stays consistent.
				helpers.csvTextRenderer.renderEditor(
					body,
					filePath,
					helpers.fileResult ?? { text: effectiveText, mtimeMs: null }
				);
			} else {
				this.renderTableView(
					body,
					parse,
					state,
					viewSettings,
					toolbar.refs,
					note,
					filePath,
					delimiter,
					effectiveText,
					viewHelpers
				);
			}

			root.appendChild(toolbar.el);
			root.appendChild(body);
			if (note.textContent) root.appendChild(note);
			container.appendChild(root);
		} catch (err) {
			// We surface errors here so a broken CSV render doesn't look like an empty file.
			console.error('CSV render failed:', err);
			const message = document.createElement('div');
			message.className = 'csv-view__error';
			message.textContent = 'CSV render failed. Check the console for details.';
			container.appendChild(message);
		}
	}

	renderToolbar(
		root,
		state,
		stats,
		settings,
		filePath,
		delimiter,
		helpers,
		onModeChange
	) {
		const toolbar = document.createElement('div');
		toolbar.className = 'csv-toolbar';

		const left = document.createElement('div');
		left.className = 'csv-toolbar__group';

		const modeToggle = document.createElement('button');
		modeToggle.type = 'button';
		modeToggle.className = 'csv-toggle csv-toggle--mode';
		modeToggle.setAttribute('aria-label', 'Toggle CSV view mode');

		const modeLabelLeft = document.createElement('span');
		modeLabelLeft.className = 'csv-toggle__label';
		modeLabelLeft.textContent = 'Table';

		const modeTrack = document.createElement('span');
		modeTrack.className = 'csv-toggle__track';

		const modeThumb = document.createElement('span');
		modeThumb.className = 'csv-toggle__thumb';
		modeTrack.appendChild(modeThumb);

		const modeLabelRight = document.createElement('span');
		modeLabelRight.className = 'csv-toggle__label';
		modeLabelRight.textContent = 'Source';

		modeToggle.appendChild(modeLabelLeft);
		modeToggle.appendChild(modeTrack);
		modeToggle.appendChild(modeLabelRight);

		const headerToggle = document.createElement('button');
		headerToggle.type = 'button';
		headerToggle.className = 'csv-toggle csv-toggle--header';
		headerToggle.setAttribute('aria-label', 'Toggle CSV header row');

		const headerLabel = document.createElement('span');
		headerLabel.className = 'csv-toggle__label';
		headerLabel.textContent = 'Header';

		const headerTrack = document.createElement('span');
		headerTrack.className = 'csv-toggle__track';

		const headerThumb = document.createElement('span');
		headerThumb.className = 'csv-toggle__thumb';
		headerTrack.appendChild(headerThumb);

		headerToggle.appendChild(headerLabel);
		headerToggle.appendChild(headerTrack);

		left.appendChild(modeToggle);
		left.appendChild(headerToggle);

		const right = document.createElement('div');
		right.className = 'csv-toolbar__group';

		const saveBtn = document.createElement('button');
		saveBtn.type = 'button';
		saveBtn.className = 'csv-toolbar__btn';
		saveBtn.textContent = 'Save';
		saveBtn.disabled = !state.dirty;

		const copyBtn = document.createElement('button');
		copyBtn.type = 'button';
		copyBtn.className = 'csv-toolbar__btn';
		copyBtn.textContent = 'Copy Cell';
		copyBtn.disabled = !state.selection;

		right.appendChild(saveBtn);
		right.appendChild(copyBtn);

		const meta = document.createElement('div');
		meta.className = 'csv-toolbar__meta';
		if (
			stats.visibleRows !== stats.totalRows ||
			stats.visibleCols !== stats.totalCols
		) {
			meta.textContent = `Rows: ${stats.totalRows} (showing ${stats.visibleRows}) · Cols: ${stats.totalCols} (showing ${stats.visibleCols})`;
		} else {
			meta.textContent = `Rows: ${stats.totalRows} · Cols: ${stats.totalCols}`;
		}

		const applyMode = (mode, notify = false) => {
			const nextMode = mode === 'edit' || mode === 'table' ? mode : 'table';
			state.mode = nextMode;
			modeToggle.dataset.state = nextMode === 'edit' ? 'right' : 'left';
			modeToggle.setAttribute('aria-pressed', nextMode === 'edit');
			copyBtn.disabled = !(nextMode === 'table' && state.selection);
			saveBtn.disabled = !(nextMode === 'table' && state.dirty);
			if (nextMode !== 'edit') {
				helpers?.csvTextRenderer?.clearActiveEditor?.();
			}
			if (notify && typeof onModeChange === 'function') onModeChange();
		};

		const applyHeader = (hasHeader, notify = false) => {
			state.hasHeader = hasHeader === true;
			headerToggle.dataset.state = state.hasHeader ? 'on' : 'off';
			headerToggle.setAttribute('aria-pressed', state.hasHeader);
			if (notify && typeof onModeChange === 'function') onModeChange();
		};

		modeToggle.addEventListener('click', () => {
			const next = state.mode === 'table' ? 'edit' : 'table';
			applyMode(next, true);
		});

		headerToggle.addEventListener('click', () => {
			applyHeader(!state.hasHeader, true);
		});

		copyBtn.addEventListener('click', () => {
			if (!state.selection?.value) return;
			this.copyToClipboard(state.selection.value);
		});

		saveBtn.addEventListener('click', async () => {
			if (!state.dirty) return;
			const res = await this.saveTableEdits(filePath, delimiter);
			if (res?.ok) {
				saveBtn.disabled = true;
			}
		});

		toolbar.appendChild(left);
		toolbar.appendChild(meta);
		toolbar.appendChild(right);

		applyMode(state.mode || settings.defaultMode, false);
		applyHeader(state.hasHeader, false);

		return {
			el: toolbar,
			refs: {
				saveBtn,
				copyBtn,
				meta,
			},
		};
	}

	renderTableView(
		container,
		parse,
		state,
		settings,
		refs,
		note,
		filePath,
		delimiter,
		sourceText,
		helpers
	) {
		const canEdit = !parse.limitedRows && !parse.limitedCols;
		let tableRows = parse.rows;

		if (!canEdit) {
			state.tableRows = null;
		} else if (
			!state.tableRows ||
			(!state.dirty && state.tableRows.sourceText !== sourceText)
		) {
			// We keep an editable copy so table edits don't get wiped by re-renders.
			state.tableRows = {
				rows: parse.rows.map((row) => row.slice()),
				sourceText,
			};
		}

		if (state.tableRows?.rows) {
			tableRows = state.tableRows.rows;
		}

		if (canEdit) {
			this.ensureTrailingEmpty(tableRows);
		}

		const rows = tableRows;
		const actualCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
		const visibleCols = Math.min(actualCols, settings.maxCols);

		if (!rows.length || visibleCols === 0) {
			const empty = document.createElement('div');
			empty.className = 'csv-view__empty';
			empty.textContent = 'No CSV cells to display.';
			container.appendChild(empty);
			return;
		}

		const table = document.createElement('table');
		table.className = 'csv-table';
		table.tabIndex = 0;

		const thead = document.createElement('thead');
		const tbody = document.createElement('tbody');

		rows.forEach((row, rowIndex) => {
			const tr = document.createElement('tr');

			const rowNum = document.createElement(rowIndex === 0 ? 'th' : 'td');
			rowNum.className = 'csv-table__rownum';
			if (settings.hasHeader && rowIndex === 0) {
				rowNum.textContent = '';
			} else {
			rowNum.textContent = String(
				settings.hasHeader ? rowIndex : rowIndex + 1
			);
			}
			tr.appendChild(rowNum);

			for (let c = 0; c < visibleCols; c += 1) {
				const isHeader = rowIndex === 0;
				const cell = document.createElement(isHeader ? 'th' : 'td');
				cell.textContent = row?.[c] ?? '';
				cell.dataset.row = String(rowIndex);
				cell.dataset.col = String(c);
				if (canEdit) cell.dataset.editable = 'true';
				if (state.selection?.row === rowIndex && state.selection?.col === c) {
					cell.classList.add('is-selected');
				}
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

		const selectCell = (rowIndex, colIndex) => {
			const nextRow = Math.max(0, Math.min(rows.length - 1, rowIndex));
			const nextCol = Math.max(0, Math.min(visibleCols - 1, colIndex));
			const selector = `[data-row="${nextRow}"][data-col="${nextCol}"]`;
			const cell = table.querySelector(selector);
			if (!cell) return;

			state.selection = {
				row: nextRow,
				col: nextCol,
				value: cell.textContent ?? '',
			};

			table
				.querySelectorAll('.is-selected')
				.forEach((el) => el.classList.remove('is-selected'));
			cell.classList.add('is-selected');
			if (refs?.copyBtn) refs.copyBtn.disabled = false;
			cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		};

		table.addEventListener('click', (event) => {
			const cell = event.target.closest('td, th');
			if (!cell || cell.classList.contains('csv-table__rownum')) return;
			const rowIndex = Number(cell.dataset.row);
			const colIndex = Number(cell.dataset.col);

			selectCell(rowIndex, colIndex);
		});

		table.addEventListener('keydown', (event) => {
			if (event.target?.classList?.contains('csv-cell-editor')) return;
			if (!rows.length || visibleCols === 0) return;

			const hasSelection = state.selection != null;
			const startRow = hasSelection ? state.selection.row : 0;
			const startCol = hasSelection ? state.selection.col : 0;

			const moveBy = (dr, dc) => {
				selectCell(startRow + dr, startCol + dc);
			};

			const jumpTo = (row, col) => {
				selectCell(row, col);
			};

			switch (event.key) {
				case 'ArrowUp':
					event.preventDefault();
					if (event.ctrlKey) {
						jumpTo(0, startCol);
					} else {
						moveBy(-1, 0);
					}
					return;
				case 'ArrowDown':
					event.preventDefault();
					if (event.ctrlKey) {
						jumpTo(rows.length - 1, startCol);
					} else {
						moveBy(1, 0);
					}
					return;
				case 'ArrowLeft':
					event.preventDefault();
					if (event.ctrlKey) {
						jumpTo(startRow, 0);
					} else {
						moveBy(0, -1);
					}
					return;
				case 'ArrowRight':
					event.preventDefault();
					if (event.ctrlKey) {
						jumpTo(startRow, visibleCols - 1);
					} else {
						moveBy(0, 1);
					}
					return;
				case 'Tab': {
					event.preventDefault();
					const delta = event.shiftKey ? -1 : 1;
					let nextRow = startRow;
					let nextCol = startCol + delta;

					if (nextCol < 0) {
						nextRow = Math.max(0, startRow - 1);
						nextCol = visibleCols - 1;
					} else if (nextCol >= visibleCols) {
						nextRow = Math.min(rows.length - 1, startRow + 1);
						nextCol = 0;
					}

					selectCell(nextRow, nextCol);
					return;
				}
				default:
					break;
			}
		});

		table.addEventListener('dblclick', (event) => {
			const cell = event.target.closest('td, th');
			if (!cell || cell.classList.contains('csv-table__rownum')) return;
			if (!cell.dataset.editable) return;
			if (cell.querySelector('input')) return;

			const rowIndex = Number(cell.dataset.row);
			const colIndex = Number(cell.dataset.col);
			const original = cell.textContent ?? '';

			cell.classList.add('is-editing');
			cell.textContent = '';

			const input = document.createElement('input');
			input.className = 'csv-cell-editor';
			input.type = 'text';
			input.value = original;
			cell.appendChild(input);
			input.focus();
			input.select();

			const commit = () => {
				const nextValue = input.value;
				cell.classList.remove('is-editing');
				cell.textContent = nextValue;
				if (!state.tableRows) return;
				if (!state.tableRows.rows[rowIndex]) {
					state.tableRows.rows[rowIndex] = [];
				}
				state.tableRows.rows[rowIndex][colIndex] = nextValue;
				const expanded = this.ensureTrailingEmpty(state.tableRows.rows);
				const trimmedRows = this.trimTrailingEmpty(state.tableRows.rows);
				const nextText = this.serializeRows(trimmedRows, delimiter);
				state.sourceText = nextText;
				state.tableRows.sourceText = nextText;
				if (helpers?.csvTextRenderer) {
					helpers.csvTextRenderer.setEditorText(filePath, nextText, {
						markDirty: true,
					});
				}
				if (!state.dirty) state.dirty = true;
				this.notifyDirtyState(filePath, true);
				if (refs?.saveBtn) refs.saveBtn.disabled = false;
				if (expanded && helpers?.requestRerender) {
					helpers.requestRerender();
				}
				selectCell(rowIndex, colIndex);
				table.focus();
			};

			const cancel = () => {
				cell.classList.remove('is-editing');
				cell.textContent = original;
			};

			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					commit();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					cancel();
				}
			});

			input.addEventListener('blur', () => {
				commit();
			});
		});

		if (parse.limitedRows || parse.limitedCols) {
			const parts = [];
			if (parse.limitedRows) {
				parts.push(`Showing first ${settings.maxRows} rows`);
			}
			if (parse.limitedCols) {
				parts.push(`first ${settings.maxCols} columns`);
			}
			note.textContent = `${parts.join(', ')}. Editing disabled for truncated data.`;
		}
	}

	renderSourceView(container, text, delimiter, settings, note) {
		const source = document.createElement('div');
		source.className = 'csv-source';

		const lines = text.split(/\r?\n/);
		const limited = lines.length > settings.maxSourceLines;
		const visibleLines = limited
			? lines.slice(0, settings.maxSourceLines)
			: lines;

		visibleLines.forEach((line, index) => {
			const rowEl = document.createElement('div');
			rowEl.className = 'csv-source__line';

			const lineNo = document.createElement('span');
			lineNo.className = 'csv-source__no';
			lineNo.textContent = String(index + 1);

			const lineBody = document.createElement('span');
			lineBody.className = 'csv-source__body';

			const tokens = this.tokenizeSourceLine(line, delimiter);
			for (const token of tokens) {
				if (token.type === 'delimiter') {
					const sep = document.createElement('span');
					sep.className = 'csv-source__delimiter';
					sep.textContent = token.value;
					lineBody.appendChild(sep);
					continue;
				}

				const span = document.createElement('span');
				span.className = `csv-source__field csv-source__field--c${
					token.colIndex % 8
				}`;
				span.textContent = token.value;
				lineBody.appendChild(span);
			}

			rowEl.appendChild(lineNo);
			rowEl.appendChild(lineBody);
			source.appendChild(rowEl);
		});

		container.appendChild(source);

		if (limited) {
			note.textContent = `Showing first ${settings.maxSourceLines} lines (${lines.length} total).`;
		}
	}

	copyToClipboard(value) {
		if (navigator?.clipboard?.writeText) {
			navigator.clipboard.writeText(value).catch(() => {
				this.fallbackCopy(value);
			});
			return;
		}
		this.fallbackCopy(value);
	}

	fallbackCopy(value) {
		const tmp = document.createElement('textarea');
		tmp.value = value;
		tmp.setAttribute('readonly', '');
		tmp.style.position = 'absolute';
		tmp.style.left = '-9999px';
		document.body.appendChild(tmp);
		tmp.select();
		document.execCommand('copy');
		document.body.removeChild(tmp);
	}

	notifyDirtyState(filePath, dirty) {
		if (!filePath) return;
		if (!window?.layoutApi?.sendCommand) return;
		window.layoutApi.sendCommand({
			type: 'tab.setDirty',
			filePath,
			dirty: dirty === true,
		});
	}

	serializeRows(rows, delimiter) {
		if (!rows || rows.length === 0) return '';
		return rows
			.map((row) =>
				row
					.map((value) => {
						const str = value == null ? '' : String(value);
						if (
							str.includes('"') ||
							str.includes('\n') ||
							str.includes('\r') ||
							str.includes(delimiter)
						) {
							return `"${str.replaceAll('"', '""')}"`;
						}
						return str;
					})
					.join(delimiter)
			)
			.join('\n');
	}

	ensureTrailingEmpty(rows) {
		if (!rows) return false;
		let changed = false;

		if (!rows.length) {
			rows.push([]);
			changed = true;
		}

		let maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
		if (maxCols === 0) {
			maxCols = 1;
			changed = true;
		}

		rows.forEach((row) => {
			while (row.length < maxCols) {
				row.push('');
				changed = true;
			}
		});

		const lastColIndex = maxCols - 1;
		const lastColHasData = rows.some(
			(row) => (row[lastColIndex] ?? '') !== ''
		);

		if (lastColHasData) {
			rows.forEach((row) => row.push(''));
			maxCols += 1;
			changed = true;
		}

		const lastRow = rows[rows.length - 1];
		const lastRowHasData = lastRow?.some((value) => (value ?? '') !== '');
		if (lastRowHasData) {
			rows.push(Array(maxCols).fill(''));
			changed = true;
		} else if (lastRow) {
			while (lastRow.length < maxCols) {
				lastRow.push('');
				changed = true;
			}
		}

		return changed;
	}

	trimTrailingEmpty(rows) {
		if (!rows || rows.length === 0) return [];
		const trimmed = rows.map((row) => row.slice());

		let maxCols = trimmed.reduce((m, r) => Math.max(m, r.length), 0);
		while (maxCols > 0) {
			const empty = trimmed.every((row) => (row[maxCols - 1] ?? '') === '');
			if (!empty) break;
			maxCols -= 1;
		}

		const trimmedCols = trimmed.map((row) => row.slice(0, maxCols));

		while (trimmedCols.length) {
			const lastRow = trimmedCols[trimmedCols.length - 1];
			const emptyRow = lastRow.every((value) => (value ?? '') === '');
			if (!emptyRow) break;
			trimmedCols.pop();
		}

		return trimmedCols;
	}

	syncFromSourceEdit(filePath, text, delimiter) {
		if (!filePath) return;
		const state = this.fileState.get(filePath);
		if (!state) return;

		state.sourceText = text ?? '';
		state.dirty = true;
		this.notifyDirtyState(filePath, true);

		const settings = this.getSettings();
		const parse = this.parseDelimited(state.sourceText, delimiter, {
			maxRows: settings.maxRows,
			maxCols: settings.maxCols,
		});

		const nextRows = parse.rows.map((row) => row.slice());
		this.ensureTrailingEmpty(nextRows);
		state.tableRows = {
			rows: nextRows,
			sourceText: state.sourceText,
		};
	}

	async saveTableEdits(filePath, delimiter) {
		if (!filePath) return { ok: false, reason: 'No file path.' };
		const state = this.fileState.get(filePath);
		if (!state?.dirty || !state.tableRows?.rows) return { ok: false };

		const trimmedRows = this.trimTrailingEmpty(state.tableRows.rows);
		const text = this.serializeRows(trimmedRows, delimiter);
		let res;
		try {
			res = await window.docApi.save(filePath, text, state.mtimeMs ?? null);
		} catch (err) {
			res = { ok: false, reason: err?.message || String(err) };
		}

		if (res?.ok) {
			state.mtimeMs = res.newMtimeMs ?? state.mtimeMs ?? null;
			state.dirty = false;
			state.tableRows.sourceText = text;
			state.sourceText = text;
			this.notifyDirtyState(filePath, false);
			if (this.fileCache) {
				this.fileCache.set(filePath, {
					text,
					mtimeMs: state.mtimeMs,
				});
			}
		}

		return res ?? { ok: false };
	}

	async saveTableEditsAs(fromPath, toPath, delimiter) {
		if (!toPath) return { ok: false, reason: 'No path.' };
		const fromState = fromPath ? this.fileState.get(fromPath) : null;
		const rows = fromState?.tableRows?.rows;
		if (!rows) return { ok: false };

		const trimmedRows = this.trimTrailingEmpty(rows);
		const text = this.serializeRows(trimmedRows, delimiter);
		let res;
		try {
			res = await window.docApi.saveAs(toPath, text);
		} catch (err) {
			res = { ok: false, reason: err?.message || String(err) };
		}

		if (res?.ok) {
			const nextState = {
				mode: fromState?.mode ?? 'table',
				selection: null,
				dirty: false,
				tableRows: {
					rows: rows.map((row) => row.slice()),
					sourceText: text,
				},
				mtimeMs: res.newMtimeMs ?? null,
			};

			this.fileState.set(toPath, nextState);
			if (fromPath && fromPath !== toPath) {
				this.fileState.delete(fromPath);
			}
			this.notifyDirtyState(toPath, false);
			if (fromPath && fromPath !== toPath) {
				this.notifyDirtyState(fromPath, false);
			}
			if (this.fileCache) {
				this.fileCache.set(toPath, {
					text,
					mtimeMs: nextState.mtimeMs,
				});
				if (fromPath && fromPath !== toPath) {
					this.fileCache.delete(fromPath);
				}
			}
		}

		return res ?? { ok: false };
	}
}

export { CsvFileRenderer };

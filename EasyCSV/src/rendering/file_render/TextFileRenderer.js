import { FileRenderBase } from './FileRenderBase.js';
import { TextTokenStyler } from './TextTokenStyler.js';

class TextFileRenderer extends FileRenderBase {
	constructor({ editorState, fileCache, tokenStyler, onTextChange } = {}) {
		super();
		this.editorState = editorState;
		this.fileCache = fileCache;
		this.activeEditor = null;
		this.tokenStyler = tokenStyler || new TextTokenStyler();
		this.onTextChange = onTextChange || null;
	}

	getTokenClass(token) {
		if (this.tokenStyler?.getClass) return this.tokenStyler.getClass(token);
		return `tok-${token.type}`;
	}

	renderViewer(container, text, viewSettings = {}) {
		container.innerHTML = '';

		const viewer = document.createElement('div');
		viewer.className = 'text-viewer';

		const useRelative = viewSettings.relativeLineNumbers === true;

		const lines = text.split(/\r?\n/);
		// Hard cap keeps very large files from freezing the renderer.
		const maxLines = 2000;
		const limited = lines.length > maxLines;
		const visibleLines = limited ? lines.slice(0, maxLines) : lines;
		const activeLine = useRelative ? 1 : null;

		for (let i = 0; i < visibleLines.length; i += 1) {
			const lineEl = document.createElement('div');
			lineEl.className = 'text-line';

			const lineNo = document.createElement('span');
			lineNo.className = 'text-line__no';
			const absoluteLine = i + 1;
			if (useRelative && activeLine) {
				lineNo.textContent =
					absoluteLine === activeLine
						? '0'
						: String(Math.abs(absoluteLine - activeLine));
			} else {
				lineNo.textContent = String(absoluteLine);
			}

			const lineBody = document.createElement('span');
			lineBody.className = 'text-line__body';

			const tokens = this.tokenizeLine(visibleLines[i]);
			for (const t of tokens) {
				if (t.type === 'plain') {
					lineBody.appendChild(document.createTextNode(t.value));
				} else {
					const span = document.createElement('span');
					span.className = this.getTokenClass(t);
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

	renderEditor(container, filePath, result, viewSettings = {}) {
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

		const surface = document.createElement('div');
		surface.className = 'text-editor__surface';

		const highlight = document.createElement('pre');
		highlight.className = 'text-editor__highlight';

		const textarea = document.createElement('textarea');
		textarea.className = 'text-editor__ta';
		textarea.spellcheck = false;
		textarea.value = state.text;

		surface.appendChild(highlight);
		surface.appendChild(textarea);

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
		editor.appendChild(surface);
		container.appendChild(editor);
		container.appendChild(footer);

		const countLines = (value) => {
			if (!value) return 1;
			let count = 1;
			for (let i = 0; i < value.length; i += 1) {
				if (value.charCodeAt(i) === 10) count += 1;
			}
			return count;
		};

		const useRelative = viewSettings.relativeLineNumbers === true;

		const getCursorLine = () => {
			if (!useRelative) return 1;
			const value = textarea.value || '';
			const pos = Math.max(0, textarea.selectionStart || 0);
			let line = 1;
			for (let i = 0; i < pos && i < value.length; i += 1) {
				if (value.charCodeAt(i) === 10) line += 1;
			}
			return line;
		};

		const renderGutter = (lines, activeLine) => {
			const existing = gutter.children.length;
			const target = Math.max(0, lines || 0);

			if (existing > target) {
				for (let i = existing - 1; i >= target; i -= 1) {
					gutter.removeChild(gutter.children[i]);
				}
			}

			if (existing < target) {
				const frag = document.createDocumentFragment();
				for (let i = existing + 1; i <= target; i += 1) {
					const ln = document.createElement('div');
					ln.className = 'text-editor__line-no';
					frag.appendChild(ln);
				}
				gutter.appendChild(frag);
			}

			for (let i = 1; i <= target; i += 1) {
				const ln = gutter.children[i - 1];
				if (!ln) continue;
				if (useRelative && activeLine) {
					ln.textContent =
						i === activeLine ? '0' : String(Math.abs(i - activeLine));
				} else {
					ln.textContent = String(i);
				}
			}
		};

		const renderHighlight = (value) => {
			highlight.innerHTML = '';
			const lines = value.split(/\r?\n/);
			const frag = document.createDocumentFragment();
			lines.forEach((line, index) => {
				if (index > 0) {
					frag.appendChild(document.createTextNode('\n'));
				}
				const tokens = this.tokenizeLine(line);
				for (const token of tokens) {
					if (token.type === 'plain') {
						frag.appendChild(document.createTextNode(token.value));
					} else {
						const span = document.createElement('span');
						span.className = this.getTokenClass(token);
						span.textContent = token.value;
						frag.appendChild(span);
					}
				}
			});
			highlight.appendChild(frag);
		};

		let lastLineCount = countLines(textarea.value);
		let lastActiveLine = getCursorLine();
		let pendingGutterTimer = null;
		let pendingHighlightTimer = null;

		const scheduleGutterSync = () => {
			if (pendingGutterTimer) return;
			pendingGutterTimer = setTimeout(() => {
				pendingGutterTimer = null;
				const nextCount = countLines(textarea.value);
				const nextActiveLine = getCursorLine();
				if (
					nextCount !== lastLineCount ||
					nextActiveLine !== lastActiveLine
				) {
					lastLineCount = nextCount;
					lastActiveLine = nextActiveLine;
					renderGutter(nextCount, nextActiveLine);
				}
			}, 80);
		};

		const scheduleHighlightSync = () => {
			if (pendingHighlightTimer) return;
			pendingHighlightTimer = setTimeout(() => {
				pendingHighlightTimer = null;
				renderHighlight(textarea.value);
			}, 60);
		};

		const markDirty = () => {
			state.text = textarea.value;
			const wasDirty = state.dirty;
			state.dirty = true;
			this.editorState.set(filePath, state);
			if (!wasDirty) {
				status.textContent = 'Unsaved changes';
				saveBtn.disabled = false;
				this.notifyDirtyState(filePath, true);
			}
			this.emitTextChange(filePath, state.text);
		};

		textarea.addEventListener('input', () => {
			scheduleGutterSync();
			scheduleHighlightSync();
			markDirty();
		});

		['click', 'keyup', 'mouseup', 'focus', 'select'].forEach((evt) => {
			textarea.addEventListener(evt, () => {
				if (!useRelative) return;
				scheduleGutterSync();
			});
		});

		textarea.addEventListener('scroll', () => {
			gutter.scrollTop = textarea.scrollTop;
			highlight.scrollTop = textarea.scrollTop;
			highlight.scrollLeft = textarea.scrollLeft;
		});

		saveBtn.addEventListener('click', async () => {
			await this.saveFile(filePath, textarea.value, {
				status,
				saveBtn,
			});
		});

		renderGutter(lastLineCount, lastActiveLine);
		renderHighlight(textarea.value);
		this.notifyDirtyState(filePath, state.dirty);
		// Focus editor so menu edit commands (cut/copy/paste/undo/redo) target it.
		requestAnimationFrame(() => textarea.focus());

		const updateText = (nextValue, options = {}) => {
			const value = nextValue ?? '';
			const preserveCursor = options.preserveCursor === true;
			const selection = preserveCursor
				? {
						start: textarea.selectionStart,
						end: textarea.selectionEnd,
					}
				: null;

			textarea.value = value;
			state.text = value;
			if (options.markDirty === true) {
				state.dirty = true;
				status.textContent = 'Unsaved changes';
				saveBtn.disabled = false;
				this.notifyDirtyState(filePath, true);
			}
			this.editorState.set(filePath, state);

			lastLineCount = countLines(textarea.value);
			lastActiveLine = getCursorLine();
			renderGutter(lastLineCount, lastActiveLine);
			renderHighlight(textarea.value);

			if (selection) {
				textarea.selectionStart = Math.min(
					selection.start,
					textarea.value.length
				);
				textarea.selectionEnd = Math.min(
					selection.end,
					textarea.value.length
				);
			}
		};

		this.activeEditor = {
			filePath,
			textarea,
			status,
			saveBtn,
			updateText,
		};
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

	async saveActiveFile() {
		if (!this.activeEditor?.filePath) return { ok: false };
		return await this.saveFile(
			this.activeEditor.filePath,
			this.activeEditor.textarea?.value ?? '',
			this.activeEditor
		);
	}

	async saveActiveFileAs(newPath) {
		if (!this.activeEditor?.textarea) return { ok: false };
		return await this.saveFileAs(
			newPath,
			this.activeEditor.textarea?.value ?? '',
			this.activeEditor.filePath,
			this.activeEditor
		);
	}

	clearActiveEditor() {
		this.activeEditor = null;
	}

	hasActiveEditor() {
		return Boolean(this.activeEditor?.textarea);
	}

	emitTextChange(filePath, text) {
		if (typeof this.onTextChange !== 'function') return;
		this.onTextChange({ filePath, text });
	}

	setEditorText(filePath, text, options = {}) {
		const state =
			this.editorState.get(filePath) || {
				text: '',
				mtimeMs: null,
				dirty: false,
			};

		state.text = text ?? '';
		if (options.markDirty === true) {
			state.dirty = true;
		}
		this.editorState.set(filePath, state);

		if (this.activeEditor?.filePath === filePath) {
			this.activeEditor.updateText(state.text, options);
		}
	}

	async saveFile(filePath, text, ui = {}) {
		const state =
			this.editorState.get(filePath) || {
				text: '',
				mtimeMs: null,
				dirty: false,
			};

		const currentText = text ?? '';
		state.text = currentText;
		this.editorState.set(filePath, state);

		let res;
		try {
			res = await window.docApi.save(
				filePath,
				currentText,
				state.mtimeMs
			);
		} catch (err) {
			res = { ok: false, reason: err?.message || String(err) };
		}

		if (res?.ok) {
			state.mtimeMs = res.newMtimeMs;
			state.dirty = false;
			this.editorState.set(filePath, state);
			if (ui.status) ui.status.textContent = 'Saved';
			if (ui.saveBtn) ui.saveBtn.disabled = true;
			this.fileCache.set(filePath, {
				text: state.text,
				mtimeMs: state.mtimeMs,
			});
			this.notifyDirtyState(filePath, false);
			return res;
		}

		if (ui.status) {
			if (res?.conflict) {
				ui.status.textContent = 'Conflict: file changed on disk';
			} else if (res?.reason) {
				ui.status.textContent = `Save failed: ${res.reason}`;
			} else {
				ui.status.textContent = 'Save failed';
			}
		}

		return res ?? { ok: false };
	}

	async saveFileAs(newPath, text, fromPath, ui = {}) {
		const currentText = text ?? '';

		let res;
		try {
			res = await window.docApi.saveAs(newPath, currentText);
		} catch (err) {
			res = { ok: false, reason: err?.message || String(err) };
		}

		if (res?.ok) {
			const nextState = {
				text: currentText,
				mtimeMs: res.newMtimeMs ?? null,
				dirty: false,
			};

			this.editorState.set(newPath, nextState);
			this.fileCache.set(newPath, {
				text: nextState.text,
				mtimeMs: nextState.mtimeMs,
			});

			if (fromPath && fromPath !== newPath) {
				this.editorState.delete(fromPath);
				this.fileCache.delete(fromPath);
			}

			if (ui.status) ui.status.textContent = 'Saved';
			if (ui.saveBtn) ui.saveBtn.disabled = true;

			if (this.activeEditor) {
				this.activeEditor.filePath = newPath;
			}

			this.notifyDirtyState(newPath, false);
			if (fromPath && fromPath !== newPath) {
				this.notifyDirtyState(fromPath, false);
			}

			return res;
		}

		if (ui.status) {
			if (res?.reason) {
				ui.status.textContent = `Save failed: ${res.reason}`;
			} else {
				ui.status.textContent = 'Save failed';
			}
		}

		return res ?? { ok: false };
	}
}

export { TextFileRenderer };

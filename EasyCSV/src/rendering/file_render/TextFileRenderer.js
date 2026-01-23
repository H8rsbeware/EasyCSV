import { FileRenderBase } from './FileRenderBase.js';

class TextFileRenderer extends FileRenderBase {
	constructor({ editorState, fileCache }) {
		super();
		this.editorState = editorState;
		this.fileCache = fileCache;
		this.activeEditor = null;
	}

	renderViewer(container, text) {
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

	renderEditor(container, filePath, result) {
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

		const countLines = (value) => {
			if (!value) return 1;
			let count = 1;
			for (let i = 0; i < value.length; i += 1) {
				if (value.charCodeAt(i) === 10) count += 1;
			}
			return count;
		};

		const renderGutter = (lines) => {
			gutter.innerHTML = '';
			const frag = document.createDocumentFragment();
			for (let i = 1; i <= lines; i += 1) {
				const ln = document.createElement('div');
				ln.className = 'text-editor__line-no';
				ln.textContent = String(i);
				frag.appendChild(ln);
			}
			gutter.appendChild(frag);
		};

		let lastLineCount = countLines(textarea.value);
		let pendingGutterTimer = null;

		const scheduleGutterSync = () => {
			if (pendingGutterTimer) return;
			pendingGutterTimer = setTimeout(() => {
				pendingGutterTimer = null;
				const nextCount = countLines(textarea.value);
				if (nextCount !== lastLineCount) {
					lastLineCount = nextCount;
					renderGutter(nextCount);
				}
			}, 80);
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
		};

		textarea.addEventListener('input', () => {
			scheduleGutterSync();
			markDirty();
		});

		textarea.addEventListener('scroll', () => {
			gutter.scrollTop = textarea.scrollTop;
		});

		saveBtn.addEventListener('click', async () => {
			await this.saveFile(filePath, textarea.value, {
				status,
				saveBtn,
			});
		});

		renderGutter(lastLineCount);
		this.notifyDirtyState(filePath, state.dirty);
		// Focus editor so menu edit commands (cut/copy/paste/undo/redo) target it.
		requestAnimationFrame(() => textarea.focus());

		this.activeEditor = {
			filePath,
			textarea,
			status,
			saveBtn,
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

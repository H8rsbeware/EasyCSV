import { FileRenderBase } from './FileRenderBase.js';

class TextFileRenderer extends FileRenderBase {
	constructor({ editorState, fileCache }) {
		super();
		this.editorState = editorState;
		this.fileCache = fileCache;
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
				this.notifyDirtyState(filePath, false);
				return;
			}
			if (res?.conflict) {
				status.textContent = 'Conflict: file changed on disk';
				return;
			}
			status.textContent = 'Save failed';
		});

		syncGutter();
		this.notifyDirtyState(filePath, state.dirty);
		// Focus editor so menu edit commands (cut/copy/paste/undo/redo) target it.
		requestAnimationFrame(() => textarea.focus());
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
}

export { TextFileRenderer };

const DEFAULT_FONTS = Object.freeze({
	ui: "'EasySans', sans-serif",
	editor: "'EasyMono', monospace",
});

function sanitizeFont(value, fallback) {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	return trimmed ? trimmed : fallback;
}

function applyFontSettings(settings) {
	const prefs = settings?.preferences?.fonts || {};
	const mode = prefs.mode === 'advanced' ? 'advanced' : 'simple';

	const ui = sanitizeFont(prefs.interface, DEFAULT_FONTS.ui);
	const editor = sanitizeFont(prefs.editor, DEFAULT_FONTS.editor);

	const sidebar =
		mode === 'advanced'
			? sanitizeFont(prefs.sidebar, ui)
			: ui;
	const text =
		mode === 'advanced'
			? sanitizeFont(prefs.text, editor)
			: editor;
	const csv =
		mode === 'advanced'
			? sanitizeFont(prefs.csv, editor)
			: editor;
	const csvEdit =
		mode === 'advanced'
			? sanitizeFont(prefs.csvEdit, editor)
			: editor;

	const root = document.documentElement;
	root.style.setProperty('--font-ui', ui);
	root.style.setProperty('--font-sidebar', sidebar);
	root.style.setProperty('--font-text', text);
	root.style.setProperty('--font-csv', csv);
	root.style.setProperty('--font-csv-edit', csvEdit);

	return { mode, ui, sidebar, text, csv, csvEdit };
}

export { applyFontSettings };

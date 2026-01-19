// backend/docs/document_manager.js
const fs = require('node:fs/promises');

class DocumentManager {
	async open(filePath) {
		const st = await fs.stat(filePath);
		if (!st.isFile()) throw new TypeError('Not a file');

		const text = await fs.readFile(filePath, 'utf8');
		return { ok: true, text, mtimeMs: st.mtimeMs };
	}

	async save(filePath, text, expectedMtimeMs) {
		const st = await fs.stat(filePath);
		if (!st.isFile()) throw new TypeError('Not a file');

		const diskMtimeMs = st.mtimeMs;

		if (
			typeof expectedMtimeMs === 'number' &&
			expectedMtimeMs !== diskMtimeMs
		) {
			return { ok: false, reason: 'conflict', diskMtimeMs };
		}

		await fs.writeFile(filePath, text, 'utf8');

		const st2 = await fs.stat(filePath);
		return { ok: true, newMtimeMs: st2.mtimeMs };
	}
}

module.exports = { DocumentManager };

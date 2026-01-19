// TabBlueprint.js
const TabKinds = Object.freeze(['welcome', 'settings', 'file']);

class TabBlueprint {
	static KINDS = TabKinds;

	constructor({ id, kind, title, filePath = null } = {}) {
		if (typeof id !== 'string' || !id.trim()) {
			throw new TypeError('TabBlueprint.id must be a non-empty string');
		}
		if (!TabBlueprint.KINDS.includes(kind)) {
			throw new ReferenceError(
				`Tab kind must be one of ${TabBlueprint.KINDS.join(', ')}`
			);
		}
		if (typeof title !== 'string' || !title.trim()) {
			throw new TypeError(
				'TabBlueprint.title must be a non-empty string'
			);
		}

		this.id = id;
		this.kind = kind;
		this.title = title;
		this.filePath = filePath ?? null;
	}

	/**
	 * Factory for coercing a plain object into a TabBlueprint
	 * @param {object|TabBlueprint} obj
	 * @returns {TabBlueprint}
	 */
	static fromObject(obj) {
		if (obj instanceof TabBlueprint) return obj;
		return new TabBlueprint(obj ?? {});
	}

	toJSON() {
		return {
			id: this.id,
			kind: this.kind,
			title: this.title,
			filePath: this.filePath,
		};
	}
}

module.exports = { TabBlueprint, TabKinds };

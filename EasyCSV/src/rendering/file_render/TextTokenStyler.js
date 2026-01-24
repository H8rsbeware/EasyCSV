class TextTokenStyler {
	constructor(map = {}) {
		this.map = { ...map };
	}

	getClass(token) {
		if (!token || !token.type) return 'tok-plain';
		return this.map[token.type] || `tok-${token.type}`;
	}

	set(type, className) {
		if (!type) return;
		this.map[type] = className;
	}
}

export { TextTokenStyler };

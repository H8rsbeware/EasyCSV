// SidebarBlueprint.js
// Keep modes explicit; UI can rely on this enum.
const SidebarModes = Object.freeze(['hidden', 'search', 'explorer']);

// Minimal sidebar state; layout-only, no UI cache here.
class SidebarBlueprint {
	static MODES = SidebarModes;

	constructor({ mode = 'hidden' } = {}) {
		if (!SidebarBlueprint.MODES.includes(mode)) {
			throw new ReferenceError(
				`Sidebar mode must be one of ${SidebarBlueprint.MODES.join(
					', '
				)}`
			);
		}

		this.mode = mode;
	}

	/**
	 * Factory for coercing a plain object into a SidebarBlueprint
	 * @param {object|SidebarBlueprint} obj
	 * @returns {SidebarBlueprint}
	 */
	static fromObject(obj) {
		if (obj instanceof SidebarBlueprint) return obj;
		return new SidebarBlueprint(obj ?? {});
	}

	toJSON() {
		return {
			mode: this.mode,
		};
	}
}

module.exports = { SidebarBlueprint, SidebarModes };

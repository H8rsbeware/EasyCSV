const pathMod = require('node:path');

// Workspace state is normalized here so UI doesn't need to guess.
class WorkspaceBlueprint {
	constructor({ projects = [], activeProjectRoot = null } = {}) {
		this.projects = Array.isArray(projects)
			? projects.map((p) => {
					// Caller responsibility: provide valid project roots.
					if (!p || typeof p.root !== 'string' || !p.root.trim()) {
						throw new TypeError(
							'WorkspaceBlueprint.projects[].root must be a non-empty string'
						);
					}
					const root = p.root;
					const name =
						typeof p.name === 'string' && p.name.trim()
							? p.name
							: pathMod.basename(root.replace(/[/\\]+$/, '')) ||
							  root;

					return { root, name };
			  })
			: [];

		if (
			activeProjectRoot != null &&
			(typeof activeProjectRoot !== 'string' || !activeProjectRoot.trim())
		) {
			throw new TypeError(
				'WorkspaceBlueprint.activeProjectRoot must be a non-empty string or null'
			);
		}

		// Ensure activeProjectRoot stays consistent with the project list.
		const roots = new Set(this.projects.map((p) => p.root));
		this.activeProjectRoot =
			activeProjectRoot && roots.has(activeProjectRoot)
				? activeProjectRoot
				: this.projects[0]?.root ?? null;
	}

	static fromObject(obj) {
		if (obj instanceof WorkspaceBlueprint) return obj;
		return new WorkspaceBlueprint(obj ?? {});
	}

	toJSON() {
		return {
			projects: this.projects.map((p) => ({
				root: p.root,
				name: p.name,
			})),
			activeProjectRoot: this.activeProjectRoot,
		};
	}
}

module.exports = { WorkspaceBlueprint };

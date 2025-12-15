

const TabKinds = ['welcome', 'project', 'settings'];

class TabBlueprint {
    static KINDS = TabKinds;

    constructor(id, kind, title, projectRoot = null) {
        if (!TabBlueprint.KINDS.includes(kind))
            throw new ReferenceError(`Tab kind must be one of ${TabBlueprint.KINDS.join(', ')}`);

        this.id = id;
        this.kind = kind;
        this.title = title;
        this.projectRoot = projectRoot ?? null;
    }

    toJSON() {
        return {
            id: this.id,
            kind: this.kind,
            title: this.title,
            projectRoot: this.projectRoot
        };
    }
}

const SidebarModes = ['hidden', 'search', 'explorer'];

class SidebarBlueprint {
    static MODES = SidebarModes;

    constructor(mode = 'hidden', projectRoot = null) {
        if (!SidebarBlueprint.MODES.includes(mode))
            throw new ReferenceError(`Sidebar mode must be one of ${SidebarBlueprint.MODES.join(', ')}`);

        this.mode = mode;
        this.projectRoot = projectRoot ?? null;
    }

    toJSON() {
        return {
            mode: this.mode,
            projectRoot: this.projectRoot
        };
    }
}

class LayoutBlueprint {
    constructor(tabs = [], activeTabId = null, sidebar = new SidebarBlueprint()) {
        this.tabs = tabs.map(t => (t instanceof TabBlueprint) ? t : new TabBlueprint(t.id, t.kind, t.title, t.projectRoot));
        this.activeTabId = activeTabId ?? (this.tabs.length ? this.tabs[0].id : null);
        this.sidebar = (sidebar instanceof SidebarBlueprint) ? sidebar : new SidebarBlueprint(sidebar.mode, sidebar.projectRoot);
    }

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId) ?? null;
    }

    toJSON() {
        return {
            tabs: this.tabs.map(t => (typeof t.toJSON === 'function') ? t.toJSON() : t),
            activeTabId: this.activeTabId,
            sidebar: (typeof this.sidebar.toJSON === 'function') ? this.sidebar.toJSON() : this.sidebar
        };
    }
}

module.exports = {
    TabBlueprint: TabBlueprint,
    SidebarBlueprint: SidebarBlueprint,
    LayoutBlueprint: LayoutBlueprint
};
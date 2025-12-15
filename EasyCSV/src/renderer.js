class MenuDefinition {
    constructor(name, items) {
        this.name = name;
        this.items = items;
    }

    static separator() {
        return { type: "separator" };
    }

    buildDOM(commandHandler) {

        const container = document.createElement('div');
        container.className = 'menu-dropdown';

        this.items.forEach((item) => {
            if (item.type === "separator") {
                const sep = document.createElement('div');
                sep.className = "menu-dropdown__separator";
                container.appendChild(sep);
                return;
            }

            const row = document.createElement('div');
            row.className = "menu-dropdown__item";

            if (item.disabled) {
                row.classList.add("menu-dropdown__item--disabled");
            }

            row.dataset.command = item.command || "";

            row.innerHTML = `
                <span class="menu-dropdown__label">${item.label}</span>
                ${item.shortcut
                    ? `<span class="menu-dropdown__shortcut">${item.shortcut}</span>`
                    : ""
                }
            `;

            row.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (!item.disabled && item.command && commandHandler) {
                    commandHandler(item.command);
                }
            });

            container.appendChild(row);
        })

        return container;
    }
}

class MenuBar {
    constructor(rootEl, dropdownRoot, menus, commandHandler) {
        this.rootEl = rootEl;
        this.dropdownRoot = dropdownRoot;
        this.menus = menus; // {file: MenuDefinitions}
        this.commandHandler = commandHandler

        this.activeMenuName = null;
        this.activeDropdownEl = null;

        this._bindTopLevel();
        this._bindGlobalClose();
    }

    _bindTopLevel() {
        if (!this.rootEl) return;
        // Bind the toggle open/close on click
        this.rootEl.addEventListener("click", (ev) => {
            const item = ev.target.closest(".menubar__item");
            if (!item) return;

            const name = item.dataset.menu;
            if (this.activeMenuName === name) {
                this.closeMenu();
            }
            else {
                this.openMenu(name, item);
            }
        });
        // Bind the highlight on mouse over
        this.rootEl.addEventListener("mouseenter", (ev) => {
            if (!this.activeMenuName) return;

            const item = ev.target.closest(".menubar__item");
            if (!item) return;

            const name = item.dataset.menu;
            if (name && name !== this.activeMenuName) {
                this.openMenu(name, item);
            }
        })
    }

    _bindGlobalClose() {
        document.addEventListener("click", (ev) => {
            const inMenu =
                ev.target.closest(".menu-dropdown") ||
                ev.target.closest(".menubar__item");
            if (!inMenu) this.closeMenu();
        });

        document.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape") {
                this.closeMenu();
            }
        });
    }

    openMenu(name, anchorEl) {
        const def = this.menus[name];
        if (!def) return;

        this.closeMenu();

        this.rootEl
            .querySelectorAll(".menubar__item")
            .forEach((el) => el.classList.remove("is-open"));

        const btn = this.rootEl.querySelector(`.menubar__item[data-menu="${name}"]`);
        if (btn) btn.classList.add("is-open");

        const dropdownEl = def.buildDOM(this.commandHandler);
        this.dropdownRoot.appendChild(dropdownEl);

        const rect = anchorEl.getBoundingClientRect();
        dropdownEl.style.left = `${rect.left}px`;
        dropdownEl.style.top = `${rect.bottom}px`;

        this.activeMenuName = name;
        this.activeDropdownEl = dropdownEl;
    }

    closeMenu() {
        this.activeMenuName = null;

        if (this.activeDropdownEl) {
            this.activeDropdownEl.remove();
            this.activeDropdownEl = null;
        }

        if (this.rootEl) {
            this.rootEl
                .querySelectorAll(".menubar__item")
                .forEach((el) => el.classList.remove('is-open'));
        }
    }
}

class TabBar {
    constructor(rootEl, initialTabs = []) {
        this.rootEl = rootEl;
        this.tabs = initialTabs;
        this.activeId = initialTabs[0]?.id ?? null;

        this.render();
    }

    render() {
        if (!this.rootEl) return;

        this.rootEl.innerHTML = "";

        this.tabs.forEach((tab) => {
            const el = document.createElement("div");
            el.className = "tab";

            if (tab.id === this.activeId) {
                el.classList.add("tab--active");
            }
            el.dataset.tabId = tab.id;

            el.innerHTML = `
                <span class="tab__title" title="${tab.title}">${tab.title}</span>
                ${tab.closable !== false
                    ? '<button class="tab__close" aria-label="Close tab">×</button>'
                    : ""
                }
            `;

            el.addEventListener("click", (ev) => {
                if (ev.target.classList.contains("tab__close")) {
                    ev.stopPropagation();
                    this.closeTab(tab.id);
                }
                else {
                    this.setActive(tab.id);
                }
            });

            this.rootEl.appendChild(el);
        });
    }

    setActive(id) {
        this.activeId = id;
        this.render();
    }

    openTab(tab) {
        this.tabs.push(tab);
        this.activeId = tab.id;
        this.render();
    }

    closeTab(id) {
        const idx = this.tabs.findIndex((t) => t.id === id);
        if (idx === -1) return;

        this.tabs.splice(idx, 1);

        if (this.activeId === id) {
            this.activeId = this.tabs[idx]?.id || this.tabs[idx - 1]?.id || null;
        }

        this.render();
    }
}

function normalizeShortcutString(str) {
    if (!str) return null;

    const parts = str.split("+").map((p) => p.trim().toLowerCase());

    const state = {
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        key: null,
    };

    for (const part of parts) {
        if (part === "ctrl" || part === "control" || part === "cmdorctrl") {
            state.ctrl = true;
        } else if (part === "shift") {
            state.shift = true;
        } else if (part === "alt") {
            state.alt = true;
        } else if (["cmd", "meta", "win", "super"].includes(part)) {
            state.meta = true;
        } else {
            // everything else is treated as the main key: "z", "f12", etc.
            state.key = part;
        }
    }

    if (!state.key) return null;

    const tokens = [];
    if (state.ctrl) tokens.push("ctrl");
    if (state.alt) tokens.push("alt");
    if (state.shift) tokens.push("shift");
    if (state.meta) tokens.push("meta");
    tokens.push(state.key);

    return tokens.join("+"); // e.g. "ctrl+z", "ctrl+shift+p", "f12"
}

function shortcutFromEvent(ev) {
    // Normalize key: letters -> lowercase, F-keys keep their name
    let key = ev.key;

    // ev.key is "z", "Z", "F12", etc.
    if (key.length === 1) {
        key = key.toLowerCase();
    } else {
        key = key.toLowerCase(); // "F12" -> "f12"
    }

    const tokens = [];
    if (ev.ctrlKey) tokens.push("ctrl");
    if (ev.altKey) tokens.push("alt");
    if (ev.shiftKey) tokens.push("shift");
    if (ev.metaKey) tokens.push("meta");
    tokens.push(key);

    return tokens.join("+");
}

function installShortcutHandler(shortcutMap, commandHandler) {
    document.addEventListener("keydown", (ev) => {
        /** For later, dont allow certain commands within text boxes
        const active = document.activeElement;
        const isTextField =
            active &&
            (active.tagName === "INPUT" ||
                active.tagName === "TEXTAREA" ||
                active.isContentEditable);
        */

        const combo = shortcutFromEvent(ev);
        const cmd = shortcutMap.get(combo);
        if (!cmd) return;

        ev.preventDefault();
        commandHandler(cmd);
    });
}



async function setupTopbarUI() {
    const menubarEl = document.getElementById("menubar");
    const dropdownRoot = document.getElementById("menubar-dropdown-root");
    const tabbarEl = document.getElementById("tabbar");

    const blueprint = await window.menuApi.getBlueprint();


    const menus = {};
    const shortcutMap = new Map();


    Object.entries(blueprint).forEach(([k, v]) => {
        const items = Array.from(v.items).map((def) => {
            if (def.type === "separator") {
                return MenuDefinition.separator();
            }

            // If this item has a shortcut, register it
            if (def.shortcut && def.command) {
                const normalized = normalizeShortcutString(def.shortcut);
                if (normalized) {
                    shortcutMap.set(normalized, def.command);
                }
            }

            return def;
        });

        menus[k] = new MenuDefinition(v.label, items);
    })

    console.log(menus)

    const commandHandler = (cmd) => {
        window.menuApi.sendCommand(cmd);
    }

    installShortcutHandler(shortcutMap, commandHandler);

    new MenuBar(menubarEl, dropdownRoot, menus, commandHandler);

    const initialTabs = [
        { id: "welcome", title: "Welcome", closable: false },
    ];
    new TabBar(tabbarEl, initialTabs);

    const themeBtn = document.getElementById("toggle-theme");
    if (themeBtn && window.theme?.get && window.theme?.set) {
        themeBtn.addEventListener("click", async () => {
            const current = document.documentElement.dataset.theme || (await window.theme.get());

            const next = current === "light" ? "dark" : "light";
            document.documentElement.dataset.theme = next;

            try {
                await window.theme.set(next);
            }
            catch (err) {
                console.error("Failed to persiit theme: ", err);
            }
        });
    }

    if (window.windowControls) {
        const minBtn = document.getElementById("min-btn");
        const maxBtn = document.getElementById("max-btn");
        const closeBtn = document.getElementById("close-btn");

        minBtn?.addEventListener("click", () => {
            window.windowControls.minimize?.()
        })
        maxBtn?.addEventListener("click", () => {
            window.windowControls.maximize?.()
        })
        closeBtn?.addEventListener("click", () => {
            window.windowControls.close?.()
        });
    }

}

function setupLayout(){
    
}




if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupTopbarUI);
} else {
    setupTopbarUI();
}
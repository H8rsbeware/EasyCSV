


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

export {normalizeShortcutString, installShortcutHandler}
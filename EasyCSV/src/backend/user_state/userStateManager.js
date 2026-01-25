const fs = require("node:fs");
const path = require("node:path");

class UserState {
    constructor(settings) {
        if (
            typeof settings.UserStatePath !== "function" &&
            typeof settings.UserStateDefaultPath !== "function"
        ) {
            throw new EvalError(
                "Settings does not contain the state required to create or determine UserState."
            );
        }

        this.statePath = settings.UserStatePath();
        this.defaultPath = settings.UserStateDefaultPath();
        this.stateDefinition = this.GetStateDefinition(this.defaultPath);
        this.defaultState = JSON.parse(fs.readFileSync(this.defaultPath, "utf8"));

        const userStateInit = this.CheckUserStateExists();
        if (!userStateInit) {
            throw new ReferenceError(
                "Cannot find or create a user state file in ProgramData."
            );
        }

        this.state = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
        const merged = this.MergeDefaults(this.state, this.defaultState);
        if (merged) {
            this.SaveState();
        }
    }

    CheckUserStateExists() {
        const statePathDir = path.dirname(this.statePath);
        if (!fs.existsSync(statePathDir)) {
            try {
                fs.mkdirSync(statePathDir, { recursive: true });
            } catch (err) {
                throw new ReferenceError(
                    `Failed to create 'EazyCSV' in 'C:/ProgramData'.`
                );
            }
        }

        if (fs.existsSync(this.statePath)) return true;

        try {
            fs.copyFileSync(this.defaultPath, this.statePath);
            return true;
        } catch (err) {
            return false;
        }
    }

    GetStateDefinition(default_states_path) {
        if (!fs.existsSync(default_states_path))
            throw new ReferenceError(
                "Default state path must be defined in settings and exist."
            );

        const file_str = fs.readFileSync(default_states_path, "utf8");
        const file_json = JSON.parse(file_str);

        const avaliable_keys = [];

        Object.entries(file_json).forEach(([k, v]) => {
            function readDown(k, v, curr = null) {
                curr = curr == null ? [] : curr;

                if (Array.isArray(v)) {
                    curr.push(k);
                    avaliable_keys.push(curr);
                } else if (typeof v === "object") {
                    curr.push(k);
                    Object.entries(v).forEach(([k1, v1]) => {
                        readDown(k1, v1, [...curr]);
                    });
                } else {
                    curr.push(k);
                    avaliable_keys.push(curr);
                }
            }
            readDown(k, v, []);
        });

        return avaliable_keys;
    }

    GetState(setting_str) {
        const follow = (a_path, obj) => {
            if (!Array.isArray(a_path) || a_path.length === 0) {
                return null;
            }

            const [curr, ...rest] = a_path;

            if (obj == null || !(curr in obj)) {
                return null;
            }

            if (rest.length === 0) {
                return obj[curr];
            }

            return follow(rest, obj[curr]);
        };

        const pathArray = setting_str.split("."); // "preferences.theme" -> ["preferences","theme"]
        return follow(pathArray, this.state);
    }

    SetState(setting_str, value) {
        const follow = (a_path, obj, vts) => {
            if (!Array.isArray(a_path) || a_path.length === 0) return false;

            if (a_path.length === 1) {
                const key = a_path[0];
                if (obj == null || typeof obj !== "object" || Array.isArray(obj))
                    return false;
                if (!(key in obj)) return false;
                obj[key] = vts;
                return true;
            }

            if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
                // You already throw for arrays; this also rejects primitives/null
                return false;
            }

            const [curr, ...rest] = a_path;
            if (!(curr in obj)) return false;

            return follow(rest, obj[curr], vts);
        };

        const pathArray = setting_str.split(".");
        return follow(pathArray, this.state, value);
    }

    SaveState() {
        fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
    }

    MergeDefaults(target, defaults) {
        if (!defaults || typeof defaults !== "object") return false;
        let changed = false;

        Object.entries(defaults).forEach(([key, value]) => {
            if (!(key in target)) {
                target[key] = Array.isArray(value) ? [...value] : value;
                changed = true;
                return;
            }

            const current = target[key];
            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                current &&
                typeof current === "object" &&
                !Array.isArray(current)
            ) {
                if (this.MergeDefaults(current, value)) {
                    changed = true;
                }
                return;
            }

            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                (!current || typeof current !== "object" || Array.isArray(current))
            ) {
                target[key] = JSON.parse(JSON.stringify(value));
                changed = true;
            }
        });

        return changed;
    }
}

module.exports = { UserState: UserState };

const fs = require("node:fs");
const path = require("node:path");

function unpackSettings(app) {
    const isDev = !app.isPackaged;

    const settingsPath = isDev
        ? path.join(__dirname, '..', "settings.json")
        : path.join(process.resourcesPath, "settings.json");

    if (fs.existsSync(settingsPath) == false)
        throw new ReferenceError(`Cannot find settings file: ${settingsPath}`);

    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const settingsDir = path.dirname(settingsPath);

    const settings = {};
    const __options = [];

    Object.entries(data).forEach(([k, v]) => {
        let value = v;
        if (typeof value === "string" && !path.isAbsolute(value)) {
            value = path.resolve(settingsDir, value);
        }
        settings[k] = () => value;
        __options.push(k);
    });

    settings.__options = __options;

    return settings;
}

module.exports = {
    unpackSettings: unpackSettings
}

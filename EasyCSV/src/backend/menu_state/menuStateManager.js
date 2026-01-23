const fs = require('node:fs');
const path = require('node:path');



class MenuState {
    constructor(settings){
        if (
            (
                typeof settings.UserMenuShortcutsPath !== "function"
                && typeof settings.UserMenuShortcutsDefaultPath !== "function"
            )
            || typeof settings.MenuStatePath !== "function"
        ){
            throw new EvalError("Settings does not contain the state required to create or determine menu shape or shortcuts.")
        }

        this.user_shortcuts_path = settings.UserMenuShortcutsPath();
        this.system_def_shortcuts_path = settings.UserMenuShortcutsDefaultPath();
        this.menu_state_path = settings.MenuStatePath();
        
        if (!this.CheckStateExists())
            throw new ReferenceError("Cannot find or create a menu state in ProgramData")

        this.menu_state = this.InitMenuState();
    }

    CheckStateExists(){
        const state_fp = path.dirname(this.user_shortcuts_path);
        if(!fs.existsSync(state_fp)){
            try{
                fs.mkdirSync(state_fp, {recursive: true});
            }
            catch(err){
                throw new ReferenceError(`Failed to create 'EasyCSV' in 'C:/ProgramData'.`);
            }
        }

        if(fs.existsSync(this.user_shortcuts_path)){
            return true;
        }

        try{
            fs.copyFileSync(this.system_def_shortcuts_path, this.user_shortcuts_path);
            return true;
        }
        catch(err){
            return false;
        }
    }

    InitMenuState(){
        if(
            !fs.existsSync(this.system_def_shortcuts_path) 
            || !fs.existsSync(this.menu_state_path)
        ){
            throw new ReferenceError("Cannot initial menu state without the state definition and system default shortcuts");
        }

        const ms_file_obj = JSON.parse(
            fs.readFileSync(this.menu_state_path, "utf8")
        );
        const sds_file_obj = JSON.parse(
            fs.readFileSync(this.system_def_shortcuts_path, "utf8")
        );
        const us_file_obj = JSON.parse(
            fs.readFileSync(this.user_shortcuts_path, "utf8")
        );

        Object.entries(ms_file_obj).forEach(([_, v]) => {
            Array.from(v.items).forEach((menu_def) => {
                if('type' in menu_def && menu_def['type'] === 'separator')
                    return;

                const key = menu_def.command;

                if(Object.hasOwn(us_file_obj, key)){
                    menu_def["shortcut"] = us_file_obj[key] 
                }
                else if(Object.hasOwn(sds_file_obj, key)){
                    menu_def["shortcut"] = sds_file_obj[key]
                }
            })
        });

        return ms_file_obj;
    }
}

module.exports = {MenuState: MenuState}

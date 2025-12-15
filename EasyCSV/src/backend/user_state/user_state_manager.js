const fs = require('node:fs');
const path = require('node:path');

class UserState {
    constructor(settings){
        if (
            typeof settings.UserStatePath !== "function" 
            && typeof settings.UserStateDefaultPath !== "function"
        ){
            throw new EvalError("Settings does not contain the state required to create or determine UserState.");
        }
        
        this.statePath = settings.UserStatePath();
        this.defaultPath = settings.UserStateDefaultPath();
        this.stateDefinition = this.GetStateDefinition(this.defaultPath);


        const userStateInit = this.CheckUserStateExists();
        if (!userStateInit){
            throw new ReferenceError("Cannot find or create a user state file in ProgramData.");
        }

        this.state = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
    }

    CheckUserStateExists() {
        const statePathDir = path.dirname(this.statePath);
        if (!fs.existsSync(statePathDir)){
            try{
                fs.mkdirSync(statePathDir, {recursive: true});
            }
            catch(err){
                throw new ReferenceError(`Failed to create 'EazyCSV' in 'C:/ProgramData'.`)
            }
            
        }
        
        if (fs.existsSync(this.statePath))
            return true;

        try{
            fs.copyFileSync(this.defaultPath, this.statePath);
            return true;
        }
        catch(err){
            return false;
        }
    }

    GetStateDefinition(default_states_path){
        if (!fs.existsSync(default_states_path))
            throw new ReferenceError("Default state path must be defined in settings and exist.")

        const file_str = fs.readFileSync(default_states_path, "utf8");
        const file_json = JSON.parse(file_str);

        const avaliable_keys = []
        
        Object.entries(file_json).forEach(([k, v]) => {
            function readDown(k, v, curr=null) {
                curr = curr == null ? [] : curr;
                
                if (Array.isArray(v)){
                    curr.push(k);
                    avaliable_keys.push(curr);
                }
                else if(typeof v === 'object'){
                    curr.push(k)
                    Object.entries(v).forEach(([k1, v1]) => {
                        readDown(k1, v1, [...curr]);
                    })
                }
                else{
                    curr.push(k);
                    avaliable_keys.push(curr);
                }
            }
            readDown(k, v, []);
        });


        return avaliable_keys;
    }


    GetState(setting_str){
        const follow = (a_path, obj) => {
            if (a_path.length == 1){
                return a_path in obj ? obj[a_path[0]] : null;
            }
    
            let [curr, ...rest] = a_path;

            if(!(curr in obj))
                return null;

            obj = obj[curr];
            return follow(rest, obj);
        };

        if(setting_str.includes(".")){
            let setting_array = setting_str.split(".");
            return follow(setting_array, this.state);
        }
        return follow([].push(setting_str), this.state)
    }

    SetState(setting_str, value){
        const follow = (a_path, obj, vts) => {

            if(a_path.length === 1){
                if(!(a_path[0] in obj))
                    return false

                obj[a_path[0]] = vts;
                return true;
            }

            if (Array.isArray(obj)){
                throw new TypeError("Cannot Set State of array, must use AddToStateArray or RemoveFromStateArray.")
            }

            if (typeof obj === 'object'){
                let [curr, ...rest] = a_path;

                if(!(curr in obj)){
                    return false;   
                }
                    
                obj = obj[curr];
                return follow(rest, obj, vts);
            }

            return false
        }
        if(setting_str.includes(".")){
            let setting_array = setting_str.split(".");
            return follow(setting_array, this.state, value);
        }

        return follow(setting_str, this.state, value);
    }
}

module.exports = {UserState: UserState}
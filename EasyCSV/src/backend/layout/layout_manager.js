const usm = require('../user_state/user_state_manager.js');
const {TabBlueprint, SidebarBlueprint, LayoutBlueprint} = require('./constructors.js');

class LayoutManager{
    constructor(userState){

        if(!(userState instanceof usm.UserState)){
            throw new ReferenceError("userState must be a UserState Manager class.")
        }

        if(usersState.GetState("layout_cache") == null){
            this.layoutState = new LayoutBlueprint({
                tabs: [
                    new TabBlueprint({
                    id: "welcome",
                    kind: "welcome",
                    title: "Welcome",
                    }),
                ],
                activeTabId: "welcome",
                sidebar: new SidebarBlueprint({
                    mode: "explorer", 
                    projectRoot: null,
                }),
            });
        } 
        else {
            throw new EvalError("Not currently supporting layout cache.")
        }
    }


}

module.exports = {LayoutManager}
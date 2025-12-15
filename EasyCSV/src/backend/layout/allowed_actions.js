

const AllowedActions = [
    {
        type: "tab.openProject",
        path: "string"
    },
    {
        type: "tab.close",
        id: "string"
    },
    {
        type: "tab.activate",
        id: "string"
    },
    {
        type: "sidebar.setMode",
        mode: "SidebarMode"
    },
    {
        type: "sidebar.setProjectRoot",
        path: "string"
    }
]

module.exports = {AllowedActions}
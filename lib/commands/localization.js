import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "update": {
                    "short": "u",
                    "title": "Update localization",
                    "module": () => new URL( "localization/update.js", import.meta.url ),
                },
                "add": {
                    "short": "a",
                    "title": "Add localization",
                    "module": () => new URL( "localization/add.js", import.meta.url ),
                },
            },
        };
    }
}

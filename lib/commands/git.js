import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "install-hooks": {
                    "title": "Install Git hooks",
                    "module": () => new URL( "git/install-hooks.js", import.meta.url ),
                },
                "remove-hooks": {
                    "title": "Remove Git hooks",
                    "module": () => new URL( "git/remove-hooks.js", import.meta.url ),
                },
                "pre-commit-hook": {
                    "title": "Git pre-commit hook",
                    "module": () => new URL( "git/pre-commit-hook.js", import.meta.url ),
                },
                "commit-msg-hook": {
                    "title": "Git commit-msg hook",
                    "module": () => new URL( "git/commit-msg-hook.js", import.meta.url ),
                },
                "commit": {
                    "title": "Git commit",
                    "module": () => new URL( "git/commit.js", import.meta.url ),
                },
            },
        };
    }
}

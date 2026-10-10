import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "init": {
                    "short": "i",
                    "title": "Initialize package documentation",
                    "module": () => new URL( "docs/init.js", import.meta.url ),
                },
                "build": {
                    "short": "b",
                    "title": "Build package documentation",
                    "module": () => new URL( "docs/build.js", import.meta.url ),
                },
                "start": {
                    "short": "s",
                    "title": "Start docsify server",
                    "module": () => new URL( "docs/start.js", import.meta.url ),
                },
                "open": {
                    "short": "O",
                    "title": "Open docs in the default browser",
                    "module": () => new URL( "docs/open.js", import.meta.url ),
                },
            },
        };
    }
}

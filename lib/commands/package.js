import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "test": {
                    "short": "t",
                    "title": "Run package tests",
                    "module": () => new URL( "package/test.js", import.meta.url ),
                },
                "release": {
                    "short": "R",
                    "title": "Release package",
                    "module": () => new URL( "package/release.js", import.meta.url ),
                },
                "publish": {
                    "short": "P",
                    "title": "Publish package",
                    "module": () => new URL( "package/publish.js", import.meta.url ),
                },
                "documentation": {
                    "short": "d",
                    "alias": "docs",
                    "title": "Documentation tools",
                    "module": () => new URL( "package/documentation.js", import.meta.url ),
                },
                "check-outdated-dependencies": {
                    "short": "o",
                    "title": "Check package outdated dependencies",
                    "module": () => new URL( "package/outdated-dependencies.js", import.meta.url ),
                },
                "update-dependencies": {
                    "short": "u",
                    "title": "Update package dependencies",
                    "module": () => new URL( "package/update-dependencies.js", import.meta.url ),
                },
                "update-metadata": {
                    "short": "m",
                    "title": "Update package metadata",
                    "module": () => new URL( "package/update-metadata.js", import.meta.url ),
                },
                "localization": {
                    "short": "l",
                    "title": "Work with package localization",
                    "module": () => new URL( "package/localization.js", import.meta.url ),
                },
                "link": {
                    "short": "L",
                    "title": "Link package dependencies",
                    "module": () => new URL( "package/link.js", import.meta.url ),
                },
                "open": {
                    "short": "O",
                    "title": "Open package upstream repository in the default browser",
                    "module": () => new URL( "package/open.js", import.meta.url ),
                },
                "wiki": {
                    "short": "w",
                    "title": "Wiki tools",
                    "module": () => new URL( "package/wiki.js", import.meta.url ),
                },
                "generate-icons": {
                    "title": "Generate icons for Cordova package",
                    "module": () => new URL( "package/icons.js", import.meta.url ),
                },
            },
        };
    }
}

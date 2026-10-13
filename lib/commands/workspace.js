import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "release": {
                    "short": "r",
                    "title": "Release packages",
                    "module": () => new URL( "workspace/release.js", import.meta.url ),
                },
                "build-docs": {
                    "short": "d",
                    "title": "Build packages docs",
                    "module": () => new URL( "workspace/build-docs.js", import.meta.url ),
                },
                "run-script": {
                    "short": "s",
                    "title": "Run packages script",
                    "module": () => new URL( "workspace/run-script.js", import.meta.url ),
                },
                "run-command": {
                    "short": "c",
                    "title": "Run command in the packages directory",
                    "module": () => new URL( "workspace/run-command.js", import.meta.url ),
                },
                "install": {
                    "short": "i",
                    "title": "Run packages install script",
                    "module": () => new URL( "workspace/install.js", import.meta.url ),
                },
                "check-outdated-dependencies": {
                    "alias": "ou",
                    "title": "Check packages outdated dependencies",
                    "module": () => new URL( "workspace/outdated-dependencies.js", import.meta.url ),
                },
                "update-dependencies": {
                    "alias": "up",
                    "title": "Update packages dependencies",
                    "module": () => new URL( "workspace/update-dependencies.js", import.meta.url ),
                },
                "update-metadata": {
                    "alias": "um",
                    "title": "Update packages metadata",
                    "module": () => new URL( "workspace/update-metadata.js", import.meta.url ),
                },
                "update-resources": {
                    "alias": "ur",
                    "title": "Update global resources",
                    "module": () => new URL( "workspace/update-resources.js", import.meta.url ),
                },
            },
        };
    }
}

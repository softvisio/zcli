import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "build-packages": {
                    "short": "b",
                    "title": "Build deb packages",
                    "module": () => new URL( "deb-repository/build-packages.js", import.meta.url ),
                },
                "update": {
                    "short": "u",
                    "alias": "up",
                    "title": "Update deb package repository",
                    "module": () => new URL( "deb-repository/update.js", import.meta.url ),
                },
                "build-images": {
                    "short": "B",
                    "title": "Build helper docker images",
                    "module": () => new URL( "deb-repository/build-images.js", import.meta.url ),
                },
            },
        };
    }
}

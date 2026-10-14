import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "build-packages": {
                    "short": "p",
                    "title": "Build deb packages",
                    "module": () => new URL( "deb-repository/build-packages.js", import.meta.url ),
                },
                "update": {
                    "short": "b",
                    "alias": "up",
                    "title": "Update deb package repository",
                    "module": () => new URL( "deb-repository/update.js", import.meta.url ),
                },
                "build-images": {
                    "short": "i",
                    "title": "Build helper docker images",
                    "module": () => new URL( "deb-repository/build-images.js", import.meta.url ),
                },
            },
        };
    }
}

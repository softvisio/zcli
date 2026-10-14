import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "build": {
                    "short": "b",
                    "title": "Build and push docker image",
                    "module": () => new URL( "docker/build.js", import.meta.url ),
                },
            },
        };
    }
}

import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "start": {
                    "short": "s",
                    "title": "Start or restart RPC server",
                    "module": () => new URL( "rpc/start.js", import.meta.url ),
                },
                "stop": {
                    "short": "e",
                    "title": "Stop RPC server",
                    "module": () => new URL( "rpc/stop.js", import.meta.url ),
                },
            },
        };
    }
}

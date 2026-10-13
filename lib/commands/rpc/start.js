import Command from "#lib/command";
import RpcServer from "#lib/rpc/server";

export default class extends Command {

    // static
    static cli () {
        return {
            "description": "Start RPC server on address 127.0.0.1:55555.",

            "options": {
                "daemon": {
                    "negatedShort": "D",
                    "description": "run in foreground",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        const server = new RpcServer();

        return server.start( {
            "daemon": process.cli.options.daemon,
        } );
    }
}

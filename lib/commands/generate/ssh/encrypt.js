import { pipeline } from "node:stream/promises";
import { encryptSsh } from "#core/crypto";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "input-encoding": {
                    "short": "i",
                    "description": "Input encoding.",
                    "schema": { "enum": [ "base64", "base64url", "hex" ] },
                },
                "output-encoding": {
                    "short": "o",
                    "description": "Output encoding.",
                    "schema": { "enum": [ "base64", "base64url", "hex" ] },
                },
            },
            "arguments": {
                "github-username": {
                    "description": "GitHub username",
                    "required": true,
                    "schema": { "type": "string" },
                },
            },
        };
    }

    // public
    async run () {
        const stream = await encryptSsh( process.cli.arguments[ "github-username" ], process.stdin, {
            "inputEncoding": process.cli.options[ "input-encoding" ],
            "outputEncoding": process.cli.options[ "output-encoding" ],
        } );

        return pipeline( stream, process.stdout )
            .then( () => result( 200 ) )
            .catch( e => result.fromError( e, { "log": false } ) );
    }
}

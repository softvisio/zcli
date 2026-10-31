import { copyToClipboard } from "#core/utils";
import Uuid from "#core/uuid";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "uuid-version": {
                    "short": "v",
                    "description": "UUID version.",
                    "default": 4,
                    "schema": { "type": "integer", "enum": [ 4, 7 ] },
                },
                "number": {
                    "short": "n",
                    "description": "number of UUIDs to generate",
                    "default": 1,
                    "schema": { "type": "integer", "minimum": 1 },
                },
                "copy": {
                    "short": "c",
                    "description": "copy UUID to the clipboard",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        var uuids = [];

        for ( let n = 0; n < process.cli.options.number; n++ ) {
            if ( process.cli.options[ "uuid-version" ] === 4 ) {
                uuids.push( Uuid.v4() );
            }
            else if ( process.cli.options[ "uuid-version" ] === 7 ) {
                uuids.push( Uuid.v7() );
            }
        }

        uuids = uuids.join( "\n" );

        console.log( uuids );

        if ( process.cli.options.copy ) {
            copyToClipboard( uuids );

            console.log( "\nUUIDs copied to the clipboard" );
        }
    }
}

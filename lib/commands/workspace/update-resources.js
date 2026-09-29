import path from "node:path";
import { readConfigSync } from "#core/config";
import env from "#core/env";
import externalResources from "#core/external-resources";
import { glob } from "#core/fs";
import GlobPatterns from "#core/glob/patterns";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "force": {
                    "short": "f",
                    "description": "force update",
                    "default": false,
                    "schema": {
                        "type": "boolean",
                    },
                },
                "verbose": {
                    "short": "v",
                    "description": "print log",
                    "default": false,
                    "schema": {
                        "type": "boolean",
                    },
                },
            },
            "arguments": {
                "pattern": {
                    "description": "Filter resources using glob patterns.",
                    "schema": { "type": "array", "items": { "type": "string", "format": "glob-pattern" } },
                },
            },
        };
    }

    // public
    async run () {
        const patterns = new GlobPatterns( {
            "allowGlobalBasename": true,
            "allowIfListEmpty": true,
        } ).add( process.cli.arguments.pattern );

        // path.join( env.getDataDir( "corejslib" ), "external-resources", `${ owner }-${ repo }-${ tag }`, name );
        const location = path.join( env.getDataDir( "corejslib" ), "external-resources" ),
            resources = (
                await glob( "*/*.json", {
                    "cwd": location,
                    "absolute": true,
                } )
            )
                .map( resource => readConfigSync( resource ).id )
                .filter( resource => patterns.test( resource ) )
                .sort();

        for ( const resource of resources ) {
            externalResources.add( resource );
        }

        const res = await externalResources.update( {
            "force": process.cli.options.force,
            "log": process.cli.options.verbose || null,
        } );

        return res;
    }
}

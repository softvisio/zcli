import ansi from "#core/ansi";
import Logger from "#core/logger";
import ThreadsPoolQueue from "#core/threads/pool/queue";
import Command from "#lib/command";

const maxRunningThreads = 4;

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "update-dependabot": {
                    "negatedShort": "D",
                    "description": "Update dependabot config",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
                "update-repository": {
                    "short": "r",
                    "description": "Configure upstream repository",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "update-tags": {
                    "short": "t",
                    "description": "Update release tags",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "commit": {
                    "negatedShort": "C",
                    "description": "Commit and push changes",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
                "verbose": {
                    "short": "v",
                    "description": "Show full log",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
            "arguments": {
                "pattern": {
                    "description": "Filter packages using glob patterns",
                    "schema": { "type": "array", "items": { "type": "string", "format": "glob-pattern" } },
                },
            },
        };
    }

    // public
    async run () {
        var res = this._findWorkspacePackages( {
            "patterns": process.cli.arguments?.pattern,
        } );
        if ( !res.ok ) return res;

        const packages = res.data;

        var length = 0,
            hasErrors;

        // find max. length
        for ( const pkg of packages ) {
            if ( pkg.workspaceSlug.length > length ) {
                length = pkg.workspaceSlug.length;
            }
        }

        const threads = new ThreadsPoolQueue( {
            maxRunningThreads,
        } );

        for ( const pkg of packages ) {
            threads.pushThread( async () => {
                const logger = new Logger( {
                        "stdout": "pipe",
                        "stderr": "stdout",
                    } ),
                    res = await pkg.updateMetadata( {
                        "updateDependabot": process.cli.options[ "update-dependabot" ],
                        "updateRepository": process.cli.options[ "update-repository" ],
                        "updateTags": process.cli.options[ "update-tags" ],
                        "commit": process.cli.options.commit,
                        logger,
                    } );

                res.data = {
                    pkg,
                    "updated": res.data?.updated,
                    "log": logger.flush(),
                };

                return res;
            } );
        }

        for await ( res of threads ) {
            const pkg = res.data.pkg;

            if ( !res.ok ) hasErrors = true;

            if ( process.cli.options.verbose || !res.ok || res.data.updated ) {
                console.log( "Package:", ansi.hl( pkg.workspaceSlug ) );
                console.log( res.data.log );
            }
        }

        if ( hasErrors ) {
            return result( 500 );
        }
        else {
            return result( 200 );
        }
    }
}

import ansi from "#core/ansi";
import ThreadsPoolQueue from "#core/threads/pool/queue";
import Command from "#lib/command";

const maxRunningThreads = 1000;

export default class extends Command {
    #newLine;

    // static
    static cli () {
        return {
            "options": {
                "reinstall": {
                    "short": "r",
                    "description": "Reinstall dependencies",
                    "default": false,
                    "schema": {
                        "type": "boolean",
                    },
                },
                "dry-run": {
                    "short": "d",
                    "description": "Dry run",
                    "default": false,
                    "schema": {
                        "type": "boolean",
                    },
                },
                "commit": {
                    "negatedShort": "C",
                    "description": "Commit and push changes",
                    "default": true,
                    "schema": {
                        "type": "boolean",
                    },
                },
                "sub-packages": {
                    "negatedShort": "S",
                    "description": "Process sub-packages",
                    "default": true,
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

        this.#newLine = false;

        const packages = res.data,
            packages1 = [],
            packages2 = [];

        for ( const pkg of packages ) {
            if ( pkg.name === "@softvisio/zcli" ) {
                packages1.push( pkg );
            }
            else {
                packages2.push( pkg );
            }
        }

        if ( packages1.length ) {
            res = await this.#run( packages1 );
            if ( !res.ok ) return res;
        }

        if ( packages2.length ) {
            res = await this.#run( packages2 );
            if ( !res.ok ) return res;
        }

        return result( 200 );
    }

    // private
    async #run ( packages ) {
        var res;

        const threads = new ThreadsPoolQueue( {
            maxRunningThreads,
        } );

        for ( const pkg of packages ) {

            // main package
            threads.pushThread( async () => {
                const res = await pkg.updateDependencies( {
                    "reinstall": process.cli.options.reinstall,
                    "dryRun": process.cli.options[ "dry-run" ],
                    "commit": process.cli.options.commit,
                    "repeatOnError": false,
                } );

                res.data ??= {};
                res.data.package = pkg;

                return res;
            } );

            // sub-packages
            if ( process.cli.options[ "sub-packages" ] ) {
                for ( const subPkg of pkg.subPackages ) {
                    threads.pushThread( async () => {
                        const res = await subPkg.updateDependencies( {
                            "reinstall": process.cli.options.reinstall,
                            "dryRun": process.cli.options[ "dry-run" ],
                            "commit": process.cli.options.commit,
                            "repeatOnError": false,
                        } );

                        res.data ??= {};
                        res.data.package = subPkg;

                        return res;
                    } );
                }
            }
        }

        var hasErrors;

        for await ( res of threads ) {
            if ( !res.data?.log ) continue;

            const pkg = res.data.package;

            if ( this.#newLine ) {
                console.log();
            }
            else {
                this.#newLine = true;
            }

            console.log( "Package:", ansi.hl( pkg.workspaceSlug ) );
            console.log( res.data.log );

            if ( !res.ok ) {
                hasErrors = true;
            }
        }

        if ( hasErrors ) {
            return result( [ 500, "Some dependencies wasn't updated" ] );
        }
        else {
            return result( 200 );
        }
    }
}

import ansi from "#core/ansi";
import Command from "#lib/command";

export default class extends Command {

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
                    "description": "Ignore sub-packages",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitPackage();
        if ( !pkg ) return result( [ 500, "Unable to find package" ] );

        var printNewLine, hasErrors;

        for ( const pack of [ pkg, ...( process.cli.options[ "sub-packages" ]
            ? pkg.subPackages
            : [] ) ] ) {
            const res = await pack.updateDependencies( {
                "dryRun": process.cli.options[ "dry-run" ],
                "reinstall": process.cli.options.reinstall,
                "commit": process.cli.options.commit,
            } );

            if ( !res.data?.log ) continue;

            if ( printNewLine ) {
                console.log();
            }
            else {
                printNewLine = true;
            }

            console.log( "Package:", ansi.hl( pack.workspaceSlug ) );
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

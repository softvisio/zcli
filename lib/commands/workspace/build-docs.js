import ansi from "#core/ansi";
import Command from "#lib/command";

export default class extends Command {
    #newLine;

    // static
    static cli () {
        return {
            "options": {
                "sub-packages": {
                    "negatedShort": "S",
                    "description": "Ignore sub-packages",
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

        const packages = res.data;

        var hasErrors;

        for ( const pkg of packages ) {
            res = await this.#buildDocs( pkg );
            if ( !res.ok ) hasErrors = true;

            if ( process.cli.options[ "sub-packages" ] ) {
                for ( const subPkg of pkg.subPackages ) {
                    res = await this.#buildDocs( subPkg );
                    if ( !res.ok ) hasErrors = true;
                }
            }
        }

        if ( hasErrors ) {
            return result( 500 );
        }
        else {
            return result( 200 );
        }
    }

    // private
    async #buildDocs ( pkg ) {
        if ( !pkg.docs.isEnabled ) return result( 200 );

        if ( this.#newLine ) {
            console.log();
        }
        else {
            this.#newLine = true;
        }

        console.log( "Package:", ansi.hl( pkg.workspaceSlug ) );

        return pkg.docs.build();
    }
}

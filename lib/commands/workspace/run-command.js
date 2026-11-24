import ansi from "#core/ansi";
import Command from "#lib/command";

export default class extends Command {
    #newLine;

    // static
    static cli () {
        return {
            "description": `
Example:

\`\`\`shell
# run "npm outdated" command
zcli workspace run-command -- npm outdated
\`\`\`
`.trim(),
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
        if ( !process.cli.argv?.length ) {
            return result( [ 400, "No command specified" ] );
        }

        var res = this._findWorkspacePackages( {
            "patterns": process.cli.arguments?.pattern,
        } );
        if ( !res.ok ) return res;

        const packages = res.data;

        var hasErrors;

        for ( const pkg of packages ) {
            res = await this.#runCommand( pkg );
            if ( !res.ok ) hasErrors = true;

            if ( process.cli.options[ "sub-packages" ] ) {
                for ( const subPkg of pkg.subPackages ) {
                    res = await this.#runCommand( subPkg );
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
    async #runCommand ( pkg ) {
        if ( this.#newLine ) {
            console.log();
        }
        else {
            this.#newLine = true;
        }

        console.log( "Package:", ansi.hl( pkg.workspaceSlug ) );

        return pkg.runCommand( ...process.cli.argv );
    }
}

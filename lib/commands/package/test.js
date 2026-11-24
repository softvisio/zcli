import childProcess from "node:child_process";
import GlobPattern from "#core/glob/pattern";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "only": {
                    "short": "o",
                    "description": 'Run `"only"` tests',
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "sub-packages": {
                    "description": "Test sub-packages",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
            },
            "arguments": {
                "pattern": {
                    "description": "Test name glob pattern",
                    "schema": { "type": "array", "items": { "type": "string", "format": "glob-pattern" } },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitPackage();
        if ( !pkg ) return result( [ 500, "Unable to find root package" ] );

        const include = [],
            exclude = [];

        if ( process.cli.arguments.pattern ) {
            for ( let pattern of process.cli.arguments.pattern ) {
                pattern = new GlobPattern( pattern );

                if ( pattern.isNegated ) {
                    exclude.push( pattern.regexp );
                }
                else {
                    include.push( pattern.regexp );
                }
            }
        }

        const args = [ "--test" ];

        if ( process.cli.options.only ) {
            args.push( "--test-only" );
        }

        if ( include.length ) {
            for ( const pattern of include ) {
                args.push( "--test-name-pattern", pattern );
            }
        }

        if ( exclude.length ) {
            for ( const pattern of exclude ) {
                args.push( "--test-skip-pattern", pattern );
            }
        }

        const packages = [
            {
                "package": pkg,
            },
        ];

        if ( process.cli.options[ "sub-packages" ] ) {
            packages.push( ...pkg.subPackages.map( pkg => {
                return {
                    "package": pkg,
                };
            } ) );
        }

        for ( const test of packages ) {
            if ( !test.package.cliConfig?.tests.location ) continue;

            console.log( "Test package:", test.package.name );

            const res = childProcess.spawnSync( "node", [ ...args, test.package.cliConfig.tests.location ], {
                "cwd": test.package.root,
                "stdio": "inherit",
            } );

            test.res = res.status
                ? result( [ 500, "Tests failed" ] )
                : result( 200 );

            console.log();
        }

        var error;

        console.log( "Tests results:" );

        for ( const test of packages ) {
            if ( !test.res.ok ) error = test.res;

            console.log( `${ test.package.name } - ${ test.res }` );
        }

        if ( error ) {
            return error;
        }
        else {
            return result( 200 );
        }
    }
}

import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "access": {
                    "short": "a",
                    "description": "Set package access level",
                    "schema": { "enum": [ "public", "private" ] },
                },
                "yes": {
                    "short": "y",
                    "description": 'Answer `"YES"` on all questions',
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
            "arguments": {
                "commit-reference": {
                    "description": "Git commit reference to publish",
                    "default": "HEAD",
                    "schema": { "type": "string" },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitPackage();
        if ( !pkg ) return result( [ 500, "Unable to find root package" ] );

        var res;

        res = await pkg.npm.publish( {
            "commitRef": process.cli.arguments[ "commit-reference" ],
            "repeatOnError": !process.cli.options.yes,
            "accessStatus": process.cli.options.access,
        } );
        if ( !res.ok ) return res;

        // get sub-packages
        const subPackages = pkg.subPackages;

        // publish sub-packages
        for ( const pkg of subPackages ) {
            res = await pkg.npm.publish( {
                "commitRef": process.cli.arguments[ "commit-reference" ],
                "repeatOnError": !process.cli.options.yes,
                "accessStatus": process.cli.options.access,
            } );
            if ( !res.ok ) return res;
        }

        return result( 200 );
    }
}

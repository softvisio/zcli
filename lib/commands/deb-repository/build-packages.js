import Command from "#lib/command";
import DebRepository from "#lib/deb-repository";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "codename": {
                    "description": "Ubuntu codename.",
                    "schema": {
                        "type": "array",
                        "items": {
                            "type": "string",
                        },
                        "uniqueItems": true,
                    },
                },
                "build-version": {
                    "short": "v",
                    "description": "Build specific version.",
                    "schema": {
                        "type": "array",
                        "items": {
                            "type": "string",
                        },
                        "uniqueItems": true,
                    },
                },
                "yes": {
                    "short": "y",
                    "description": `Answer "yes" on all questions.`,
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
            "arguments": {
                "pattern": {
                    "description": "Packages to build (package names or glob patterns).",
                    "schema": { "type": "array", "items": { "type": "string", "format": "glob-pattern" }, "minItems": 1 },
                },
            },
        };
    }

    // public
    async run () {
        const root = this._findGitPackage()?.root;
        if ( !root ) return result( [ 500, "Unable to find root package" ] );

        const debRepository = new DebRepository( root );

        const res = await debRepository.checkRepository();
        if ( !res.ok ) return res;

        return debRepository.buildPackages( {
            "patterns": process.cli.arguments.pattern,
            "codenames": process.cli.options.codename,
            "versions": process.cli.options[ "build-version" ],
        } );
    }
}

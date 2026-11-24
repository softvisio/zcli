import Command from "#lib/command";

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
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitPackage();

        if ( !pkg ) return result( [ 500, "Unable to find root package" ] );

        const res = await pkg.updateMetadata( {
            "updateDependabot": process.cli.options[ "update-dependabot" ],
            "updateRepository": process.cli.options[ "update-repository" ],
            "updateTags": process.cli.options[ "update-tags" ],
            "commit": process.cli.options.commit,
        } );

        return res;
    }
}

import Command from "#lib/command";
import DebRepository from "#lib/deb-repository";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "delete-outdated-packages": {
                    "negatedShort": "D",
                    "description": "Delete outdated packages",
                    "default": true,
                    "schema": {
                        "type": "boolean",
                    },
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

        return debRepository.update( {
            "deleteOutdatedPackages": process.cli.options[ "delete-outdated-packages" ],
        } );
    }
}

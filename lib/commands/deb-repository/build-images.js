import Command from "#lib/command";
import DebRepository from "#lib/deb-repository";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "codename": {
                    "description": "Ubuntu codename",
                    "schema": {
                        "type": "array",
                        "items": {
                            "type": "string",
                        },
                        "uniqueItems": true,
                    },
                },
            },
        };
    }

    // public
    async run () {
        const root = this._findGitPackage()?.root;

        if ( !root ) throw result( [ 500, "Unable to find root package" ] );

        const debRepository = new DebRepository( root );

        const res = await debRepository.checkRepository();
        if ( !res.ok ) throw res;

        return debRepository.buildImages( {
            "codenames": process.cli.options.codename,
        } );
    }
}

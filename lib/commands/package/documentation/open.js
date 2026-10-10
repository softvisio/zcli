import openUrl from "#core/open-url";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {};
    }

    // public
    async run () {
        const pkg = this._findGitRoot();
        if ( !pkg ) return result( [ 500, "Unable to find git root" ] );

        const docsUrl = pkg.docsUrl;

        if ( !docsUrl ) return result( [ 500, "Docs URL wasn't found" ] );

        openUrl( docsUrl );
    }
}

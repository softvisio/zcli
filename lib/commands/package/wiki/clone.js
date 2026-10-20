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

        const wiki = pkg.wiki;

        if ( wiki.isExists ) return result( [ 500, "Wiki is already cloned" ] );

        const git = pkg.git;

        const upstream = git.upstream;

        if ( !upstream ) return result( [ 500, "Upstream git repository wasn't found" ] );

        console.log( "Cloning wiki" );
        const res = await git.exec( [ "clone", "--quiet", upstream.wikiSshCloneUrl, wiki.root ] );
        if ( !res.ok ) return res;
        console.log( "Wiki clone completed:", res + "" );
    }
}

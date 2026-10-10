import ansi from "#core/ansi";
import Server from "#core/http/server";
import openUrl from "#core/open-url";
import Command from "#lib/command";

// XXX live reload
// <script>
//   document.write('<script src="http://' + (location.host || 'localhost').split(':')[0] +
//   ':35729/livereload.js?snipver=1"></' + 'script>')
// </script>

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "port": {
                    "short": "p",
                    "description": "Listen port. Listen on random port by default.",
                    "schema": { "type": "integer", "format": "ip-port" },
                },
                "open": {
                    "negatedShort": "O",
                    "description": "do not open docs in the default browser",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    // XXX live reload
    async run () {
        const pkg = this._findPackage();
        if ( !pkg ) return result( [ 500, "Unable to find package" ] );

        if ( !pkg.cliConfig?.docs?.location ) return result( [ 404, "Documentation not found" ] );

        const location = pkg.root + pkg.cliConfig.docs.location;

        const server = new Server().directory( "/", location );

        const res = await server.start( {
            "address": "localhost",
            "port": process.cli.options.port || 0,
        } );

        if ( !res.ok ) return res;

        const url = `http://localhost:${ res.data.port }/`;

        console.log( `
Serving: ${ location }
Listening at: ${ ansi.link( url ) }
` );

        if ( process.cli.options.open ) {
            openUrl( url );
        }

        return new Promise( resolve => {} );
    }
}

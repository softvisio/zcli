import "#core/stream";
import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import url from "node:url";
import File from "#core/file";
import Server from "#core/http/server";
import openUrl from "#core/open-url";
import { TmpFile } from "#core/tmp";
import Copilot from "#lib/copilot";
import { lintFile } from "#lib/lint";
import Api from "#lib/rpc/api";
import * as constants from "#lib/rpc/constants";

export default class RpcServer {
    #copilot;

    // public
    async start ( { daemon } = {} ) {
        var res;

        const api = new Api();

        // exit current server
        await api.call( "exit" );

        // start daemon
        if ( daemon ) {
            const proc = childProcess.spawn( process.argv[ 0 ], [ process.argv[ 1 ], "lsp", "start", "--no-daemon" ], {
                "detached": true,
                "stdio": "ignore",
            } );

            proc.unref();

            return result( 200 );
        }

        // start server
        else {
            res = await this.#startLspServer();
            if ( !res.ok ) return res;

            res = await this.#startApiServer();
            if ( !res.ok ) return res;

            return new Promise( resolve => {} );
        }
    }

    // protected
    async [ "_API_exit" ] () {
        process.exit();
    }

    async [ "_API_initialize" ] ( data ) {

        // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initializeresult
        return result( 200, {
            "serverInfo": {
                "name": "zcli",
            },

            // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#serverCapabilities
            "capabilities": {
                "positionEncoding": "utf8",

                // "textDocumentSync": {},
                // "documentFormattingProvider": true,
                // "documentRangeFormattingProvider": false,
            },
        } );
    }

    async [ "_API_zcli/lint-file" ] ( data ) {
        if ( data.path == null || data.path === "" ) data.path = "temp";

        const file = new File( {
            "path": path.isAbsolute( data.path )
                ? data.path
                : path.join( data.cwd, data.path ),
            "sources": data.buffer,
        } );

        return lintFile( file, {
            "action": data.action,
            "type": data.type,
            "processUnsupportedTypes": true,
        } );
    }

    async [ "_API_zcli/open-browser" ] ( data ) {
        if ( process.platform !== "win32" ) return;

        data.data.replaceAll( "\t", "    " );
        data.data.replaceAll( "&", "&amp;" );
        data.data.replaceAll( "<", "&lt;" );
        data.data.replaceAll( ">", "&gt;" );
        data.data.replaceAll( `"`, "&quot;" );
        data.data.replaceAll( "'", "&#39;" );

        if ( data.font ) data.font = data.font.split( ":", 1 )[ 0 ].replaceAll( "_", " " );

        const html = `
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=${ data.encoding }">
</head>
<body>
<pre style="font-family: '${ data.font }' !important; font-size: 12pt; white-space: pre-wrap;">
${ data.data }
</pre>
</body>
</html>
        `;

        const tmp = new TmpFile( { "extname": ".html" } );

        fs.writeFileSync( tmp.path, html );

        openUrl( url.pathToFileURL( tmp.path ) );

        return result( 200 );
    }

    async [ "_API_zcli/start-copilot" ] () {
        this.#copilot ||= new Copilot( {
            "remote": false,
        } );

        const res = await this.#copilot.start();
        if ( !res.ok ) return res;

        return result( 200, {
            "port": this.#copilot.port,
        } );
    }

    // private
    async #startApiServer () {
        const server = new Server().ws( "/*", {
            "maxPayloadLength": constants.maxPayloadSize,

            "onConnect": connection => {
                connection.on( "message", async ( connection, data, isBinary ) => {
                    try {
                        const msg = JSON.parse( Buffer.from( data ) );

                        if ( msg.method ) {
                            msg.method = msg.method.replace( /^\/v\d+\//v, "" );
                        }

                        const res = await this.#processMessage( msg );
                        if ( !res ) return;

                        connection.send( JSON.stringify( res.toJsonRpc( msg.id ) ), false );
                    }
                    catch {}
                } );
            },
        } );

        return server.start( {
            "address": constants.host,
            "port": constants.apiPort,
        } );
    }

    async #startLspServer () {
        const server = net.createServer( async socket => {
            while ( true ) {
                try {
                    const headers = await socket.readHttpHeaders();
                    if ( !headers ) break;

                    const length = headers.match( /content-length: *(\d+)/iv )?.[ 1 ];
                    if ( !length ) break;

                    const data = await socket.readChunk( Number( length ) );
                    if ( !data ) break;

                    const msg = JSON.parse( data );

                    // shutdown
                    if ( msg.method === "shutdown" ) {
                        break;
                    }
                    else {
                        const res = await this.#processMessage( msg );
                        if ( !res ) continue;

                        if ( msg.method.startsWith( "zcli/" ) ) {
                            this.#sendLspResponse( socket, msg.id, res );
                        }
                        else {
                            this.#sendLspResponse( socket, msg.id, res.data );
                        }
                    }
                }
                catch {}
            }
        } );

        server.listen( constants.lspPort, constants.host );

        return result( 200 );
    }

    async #processMessage ( msg ) {
        if ( !msg.id ) return;

        if ( !msg.method ) return;

        const method = "_API_" + msg.method;

        if ( !this[ method ] ) {
            return result( [ 404, "API method not found" ] );
        }

        if ( !Array.isArray( msg.params ) ) msg.params = [ msg.params ];

        return this[ method ]( ...msg.params );
    }

    #sendLspResponse ( socket, id, result ) {
        const data = Buffer.from( JSON.stringify( {
            "jsonrpc": "2.0",
            id,
            result,
        } ) );

        socket.write( `Content-Length: ${ data.length }\r\n\r\n${ data.toString() }` );
    }
}

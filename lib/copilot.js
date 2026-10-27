import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import Events from "#core/events";
import { getRandomFreePort, tryConnect } from "#core/net";
import LifecycleManager from "#core/threads/lifecycle-manager";
import { shellQuote, sleep } from "#core/utils";
import Api from "#lib/rpc/api";

const COPILOT_BIN = "copilot",
    STOP_TIMEOUT = 5000; // ms, if the process does not exit after SIGTERM, it is killed forcibly

const AGENT_METHODS = acp.methods.agent,
    CLIENT_METHODS = acp.methods.client;

class CopilotSession {
    #copilot;
    #socket;
    #connection;
    #session;
    #events = new Events();
    #cwd;
    #allowAll;
    #allowEdit;
    #allowExecute;
    #onRequestPermission;
    #onSessionUpdate;
    #response = "";

    constructor ( copilot, { cwd, allowAll, allowEdit, allowExecute, onRequestPermission, onSessionUpdate } = {} ) {
        this.#copilot = copilot;
        this.#cwd = cwd || process.cwd();
        this.#allowAll = Boolean( allowAll );
        this.#allowEdit = allowEdit == null
            ? null
            : Boolean( allowEdit );
        this.#allowExecute = allowExecute ?? null;
        this.#onRequestPermission = onRequestPermission;
        this.#onSessionUpdate = onSessionUpdate;
    }

    // static
    static async new ( copilot, options ) {
        const session = new this( copilot, options );

        return session.#init();
    }

    // properties
    get copilot () {
        return this.#copilot;
    }

    get id () {
        return this.#session.sessionId;
    }

    get isClosed () {
        return !this.#connection;
    }

    // public
    async prompt ( prompt ) {
        if ( !this.#connection ) return result( 500 );

        const promptResult = await this.#connection.agent.request( AGENT_METHODS.session.prompt, {
            "sessionId": this.#session.sessionId,
            "prompt": [
                {
                    "type": "text",
                    "text": prompt,
                },
            ],
        } );

        if ( promptResult.stopReason !== "end_turn" ) {
            console.warn( `Warning: prompt finished with stopReason=${ promptResult.stopReason }` );
        }

        const response = this.#response;
        this.#response = "";

        return result( 200, {
            "text": response,
            "reason": promptResult.stopReason,
            "usage": promptResult.usage,
        } );
    }

    async close () {
        if ( this.isClosed ) return;

        await this.#connection.agent.request( AGENT_METHODS.session.close, {
            "sessionId": this.id,
        } );

        this.#socket.destroy();

        await this.#connection.closed;

        this.#socket = null;
        this.#connection = null;

        this.#events.emit( "close", this );
    }

    on ( event, callback ) {
        this.#events.on( event, callback );

        return this;
    }

    once ( event, callback ) {
        this.#events.once( event, callback );

        return this;
    }

    off ( event, callback ) {
        this.#events.off( event, callback );

        return this;
    }

    async [ Symbol.asyncDispose ] () {
        return this.close();
    }

    // private
    async #init () {
        this.#socket = net.connect( {
            "host": this.#copilot.hostname,
            "port": this.#copilot.port,
        } );

        await new Promise( ( resolve, reject ) => {
            this.#socket.once( "connect", resolve );
            this.#socket.once( "error", reject );
        } );

        const stream = acp.ndJsonStream( Writable.toWeb( this.#socket ), Readable.toWeb( this.#socket ) );

        this.#connection = acp
            .client()
            .onRequest( CLIENT_METHODS.session.requestPermission, ( { params } ) => this.#requestPermission( params ) )
            .onNotification( CLIENT_METHODS.session.update, ( { params } ) => this.#sessionUpdate( params ) )
            .connect( stream );

        await this.#connection.agent.request( AGENT_METHODS.initialize, {
            "protocolVersion": acp.PROTOCOL_VERSION,
            "clientCapabilities": {},
        } );

        this.#session = await this.#connection.agent.request( AGENT_METHODS.session.new, {
            "cwd": this.#cwd,
            "mcpServers": [],
        } );

        return this;
    }

    async #sessionUpdate ( params ) {
        const update = params.update;

        if ( update.sessionUpdate === "agent_message_chunk" && update.content.type === "text" ) {
            this.#response += update.content.text;
        }

        if ( this.#onSessionUpdate ) await this.#onSessionUpdate( params );
    }

    async #requestPermission ( request ) {

        // edit
        if ( request.toolCall.kind === "edit" && this.#allowEdit !== null ) {
            if ( this.#allowEdit ) {
                return this.#createPermissionResponce( true, request );
            }
            else {
                return this.#createPermissionResponce( false, request );
            }
        }

        // execute
        if ( request.toolCall.kind === "execute" && this.#allowExecute !== null ) {
            if ( this.#allowExecute === true ) {
                return this.#createPermissionResponce( true, request );
            }
            else if ( typeof this.#allowExecute === "function" ) {
                const response = await this.#allowExecute( request.toolCall.rawInput.command, request );

                return this.#createPermissionResponce( response, request );
            }
            else {
                return this.#createPermissionResponce( false, request );
            }
        }

        // request permission
        if ( this.#onRequestPermission ) {
            const response = await this.#onRequestPermission( request );

            return this.#createPermissionResponce( response, request );
        }

        // allow all
        if ( this.#allowAll ) {
            return this.#createPermissionResponce( "allow-always", request );
        }

        // deny
        else {
            return this.#createPermissionResponce( false, request );
        }
    }

    #createPermissionResponce ( response, request ) {

        // cancel
        if ( response === "cancel" ) {
            return {
                "outcome": {
                    "outcome": "cancelled",
                },
            };
        }
        else {

            // index options
            const options = {};
            for ( const option of request.options ) {
                options[ option.optionId.replaceAll( "_", "-" ) ] = option.optionId;
            }

            const optionId = typeof response === "string"
                ? response
                : null;

            // allow
            if ( response === true || optionId?.startsWith( "allow-" ) ) {
                return {
                    "outcome": {
                        "outcome": "selected",
                        "optionId": options[ optionId ] || options[ "allow-once" ] || "allow_always",
                    },
                };
            }

            // reject
            else {
                return {
                    "outcome": {
                        "outcome": "selected",
                        "optionId": options[ optionId ] || options[ "reject-once" ] || "reject_always",
                    },
                };
            }
        }
    }
}

export default class Copilot {
    #copilot;
    #hostname = "127.0.0.1";
    #port;
    #remote;
    #lifecycleManager;
    #sessions = new Map();
    #onProcessExit;

    constructor ( { port, remote = true } = {} ) {
        this.#port = port;
        this.#remote = Boolean( remote );
        this.#onProcessExit = this.#stop.bind( this );

        this.#lifecycleManager = new LifecycleManager( {
            "onStart": this.#start.bind( this ),
            "onStop": this.#stop.bind( this ),
        } );
    }

    // properties
    get hostname () {
        return this.#hostname;
    }

    get port () {
        return this.#port;
    }

    get isStarted () {
        return this.#lifecycleManager.isStarted;
    }

    get hasSessions () {
        return !!this.#sessions.size;
    }

    // public
    async start () {
        return this.#lifecycleManager.start();
    }

    async stop () {
        return this.#lifecycleManager.stop();
    }

    async waitConnect ( { signal } = {} ) {
        return this.#lifecycleManager.waitStart( { signal } );
    }

    hasSession ( id ) {
        return this.#sessions.has( id );
    }

    getSession ( id ) {
        return this.#sessions.get( id );
    }

    async createSession ( { cwd, allowAll, allowEdit, allowExecute, onRequestPermission, onSessionUpdate } = {} ) {
        const session = await CopilotSession.new( this, { cwd, allowAll, allowEdit, allowExecute, onRequestPermission, onSessionUpdate } );

        session.once( "close", this.#onSessionClose.bind( this ) );

        this.#sessions.set( session.id, session );

        return session;
    }

    async [ Symbol.asyncDispose ] () {
        return this.stop();
    }

    // private
    async #start ( signal ) {

        // aborted before the process was spawned
        if ( signal.aborted ) return result( [ 500, "Aborted" ] );

        // use remote api if available
        if ( this.#remote && ( await Api.tryConnect() ) ) {
            const api = new Api();

            const res = await api.call( "zcli/start-copilot" );
            if ( !res.ok ) return res;

            this.#port = res.data.port;
            if ( !this.#port ) return result( [ 500, "Remote Copilot ACP server did not return a port" ] );

            return result( 200 );
        }

        if ( !this.#port ) {
            this.#port = await getRandomFreePort( this.#hostname );
        }

        this.#copilot = spawn( shellQuote( [ COPILOT_BIN, "--acp", "--port", this.#port ] ), {
            "stdio": "ignore",
            "shell": true,
            "detached": process.platform !== "win32",
            "windowsHide": true,
        } );

        this.#copilot.unref();
        process.on( "exit", this.#onProcessExit );

        let spawnError;

        this.#copilot.once( "error", error => {
            spawnError = error;
            this.#copilot = null;
        } );
        this.#copilot.once( "exit", ( code, sig ) => this.#onCopilotExit() );

        await this.#waitConnect( signal );

        // aborted while waiting for the server, the process is not needed anymore
        if ( signal.aborted ) {
            await this.#kill();

            return result( [ 500, "Aborted" ] );
        }

        if ( this.#copilot ) {
            return result( 200 );
        }
        else {
            return result( [ 500, spawnError?.message || "Copilot ACP server exited before connecting" ] );
        }
    }

    async #stop () {
        process.off( "exit", this.#onProcessExit );

        await this.#kill();

        return result( 200 );
    }

    async #kill () {
        const copilot = this.#copilot;

        if ( !copilot ) return;

        const exited = new Promise( resolve => copilot.once( "exit", () => resolve() ) );

        this.#signalProcess( copilot, "SIGTERM" );

        // the process ignores SIGTERM, kill it forcibly
        const timer = setTimeout( () => this.#signalProcess( copilot, "SIGKILL" ), STOP_TIMEOUT );

        await exited;

        clearTimeout( timer );
    }

    #signalProcess ( copilot, signal ) {
        try {
            if ( process.platform === "win32" ) {

                // taskkill with "/F" is always forcible
                spawnSync( "taskkill", [ "/pid", String( copilot.pid ), "/T", "/F" ], {
                    "stdio": "ignore",
                    "windowsHide": true,
                } );
            }
            else {
                process.kill( -copilot.pid, signal );
            }
        }
        catch {

            // the process group is already gone
        }
    }

    async #waitConnect ( signal ) {
        while ( !signal.aborted ) {
            if ( !this.#copilot ) break;

            const connected = await tryConnect( {
                "host": this.#hostname,
                "port": this.#port,
            } );

            if ( connected ) break;

            await sleep( 100 );
        }
    }

    #onCopilotExit () {
        this.#copilot = null;
        process.off( "exit", this.#onProcessExit );

        // process exited unexpectedly while the service was running,
        // if the manager is already starting or stopping, it handles the exit itself
        if ( this.#lifecycleManager.isStarted ) {
            this.#lifecycleManager.stop();
        }
    }

    #onSessionClose ( session ) {
        this.#sessions.delete( session.id );
    }
}

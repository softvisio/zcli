import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import Events from "#core/events";
import { getRandomFreePort, tryConnect } from "#core/net";
import ActivityController from "#core/threads/activity-controller";
import { shellQuote, sleep } from "#core/utils";
import Api from "#lib/rpc/api";

const COPILOT_BIN = "copilot";

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
        this.#allowExecute = allowExecute;
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

        const promptResult = await this.#connection.prompt( {
            "sessionId": this.#session.sessionId,
            "prompt": [
                {
                    "type": "text",
                    "text": prompt,
                },
            ],
        } );

        if ( promptResult.stopReason !== "end_turn" ) {
            console.wan( `Warning: prompt finished with stopReason=${ promptResult.stopReason }` );
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

        await this.#connection.closeSession( {
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

        const stream = acp.ndJsonStream( Writable.toWeb( this.#socket ), Readable.toWeb( this.#socket ) ),
            client = {
                "sessionUpdate": this.#sessionUpdate.bind( this ),
                "requestPermission": this.#requestPermission.bind( this ),
            };

        this.#connection = new acp.ClientSideConnection( () => client, stream );

        await this.#connection.initialize( {
            "protocolVersion": acp.PROTOCOL_VERSION,
            "clientCapabilities": {},
        } );

        this.#session = await this.#connection.newSession( {
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
    #activityController;
    #sessions = new Map();
    #onProcessExit;

    constructor ( { port, remote = true } = {} ) {
        this.#port = port;
        this.#remote = Boolean( remote );
        this.#onProcessExit = this.#stop.bind( this );

        this.#activityController = new ActivityController( {
            "doStart": this.#start.bind( this ),
            "doStop": this.#stop.bind( this ),
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
        return this.#activityController.isStarted;
    }

    get hasSessions () {
        return !!this.#sessions.size;
    }

    // public
    async start () {
        return this.#activityController.start();
    }

    async stop () {
        return this.#activityController.stop();
    }

    async waitConnect ( signal ) {
        return this.#activityController.waitStart( signal );
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

    // private
    async #start () {

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

        await this.#waitConnect();

        if ( this.#copilot ) {
            return result( 200 );
        }
        else {
            return result( [ 500, spawnError?.message || "Copilot ACP server exited before connecting" ] );
        }
    }

    async #stop () {
        process.off( "exit", this.#onProcessExit );

        if ( this.#copilot ) {
            if ( process.platform === "win32" ) {
                spawnSync( "taskkill", [ "/pid", String( this.#copilot.pid ), "/T", "/F" ], {
                    "stdio": "ignore",
                    "windowsHide": true,
                } );
            }
            else {
                process.kill( -this.#copilot.pid, "SIGTERM" );
            }

            await new Promise( resolve => {
                this.#copilot.once( "exit", () => resolve() );
            } );
        }

        return result( 200 );
    }

    async #waitConnect () {
        while ( true ) {
            if ( !this.#copilot ) break;

            const connected = await tryConnect( this.#port, this.#hostname );

            if ( connected ) break;

            await sleep( 100 );
        }
    }

    #onCopilotExit () {
        this.#copilot = null;
        process.off( "exit", this.#onProcessExit );

        this.#activityController.onExternalStop();
    }

    #onSessionClose ( session ) {
        this.#sessions.delete( session.id );
    }
}

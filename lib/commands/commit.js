import { spawn, spawnSync } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { confirm, shellQuote } from "#core/utils";
import Command from "#lib/command";
import Git from "#lib/git";
import prompts from "#lib/prompts";

const COPILOT_BIN = "copilot";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "all": {
                    "short": "a",
                    "description": "commit all changed files",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "force": {
                    "short": "f",
                    "description": "do not confirm commit message",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
            "arguments": {
                "files": {
                    "description": "Files to commit",
                    "schema": { "type": "array", "items": { "type": "string" } },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitPackage();
        if ( !pkg ) return result( [ 500, "Unable to find package" ] );

        const cwd = process.cwd();

        const args = [ "--no-pager", "diff", "--name-only" ],
            diffArgs = [ "git", "--no-pager", "diff" ],
            commitArgs = [ "commit" ];

        if ( process.cli.arguments.files ) {
            args.push( "HEAD", "--", ...process.cli.arguments.files );
            diffArgs.push( "HEAD", "--", ...process.cli.arguments.files.map( file => `"${ file.replaceAll( /([`\\"])/gv, "\\$1" ) }"` ) );
            commitArgs.push( ...process.cli.arguments.files );
        }
        else if ( process.cli.options.all ) {
            args.push( "HEAD" );
            diffArgs.push( "HEAD" );
            commitArgs.push( "-a" );
        }
        else {
            args.push( "--cached" );
            diffArgs.push( "--cached" );
        }

        const git = new Git( cwd ),
            diffCommand = diffArgs.join( " " );

        let res = await git.exec( args );
        if ( !res.ok ) return res;

        if ( !res.data ) {
            return result( [ 200, "Nothing to commit" ] );
        }

        const copilotProcess = spawn( shellQuote( [ COPILOT_BIN, "--acp", "--stdio" ] ), {
            cwd,
            "stdio": [ "pipe", "pipe", "inherit" ],
            "shell": true,
        } );

        if ( !copilotProcess.stdin || !copilotProcess.stdout ) {
            return result( [ 500, "Failed to start Copilot ACP process with piped stdio" ] );
        }

        const output = Writable.toWeb( copilotProcess.stdin ),
            input = Readable.toWeb( copilotProcess.stdout ),
            stream = acp.ndJsonStream( output, input );

        let commitMessage = "";

        const client = {
            "requestPermission": async params => {
                if ( params.toolCall.kind === "execute" && params.toolCall.rawInput.command === diffCommand ) {
                    return {
                        "outcome": {
                            "outcome": "selected",
                            "optionId": "allow_once",
                        },
                    };
                }
                else {
                    console.warn( "Unable to execute command:", JSON.stringify( params, null, 4 ) );

                    return {
                        "outcome": {
                            "outcome": "cancelled",
                        },
                    };
                }
            },

            "sessionUpdate": async params => {
                const update = params.update;

                if ( update.sessionUpdate === "agent_message_chunk" && update.content.type === "text" ) {
                    commitMessage += update.content.text;
                }
            },
        };

        const connection = new acp.ClientSideConnection( _agent => client, stream );

        await connection.initialize( {
            "protocolVersion": acp.PROTOCOL_VERSION,
            "clientCapabilities": {},
        } );

        const sessionResult = await connection.newSession( {
            cwd,
            "mcpServers": [],
        } );

        const prompt = await prompts.get( "commit-message" ).render( {
            diffCommand,
            "types": pkg.cliConfig?.commits,
        } );

        const promptResult = await connection.prompt( {
            "sessionId": sessionResult.sessionId,
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

        copilotProcess.stdin.end();
        copilotProcess.kill( "SIGTERM" );
        await new Promise( resolve => {
            copilotProcess.once( "exit", () => resolve() );
            setTimeout( () => resolve(), 2000 );
        } );

        if ( !commitMessage ) return result( [ 500, "Unable to create commit message" ] );

        console.log( commitMessage );

        if ( !process.cli.options.force ) {
            console.log();

            if ( !( await confirm( "Commit?" ) ) ) return result( [ 400, "Cancelled" ] );
        }

        console.log();

        commitArgs.push( "-m", commitMessage );

        res = spawnSync( "git", commitArgs, {
            cwd,
            "stdio": "inherit",
        } );
        if ( res.status ) return result( 500 );

        return result( 200 );
    }
}

import { spawn, spawnSync } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import ejs from "#core/ejs";
import { confirm, shellQuote } from "#core/utils";
import Command from "#lib/command";
import Git from "#lib/git";

const COPILOT_BIN = "copilot",
    PROMPT = ejs( `
You MUST execute the \`<%- diffCommand %>\` tool call and read its real output before writing anything. Do not modify command, execute exactly the provided command.

Then write a single commit message following the Conventional Commits format. Do not answer from assumption, memory, or a typical/generic example — if you have not run the command yet, run it now before responding.

Rules:
- Output ONLY the commit message, like this:

\`\`\`
type(scope): subject line

optional body
\`\`\`

- Nothing before the fence, nothing after it. No explanations, no preamble.
- Do not add any "Co-authored-by" trailer.
- Base the message strictly on the actual diff — do not invent changes that aren't there.
- Do not run any git command other than \`git diff --cached\` (and \`git diff --cached --stat\` if helpful). Do not modify anything.
<% if ( types ) { %>
Conventional commit types allowed to use:
<% for ( const [ type, options ] of Object.entries( types.types ) ) { -%>

- \`<%- type %>\` <%- options.description %>
<% if ( options.scopes ) { -%>

    Scopes, allowed to use with this type:

<% for ( const scope in options.scopes ) { -%>
    - \`<%- scope %>\` <%- options.scopes[ scope ] %>
<% } -%>
<% } else { -%>

    Do not use scope with this type.
<% } -%>
<% } -%>
<% } -%>
`.trim() );

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

        const prompt = PROMPT.render( {
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

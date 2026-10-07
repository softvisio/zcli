import { spawnSync } from "node:child_process";
import { confirm } from "#core/utils";
import Command from "#lib/command";
import Copilot from "#lib/copilot";
import Git from "#lib/git";
import prompts from "#lib/prompts";

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

        await using copilot = new Copilot();

        res = await copilot.start();
        if ( !res.ok ) return res;

        await using session = await copilot.createSession( {
            cwd,
            "allowExecute": command => command === diffCommand,
        } );

        const prompt = await prompts.get( "commit-message" ).render( {
            diffCommand,
            "types": pkg.cliConfig?.commits,
        } );

        res = await session.prompt( prompt );
        if ( !res.ok ) throw res;

        const commitMessage = res.data.text;

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

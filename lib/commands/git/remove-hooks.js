import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Git from "#core/api/git";
import { pathExists } from "#core/fs";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "global": {
                    "description": "Remove Git hooks globally.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        var res;

        res = await this.#getHooksPath( process.cli.options.global );
        if ( !res.ok ) return res;

        const { git, hooksPath, hooksPathInstalled } = res.data;

        // remove "pre-commit" hook
        if ( await pathExists( path.join( hooksPath, "pre-commit" ) ) ) {
            fs.rmSync( path.join( hooksPath, "pre-commit" ) );
            console.log( `Git "pre-commit" hook removed` );
        }
        else {
            console.log( `Git "pre-commit" hook not installed` );
        }

        // remove "commit-msg" hook
        if ( await pathExists( path.join( hooksPath, "commit-msg" ) ) ) {
            fs.rmSync( path.join( hooksPath, "commit-msg" ) );
            console.log( `Git "commit-msg" hook removed` );
        }
        else {
            console.log( `Git "commit-msg" hook not installed` );
        }

        if ( !process.cli.options.global && hooksPathInstalled ) {
            res = await git.exec( [ "config", "unset", "--local", "--all", "core.hooksPath" ] );

            if ( !res.ok ) return res;

            console.log( "Git config updated" );
        }

        return result( 200 );
    }

    // private
    async #getHooksPath ( global ) {
        var res, pkg, git, hooksPath, hooksPathInstalled, config;

        if ( global ) {
            git = new Git();

            config = "--global";
        }
        else {
            pkg = this._findGitPackage();

            if ( !pkg ) return result( [ 500, "Unable to find git package root" ] );

            git = pkg.git;

            config = "--local";
        }

        res = await git.exec( [ "config", "get", config, "--default", "", "core.hooksPath" ] );

        if ( !res.ok ) return res;

        hooksPath = res.data.trim();

        if ( hooksPath ) {
            hooksPathInstalled = true;

            if ( hooksPath.startsWith( "~" ) ) hooksPath = path.join( os.homedir(), hooksPath.slice( 1 ) );

            if ( !global ) {
                hooksPath = path.resolve( pkg.root, hooksPath );
            }
        }
        else {
            if ( global ) {
                return result( [ 500, `Unable to find global Git hooks path. Check, that your global Git config file contains "core.hooksPath" variable defined.` ] );
            }
            else {
                hooksPath = pkg.root + "/.git/hooks";
            }
        }

        return result( 200, {
            git,
            hooksPath,
            hooksPathInstalled,
        } );
    }
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Git from "#core/api/git";
import { chmodSync, pathExists } from "#core/fs";
import * as utils from "#core/utils";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "global": {
                    "description": "Install Git hooks globally",
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

        const { pkg, git, hooksPath } = res.data;

        // create hooks dir
        if ( !( await pathExists( hooksPath ) ) ) {
            fs.mkdirSync( hooksPath, {
                "recursive": true,
            } );
        }

        // install "pre-commit" hook
        this.#installHook( hooksPath, "pre-commit" );

        // install "commit-msg" hook
        this.#installHook( hooksPath, "commit-msg" );

        if ( !process.cli.options.global ) {
            res = await git.exec( [ "config", "set", "--local", "core.hooksPath", path.relative( pkg.root, hooksPath ).replaceAll( "\\", "/" ) ] );

            if ( !res.ok ) return res;

            console.log( "Git config updated" );
        }

        return result( 200 );
    }

    // private
    async #getHooksPath ( global ) {
        var res, pkg, git, hooksPath, config;

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
                hooksPath = path.join( pkg.root, ".git/hooks" );
            }
        }

        return result( 200, {
            pkg,
            git,
            hooksPath,
        } );
    }

    #installHook ( hooksPath, name ) {
        const hookPath = path.join( hooksPath, name );

        fs.copyFileSync( utils.resolve( `#resources/git-hooks/${ name }`, import.meta.url ), hookPath );

        chmodSync( hookPath, "rwx--x--x" );

        console.log( `Git "${ name }" hook installed` );
    }
}

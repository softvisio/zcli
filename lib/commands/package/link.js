import fs from "node:fs";
import path from "node:path";
import { readConfig } from "#core/config";
import { glob, pathExists } from "#core/fs";
import Command from "#lib/command";
import Dependencies from "#lib/package/dependencies";

const IGNORE = [ "!.cache/", "!.external-resources/" ];

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "update": {
                    "short": "u",
                    "description": "update package dependencies before linking",
                    "default": false,
                    "schema": {
                        "type": "boolean",
                    },
                },
                "dry-run": {
                    "short": "d",
                    "description": "dry run",
                    "default": false,
                    "schema": {
                        "type": "boolean",
                    },
                },
            },
        };
    }

    // public
    async run () {
        const workspace = process.env[ "COREJSLIB_CLI_WORKSPACE_" + process.platform.toUpperCase() ];

        if ( !workspace ) return result( [ 500, "No workspace configured" ] );

        const pkg = this._findPackage();

        if ( !pkg ) return result( [ 500, "Package not found" ] );

        if ( !process.cli.options[ "dry-run" ] ) {
            if ( process.cli.options.update ) {
                const res = await pkg.updateDependencies( {
                    "dryRun": process.cli.options[ "dry-run" ],
                    "reinstall": true,
                    "commit": true,
                } );

                if ( !res.ok ) return res;
            }
        }

        const files = await glob( "*/*/package.json", {
            "cwd": workspace,
        } );

        const packages = {};

        for ( const file of files ) {
            const config = await readConfig( workspace + "/" + file );

            if ( !config.name || config.private ) continue;

            packages[ config.name ] = {
                "name": config.name,
                "path": path.dirname( workspace + "/" + file ),
                "allDependencies": this.#getDependencies( config ),
                "peerDependencies": this.#getDependencies( config, { "peerOnly": true } ),
            };
        }

        for ( const dep of this.#getDependencies( pkg.config ) ) {
            this.#processDependencies( dep, packages );
        }

        for ( const pkg of Object.values( packages ) ) {
            if ( !pkg.link ) continue;

            for ( const dep of pkg.allDependencies ) {
                if ( packages[ dep ]?.link ) {
                    pkg.removeNodeModules = true;

                    break;
                }
            }
        }

        for ( const dep of Object.values( packages ) ) {
            if ( !dep.link ) continue;

            console.log( `Link package: ${ dep.name }` );

            if ( !process.cli.options[ "dry-run" ] ) {

                // create node_modules
                if ( !( await pathExists( pkg.root + "/node_modules/" + path.dirname( dep.name ) ) ) ) {
                    fs.mkdirSync( pkg.root + "/node_modules/" + path.dirname( dep.name ), {
                        "recursive": true,
                    } );
                }

                fs.rmSync( pkg.root + "/node_modules/" + dep.name, {
                    "force": true,
                    "recursive": true,
                } );

                if ( process.platform === "win32" ) {
                    fs.symlinkSync( dep.path, pkg.root + "/node_modules/" + dep.name, "junction" );
                }
                else {
                    fs.symlinkSync( dep.path, pkg.root + "/node_modules/" + dep.name, "dir" );
                }
            }

            // remove node modules
            if ( dep.removeNodeModules && ( await pathExists( dep.path + "/node_modules" ) ) ) {
                console.log( `Remove "node_modules" for package: ${ dep.name }` );

                if ( !process.cli.options[ "dry-run" ] ) {
                    const files = await glob( [ "*", ...IGNORE ], {
                        "cwd": dep.path + "/node_modules",
                        "absolute": true,
                        "files": true,
                        "directories": true,
                    } );

                    const promises = Array.from( files, file => {
                        return fs.promises.rm( file, {
                            "force": true,
                            "recursive": true,
                        } );
                    } );

                    await Promise.all( promises );
                }
            }
        }

        return result( 200 );
    }

    // private
    #getDependencies ( config, { peerOnly } = {} ) {
        const dependencies = new Dependencies( config );

        if ( peerOnly ) {
            return dependencies.peerNames;
        }
        else {
            return dependencies.names;
        }
    }

    #processDependencies ( name, packages ) {
        if ( !packages[ name ] ) return;

        if ( packages[ name ].processed ) return;

        packages[ name ].processed = true;

        packages[ name ].link = true;

        for ( const dep of packages[ name ].peerDependencies ) {
            this.#processDependencies( dep, packages );
        }
    }
}

import childProcess from "node:child_process";
import fs from "node:fs";
import url from "node:url";
import ansi from "#core/ansi";
import GitHub from "#core/api/github";
import ejs from "#core/ejs";
import env from "#core/env";
import File from "#core/file";
import FileTree from "#core/file-tree";
import { glob, pathExists, pathExistsSync } from "#core/fs";
import * as utils from "#core/utils";
import { resolve } from "#core/utils";
import { lintFile } from "#lib/lint";
import Markdown from "#lib/markdown";
import Options from "./docs/options.js";

export default class Docs {
    #package;

    constructor ( pkg ) {
        this.#package = pkg;
    }

    // properties
    get package () {
        return this.#package;
    }

    get location () {
        return this.#package.cliConfig?.docs?.location;
    }

    get locationPath () {
        if ( !this.location ) {
            return null;
        }
        else if ( this.location === "/" ) {
            return this.#package.root;
        }
        else {
            return this.#package.root + this.location;
        }
    }

    get isEnabled () {
        return Boolean( this.location );
    }

    get isInitialized () {
        return Boolean( this.isEnabled && pathExistsSync( this.locationPath ) );
    }

    // public
    async init () {
        var res;

        process.stdout.write( "Initializing documentation ... " );

        try {

            // check docs config
            if ( !this.location ) throw result( [ 404, "Documentation config was not found" ] );

            const options = await new Options( this.#package ).init();

            await this.#init( options );

            await this.#initGitHubPages( options );

            res = result( 200 );
        }
        catch ( e ) {
            res = result.fromError( e );
        }

        console.log( res + "" );

        return res;
    }

    async build () {
        var res, warn;

        process.stdout.write( "Building documentation ... " );

        try {

            // check docs config
            if ( !this.location ) throw result( [ 404, "Documentation config was not found" ] );

            // check docs initialized
            if ( !this.isInitialized ) throw result( [ 404, "Documentation is not initialized" ] );

            const options = await new Options( this.#package ).init();

            // build API schemas
            await this.#buildAppSchemas( options, { "lint": false } );

            // check markdown files
            warn = await this.#checkMarkdown( options, { "lint": true } );

            // build index.html
            await this.#buildDefault( options );

            // build README.md
            await this.#buildReadme( options );

            res = result( 200 );
        }
        catch ( e ) {
            res = result.fromError( e, { "log": false } );
        }

        console.log( res + "" );
        if ( warn ) console.log( warn );

        return res;
    }

    // private
    async #init ( options ) {
        const fileTree = new FileTree();

        // generate README.md
        if ( !( await pathExists( this.locationPath + "/README.md" ) ) ) {
            const readmeTmpl = utils.resolve( "#resources/templates/docs/README-default.md", import.meta.url );

            if ( this.location !== "/" ) {

                // default readme
                fileTree.add( new File( {
                    "path": "README.md",
                    "sources": await ejs.renderFile( readmeTmpl, options ),
                } ) );
            }
            else {

                // copy root readme
                if ( await pathExists( this.#package.root + "/README.md" ) ) {
                    fileTree.add( new File( {
                        "path": "README.md",
                        "sources": fs.readFileSync( this.#package.root + "/README.md" ),
                    } ) );
                }

                // default readme
                else {
                    fileTree.add( new File( {
                        "path": "README.md",
                        "sources": await ejs.renderFile( readmeTmpl, options ),
                    } ) );
                }
            }
        }

        // generate default sidebar
        if ( !( await pathExists( this.locationPath + "/_sidebar.md" ) ) ) {
            fileTree.add( new File( {
                "path": "_sidebar.md",
                "sources": await ejs.renderFile( utils.resolve( "#resources/templates/docs/_sidebar.md", import.meta.url ), options ),
            } ) );
        }

        await fileTree.write( this.locationPath );

        // copy .nojekyll
        this.#createNoJekyll( options );
    }

    async #buildDefault ( options ) {

        // generate index.html
        let index = await ejs.renderFile( utils.resolve( "#resources/templates/docs/index.html", import.meta.url ), options );

        // lint index.html
        const res = await lintFile( new File( {
            "path": this.locationPath + "/index.html",
            "sources": index,
        } ) );
        if ( !res.ok ) throw res;

        index = res.data;

        // write index.html
        fs.writeFileSync( this.locationPath + "/index.html", index );

        // create .nojekyll
        this.#createNoJekyll( options );
    }

    async #buildAppSchemas ( options, { lint } = {} ) {
        if ( !options.app ) return;

        const builder = resolve( "#resources/docs-builder.js", import.meta.url ),
            cwd = this.#package.root,
            appUrl = url.pathToFileURL( cwd + "/lib/app.js" ),
            args = {
                "componentsUrl": resolve( "@corejslib/app/components", appUrl, { "url": true } ),
                appUrl,
                "types": options.app,
            };

        const proc = childProcess.spawn( process.argv[ 0 ], [ "--preserve-symlinks", "--preserve-symlinks-main", builder, JSON.stringify( args ) ], {
            cwd,
            "stdio": [ "ignore", "pipe", "inherit" ],
        } );

        var data = "";
        proc.stdout.on( "data", buffer => ( data += buffer.toString() ) );

        await new Promise( resolve => proc.on( "close", resolve ) );

        if ( proc.exitCode ) throw result( 500 );

        data = JSON.parse( data );

        fs.rmSync( this.locationPath + "/api", { "force": true, "recursive": true } );
        fs.rmSync( this.locationPath + "/rpc", { "force": true, "recursive": true } );

        const fileTree = new FileTree();
        for ( const [ path, sources ] of Object.entries( data ) ) {
            fileTree.add( new File( { path, sources } ) );
        }

        if ( fileTree.isEmpty ) return;

        // write files
        await fileTree.write( this.locationPath );

        // lint
        if ( lint ) {
            for ( const path of fileTree.keys() ) {
                const res = await lintFile(
                    new File( {
                        "path": this.locationPath + "/" + path,
                    } ),
                    {
                        "write": true,
                    }
                );
                if ( !res.ok ) throw res;
            }
        }
    }

    // TODO: replace relative urls
    async #buildReadme ( options ) {
        const readmePath = this.locationPath + "/README.md";

        if ( this.location === "/" || options.generateReadme === false || !( await pathExists( readmePath ) ) ) return;

        const template = utils.resolve( "#resources/templates/docs/README-wrapper.md.ejs", import.meta.url ),
            fileTree = new FileTree();

        options.readmeContent = fs.readFileSync( readmePath, "utf8" ).trim();

        // TODO: replace relative urls

        fileTree.add( new File( {
            "path": "README.md",
            "sources": await ejs.renderFile( template, options ),
        } ) );

        await fileTree.write( this.#package.root );
    }

    #createNoJekyll ( options ) {
        fs.writeFileSync( this.locationPath + "/.nojekyll", "" );
    }

    async #checkMarkdown ( options, { lint } = {} ) {
        const files = await glob( "**/*.md", {
                "cwd": this.locationPath,
                "directories": false,
            } ),
            types = options.getTypes(),
            warn = [];

        for ( const file of files ) {
            const source = fs.readFileSync( this.locationPath + "/" + file, "utf8" );

            const markdown = new Markdown( source );

            const content = markdown
                .traverse(
                    ( node, index, parent ) => {
                        if ( node.lang ) {
                            const language = markdown.getCodeLanguage( node.lang )?.language || node.lang;

                            if ( !options.addLanguage( language ) ) {
                                throw result( [ 500, `Code block in file "${ file }" has unsupported code language identifier "${ language }"` ] );
                            }

                            node.lang = language;
                        }

                        return markdown.CONTINUE;
                    },
                    {
                        "test": "code",
                    }
                )
                .toMarkdown( {
                    "handlers": {
                        text ( node, parent, state, info ) {
                            const value = markdown.nodeToString( node );

                            for ( const match of value.matchAll( /\{([\w.\[\]\|]+)\}/gv ) ) {
                                for ( let type of match[ 1 ].split( "|" ) ) {
                                    type = type.replace( /\[\]$/v, "" );

                                    if ( type in types ) {
                                        options.addType( type );
                                    }
                                    else {
                                        warn.push( `${ ansi.warn( " warn " ) } Type "${ type }" in file "${ file }" is undefined` );
                                    }
                                }
                            }

                            return markdown.defaultHandlers.text( node, parent, state, info );
                        },
                    },
                } );

            if ( content !== markdown.source ) fs.writeFileSync( this.locationPath + "/" + file, content );
        }

        // lint
        if ( lint ) {
            for ( const file of files ) {
                const res = await lintFile(
                    new File( {
                        "path": this.locationPath + "/" + file,
                    } ),
                    {
                        "write": true,
                    }
                );
                if ( !res.ok ) return res;
            }
        }

        return warn.join( "\n" );
    }

    async #initGitHubPages ( options ) {
        const branch = "main",
            path = this.location;

        process.stdout.write( "Initializing GitHub pages ... " );

        var res;

        try {

            // GitHub pages init
            const upstream = this.#package.git.upstream;

            env.loadUserEnv();

            if ( upstream.hosting !== "github" ) throw result( [ 500, "Upstream is not GitHub" ] );

            if ( !process.env.GITHUB_TOKEN ) throw result( [ 500, "GitHub API token is not configured" ] );

            const github = new GitHub( process.env.GITHUB_TOKEN );

            res = await github.getPages( upstream.repositorySlug );

            // pages created
            if ( res.ok ) {
                if ( path === res.data.source.path ) {
                    throw result( [ 200, `OK, branch: "${ res.data.source.branch }", path: "${ res.data.source.path }"` ] );
                }

                // update location
                else {
                    res = await github.updatePages( upstream.repositorySlug, { "source": { branch, path } } );

                    if ( res.ok ) throw result( [ 200, `Updated, branch: "${ branch }", path: "${ path }"` ] );
                }
            }

            // create pages
            else {
                res = await github.createPages( upstream.repositorySlug, branch, path );
            }
        }
        catch ( e ) {
            res = result.fromError( e );
        }

        console.log( res + "" );
    }
}

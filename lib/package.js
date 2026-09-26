import "#core/temporal";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ansi from "#core/ansi";
import GitHubApi from "#core/api/github";
import { readConfig, readConfigSync, writeConfigSync } from "#core/config";
import env from "#core/env";
import File from "#core/file";
import FileTree from "#core/file-tree";
import { chmodSync, glob, globSync, pathExists, pathExistsSync, rmEmptyDir } from "#core/fs";
import GlobPatterns from "#core/glob/patterns";
import Locale from "#core/locale";
import Logger from "#core/logger";
import SemanticVersion from "#core/semantic-version";
import Table from "#core/text/table";
import Mutex from "#core/threads/mutex";
import ThreadsPool from "#core/threads/pool";
import { compare, isEmptyObject, mergeObjects, repeatAction, shellQuote } from "#core/utils";
import * as yaml from "#core/yaml";
import Git from "#lib/git";
import lintFile from "#lib/lint/file";
import Dependencies from "#lib/package/dependencies";
import Docs from "#lib/package/docs";
import Localization from "#lib/package/localization";
import Npm from "#lib/package/npm";
import Wiki from "#lib/package/wiki";
import { getCliConfig } from "#lib/utils";

const TAG_MESSAGES = {
        "latest": "Latest stable release",
        "next": "Next release",
    },
    MUTEX_SET = new Mutex.Set(),
    NPM_THREADS_POOL = new ThreadsPool( {
        "maxRunningThreads": 3,
    } );

export default class Package {
    #root;
    #rootPackage;
    #parentPackage;
    #isGitRoot;
    #isPackage;
    #isGitPackage;
    #config;
    #cliConfig;
    #version;
    #workspaces;
    #subPackages;
    #git;
    #npm;
    #wiki;
    #docs;
    #localization;
    #rootSlug;
    #parentSlug;
    #dependencies;

    constructor ( root, { rootPackage, parentPackage } = {} ) {
        this.#root = root;
        this.#rootPackage = rootPackage;
        this.#parentPackage = parentPackage;
    }

    // static
    static new ( dir ) {
        dir = env.findPackageRoot( dir );

        if ( dir ) return new this( dir.replaceAll( "\\", "/" ) );
    }

    static newGit ( dir ) {
        dir = env.findGitPackageRoot( dir );

        if ( dir ) return new this( dir.replaceAll( "\\", "/" ) );
    }

    static newGitRoot ( dir ) {
        dir = env.findGitRoot( dir );

        if ( dir ) return new this( dir.replaceAll( "\\", "/" ) );
    }

    // properties
    get root () {
        return this.#root;
    }

    get rootPackage () {
        return this.#rootPackage;
    }

    get parentPackage () {
        return this.#parentPackage;
    }

    get rootSlug () {
        if ( this.#rootSlug === undefined ) {
            if ( this.rootPackage ) {
                this.#rootSlug = path.relative( this.rootPackage.root, this.root ).replaceAll( "\\", "/" );
            }
            else {
                this.#rootSlug = null;
            }
        }

        return this.#rootSlug;
    }

    get parentSlug () {
        if ( this.#parentSlug === undefined ) {
            if ( this.parentPackage ) {
                this.#parentSlug = path.relative( this.parentPackage.root, this.root ).replaceAll( "\\", "/" );
            }
            else {
                this.#parentSlug = null;
            }
        }

        return this.#parentSlug;
    }

    get isGitRoot () {
        this.#isGitRoot ??= env.isGitRoot( this.root );

        return this.#isGitRoot;
    }

    get isPackage () {
        this.#isPackage ??= env.isPackageRoot( this.root );

        return this.#isPackage;
    }

    get isGitPackage () {
        this.#isGitPackage ??= env.isGitPackageRoot( this.root );

        return this.#isGitPackage;
    }

    get hasDockerfile () {
        return pathExistsSync( this.root + "/dockerfile" ) || pathExistsSync( this.root + "/Dockerfile" );
    }

    get git () {
        if ( !this.#git ) {
            this.#git = new Git( this.root );
        }

        return this.#git;
    }

    get npm () {
        if ( !this.#npm ) {
            this.#npm = new Npm( this );
        }

        return this.#npm;
    }

    get config () {
        if ( this.#config === undefined ) {
            this.#config = this.isPackage
                ? readConfigSync( path.join( this.root, "package.json" ) )
                : null;
        }

        return this.#config;
    }

    get cliConfig () {
        if ( this.#cliConfig === undefined ) {
            this.#cliConfig = getCliConfig( path.join( this.root, "zcli.config.yaml" ), {
                "validate": true,
            } );
        }

        return this.#cliConfig;
    }

    get name () {
        return this.config?.name;
    }

    get version () {
        if ( this.#version === undefined ) {
            try {
                this.#version = SemanticVersion.new( this.config?.version );
            }
            catch {
                this.#version = null;
            }
        }

        return this.#version;
    }

    get isPrivate () {
        return this.config
            ? Boolean( this.config.private )
            : true;
    }

    get isReleaseEnabled () {
        if ( !this.isGitPackage ) return false;

        if ( !this.cliConfig ) return false;

        return this.cliConfig.release.enabled;
    }

    get workspaces () {
        BREAK: if ( !this.#workspaces ) {
            this.#workspaces = [];

            const workspaces = this.config.workspaces;

            if ( !workspaces ) break BREAK;

            for ( const pattern of workspaces ) {
                const root = this.#root + "/" + pattern;

                if ( env.isPackageRoot( root ) ) {
                    this.#workspaces.push( new this.constructor( root, {
                        "rootPackage": this.isGitPackage
                            ? this
                            : this.rootPackage,
                        "parentPackage": this,
                    } ) );
                }
            }
        }

        return this.#workspaces;
    }

    get subPackages () {
        BREAK: if ( !this.#subPackages ) {
            this.#subPackages = [];

            const subPackages = this.cliConfig?.subPackages;

            if ( !subPackages ) break BREAK;

            for ( const pkg of globSync( subPackages, {
                "cwd": this.#root,
                "files": false,
                "directories": true,
            } ) ) {
                const root = this.#root + "/" + pkg;

                if ( env.isPackageRoot( root ) ) {
                    const pkg = new this.constructor( root, {
                        "rootPackage": this.isGitPackage
                            ? this
                            : this.rootPackage,
                        "parentPackage": this,
                    } );

                    this.#subPackages.push( pkg, ...pkg.subPackages );
                }
            }
        }

        return this.#subPackages;
    }

    get wiki () {
        if ( !this.#wiki ) {
            this.#wiki = new Wiki( this );
        }

        return this.#wiki;
    }

    get docs () {
        if ( !this.#docs ) {
            this.#docs = new Docs( this );
        }

        return this.#docs;
    }

    get docsUrl () {
        if ( !this.git.upstream ) {
            return null;
        }
        else if ( this.cliConfig?.docs?.location ) {
            return this.git.upstream.docsUrl;
        }
        else {
            return this.git.upstream.readmeUrl;
        }
    }

    get npmUrl () {
        if ( !this.name ) return null;

        if ( this.isPrivate || !this.name ) return null;

        return `https://www.npmjs.com/package/${ this.name }`;
    }

    get localization () {
        this.#localization ??= new Localization( this );

        return this.#localization;
    }

    get workspaceSlug () {
        env.loadUserEnv();

        const workspace = process.env[ "COREJSLIB_CLI_WORKSPACE_" + process.platform.toUpperCase() ];

        if ( !workspace ) return null;

        return path.relative( workspace, this.root ).replaceAll( "\\", "/" );
    }

    get hasPackageLock () {
        return pathExistsSync( this.root + "/package-lock.json" );
    }

    get dependencies () {
        if ( !this.#dependencies ) {
            this.#dependencies = new Dependencies( this.config );
        }

        return this.#dependencies;
    }

    // public
    patchVersion ( version ) {
        const root = this.root;

        // update package.json
        const pkg = readConfigSync( root + "/package.json" );
        pkg.version = version;
        writeConfigSync( root + "/package.json", pkg, { "readable": true } );

        // update package-lock.json
        if ( this.hasPackageLock ) {
            const data = readConfigSync( root + "/package-lock.json" );
            data.version = version;
            if ( data.packages && data.packages[ "" ] ) data.packages[ "" ].version = version;
            writeConfigSync( root + "/package-lock.json", data, { "readable": true } );
        }

        // update cordova config.xml
        if ( pathExistsSync( root + "/config.xml" ) ) {
            var xml = fs.readFileSync( root + "/config.xml", "utf8" ),
                replaced;

            xml = xml.replace( /(<widget[^>]+version=")\d+\.\d+\.\d+(")/v, ( ...match ) => {
                replaced = true;

                return match[ 1 ] + version + match[ 2 ];
            } );

            if ( replaced ) fs.writeFileSync( root + "/config.xml", xml );
        }

        this.#clearCache();
    }

    checkPreReleaseDependencies () {
        const preReleaseDependencies = this.dependencies.preReleaseNames;

        if ( preReleaseDependencies.size ) {
            return result( [
                500,
                `Package "${ this.name }" has pre-release dependencies: ${ [ ...preReleaseDependencies ]
                    .sort()
                    .map( name => `"${ name }"` )
                    .join( ", " ) }`,
            ] );
        }
        else {
            return result( 200 );
        }
    }

    async createRelease ( { preReleaseTag, publish, yes } = {} ) {
        const { "default": PackageRelease } = await import( "./package/release.js" );

        return new PackageRelease( this, {
            preReleaseTag,
            publish,
            yes,
        } );
    }

    async updateMetadata ( { updateDependabot, updateRepository, updateTags, commit, logger } = {} ) {
        logger ||= globalThis.console;

        var res,
            updated = false;

        // configure upstream repository
        if ( updateRepository ) {
            res = await this.configureUpstreamRepository();

            logger.log( "Configure upstream repository:", res.ok
                ? ( res.data.updated
                    ? ansi.ok( " Updated " )
                    : "Not modified" )
                : ansi.error( " " + res.statusText + " " ) );

            if ( !res.ok ) return res;

            if ( res.data?.updated ) updated = true;
        }

        // update metadata
        {
            res = await this.#updateMetadata( { updateDependabot, commit } );

            logger.log( "Update metadata:", res.ok
                ? ( res.data.updated
                    ? ansi.ok( " Updated " )
                    : "Not modified" )
                : ansi.error( " " + res.statusText + " " ) );

            if ( !res.ok ) return res;

            if ( res.data?.updated ) updated = true;
        }

        // update release tags
        if ( updateTags ) {

            // update release tags in repository
            if ( this.cliConfig?.release.enabled ) {
                res = await this.updateReleaseTags();

                logger.log( "Update release tags:", res.ok
                    ? ( res.data.updated
                        ? ansi.ok( " Updated " )
                        : "Not modified" )
                    : ansi.error( ` ${ res.statusText } ` ) );

                if ( !res.ok ) return res;

                if ( res.data?.updated ) updated = true;
            }

            // update npm
            for ( const pkg of [ this, ...this.subPackages ] ) {
                if ( pkg.isPrivate ) continue;

                res = await pkg.npm.updateTags( {
                    logger,
                } );

                if ( !res.ok ) return res;

                if ( res.data?.updated ) updated = true;
            }
        }

        return result( 200, {
            updated,
        } );
    }

    async updateReleaseTags () {
        var res,
            updated = false;

        if ( !this.cliConfig?.release.enabled ) {
            return result( 200, {
                updated,
            } );
        }

        // fetch remote tags
        if ( this.git.upstream ) {
            res = await this.git.exec( [ "fetch", "--tags" ] );
            if ( !res.ok ) return res;
        }

        res = await this.git.getReleaseTags( { "majorTagEnabled": this.cliConfig?.release.majorTagEnabled } );
        if ( !res.ok ) return res;
        const tags = res.data;

        for ( const tag in tags ) {

            // update tag
            if ( tags[ tag ].action === "update" ) {
                const annotation = this.createReleaseTagAnnotation( tag );

                res = await this.git.exec( [ "tag", "--force", "--annotate", "--message", annotation, tag, tags[ tag ].versionString ] );
                if ( !res.ok ) return res;

                if ( this.git.upstream ) {
                    res = await this.git.exec( [ "push", "--force", "origin", tag ] );
                    if ( !res.ok ) return res;
                }

                updated = true;
            }

            // delete tag
            else if ( tags[ tag ].action === "delete" ) {
                res = await this.git.exec( [ "tag", "--delete", tag ] );
                if ( !res.ok ) return res;

                if ( this.git.upstream ) {
                    res = await this.git.exec( [ "push", "--delete", "origin", tag ] );
                    if ( !res.ok ) return res;
                }

                updated = true;
            }
        }

        return result( 200, {
            updated,
            "tags": Object.entries( tags ).reduce( ( tags, [ tag, { version, action } ] ) => {
                if ( version && action !== "delete" ) {
                    tags[ tag ] = version.versionString;
                }

                return tags;
            }, {} ),
        } );
    }

    async updateFilesMode () {
        if ( !this.cliConfig?.meta?.executables ) return result( 200 );

        var res;

        const packagePatterns = new GlobPatterns().add( "**" );
        for ( const pkg of this.subPackages ) {
            packagePatterns.add( "!" + pkg.parentSlug + "/**" );
        }

        res = await this.git.exec( [ "ls-files", "--format", "%(objectmode) %(path)" ] );
        if ( !res ) return res;

        const files = Object.fromEntries( res.data
            .split( "\n" )
            .map( line => line.split( " ", 2 ).reverse() )
            .filter( ( [ path, mode ] ) => path && packagePatterns.test( path ) )
            .map( ( [ path, mode ] ) => [ path, mode.endsWith( "755" ) ] ) );

        const executablePatterns = new GlobPatterns().add( this.cliConfig.meta.executables );

        const setX = [],
            dropX = [];

        for ( const [ path, executable ] of Object.entries( files ) ) {
            if ( executablePatterns.test( path ) ) {
                if ( !executable ) setX.push( path );
            }
            else {
                if ( executable ) dropX.push( path );
            }
        }

        if ( setX.length ) {
            res = await this.git.exec( [ "update-index", "--chmod=+x", ...setX ] );

            if ( !res.ok ) return res;

            if ( process.platform !== "win32" ) {
                for ( const file of setX ) {
                    chmodSync( this.root + "/" + file, "+x" );
                }
            }
        }

        if ( dropX.length ) {
            res = await this.git.exec( [ "update-index", "--chmod=-x", ...dropX ] );

            if ( !res.ok ) return res;

            if ( process.platform !== "win32" ) {
                for ( const file of dropX ) {
                    chmodSync( this.root + "/" + file, "-x" );
                }
            }
        }

        return result( 200 );
    }

    runCommand ( command, ...args ) {
        const res = childProcess.spawnSync( shellQuote( [ command, ...args ] ), {
            "cwd": this.root,
            "stdio": "inherit",
            "shell": true,
        } );

        if ( res.status ) {
            return result( 500 );
        }
        else {
            return result( 200 );
        }
    }

    async runScript ( script, args ) {
        return this.npm.runScript( script, { args } );
    }

    async getOutdatedDependencies ( { cache = {} } = {} ) {
        if ( !this.dependencies.hasDependencies ) return result( 200 );

        var res,
            updates = [],
            promises = [];

        for ( const dependency of this.dependencies ) {
            if ( cache[ dependency.name ] ) continue;

            const promise = async resolve => {
                const mutex = MUTEX_SET.get( "outdated-dependencies/" + dependency.name );

                if ( mutex.tryLock() ) {

                    // git dependency
                    if ( dependency.gitRepositorySlug ) {
                        res = await this.git.exec( [ "ls-remote", "--tags", `https://github.com/${ dependency.gitRepositorySlug }` ] );

                        if ( res.ok ) {
                            const versions = [];

                            for ( const line of res.data.split( "\n" ) ) {
                                const fields = line.split( "\t" ),
                                    tag = fields[ 1 ]?.replace( "refs/tags/", "" );

                                if ( !tag || tag.endsWith( "^{}" ) ) continue;

                                if ( SemanticVersion.isValid( tag ) ) {
                                    versions.push( tag );
                                }
                            }

                            res.data = versions;
                        }
                    }

                    // npm dependency
                    else {
                        res = await NPM_THREADS_POOL.runThread( async () => this.npm.getPackageTags( dependency.name ) );

                        if ( res.ok ) {
                            if ( res.data.latest ) {
                                res.data = [ res.data.latest ];
                            }
                            else {
                                res = await NPM_THREADS_POOL.runThread( async () => this.npm.getPackageVersions( dependency.name ) );
                            }
                        }
                    }

                    if ( res.ok ) {
                        let latest;

                        for ( let version of res.data ) {
                            version = new SemanticVersion( version );

                            if ( !version.isPreRelease ) {
                                if ( latest ) {
                                    if ( version.gt( latest ) ) latest = version;
                                }
                                else {
                                    latest = version;
                                }
                            }
                        }

                        res = result( 200, {
                            latest,
                        } );
                    }

                    cache[ dependency.name ] = res;

                    mutex.unlock();
                }
                else {
                    await mutex.wait();
                }

                resolve();
            };

            promises.push( new Promise( resolve => promise( resolve ) ) );
        }

        if ( promises.length ) {
            await Promise.all( promises );
        }

        try {
            for ( const dependency of this.dependencies ) {
                res = cache[ dependency.name ];
                if ( !res.ok ) throw res;

                const isOutdated = !dependency.range.test( res.data.latest );

                if ( isOutdated ) {
                    updates.push( {
                        "name": dependency.name,
                        "wanted": dependency.range,
                        "latest": res.data.latest,
                        isOutdated,
                    } );
                }
            }
        }
        catch ( e ) {
            res = result.fromError( e );
        }

        const logger = new Logger( {
            "stdout": "pipe",
            "stderr": "pipe",
        } );

        if ( res.ok ) {
            res = result( 200, {
                "updates": updates.length
                    ? updates
                    : null,
            } );

            if ( updates.length ) {
                const table = new Table( {
                    "ansi": process.stdout,
                    "width": process.stdout,
                    "columns": {
                        "name": {
                            "title": ansi.hl( "DEPENDENCY" ),
                            "headerAlign": "center",
                            "headerValign": "end",
                        },
                        "wanted": {
                            "title": ansi.hl( "WANTED VERSION" ),
                            "headerAlign": "center",
                            "headerValign": "end",
                            "align": "end",
                            "width": 30,
                        },
                        "latest": {
                            "title": ansi.hl( "LATEST VERSION" ),
                            "headerAlign": "center",
                            "headerValign": "end",
                            "align": "end",
                            "width": 30,
                            format ( value ) {
                                return ansi.error( ` ${ value } ` );
                            },
                        },
                    },
                } )
                    .write( updates.sort( ( a, b ) => compare( a.name, b.name ) ) )
                    .end();

                logger.log( table.content.trim() );
            }
        }
        else {
            logger.log( "Get dependencies ... " + ansi.error( " ERROR " ) + ", " + res );

            res = result( 500, {} );
        }

        res.data.log = logger.flush().trim();

        return res;
    }

    async updateDependencies ( { reinstall, dryRun, commit, repeatOnError = false } = {} ) {
        if ( !this.dependencies.hasDependencies ) return result( 200 );

        const logger = new Logger( {
            "stdout": "pipe",
            "stderr": "pipe",
        } );

        var res,
            updates = [];

        try {
            if ( reinstall ) {
                await fs.promises.rm( path.join( this.root, "node_modules" ), {
                    "force": true,
                    "recursive": true,
                } );
            }

            res = await NPM_THREADS_POOL.runThread( async () => {
                return this.npm.updateDependencies( {
                    dryRun,
                } );
            } );
            if ( !res.ok ) throw res;

            // added
            for ( const change of res.data.add ) {
                updates.push( {
                    "name": change.name,
                    "status": "INSTALLED",
                    "oldVersion": null,
                    "newVersion": change.version,
                } );
            }

            // removed
            for ( const change of res.data.remove ) {

                // check that package removed
                // if ( !dryRun && ( await pathExists( change.path + "/package.json" ) ) ) continue;

                updates.push( {
                    "name": change.name,
                    "status": "REMOVED",
                    "oldVersion": change.version,
                    "newVersion": null,
                } );
            }

            // changed
            for ( const change of res.data.change ) {

                // ignore reinstalled packages
                // if ( change.from.version === change.to.version ) continue;

                updates.push( {
                    "name": change.from.name,
                    "status": change.from.version === change.to.version
                        ? "REINSTALLED"
                        : "UPDATED",
                    "oldVersion": change.from.version,
                    "newVersion": change.to.version,
                } );
            }

            if ( updates.length ) {
                const table = new Table( {
                    "ansi": process.stdout,
                    "width": process.stdout,
                    "columns": {
                        "name": {
                            "title": ansi.hl( "DEPENDENCY" ),
                            "headerAlign": "center",
                            "headerValign": "end",
                        },
                        "status": {
                            "title": ansi.hl( "STATUS" ),
                            "headerAlign": "center",
                            "headerValign": "end",
                            "align": "center",
                            "width": 13,
                        },
                        "oldVersion": {
                            "title": ansi.hl( "OLD VERSION" ),
                            "headerAlign": "center",
                            "headerValign": "end",
                            "align": "end",
                            "width": 30,
                            "format": ( value, row ) => {
                                if ( value ) {
                                    return ` ${ value } `;
                                }
                                else {
                                    return " - ";
                                }
                            },
                        },
                        "newVersion": {
                            "title": ansi.hl( "NEW VERSION" ),
                            "headerAlign": "center",
                            "headerValign": "end",
                            "align": "end",
                            "width": 30,
                            "format": ( value, row ) => {
                                if ( value ) {
                                    if ( row.status === "UPDATED" ) {
                                        return ansi.ok( ` ${ value } ` );
                                    }
                                    else {
                                        return ` ${ value } `;
                                    }
                                }
                                else {
                                    return " - ";
                                }
                            },
                        },
                    },
                } )
                    .write( updates.sort( ( a, b ) => compare( a.name, b.name ) ) )
                    .end();

                logger.log( table.content.trim() );
                logger.log( "Update dependencies ... " + res );
            }

            // commit and push
            COMMIT: if ( commit ) {
                try {

                    // get working tree status
                    res = await this.git.getWorkingTreeStatus();
                    if ( !res.ok ) throw res;

                    const commitFiles = [];

                    // working tree is dirty
                    if ( res.data.isDirty ) {
                        const lockFilePath = this.rootSlug
                            ? this.rootSlug + "/package-lock.json"
                            : "package-lock.json";

                        if ( res.data.files[ lockFilePath ] ) commitFiles.push( "package-lock.json" );
                    }

                    // dependencies locks was not updated
                    if ( !commitFiles.length ) break COMMIT;

                    // add changes
                    res = await repeatAction(
                        async () => {
                            const res = await this.git.exec( [ "add", ...commitFiles ] );

                            if ( res.ok ) {
                                return res;
                            }
                            else {

                                // console.log( ansi.error( res + "" ) );

                                throw res;
                            }
                        },
                        { repeatOnError }
                    );
                    if ( !res.ok ) throw res;

                    // commit changes
                    res = await repeatAction(
                        async () => {
                            const res = await this.git.exec( [ "commit", "-m", "chore(deps): update locked dependencies", ...commitFiles ] );

                            if ( res.ok ) {
                                return res;
                            }
                            else {

                                // console.log( ansi.error( res + "" ) );

                                throw res;
                            }
                        },
                        { repeatOnError }
                    );
                    if ( !res.ok ) throw res;

                    // push changes
                    res = await repeatAction(
                        async () => {
                            const res = await this.git.exec( [ "push" ] );

                            if ( res.ok ) {
                                return res;
                            }
                            else {

                                // console.log( ansi.error( res + "" ) );

                                return res;
                            }
                        },
                        { repeatOnError }
                    );
                    if ( !res.ok ) throw res;

                    logger.log( "Commit and push ... " + result( 200 ) );
                }
                catch ( e ) {
                    res = result.fromError( e );

                    logger.log( "Commit and push ... " + ansi.error( " ERROR " ) + ", " + res );
                }
            }
        }
        catch ( e ) {
            res = result.fromError( e );

            logger.log( "Update dependencies ... " + ansi.error( " ETTOT " ) + ", " + res );
        }

        if ( res.ok ) {
            res = result( 200 );
        }
        else {
            res = result( [ 500, "Dependencies update failed" ] );
        }

        res.data = {
            "updates": updates.length
                ? updates
                : null,
            "log": logger.flush().trim(),
        };

        return res;
    }

    async runTests ( { log } = {} ) {
        var res;

        if ( !this.config.scripts?.test ) {
            res = result( [ 200, "No tests to run" ] );
        }
        else {
            res = await this.npm.runScript( "test", { log } );
        }

        if ( log ) {
            console.log( `Tests result "${ this.workspaceSlug }":`, res + "" );
        }

        return res;
    }

    async configureUpstreamRepository () {
        const upstream = this.git.upstream;

        if ( !upstream.isGitHub ) return result( [ 400, "Repository upstream is not GitHub" ] );

        env.loadUserEnv();

        if ( !process.env.GITHUB_TOKEN ) return result( [ 400, "GitHub token is not provided" ] );

        const gitHubApi = new GitHubApi( process.env.GITHUB_TOKEN ),
            repositorySettings = this.cliConfig.meta.repository,
            homepage = ( this.docs.isEnabled && upstream.docsUrl ) || upstream.homeUrl;

        var res,
            data,
            updated = false;

        // get repository settings
        res = await gitHubApi.getRepository( upstream.repositorySlug );
        if ( !res.ok ) return res;

        const currentData = res.data;

        // description
        if ( this.config.description && this.config.description !== currentData.description ) {
            data ??= {};
            data.description = this.config.description;
        }

        // homepage
        if ( currentData.homepage !== homepage ) {
            data ??= {};
            data.homepage = homepage;
        }

        // private
        if ( repositorySettings.private !== null && repositorySettings.private !== currentData.private ) {
            data ??= {};
            data.private = repositorySettings.private;

            currentData.private = repositorySettings.private;
        }

        // visibility
        if ( repositorySettings.visibility !== null && repositorySettings.visibility !== currentData.visibility ) {
            data ??= {};
            data.visibility = repositorySettings.visibility;
        }

        // issues
        if ( repositorySettings.hasIssues !== null && repositorySettings.hasIssues !== currentData.has_issues ) {
            data ??= {};
            data.has_issues = repositorySettings.hasIssues;
        }

        // projects
        if ( repositorySettings.hasProjects !== null && repositorySettings.hasProjects !== currentData.has_projects ) {
            data ??= {};
            data.has_projects = repositorySettings.hasProjects;
        }

        // wiki
        if ( repositorySettings.hasWiki !== null && repositorySettings.hasWiki !== currentData.has_wiki ) {
            data ??= {};
            data.has_wiki = repositorySettings.hasWiki;
        }

        // discussions
        if ( repositorySettings.hasDiscussions !== null && repositorySettings.hasDiscussions !== currentData.has_discussions ) {
            data ??= {};
            data.has_discussions = repositorySettings.hasDiscussions;
        }

        // default branch
        if ( repositorySettings.defaultBranch !== null && repositorySettings.defaultBranch !== currentData.default_branch ) {
            data ??= {};
            data.default_branch = repositorySettings.defaultBranch;
        }

        // allow forking
        if ( repositorySettings.allowForking !== null && repositorySettings.allowForking !== currentData.allow_forking ) {
            data ??= {};
            data.allow_forking = repositorySettings.allowForking;
        }

        // web commit signoff required
        if ( repositorySettings.webCommitSignoffRequired !== null && repositorySettings.webCommitSignoffRequired !== currentData.web_commit_signoff_required ) {
            data ??= {};
            data.web_commit_signoff_required = repositorySettings.webCommitSignoffRequired;
        }

        // security and analysis
        if ( currentData.security_and_analysis ) {

            // secret scanning
            if ( repositorySettings.secretScanning !== null && repositorySettings.secretScanning !== currentData.security_and_analysis.secret_scanning.status ) {
                data ??= {};
                data.security_and_analysis ??= {};
                data.security_and_analysis.secret_scanning = {
                    "status": repositorySettings.secretScanning,
                };
            }

            // secret scanning push protection
            if ( repositorySettings.secretScanningPushProtection !== null && repositorySettings.secretScanningPushProtection !== currentData.security_and_analysis.secret_scanning_push_protection.status ) {
                data ??= {};
                data.security_and_analysis ??= {};
                data.security_and_analysis.secret_scanning_push_protection = {
                    "status": repositorySettings.secretScanningPushProtection,
                };
            }
        }

        if ( data ) {
            updated = true;

            res = await gitHubApi.updateRepository( upstream.repositorySlug, data );
            if ( !res.ok ) return res;
        }

        // vulnerability alerts
        if ( repositorySettings.vulnerabilityAlerts != null ) {
            res = await gitHubApi.getVulnerabilityAlertsEnabled( upstream.repositorySlug );
            if ( !res.ok ) return res;

            if ( repositorySettings.vulnerabilityAlerts !== res.data.enabled ) {
                res = await gitHubApi.setVulnerabilityAlertsEnabled( upstream.repositorySlug, repositorySettings.vulnerabilityAlerts );
                if ( !res.ok ) return res;

                updated = true;
            }
        }

        // dependabot Security Updates
        if ( repositorySettings.dependabotsecurityupdates != null ) {
            res = await gitHubApi.getDependabotsecurityupdatesEnabled( upstream.repositorySlug );
            if ( !res.ok ) return res;

            if ( repositorySettings.dependabotsecurityupdates !== res.data.enabled ) {
                res = await gitHubApi.setDependabotsecurityupdateEnabled( upstream.repositorySlug, repositorySettings.dependabotsecurityupdates );
                if ( !res.ok ) return res;

                updated = true;
            }
        }

        // private vulnerability reporting
        if ( repositorySettings.privateVulnerabilityReporting != null && !currentData.private ) {
            res = await gitHubApi.getPrivateVulnerabilityReportingEnabled( upstream.repositorySlug );
            if ( !res.ok ) return res;

            if ( repositorySettings.privateVulnerabilityReporting !== res.data.enabled ) {
                res = await gitHubApi.setPrivateVulnerabilityReportingEnabled( upstream.repositorySlug, repositorySettings.privateVulnerabilityReporting );
                if ( !res.ok ) return res;

                updated = true;
            }
        }

        return result( 200, {
            updated,
        } );
    }

    createReleaseTagAnnotation ( tag ) {
        var majorVersion;

        if ( tag.includes( "." ) ) {
            [ majorVersion, tag ] = tag.split( ".", 2 );
        }
        else if ( /^v\d+$/v.test( tag ) ) {
            majorVersion = tag;
            tag = "latest";
        }

        var annotation = TAG_MESSAGES[ tag ];

        if ( majorVersion != null ) {
            annotation += ` for the branch: ${ majorVersion }`;
        }

        return annotation;
    }

    clearCache () {
        this.#clearCache();
    }

    // private
    #clearCache () {
        this.#config = undefined;
        this.#cliConfig = undefined;
        this.#version = undefined;
        this.#workspaces = undefined;
        this.#subPackages = undefined;
        this.#dependencies = undefined;
    }

    async #updateMetadata ( { updateDependabot, commit } = {} ) {
        var res, updated;

        // get git status
        res = await this.git.getWorkingTreeStatus();
        if ( !res.ok ) return res;

        // package is dirty
        if ( res.data.isDirty ) return result( [ 500, "Work tree has uncommited changes" ] );

        const upstream = this.git.upstream,
            packages = [ this, ...this.subPackages ],
            fileTree = new FileTree();

        for ( const pkg of packages ) {
            const config = await readConfig( pkg.root + "/package.json" );

            // bugs
            config.bugs = {
                "url": upstream.issuesUrl,
                "email": process.env.META_BUGS_EMAIL || process.env.META_AUTHOR,
            };

            // repository
            config.repository = {
                "type": "git",
                "url": "git+" + upstream.httpsCloneUrl,
            };

            if ( pkg.rootSlug ) {
                config.repository.directory = pkg.rootSlug;
            }
            else {
                delete config.repository.directory;
            }

            // homepage
            if ( pkg.cliConfig ) {
                config.homepage = pkg.cliConfig.meta.homepage || ( this.docs.isEnabled && upstream.docsUrl ) || upstream.readmeUrl;
            }
            else {
                config.homepage ||= upstream.readmeUrl;
            }

            // license
            if ( pkg.cliConfig ) {
                config.license = pkg.cliConfig.meta.license || config.private
                    ? process.env.META_LICENSE_PRIVATE
                    : process.env.META_LICENSE_PUBLIC;
            }

            // author
            if ( pkg.cliConfig ) {
                config.author = pkg.cliConfig.meta.author || process.env.META_AUTHOR;
            }

            // scripts
            if ( pkg.cliConfig ) {

                // "test" script
                if ( pkg.cliConfig.tests.location ) {
                    if ( ( await glob( pkg.cliConfig.tests.location, { "cwd": pkg.root } ) ).length ) {
                        config.scripts ??= {};
                        config.scripts.test = `node --test "${ pkg.cliConfig.tests.location }"`;
                    }
                    else {
                        delete config.scripts?.test;
                    }
                }

                // dependencies
                const dependencies = new Dependencies( config );
                dependencies.fix();

                if ( config.scripts && isEmptyObject( config.scripts ) ) {
                    delete config.scripts;
                }
            }

            fileTree.add( new File( {
                "path": ( pkg.rootSlug || "" ) + "/package.json",
                "sources": JSON.stringify( config, null, 4 ) + "\n",
            } ) );

            // chmod
            res = await pkg.updateFilesMode();
            if ( !res.ok ) return res;
        }

        // dependabot
        if ( updateDependabot ) {
            res = await this.#updateDependabotConfig();
            if ( !res.ok ) return res;

            if ( res.data ) {
                fileTree.add( res.data );
            }
        }

        // lint
        const entries = [ ...fileTree ];
        for ( const [ filePath, file ] of entries ) {
            const res = await lintFile( new File( {
                "path": path.join( this.root, filePath ),
                "sources": await file.text(),
            } ) );

            if ( !res.ok ) return res;

            fileTree.add( new File( {
                "path": file.path,
                "sources": res.data,
            } ) );
        }

        // write file tree
        await fileTree.write( this.root );

        // get git status
        res = await this.git.getWorkingTreeStatus();
        if ( !res.ok ) return res;

        updated = res.data.isDirty;

        if ( updated ) {

            // commit and push
            if ( commit ) {

                // add changes
                res = await this.git.exec( [ "add", "." ] );
                if ( !res.ok ) return res;

                // commit changes
                res = await this.git.exec( [ "commit", "-m", "chore(metadata): update package metadata" ] );
                if ( !res.ok ) return res;

                // push
                res = await this.git.exec( [ "push" ] );
                if ( !res.ok ) return res;
            }
        }

        return result( 200, {
            updated,
        } );
    }

    async #updateDependabotConfig () {
        const upstream = this.git.upstream;

        if ( !upstream.isGitHub ) return result( 200 );

        var filename,
            config,
            registries = new Map(),
            updates = new Map();

        if ( await pathExists( this.root + "/.github/dependabot.yaml" ) ) {
            filename = "dependabot.yaml";

            config = await readConfig( this.root + "/.github/dependabot.yaml" );
        }
        else if ( await pathExists( this.root + "/.github/dependabot.yml" ) ) {
            filename = "dependabot.yml";

            config = await readConfig( this.root + "/.github/dependabot.yml" );
        }
        else {
            filename = "dependabot.yaml";
        }

        if ( config ) {
            for ( const registry in config.registries ) {
                registries.set( registry, config.registries[ registry ] );
            }

            if ( config.updates ) {
                for ( const update of config.updates ) {
                    if ( update[ "package-ecosystem" ] === "npm" ) continue;

                    if ( update[ "package-ecosystem" ] === "docker" ) continue;

                    if ( update[ "package-ecosystem" ] === "github-actions" ) continue;

                    updates.set( update[ "package-ecosystem" ], update );
                }
            }
        }

        // npm
        if ( this.cliConfig?.meta.dependabot.npm?.enabled ) {
            const directories = new Set();

            for ( const pkg of [ this, ...this.subPackages ] ) {
                if ( pkg.cliConfig?.meta.dependabot.npm ) {
                    if ( pkg.config.dependencies || pkg.config.devDependencies || pkg.config.peerDependencies ) {
                        directories.add( "/" + ( pkg.rootSlug || "" ) );
                    }
                }
            }

            if ( directories.size ) {
                const config = mergeObjects(
                    {
                        "package-ecosystem": "npm",
                        "registries": "*",
                        "directories": [ ...directories ].sort(),
                    },
                    this.cliConfig.meta.dependabot.npm.config
                );

                if ( config.schedule.day ) {
                    config.schedule.day = config.schedule.day?.toLowerCase();
                }

                if ( config.schedule.time ) {
                    config.schedule.time = new Locale().formatDate( Temporal.PlainTime.from( config.schedule.time ), "timeStyle:short" );
                }

                updates.set( "npm", config );

                registries.set( "npm.pkg.github.com", {
                    "type": "npm-registry",
                    "url": "https://npm.pkg.github.com",
                    "token": "${{secrets.DEPENDABOT_GITHUB_TOKEN}}",
                } );
            }
        }

        // docker
        if ( this.cliConfig?.meta.dependabot.docker?.enabled && this.hasDockerfile ) {
            const config = mergeObjects(
                {
                    "package-ecosystem": "docker",
                    "registries": "*",
                    "directories": [ "/" ],
                },
                this.cliConfig.meta.dependabot.docker.config
            );

            if ( config.schedule.day ) {
                config.schedule.day = config.schedule.day?.toLowerCase();
            }

            if ( config.schedule.time ) {
                config.schedule.time = new Locale().formatDate( Temporal.PlainTime.from( config.schedule.time ), "timeStyle:short" );
            }

            updates.set( "docker", config );

            registries.set( "ghcr.io", {
                "type": "docker-registry",
                "url": "ghcr.io",
                "username": "${{github.repository_owner}}",
                "password": "${{secrets.DEPENDABOT_GITHUB_TOKEN}}",
            } );
        }

        // github-actions
        if ( this.cliConfig?.meta.dependabot[ "github-actions" ]?.enabled ) {
            const directories = new Set();

            if ( ( await glob( ".github/workflows/*.*", { "cwd": this.root } ) ).length ) {
                directories.add( "/" );
            }

            if ( this.cliConfig.meta.dependabot[ "github-actions" ].actionsEnabled ) {
                if ( ( await pathExists( this.root + "/action.yaml" ) ) || ( await pathExists( this.root + "/action.yml" ) ) ) {
                    directories.add( "/" );
                }

                const files = await glob( [ "*/action.yaml", "*/action.yml" ], { "cwd": this.root } );

                for ( const file of files ) {
                    directories.add( "/" + path.dirname( file ) );
                }
            }

            if ( directories.size ) {
                const config = mergeObjects(
                    {
                        "package-ecosystem": "github-actions",
                        "directories": [ ...directories ].sort(),
                    },
                    this.cliConfig.meta.dependabot[ "github-actions" ].config
                );

                if ( config.schedule.day ) {
                    config.schedule.day = config.schedule.day?.toLowerCase();
                }

                if ( config.schedule.time ) {
                    config.schedule.time = new Locale().formatDate( Temporal.PlainTime.from( config.schedule.time ), "timeStyle:short" );
                }

                updates.set( "github-actions", config );
            }
        }

        // dependabot is not configured
        if ( !updates.size ) {
            if ( await pathExists( this.root + "/.github" ) ) {

                // remove dependabot config
                await fs.promises.rm( this.root + "/.github/" + filename, {
                    "force": true,
                } );

                // remove empty ".github" directory
                await rmEmptyDir( this.root + "/.github" );
            }

            return result( 200 );
        }

        config = {
            "version": 2,
        };

        for ( const registry of [ ...registries.keys() ].sort() ) {
            if ( registries.get( registry ).type === "npm-registry" ) {
                if ( !updates.has( "npm" ) ) continue;
            }
            else if ( registries.get( registry ).type === "docker-registry" ) {
                if ( !updates.has( "docker" ) ) continue;
            }

            config.registries ??= {};

            config.registries[ registry ] = registries.get( registry );
        }

        for ( const update of [ ...updates.keys() ].sort() ) {
            config.updates ??= [];

            config.updates.push( updates.get( update ) );
        }

        return result(
            200,
            new File( {
                "path": "/.github/" + filename,
                "sources": yaml.toYaml( config, {
                    "yaml11": true,
                } ),
            } )
        );
    }
}

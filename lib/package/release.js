import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ansi from "#core/ansi";
import GitHub from "#core/api/github";
import env from "#core/env";
import File from "#core/file";
import { pathExists } from "#core/fs";
import SemanticVersion from "#core/semantic-version";
import { TmpFile } from "#core/tmp";
import { confirm, repeatAction, shellQuote } from "#core/utils";
import { lintFile } from "#lib/lint";

export default class PackageRelease {
    #pkg;
    #preReleaseTag;
    #stable;
    #publish;
    #yes;
    #repeatOnError;

    #previousRelease;
    #newRelease;
    #isMajorRelease;
    #originalBranch;
    #previousReleaseBranch;
    #newReleaseBranch;
    #changelog;
    #changelogMarkdown;
    #changelogText;
    #fullChangelog;
    #latestTag;
    #nextTag;
    #majorTag;
    #majorLatestTag;
    #majorNextTag;

    constructor ( pkg, { preReleaseTag, publish, yes } = {} ) {
        this.#pkg = pkg;
        this.#preReleaseTag = preReleaseTag;
        this.#publish = Boolean( publish );
        this.#yes = Boolean( yes );
        this.#repeatOnError = !this.#yes;

        if ( this.#preReleaseTag === "stable" ) {
            this.#preReleaseTag = null;
            this.#stable = true;
        }
        else {
            this.#stable = false;
        }
    }

    // public
    async run () {
        var res;

        console.log( "Releasing package:", ansi.hl( this.#pkg.workspaceSlug ), "\n" );

        env.loadUserEnv();

        // check user config
        if ( !process.env.EDITOR ) return result( [ 500, "Editor is not configured" ] );

        // package is not releasable
        if ( !this.#pkg.isReleaseEnabled ) return result( [ 500, "Package release is disabled" ] );

        // get git status
        res = await this.#pkg.git.getStatus();
        if ( !res.ok ) return res;
        const status = res.data;

        // check for uncommited changes
        if ( status.isDirty ) return result( [ 500, "working copy or sub-repositories has uncommited changes or untracked files" ] );

        // get changelog
        res = await this.getChangelog();
        if ( !res.ok ) return res;

        this.#previousReleaseBranch = `v${ this.#previousRelease?.majorNumber || "0" }.x`;

        // detached head
        if ( !status.head.isBranchHead ) {
            return result( [ 500, "Release on tbe detached head is not possible" ] );
        }

        // not a release branch head
        else if ( status.head.branch !== this.#previousReleaseBranch ) {
            this.#originalBranch = status.head.branch;

            // check allowed release branches
            if ( this.#pkg.cliConfig?.release.releaseBranches != null && ( !this.#pkg.cliConfig.release.releaseBranches || !this.#pkg.cliConfig.release.releaseBranches.includes( this.#originalBranch ) ) ) {
                return result( [ 500, "Unable to create release from the current branch" ] );
            }

            // previous release commit must be a branch head for the previous release branch
            if ( this.#previousRelease ) {
                res = await this.#pkg.git.getCommit( { "commitRef": this.#previousRelease.versionString } );
                if ( !res.ok ) return res;
                const previousReleaseCommit = res.data;

                if ( !previousReleaseCommit.branches.has( this.#previousReleaseBranch ) ) {
                    return result( [ 500, `Release "${ this.#previousRelease.versionString }" must be a release branch "${ this.#previousReleaseBranch }" head` ] );
                }
            }
        }

        // create new version
        res = this.#changelog.createNextVersion( this.#stable
            ? false
            : this.#preReleaseTag );
        if ( !res.ok ) return res;
        this.#newRelease = res.data;

        this.#newReleaseBranch = `v${ this.#newRelease.majorNumber }.x`;

        // detect major release
        if ( this.#newRelease.isMajor && this.#previousRelease && this.#newRelease.majorNumber !== this.#previousRelease.majorNumber ) {
            this.#isMajorRelease = true;
        }

        // check version can be released
        res = status.releases.canRelease( this.#newRelease );
        if ( !res.ok ) return res;

        // get sub-packages
        const subPackages = this.#pkg.subPackages;

        // check for pre-release dependencies
        if ( this.#newRelease.isStableRelease ) {
            for ( const pkg of [ this.#pkg, ...subPackages ] ) {
                const res = pkg.checkPreReleaseDependencies();

                if ( !res.ok ) return res;
            }
        }

        // define tags, pre-release version can't have "latest" tag
        this.#latestTag = !this.#newRelease.isPreRelease && this.#newRelease.gt( status.releases.lastStableRelease || SemanticVersion.initialVersion )
            ? "latest"
            : "";

        this.#nextTag = this.#newRelease.gt( status.releases.lastRelease || SemanticVersion.initialVersion )
            ? "next"
            : "";

        MAJOR_LATEST_TAG: if ( !this.#newRelease.isPreRelease ) {
            for ( const release of status.releases ) {
                if ( this.#newRelease.majorNumber !== release.majorNumber ) continue;

                if ( release.isPreRelease ) continue;

                if ( this.#newRelease.lt( release ) ) break MAJOR_LATEST_TAG;
            }

            this.#majorLatestTag = `v${ this.#newRelease.majorNumber }.latest`;

            if ( this.#pkg.cliConfig?.release.majorTagEnabled ) {
                this.#majorTag = `v${ this.#newRelease.majorNumber }`;
            }
        }

        MAJOR_NEXT_TAG: {
            for ( const release of status.releases ) {
                if ( this.#newRelease.majorNumber !== release.majorNumber ) continue;

                if ( this.#newRelease.lt( release ) ) break MAJOR_NEXT_TAG;
            }

            this.#majorNextTag = `v${ this.#newRelease.majorNumber }.next`;
        }

        console.log( this.#changelog.createReport() );
        console.log();

        console.log( `New version:      ${ ansi.underline( this.#newRelease.versionString ) }, tags: ${ this.#createTagsText() || "-" }` );
        console.log( `Previous version: ${ this.#previousRelease?.versionString || "-" }` );

        if ( this.#isMajorRelease ) {
            console.log( `New release branch "${ this.#newReleaseBranch }" will be created` );
        }

        console.log();

        if ( subPackages.length ) {
            console.log( "Sub-packages found:" );

            subPackages.forEach( pkg => console.log( "  - " + path.relative( this.#pkg.root, pkg.root ) ) );

            console.log();
        }

        // confirm no changes
        if ( !this.#changelog.hasChanges ) {
            res = await confirm( "No changes since the previous release.\nContinue the release process?", [ "yes", "[no]" ] );

            if ( res !== "yes" ) return result( [ 400, "Terminated" ] );

            console.log();
        }

        // confirm no notable changes
        else if ( !this.#yes && !this.#changelog.hasNotableChanges ) {
            res = await confirm( "No notable changes since the previous release.\nContinue the release process?", [ "yes", "[no]" ] );

            if ( res !== "yes" ) return result( [ 400, "Terminated" ] );

            console.log();
        }

        // confirm release
        else if ( !this.#yes ) {
            res = await confirm( "Continue the release process?", [ "[yes]", "no" ] );

            if ( res !== "yes" ) return result( [ 400, "Terminated" ] );

            console.log();
        }

        // run tests
        res = await this.#pkg.runTests( { "log": true } );
        if ( !res.ok ) return res;

        if ( subPackages.length ) {
            for ( const pkg of subPackages ) {
                res = await pkg.runTests( { "log": true } );

                if ( !res.ok ) return res;
            }
        }

        console.log();

        // update documentation
        res = await this.#updateDocs();
        if ( !res.ok ) return res;

        // update changelog
        res = await this.#updateChangelog();
        if ( !res.ok ) return res;

        // prepare release branch
        if ( this.#originalBranch ) {

            // merge the original branch to the previous release branch
            if ( this.#previousRelease ) {

                // switch to the previous release branch
                res = await this.#execGitCommand( `Switching to the branch "${ this.#previousReleaseBranch }"`, [ "switch", this.#previousReleaseBranch ], { "repeatOnError": false } );
                if ( !res.ok ) return res;

                // merge
                res = await this.#execGitCommand( `Merging the branch "${ this.#originalBranch }" to the branch "${ this.#previousReleaseBranch }"`, [ "merge", "--no-edit", "--quiet", "--ff-only", this.#originalBranch ], { "repeatOnError": false } );
                if ( !res.ok ) return res;
            }

            // create release branch, if HEAD has no release branch
            else if ( !status.head.branches.has( this.#previousReleaseBranch ) ) {
                res = await this.#execGitCommand( `Creating and switching to the branch "${ this.#previousReleaseBranch }"`, [ "switch", "--create", this.#previousReleaseBranch ], { "repeatOnError": false } );
                if ( !res.ok ) return res;
            }
        }

        // prepare major release
        if ( this.#isMajorRelease ) {

            // create and switch major release branch
            res = await this.#execGitCommand( `Creating and switching to the new release branch "${ this.#newReleaseBranch }"`, [ "switch", "--create", this.#newReleaseBranch ], { "repeatOnError": false } );
            if ( !res.ok ) return res;

            // move previous release branch head
            if ( this.#previousRelease ) {
                res = await this.#execGitCommand(
                    `Moving branch head "${ this.#previousReleaseBranch }" to the release "${ this.#previousRelease.versionString }"`,
                    [

                        //
                        "branch",
                        "--force",
                        this.#previousReleaseBranch,
                        this.#previousRelease.versionString,
                    ],
                    { "repeatOnError": false }
                );
                if ( !res.ok ) return res;
            }
        }

        // write CHANGELOG.md
        fs.writeFileSync( this.#pkg.root + "/CHANGELOG.md", this.#fullChangelog );

        // update package version
        this.#pkg.patchVersion( this.#newRelease );

        // update sub-packages versions
        subPackages.forEach( pkg => pkg.patchVersion( this.#newRelease ) );

        // add changes
        res = await this.#execGitCommand( "Adding changes", [ "add", "." ], { "repeatOnError": false } );
        if ( !res.ok ) return res;

        // commit
        res = await this.#execGitCommand( "Commiting changes", [ "commit", "--cleanup=verbatim", "-m", `build(release): release ${ this.#newRelease.versionString }\n\n${ this.#changelogText }\n` ], { "repeatOnError": false } );
        if ( !res.ok ) return res;

        // set version tag
        res = await this.#setTag( this.#newRelease.versionString, {
            "force": false,
            "annotation": `Release ${ this.#newRelease.versionString }\n\n${ this.#changelogText }\n`,
        } );
        if ( !res.ok ) return res;

        // set tags
        for ( const tag of [ this.#latestTag, this.#nextTag, this.#majorTag, this.#majorLatestTag, this.#majorNextTag ] ) {
            if ( !tag ) continue;

            res = await this.#setTag( tag, {
                "force": true,
                "annotation": this.#pkg.createReleaseTagAnnotation( tag ),
            } );

            if ( !res.ok ) return res;
        }

        // push, if has upstream
        if ( this.#pkg.git.upstream ) {

            // track current release branch
            if ( this.#isMajorRelease ) {
                res = await this.#execGitCommand( `Setting upstream for the branch "${ this.#newReleaseBranch }"`, [

                    //
                    "push",
                    "--set-upstream",
                    "origin",
                    this.#newReleaseBranch,
                ] );
                if ( !res.ok ) return res;
            }

            // push references
            res = await this.#execGitCommand( "Pushing", [

                //
                "push",
                "--atomic",
                "--force",
                "origin",
                ...new Set( [

                    //
                    this.#newReleaseBranch,
                    this.#previousReleaseBranch,
                    this.#newRelease.versionString,
                    this.#latestTag,
                    this.#nextTag,
                    this.#majorTag,
                    this.#majorLatestTag,
                    this.#majorNextTag,
                ].filter( param => param != null && param !== "" ) ),
            ] );
            if ( !res.ok ) return res;

            // create release on GitHub
            if ( this.#pkg.git.upstream.hosting === "github" && process.env.GITHUB_TOKEN ) {
                const github = new GitHub( process.env.GITHUB_TOKEN );

                res = await repeatAction(
                    async () => {
                        process.stdout.write( "Creating release on GitHub ... " );

                        const res = await github.createRelease( this.#pkg.git.upstream.repositorySlug, this.#newRelease.versionString, {
                            "name": this.#newRelease.versionString,
                            "body": this.#changelogMarkdown,
                            "prerelease": this.#newRelease.isPreRelease,
                        } );

                        console.log( res + "" );

                        // repeat
                        if ( !res.ok ) {
                            throw res;
                        }
                        else {
                            return res;
                        }
                    },
                    {
                        "repeatOnError": this.#repeatOnError,
                    }
                );
                if ( !res.ok ) return res;
            }
        }

        // publish packages
        if ( this.#publish ) {
            for ( const pkg of [ this.#pkg, ...subPackages ] ) {
                if ( pkg.isPrivate ) continue;

                res = await pkg.npm.publish( {
                    "repeatOnError": this.#repeatOnError,
                } );

                if ( !res.ok ) return res;
            }
        }

        // restore original branch state
        if ( this.#originalBranch ) {
            res = await this.#execGitCommand( `Switching to the branch "${ this.#originalBranch }"`, [ "switch", this.#originalBranch ], { "repeatOnError": false } );
            if ( !res.ok ) return res;

            res = await this.#execGitCommand( `Merging the branch "${ this.#newReleaseBranch }" to the branch "${ this.#originalBranch }"`, [ "merge", "--no-edit", "--quiet", "--ff-only", this.#newReleaseBranch ], { "repeatOnError": false } );
            if ( !res.ok ) return res;

            if ( this.#pkg.git.upstream ) {
                res = await this.#execGitCommand( `Checking if branch "${ this.#originalBranch }" is tracking`, [ "config", "--get", `branch.${ this.#originalBranch }.remote` ], { "repeatOnError": false } );
                if ( !res.ok ) return res;

                // push, if original branch is tracked
                if ( res.data ) {
                    res = await this.#execGitCommand( `Pushing "${ this.#originalBranch }"`, [ "push" ] );
                    if ( !res.ok ) return res;
                }
            }
        }

        return result( 200 );
    }

    async getChangelog ( { force } = {} ) {
        if ( force || !this.#changelog ) {
            this.#changelog = null;
            this.#previousRelease = null;

            // get changes
            const res = await this.#pkg.git.getChangelog( {
                "release": true,
                "stable": this.#stable,
                "commitTypes": this.#pkg.cliConfig?.commits.types,
            } );

            if ( !res.ok ) return res;

            this.#changelog = res.data;
            this.#previousRelease = this.#changelog.startRelease;
        }

        return result( 200, this.#changelog );
    }

    // private
    #createTagsText () {
        const tags = [ this.#latestTag, this.#nextTag, this.#majorTag, this.#majorLatestTag, this.#majorNextTag ]
            .filter( tag => tag )
            .map( tag => "🏷 " + ansi.underline( tag ) )
            .join( ", " );

        if ( tags ) {
            return tags;
        }
        else {
            return "-";
        }
    }

    async #updateDocs () {
        const docs = this.#pkg.docs;

        if ( !docs.isEnabled ) return result( 200 );

        var res;

        // building docs
        res = await repeatAction(
            async () => {
                const res = await docs.build();

                // repeat
                if ( !res.ok ) {
                    throw res;
                }
                else {
                    return res;
                }
            },
            {
                "repeatOnError": this.#repeatOnError,
            }
        );
        if ( !res.ok ) return res;

        res = await this.#pkg.git.getWorkingTreeStatus();
        if ( !res.ok ) return res;

        // commit docs
        if ( res.data.isDirty ) {

            // add changes
            res = await this.#execGitCommand( "Adding documentation", [ "add", "." ], { "repeatOnError": false } );
            if ( !res.ok ) return res;

            // commit changes
            res = await this.#execGitCommand( "Commiting documentation", [ "commit", "-m", "docs: update docs" ] );
            if ( !res.ok ) return res;

            // update changelog
            res = this.getChangelog( { "force": true } );
            if ( !res.ok ) return res;
        }

        console.log();

        return result( 200 );
    }

    async #updateChangelog () {
        var res,
            changelogMarkdown = await this.#changelog.createChangelog( {
                "endRelease": this.#newRelease,
            } );

        while ( true ) {

            // lint
            res = await lintFile( new File( {
                "path": this.#pkg.root + "/CHANGELOG.md",
                "type": "text/markdown",
                "sources": changelogMarkdown,
            } ) );
            if ( !res.ok ) return result( [ 500, `Error linting "CHANGELOG.md"` ] );

            changelogMarkdown = res.data;

            console.log( `${ this.#changelog.convertMarkdownToText( "# Changelog:\n\n" + changelogMarkdown, {
                "ansi": true,
                "linkify": true,
            } ) }\n` );

            // confirm release
            if ( !this.#yes ) {
                res = await confirm( "Continue the release process?", [ "(e)dit changelog", "[yes]", "no" ] );

                if ( res === "edit changelog" ) {
                    res = await this.#editChangelog( changelogMarkdown );
                    if ( !res.ok ) return res;

                    changelogMarkdown = res.data;

                    console.log();

                    continue;
                }
                else if ( res !== "yes" ) {
                    return result( [ 400, "Terminated" ] );
                }

                console.log();
            }

            break;
        }

        this.#changelogMarkdown = changelogMarkdown;
        this.#changelogText = this.#changelog.convertMarkdownToText( changelogMarkdown, {
            "ansi": false,
            "linkify": false,
        } );

        this.#fullChangelog =
            `
# Changelog

### ${ this.#newRelease.versionString } (${ this.#newRelease.changelogDate })

${ this.#changelog.linkifyMarkdown( changelogMarkdown ) }
`.trim() + "\n";

        // append CHANGELOG.md
        if ( !this.#isMajorRelease ) {
            if ( await pathExists( this.#pkg.root + "/CHANGELOG.md" ) ) {
                this.#fullChangelog +=
                    fs
                        .readFileSync( this.#pkg.root + "/CHANGELOG.md", "utf8" )
                        .replace( /# Changelog\n/v, "" )
                        .trim() + "\n";
            }
        }

        return result( 200 );
    }

    async #editChangelog ( changelogMarkdown ) {
        const tmp = new TmpFile( { "extname": ".md" } );

        fs.writeFileSync( tmp.path, changelogMarkdown );

        const res = childProcess.spawnSync( shellQuote( [ process.env.EDITOR, tmp.path ] ), {
            "shell": true,
            "stdio": "inherit",
        } );

        if ( res.status ) return result( [ 500, "Unable to create changelog" ] );

        changelogMarkdown = fs.readFileSync( tmp.path, "utf8" );

        tmp.destroy();

        return result( 200, changelogMarkdown );
    }

    async #setTag ( tag, { annotation, force } = {} ) {
        if ( !tag ) return result( 200 );

        const args = [ "tag", "--cleanup=verbatim", "--annotate", "--message", annotation, tag ];

        if ( force ) args.push( "--force" );

        return this.#execGitCommand( `Adding "${ tag }" tag`, args, { "repeatOnError": false } );
    }

    async #execGitCommand ( title, args, { repeatOnError } = {} ) {
        return repeatAction(
            async () => {
                process.stdout.write( `${ title } ... ` );

                const res = await this.#pkg.git.exec( args );

                console.log( res + "" );

                // repeat
                if ( !res.ok ) {
                    throw res;
                }
                else {
                    return res;
                }
            },
            {
                "repeatOnError": repeatOnError ?? this.#repeatOnError,
            }
        );
    }
}

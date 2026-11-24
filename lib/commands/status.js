import ansi from "#core/ansi";
import Table from "#core/text/table";
import Command from "#lib/command";
import { CURRENT_BRANCH_SYMBOL, LAST_RELEASE_SYMBOL, PRIVATE_PACKAGE_SYMBOL, PULL_SYMBOL, PUSH_SYMBOL } from "#lib/symbols";

export default class StatusCommand extends Command {

    // static
    static cli () {
        return {
            "options": {
                "status": {
                    "short": "i",
                    "description": "Show info.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "branches": {
                    "short": "b",
                    "description": "Show branches status.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "localization": {
                    "short": "l",
                    "description": "Show localization status.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "links": {
                    "short": "L",
                    "description": "Show links.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitRoot();
        if ( !pkg ) return result( [ 500, "Unable to find git root" ] );

        var res, hasOutput, showDefaults;

        res = await pkg.git.getStatus( {
            "branchStatus": true,
        } );
        if ( !res.ok ) return res;

        const status = res.data,
            config = pkg.config;

        if ( !process.cli.options.status && !process.cli.options.branches && !process.cli.options.links && !process.cli.options.localization ) {
            showDefaults = true;
        }

        // info
        if ( process.cli.options.status ) {
            hasOutput = true;

            console.log( `
Package name:            ${ ansi.hl( config?.name || "-" ) }
Releasable:              ${ pkg.isReleaseEnabled
    ? ansi.ok( " RELEASABLE " )
    : ansi.error( " NOT RELEASABLE " ) }
Private:                 ${ pkg.isPrivate
    ? `${ PRIVATE_PACKAGE_SYMBOL } ` + ansi.error( " PRIVATE " )
    : ansi.ok( " PUBLIC " ) }
Stable release (latest): ${ ansi.hl( status.releases.lastStableRelease?.versionString || "-" ) }
Last release (next):     ${ ansi.hl( status.releases.lastRelease?.versionString || "-" ) }

Branch name:             ${ ansi.hl( status.head.branch ) }
Previous release:        ${ ansi.hl( status.previousRelease?.versionString || "-" ) }${ status.previousRelease && status.releases.lastRelease?.eq( status.previousRelease )
    ? ` ${ LAST_RELEASE_SYMBOL }`
    : "" }
Working tree status:     ${ status.isDirty
    ? ansi.error( " DIRTY " )
    : ansi.ok( " COMMITED " ) }
Unreleased commits:      ${ pkg.isReleaseEnabled
    ? ( status.previousReleaseDistance
        ? ansi.error( " " + status.previousReleaseDistance + " " )
        : ansi.ok( " RELEASED " ) )
    : "-" }
`.trim() );
        }

        // branches
        if ( showDefaults || process.cli.options.branches ) {
            if ( hasOutput ) {
                console.log();
            }

            hasOutput = true;

            console.log( "Branch status:" );
            console.log( await this.#createBranchStatus( pkg, status ) );
        }

        // links
        if ( process.cli.options.links ) {
            const upstream = pkg.git.upstream;

            if ( upstream ) {
                if ( hasOutput ) {
                    console.log();
                }

                hasOutput = true;

                console.log( `
Home:                    ${ ansi.hl( upstream.homeUrl ) }
Issues:                  ${ ansi.hl( upstream.issuesUrl ) }
Wiki:                    ${ ansi.hl( upstream.wikiUrl ) }
Docs:                    ${ ansi.hl( pkg.docsUrl || "-" ) }

Clone:                   ${ ansi.hl( upstream.sshCloneUrl ) }
Clone wiki:              ${ ansi.hl( upstream.wikiSshCloneUrl ) }
            `.trim() );
            }
        }

        // localization
        if ( process.cli.options.localization ) {
            const localizationStatus = await this.#createLocalizationStatus( pkg );

            if ( localizationStatus ) {
                if ( hasOutput ) {
                    console.log();
                }

                console.log( "Localization status:" );
                console.log( localizationStatus );
            }
        }
    }

    // private
    async #createBranchStatus ( pkg, status ) {
        const table = new Table( {
            "ansi": true,
            "width": 90,
            "columns": {
                "branchName": {
                    "title": ansi.hl( "BRANCH NAME" ),
                    "headerAlign": "center",
                    "headerValign": "end",
                    "format": branch => {
                        return `${ status.head.branch === branch
                            ? CURRENT_BRANCH_SYMBOL
                            : "  " } ${ branch }`;
                    },
                },
                "syncStatus": {
                    "title": ansi.hl( "SYNC STATUS" ),
                    "headerAlign": "center",
                    "headerValign": "end",
                    "width": 13,
                    "align": "end",
                    "format": status => {
                        if ( status.upstream ) {
                            if ( status.synchronized ) {
                                return " - ";
                            }
                            else {
                                const text = [];

                                if ( status.behind ) {
                                    text.push( `${ PULL_SYMBOL }pull:` + ansi.error( ` ${ status.behind } ` ) );
                                }

                                if ( status.ahead ) {
                                    text.push( `${ PUSH_SYMBOL }push:` + ansi.error( ` ${ status.ahead } ` ) );
                                }

                                return text.join( "\n" );
                            }
                        }
                        else {
                            return ansi.dim( " NOT TRACKED " );
                        }
                    },
                },
                "previousRelease": {
                    "title": ansi.hl( "PREVIOUS\nRELEASE" ),
                    "headerAlign": "center",
                    "headerValign": "end",
                    "width": 25,
                    "align": "end",
                    "format": status => {
                        if ( pkg.isReleaseEnabled ) {
                            if ( status.previousRelease ) {
                                return `${ status.previousRelease.versionString }${ status.releases.lastRelease.eq( status.previousRelease )
                                    ? ` ${ LAST_RELEASE_SYMBOL }`
                                    : "   " }`;
                            }
                            else {
                                return " -    ";
                            }
                        }
                        else {
                            return ansi.dim( " DISABLED " );
                        }
                    },
                },
                "unreleasedCommits": {
                    "title": ansi.hl( "UNRELEASED\nCOMMITS" ),
                    "headerAlign": "center",
                    "headerValign": "end",
                    "width": 12,
                    "align": "end",
                    "format": status => {
                        if ( pkg.isReleaseEnabled ) {
                            if ( status.previousReleaseDistance ) {
                                return ansi.error( ` ${ status.previousReleaseDistance } ` );
                            }
                            else {
                                return " - ";
                            }
                        }
                        else {
                            return ansi.dim( " DISABLED " );
                        }
                    },
                },
            },
        } );

        await Promise.all( Object.keys( status.branchStatus ).map( branchName => {
            return pkg.git
                .getPreviousRelease( {
                    "commitRef": branchName,
                } )
                .then( res => {
                    status.branchStatus[ branchName ].previousRelease = res;

                    return res;
                } );
        } ) );

        for ( const branchName of Object.keys( status.branchStatus ).sort( pkg.git.compareBranches ) ) {
            const res = status.branchStatus[ branchName ].previousRelease;
            if ( !res.ok ) throw res;
            const previousRelease = res.data;

            table.write( {
                branchName,
                "syncStatus": status.branchStatus[ branchName ],
                "previousRelease": previousRelease,
                "unreleasedCommits": previousRelease,
            } );
        }

        table.end();

        return `${ table.content.trim() }
${ CURRENT_BRANCH_SYMBOL } - current branch
${ LAST_RELEASE_SYMBOL } - last release
`.trim();
    }

    async #createLocalizationStatus ( pkg ) {
        const localizationStatus = await pkg.localization.status(),
            table = new Table( {
                "ansi": true,
                "width": 90,
                "columns": {
                    "isTranslated": {
                        "title": ansi.hl( "STATUS" ),
                        "headerAlign": "center",
                        "headerValign": "end",
                        "width": 13,
                        "align": "end",
                        "format": isTranslated => {
                            return isTranslated
                                ? " - "
                                : ansi.error( " FUZZY " );
                        },
                    },
                    "poFilePath": {
                        "title": ansi.hl( "PATH" ),
                        "headerAlign": "center",
                        "headerValign": "end",
                    },
                },
            } );

        if ( localizationStatus.data ) {
            for ( const [ poFilePath, isTranslated ] of Object.entries( localizationStatus.data ) ) {
                table.write( {
                    poFilePath,
                    isTranslated,
                } );
            }
        }

        table.end();

        return table.content;
    }
}

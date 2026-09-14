import fs from "node:fs";
import File from "#core/file";
import { glob, pathExists } from "#core/fs";
import Command from "#lib/command";
import Git from "#lib/git";
import { lintFile } from "#lib/lint";
import Package from "#lib/package";
import * as utils from "#lib/utils";

export default class extends Command {

    // static
    static cli () {
        return {};
    }

    // public
    async run () {
        const git = Git.new();

        // get list of staged files
        let staged = await git.exec( [ "diff", "--cached", "--name-only", "--diff-filter=ACMR" ] );
        if ( !staged.ok ) throw result( [ 500, "Unable to get list of staged files" ] );

        // nothing to commit
        if ( !staged.data ) return;

        staged = staged.data.split( "\n" ).filter( file => file !== "" );

        staged = await glob( staged, {
            "ignoreFile": ".lintignore",
        } );

        // nothing to do
        if ( !staged.length ) return;

        // get list of modified files
        let modified = await git.exec( [ "diff", "--name-only", "--diff-filter=ACM" ] );
        if ( !modified.ok ) throw result( [ 500, "Unable to get list of modified files" ] );
        modified = Object.fromEntries( modified.data
            .split( "\n" )
            .filter( file => file !== "" )
            .map( file => [ file, true ] ) );

        const report = {
                "total": 0,
                "ignored": 0,
                "processed": 0,
                "modified": 0,
                "ok": 0,
                "warnings": 0,
                "errors": 0,
            },
            table = utils.getLintReportTable( { "ansi": true } );

        let status = 200;

        const cache = {};

        for ( const filename of staged ) {
            let res, encrypted;

            // get staged file content
            let content = await git.exec( [ "show", ":" + filename ], {
                "encoding": "buffer",
            } );

            // git ok
            if ( content.ok ) {
                const data = content.data.subarray( 0, 1000 ).toString( "latin1" );

                // git-lfs
                if ( /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid .+\nsize \d+$/mv.test( data ) ) {
                    content = await git.exec( [ "lfs", "smudge" ], {
                        "encoding": "buffer",
                        "input": content.data,
                    } );

                    if ( !content.ok ) res = content;
                }

                // git-crypt
                else if ( data.startsWith( "\u{0}GITCRYPT\u{0}" ) ) {
                    encrypted = true;

                    content = await git.exec( [ "crypt", "smudge" ], {
                        "encoding": "buffer",
                        "input": content.data,
                    } );

                    if ( !content.ok ) res = content;
                }
            }

            // git error
            else {
                res = content;
            }

            // lint file
            if ( !res ) {
                res = await lintFile(
                    new File( {
                        "path": filename,
                        "sources": content.data,
                    } ),
                    {
                        "cwd": process.cwd(),
                        cache,
                    }
                );
            }

            if ( res.status > status ) status = res.status;

            report.total++;

            // file was ignored
            if ( res.status === 201 ) {
                report.ignored++;

                continue;
            }

            report.processed++;

            if ( res.status !== 201 ) {
                if ( res.status === 200 ) {
                    report.ok++;
                }
                else if ( res.ok ) {
                    report.warnings++;
                }
                else {
                    report.errors++;
                }
            }

            // file was modified
            if ( res.meta.isModified ) {
                report.modified++;

                // get mode
                const mode = await git.exec( [ "ls-files", "--format", "%(objectmode)", filename ] );
                if ( !mode.ok || !mode.data ) throw result( [ 500, "Unable to get file mode" ] );
                mode.data = mode.data.trim();

                let content;

                if ( encrypted ) {
                    const res1 = await git.exec( [ "crypt", "clean" ], {
                        "encoding": "buffer",
                        "input": res.data,
                    } );
                    if ( !res1.ok ) throw result( [ 500, "Unable to encrypt file" ] );

                    content = res1.data;
                }
                else {
                    content = res.data;
                }

                // create git object
                const hash = await git.createObject( content );
                if ( !hash.ok || !hash.data ) throw result( [ 500, "Unable to create git object" ] );

                // update git staging index
                const res1 = await git.exec( [ "update-index", "--add", "--cacheinfo", `${ mode.data },${ hash.data },${ filename }` ] );
                if ( !res1.ok ) throw result( [ 500, "Unable to update git index" ] );

                // update working tree, if file wasn't modified after add and wasn't removed
                if ( !modified[ filename ] && ( await pathExists( filename ) ) ) {
                    fs.writeFileSync( filename, res.data );
                }
            }

            // report
            table.write( { "modified": res, "status": res, "path": filename } );
        }

        table.end();

        utils.printLintReport( report );

        console.log();

        if ( status >= 300 ) {
            throw result( [ 500, "Linter reported errors in staged files. Commit terminated." ] );
        }

        // chmod
        const rootPackage = new Package( process.cwd() );
        if ( rootPackage.isPackage ) {
            for ( const pkg of [ rootPackage, ...rootPackage.subPackages ] ) {
                const res = await pkg.updateFilesMode();

                if ( !res.ok ) throw res;
            }
        }
    }
}

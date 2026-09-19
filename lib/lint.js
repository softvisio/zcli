import path from "node:path";
import File from "#core/file";
import { glob } from "#core/fs";
import lintFile, { LintFile } from "#lib/lint/file";
import * as utils from "./utils.js";

export class LintPatterns {
    #cwd;
    #patterns;
    #useLintignore;
    #verbose;
    #reportIgnored;
    #useDefaults;
    #eslintCode;
    #eslintExperimental;
    #fix;
    #log;

    constructor ( patterns, { cwd, verbose, reportIgnored, useLintignore, useDefaults, eslintCode = true, eslintExperimental, fix = true, log = true } = {} ) {
        this.#patterns = Array.isArray( patterns )
            ? patterns
            : [ patterns ];
        this.#cwd = cwd;
        this.#useLintignore = useLintignore;
        this.#verbose = verbose;
        this.#reportIgnored = reportIgnored;
        this.#useDefaults = Boolean( useDefaults );
        this.#eslintCode = Boolean( eslintCode );
        this.#eslintExperimental = Boolean( eslintExperimental );
        this.#fix = Boolean( fix );
        this.#log = Boolean( log );
    }

    // public
    async run ( action ) {
        const cwd = path.resolve( this.#cwd || "." ).replaceAll( "\\", "/" );

        const files = await glob( this.#patterns, {
            cwd,
            "ignoreFile": this.#useLintignore
                ? ".lintignore"
                : false,
        } );

        if ( !files.length ) return result( 200 );

        const report = {
                "total": 0,
                "ignored": 0,
                "processed": 0,
                "modified": 0,
                "ok": 0,
                "warnings": 0,
                "errors": 0,
            },
            table = utils.getLintReportTable();

        let status = 200;

        const cache = {};

        for ( const filepath of files.sort( ( a, b ) => path.dirname( a ).toLowerCase().localeCompare( path.dirname( b ).toLowerCase() ) || path.basename( a ).toLowerCase().localeCompare( path.basename( b ).toLowerCase() ) ) ) {
            const res = await lintFile(
                new File( {
                    "path": path.join( cwd, filepath ),
                } ),
                {
                    action,
                    "write": true,
                    "useDefaults": this.#useDefaults,
                    "eslintCode": this.#eslintCode,
                    "eslintExperimental": this.#eslintExperimental,
                    "fix": this.#fix,
                    "log": this.#log,
                    cache,
                }
            );

            if ( res.status > status ) status = res.status;

            report.total++;

            // file is ignored
            if ( res.status === 201 ) {
                report.ignored++;
            }
            else {
                report.processed++;

                // ok
                if ( res.status === 200 ) {
                    report.ok++;
                }

                // warnings
                else if ( res.ok ) {
                    report.warnings++;
                }

                // errors
                else {
                    report.errors++;
                }

                if ( res.meta.isModified ) report.modified++;
            }

            let printReport;

            // report errors and modified files
            if ( this.#verbose || !res.ok || res.meta.isModified ) {
                printReport = true;
            }

            // report ignored files
            if ( res.status === 201 ) {
                printReport = this.#reportIgnored;
            }

            if ( !printReport ) continue;

            table.write( {
                "modified": res,
                "status": res,
                "path": filepath,
            } );
        }

        table.end();

        utils.printLintReport( report );

        return result( [ status, LintFile.getStatusText( status ) ] );
    }
}

export { lintFile };

export async function lintPatterns ( patterns, { action, ...options } = {} ) {
    const lintPatterns = new LintPatterns( patterns, options );

    return lintPatterns.run( action );
}

import fs from "node:fs";
import Ajv from "#core/ajv";
import ansi from "#core/ansi";
import { readConfig, readConfigSync } from "#core/config";
import env from "#core/env";
import { globSync } from "#core/fs";
import GlobPatterns from "#core/glob/patterns";
import Table from "#core/text/table";
import { mergeObjects } from "#core/utils";
import Package from "#lib/package";

env.loadUserEnv();

const cliConfigSchema = new Ajv().addSchema( await readConfig( import.meta.resolve( "#resources/schemas/zcli.config.schema.yaml" ) ) ),
    defaultCliConfig = await readConfig( "#resources/zcli.config.yaml", { "resolve": import.meta.url } );

export function getLintReportTable ( options = {} ) {
    return new Table( {
        "style": "borderless",
        ...options,
        "columns": {
            "status": {
                "title": ansi.hl( "Status" ),
                "width": 9,
                "align": "center",
                format ( res ) {
                    if ( res.status === 200 ) return "OK";
                    else if ( res.status === 201 ) return ansi.dim( "IGNORED" );
                    else if ( res.ok ) return ansi.warn( " WARNING " );
                    else return ansi.error( " ERROR " );
                },
            },
            "modified": {
                "title": ansi.hl( "Modified" ),
                "width": 12,
                "margin": [ 1, 1 ],
                "align": "center",
                "format": res => {
                    return res.meta.isModified
                        ? ansi.error( " MODIFIED " )
                        : " - ";
                },
            },
            "path": {
                "title": ansi.hl( "Path" ),
                "flex": 1,
            },
        },
    } ).pipe( process.stdout );
}

export function printLintReport ( report ) {
    console.log( `
Total files: ${ report.total }, ignored: ${ report.ignored }, processed: ${ report.processed }
Modified: ${ report.modified || "-" }, warnings: ${ report.warnings
    ? ansi.warn( ` ${ report.warnings } ` )
    : "-" }, errors: ${ report.errors
    ? ansi.error( ` ${ report.errors } ` )
    : "-" }` );
}

export function findWorkspacePackages ( { patterns, git = true, "package": isPackage = true } = {} ) {
    const workspace = process.env[ "COREJSLIB_CLI_WORKSPACE_" + process.platform.toUpperCase() ];

    if ( !workspace ) return result( [ 500, "No workspace configured" ] );

    if ( patterns ) {
        patterns = new GlobPatterns( {
            "allowGlobalBasename": true,
            "allowIfListEmpty": true,
        } ).add( patterns );
    }

    const packagesPaths = globSync( "*/*", {
        "cwd": workspace,
        "files": false,
        "directories": true,
    } );

    const packages = [];

    for ( const packagePath of packagesPaths ) {

        // filter by patterns
        if ( patterns && !patterns.test( packagePath, { "caseSensitive": false } ) ) {
            continue;
        }

        if ( git && !env.isGitRoot( workspace + "/" + packagePath ) ) continue;

        if ( isPackage && !env.isPackageRoot( workspace + "/" + packagePath ) ) continue;

        const pkg = new Package( workspace + "/" + packagePath );

        packages.push( pkg );
    }

    return result( 200, packages );
}

export function getCliConfig ( path, { validate = true } = {} ) {
    if ( !fs.existsSync( path ) ) return null;

    const cliConfig = mergeObjects( {}, defaultCliConfig, readConfigSync( path ) );

    if ( validate ) {
        if ( !cliConfigSchema.validate( "config", cliConfig ) ) throw `CLI config is not valid:\n${ cliConfigSchema.errors }`;
    }

    return cliConfig;
}

import fs from "node:fs";
import path from "node:path";
import { glob, pathExists } from "#core/fs";
import PoFile from "#core/locale/po-file";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "arguments": {
                "language": {
                    "description": "Localization language",
                    "required": true,
                    "schema": {
                        "type": "string",
                    },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitPackage();
        if ( !pkg ) return result( [ 500, "Unable to find git root" ] );

        const language = process.cli.arguments.language;

        const potFiles = await glob( "**/*.pot", {
            "cwd": pkg.root,
            "absolute": true,
        } );

        if ( !potFiles.length ) {
            return result( [ 200, "Localizations not found" ] );
        }

        let added = 0;

        for ( const potPath of potFiles ) {
            const poPath = path.join( path.dirname( potPath ), `${ language }.po` );

            if ( await pathExists( poPath ) ) continue;

            const poFile = await PoFile.fromTemplateFile( potPath, language );

            await fs.promises.writeFile( poPath, poFile.toString() );

            added++;
        }

        if ( added ) {
            console.log( `"${ language }" localization added` );

            return result( 200 );
        }
        else {
            console.log( `"${ language }" localization already exists` );

            return result( 200 );
        }
    }
}

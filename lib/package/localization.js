import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import CloudTranslationApi from "#core/api/google/cloud/translation";
import env from "#core/env";
import { glob, pathExists } from "#core/fs";
import PoFile from "#core/locale/po-file";
import sql from "#core/sql";
import * as utils from "#core/utils";
import GetText from "#lib/get-text";

env.loadUserEnv();

if ( process.env.GCLOUD_TRANSLATION_API_KEY ) {
    var cloudTranslationApi = new CloudTranslationApi( process.env.GCLOUD_TRANSLATION_API_KEY );
}

const SQL = {
    "schema": sql`
CREATE TABLE IF NOT EXISTS message (
    language text NOT NULL,
    singular text NOT NULL,
    plural text NOT NULL,
    translations json NOT NULL,
    PRIMARY KEY ( language, singular, plural )
);
`,

    "updateTranslations": sql`
INSERT INTO message
    (
        language,
        singular,
        plural,
        translations
    )
VALUES
    ( ?, ?, ?, ? )
ON CONFLICT ( language, singular, plural ) DO UPDATE SET
    translations = EXCLUDED.translations
`.prepare(),

    "getTranslatedMessage": sql`SELECT * FROM message WHERE language = ? AND singular = ? AND plural = ?`.prepare(),
};

export default class {
    #pkg;
    #dbh;

    constructor ( pkg ) {
        this.#pkg = pkg;
    }

    // public
    async status () {
        var status;

        const poFiles = await glob( "**/*.po", {
            "cwd": this.#pkg.root,
            "directiries": false,
        } );

        var isTranslated = true;

        for ( const poFilePath of poFiles ) {
            status ??= {};

            const absPoFilePath = path.join( this.#pkg.root, poFilePath );

            const poFile = await PoFile.fromFile( absPoFilePath );

            status[ poFilePath ] = poFile.isTranslated;

            if ( !status[ poFilePath ] ) isTranslated = false;
        }

        return result( isTranslated
            ? 200
            : 500, status );
    }

    async update () {
        await this.#initTranslationMemory();

        const extracted = {};

        const poFiles = await glob( "**/*.po", {
            "cwd": this.#pkg.root,
            "directiries": false,
        } );

        for ( const poFilePath of poFiles ) {
            const absPoFilePath = path.join( this.#pkg.root, poFilePath );

            const poFile = await PoFile.fromFile( absPoFilePath );

            if ( !poFile.searchPath ) continue;

            // .po file package root
            let poFilePackageRoot = path.dirname( absPoFilePath );

            // find po file nearest package
            while ( true ) {
                if ( await pathExists( poFilePackageRoot + "/package.json" ) ) break;

                const parent = path.dirname( poFilePackageRoot );
                if ( parent === poFilePackageRoot ) break;
                poFilePackageRoot = parent;
            }

            const prefix = path.relative( poFilePackageRoot, path.dirname( absPoFilePath ) ).replaceAll( "\\", "/" ),
                globPatterns = [];

            for ( let searchPath of poFile.searchPath.split( ":" ) ) {
                if ( !searchPath.startsWith( "/" ) ) searchPath = "/" + prefix + "/" + searchPath;

                globPatterns.push( searchPath );
            }

            const sources = await glob( globPatterns, {
                "cwd": poFilePackageRoot,
                "directories": false,
                "normalizePatterns": true,
            } );

            const extractedMessages = new PoFile();

            for ( const source of sources ) {
                const souceAbsPath = path.join( poFilePackageRoot, source ),
                    sourceRelPath = path.relative( path.dirname( absPoFilePath ), souceAbsPath ).replaceAll( "\\", "/" ),
                    key = souceAbsPath + "/" + sourceRelPath;

                if ( extracted[ key ] == null ) {
                    const res = new GetText( {
                        "absolutePath": souceAbsPath,
                        "packageRelativePath": source,
                        "relativePath": sourceRelPath,
                    } ).extract();

                    if ( !res.ok ) {
                        console.log( res + "" );

                        return res;
                    }

                    extracted[ key ] = res.data || false;
                }

                if ( extracted[ key ] ) {
                    extractedMessages.addExtractedMessages( extracted[ key ] );
                }
            }

            poFile.setExtractedMessages( extractedMessages );

            // update translation memory
            if ( poFile.messages ) {
                for ( const message of Object.values( poFile.messages ) ) {
                    if ( message.isDisabled ) continue;

                    const translatedMessage = this.#dbh.selectRow( SQL.getTranslatedMessage, [

                        //
                        poFile.language,
                        message.id,
                        message.pluralId || "",
                    ] ).data;

                    // message is fully translated
                    if ( message.isTranslated && !message.isFuzzy ) {
                        if ( translatedMessage ) {
                            await this.#resolveConflict( poFile, message, translatedMessage );
                        }

                        // store to the translatuin memory
                        else {
                            this.#storeMessage( poFile.language, message );
                        }
                    }

                    // message is not translated
                    else {

                        // get message from the translation memory
                        if ( translatedMessage ) {
                            message.isFuzzy = false;
                            message.setTranslations( translatedMessage.translations );
                        }

                        // pre-translate singular form
                        else if ( cloudTranslationApi && !message.isSingularTranslated ) {
                            await this.#preTranslate( poFile, message );
                        }
                    }
                }
            }

            fs.writeFileSync( absPoFilePath, poFile.toString() );
        }

        return result( 200 );
    }

    // private
    async #initTranslationMemory () {
        const location = url.pathToFileURL( env.getDataDir( "corejslib" ) + "/zcli/translation-memory.sqlite" );

        if ( !( await pathExists( path.dirname( url.fileURLToPath( location ) ) ) ) ) {
            fs.mkdirSync( path.dirname( url.fileURLToPath( location ) ), {
                "recursive": true,
            } );
        }

        this.#dbh = sql.new( location );

        this.#dbh.exec( SQL.schema );
    }

    async #preTranslate ( poFile, message ) {
        const res = await cloudTranslationApi.translate( poFile.language, message.id );

        // error
        if ( !res.ok ) {
            console.warn( "Cloud translation API error:", res + "" );
        }

        // not translated
        else if ( !res.data || res.data === message.id ) {
            console.warn( `Cloud translation failed:

[en] message:
${ message.id }
` );
        }

        // translated from clous
        else {
            message.isFuzzy = true;
            message.setSingularTranslation( res.data );

            console.log( `Cloud translation:

[en] message:
${ message.id }

[${ poFile.language }] translation:
${ res.data }
` );
        }
    }

    async #resolveConflict ( poFile, message, translatedMessage ) {

        // translations not changed
        if ( JSON.stringify( message.translations ) === JSON.stringify( translatedMessage.translations ) ) return;

        console.log( `Translation memory conflict found:

[en] message:
${ message.id }

[en] plural form:
${ message.pluralId || "-" }

[${ poFile.language }]: old translations:
${ JSON.stringify( translatedMessage.translations, null, 4 ) }

[${ poFile.language }]: new translations:
${ JSON.stringify( message.translations, null, 4 ) }
` );

        const answer = await utils.confirm( "What translations do you want to use?", [ "new", "old", "[cancel]" ] );

        if ( !answer || answer === "cancel" ) {
            process.exit( 1 );
        }
        else if ( answer === "new" ) {
            this.#storeMessage( poFile.language, message );
        }
        else {
            message.setTranslations( translatedMessage.translations );
        }
    }

    #storeMessage ( language, { id, pluralId, translations } ) {
        this.#dbh.do( SQL.updateTranslations, [

            //
            language,
            id,
            pluralId || "",
            translations,
        ] );
    }
}

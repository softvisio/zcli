import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import env from "#core/env";
import { glob, pathExists } from "#core/fs";
import PoFile from "#core/locale/po-file";
import sql from "#core/sql";
import * as utils from "#core/utils";
import Copilot from "#lib/copilot";
import GetText from "#lib/get-text";
import prompts from "#lib/prompts";

const SQL = {
    "schema": sql`
CREATE TABLE IF NOT EXISTS message (
    language text NOT NULL,
    updated text DEFAULT CURRENT_TIMESTAMP,
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
        updated,
        singular,
        plural,
        translations
    )
VALUES
    ( ?, ?, ?, ?, ? )
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

    async update ( { deleteObsoleteMessages } = {} ) {
        let res;

        await this.#initTranslationMemory();

        // build localizations
        const localizations = await this.#buildLocalizations();

        // extract messages from sources
        res = await this.extractMessages( localizations );
        if ( !res.ok ) return res;

        for ( const localization of localizations ) {
            if ( localization.hash !== localization.poFile.hash ) {
                await fs.promises.writeFile( localization.absolutePath, localization.poFile.toString() );
            }
        }

        // translate localizations
        res = await this.#translateLocalizations( localizations );
        if ( !res.ok ) return res;

        // re-read .po files
        for ( const localization of localizations ) {
            localization.poFile = await PoFile.fromFile( localization.absolutePath );
        }

        // re-extract messages if sources were updates
        if ( res.data.sourcesUpdated ) {

            // extract messages from sources
            res = await this.extractMessages( localizations );
            if ( !res.ok ) return res;
        }

        // delete obsolete messages
        if ( deleteObsoleteMessages ) {
            this.#deleteObsoleteMessages( localizations );
        }

        // sync with translation memory
        for ( const localization of localizations ) {

            // update translation memory
            if ( localization.poFile.messages ) {
                for ( const message of Object.values( localization.poFile.messages ) ) {
                    if ( message.isObsolete ) continue;

                    // get message translation from translation memory
                    const translatedMessage = this.#dbh.selectRow( SQL.getTranslatedMessage, [

                        //
                        localization.poFile.language,
                        message.id,
                        message.pluralId || "",
                    ] ).data;

                    // message is fully translated
                    if ( message.isTranslated && !message.isFuzzy ) {

                        // compare with translation memory
                        if ( translatedMessage ) {
                            await this.#resolveConflict( localization.poFile, message, translatedMessage );
                        }

                        // store to the translatuin memory
                        else {
                            this.#storeMessage( localization.poFile.language, message );
                        }
                    }

                    // message is not translated
                    else {

                        // update message from the translation memory
                        if ( translatedMessage ) {
                            message.setFuzzy( false );
                            message.setTranslations( translatedMessage.translations );
                        }
                    }
                }
            }

            // .po file was updated
            if ( localization.hash !== localization.poFile.hash ) {
                localization.poFile.setRevisionDate();

                await fs.promises.writeFile( localization.absolutePath, localization.poFile.toString() );
            }
        }

        return result( 200 );
    }

    // private
    async #initTranslationMemory () {
        const location = url.pathToFileURL( env.getDataDir( "corejslib" ) + "/zcli/localization/translation-memory.sqlite" );

        if ( !( await pathExists( path.dirname( url.fileURLToPath( location ) ) ) ) ) {
            fs.mkdirSync( path.dirname( url.fileURLToPath( location ) ), {
                "recursive": true,
            } );
        }

        this.#dbh = sql.new( location );

        this.#dbh.exec( SQL.schema );
    }

    async #buildLocalizations () {
        const poFiles = await glob( "**/*.po", {
            "cwd": this.#pkg.root,
            "directiries": false,
        } );

        const localizations = [];

        // build po files
        for ( const relativePath of poFiles ) {
            const localization = {
                relativePath,
                "absolutePath": path.join( this.#pkg.root, relativePath ),
                "packageRoot": null,
                "prefix": null,
                "globPatterns": [],
                "poFile": null,
                "hash": null,
                "sources": [],
            };

            localization.poFile = await PoFile.fromFile( localization.absolutePath );

            if ( !localization.poFile.searchPath ) continue;

            localizations.push( localization );

            localization.hash = localization.poFile.hash;

            // .po file package root
            localization.packageRoot = env.findPackageRoot( path.dirname( localization.absolutePath ) );

            localization.prefix = path.relative( localization.packageRoot, path.dirname( localization.absolutePath ) ).replaceAll( "\\", "/" );

            for ( let searchPath of localization.poFile.searchPath.split( ":" ) ) {
                if ( !searchPath.startsWith( "/" ) ) searchPath = "/" + localization.prefix + "/" + searchPath;

                localization.globPatterns.push( searchPath );
            }

            localization.sources = await glob( localization.globPatterns, {
                "cwd": localization.packageRoot,
                "directories": false,
                "normalizePatterns": true,
            } );
        }

        return localizations;
    }

    async extractMessages ( localizations ) {
        const cache = {};

        for ( const localization of localizations ) {
            const extractedMessages = new PoFile();

            for ( const source of localization.sources ) {
                const souceAbsPath = path.join( localization.packageRoot, source ),
                    sourceRelPath = path.relative( path.dirname( localization.absolutePath ), souceAbsPath ).replaceAll( "\\", "/" ),
                    key = souceAbsPath + "/" + sourceRelPath;

                // extract messages from source if source is not cached
                if ( cache[ key ] == null ) {
                    const res = new GetText( {
                        "absolutePath": souceAbsPath,
                        "packageRelativePath": source,
                        "relativePath": sourceRelPath,
                    } ).extract();

                    if ( !res.ok ) {
                        console.log( res + "" );

                        return res;
                    }

                    cache[ key ] = res.data || false;
                }

                if ( cache[ key ] ) {
                    extractedMessages.addExtractedMessages( cache[ key ] );
                }
            }

            localization.poFile.setExtractedMessages( extractedMessages );
        }

        return result( 200 );
    }

    async #translateLocalizations ( localizations ) {
        if ( !localizations.length ) {
            return result( 200, {
                "poUpdated": false,
                "sourcesUpdated": false,
            } );
        }

        const prompt = await prompts.get( "translate-po-files" ).render( {
            localizations,
        } );

        const copilot = new Copilot();

        let session;

        try {
            let res = await copilot.start();
            if ( !res.ok ) return res;

            session = await copilot.createSession( {
                "cwd": this.#pkg.root,
                "allowEdit": true,
            } );

            res = await session.prompt( prompt );
            if ( !res.ok ) return res;

            return result( 200, JSON.parse( res.data.text ) );
        }
        finally {
            try {
                if ( session ) await session.close();
            }
            finally {
                await copilot.stop();
            }
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
            new Date().toISOString(),
            id,
            pluralId || "",
            translations,
        ] );
    }

    #deleteObsoleteMessages ( localizations ) {
        for ( const localization of localizations ) {
            localization.poFile.deleteObsoleteMessages();
        }
    }
}

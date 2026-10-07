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

    async update ( { manual, translate, deleteObsoleteMessages } = {} ) {
        let res;

        await this.#initTranslationMemory();

        // build localizations
        const localizations = await this.#buildLocalizations();

        // extract messages from sources
        res = await this.extractMessages( localizations );
        if ( !res.ok ) return res;

        // translate
        if ( translate ) {

            // sync with translation memory
            await this.#syncTranslationMemory( localizations, { manual } );

            await this.#writePoFiles( localizations );

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
        }

        // delete obsolete messages
        if ( deleteObsoleteMessages ) {
            this.#deleteObsoleteMessages( localizations );
        }

        // sync with translation memory
        await this.#syncTranslationMemory( localizations, { manual } );

        await this.#writePoFiles( localizations );

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

        await using copilot = new Copilot();

        let res = await copilot.start();
        if ( !res.ok ) return res;

        await using session = await copilot.createSession( {
            "cwd": this.#pkg.root,
            "allowEdit": true,
        } );

        res = await session.prompt( prompt );
        if ( !res.ok ) return res;

        return result( 200, JSON.parse( res.data.text ) );
    }

    async #syncTranslationMemory ( localizations, { manual } = {} ) {
        for ( const localization of localizations ) {
            for ( const message of localization.poFile ) {
                if ( message.isObsolete ) continue;

                if ( message.isFuzzy ) continue;

                // get message translation from translation memory
                const translatedMessage = this.#dbh.selectRow( SQL.getTranslatedMessage, [

                    //
                    localization.poFile.language,
                    message.id,
                    message.pluralId || "",
                ] ).data;

                // message is fully translated
                if ( message.isTranslated ) {
                    if ( translatedMessage ) {
                        if ( manual ) {
                            await this.#resolveConflict( localization.poFile, translatedMessage, message );
                        }
                        else {

                            // use translation memory
                            message.setTranslations( translatedMessage.translations );
                        }
                    }
                    else {

                        // store message to the translation memory
                        this.#storeMessage( localization.poFile.language, message );
                    }
                }

                // message is not translated
                else {

                    // message exists in the translation memory
                    if ( translatedMessage ) {

                        // use translation memory
                        message.setTranslations( translatedMessage.translations );
                    }
                }
            }
        }
    }

    async #resolveConflict ( poFile, oldMessage, newMessage ) {
        const conflict = JSON.stringify( oldMessage.translations ) !== JSON.stringify( newMessage.translations );

        if ( !conflict ) return;

        console.log( `Translation memory conflict found:

[en] message:
${ oldMessage.id }

[en] plural form:
${ oldMessage.pluralId || "-" }

[${ poFile.language }]: old translations:
${ JSON.stringify( oldMessage.translations, null, 4 ) }

[${ poFile.language }]: new translations:
${ JSON.stringify( newMessage.translations, null, 4 ) }
` );

        const answer = await utils.confirm( "What translations do you want to use?", [ "cancel", "[skip]", "old", "new" ] );

        // cancel
        if ( !answer || answer === "cancel" ) {
            process.exit( 1 );
        }

        // skip
        else if ( answer === "skip" ) {
            return;
        }

        // old
        else if ( answer === "old" ) {
            newMessage.setTranslations( oldMessage.translations );
        }

        // new
        else {
            this.#storeMessage( poFile.language, newMessage );
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

    async #writePoFiles ( localizations ) {
        for ( const localization of localizations ) {
            if ( localization.hash !== localization.poFile.hash ) {
                localization.poFile.setRevisionDate();

                await fs.promises.writeFile( localization.absolutePath, localization.poFile.toString() );
            }
        }
    }
}

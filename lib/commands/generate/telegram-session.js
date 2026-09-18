import TelegramClient from "@corejslib/app-telegram/api/telegram/client";
import { copyToClipboard } from "#core/utils";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "copy": {
                    "description": "copy Telegram session to the clipboard",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
            "arguments": {
                "api-id": {
                    "description": "Telegram API ID.",
                    "required": true,
                    "schema": { "type": "integer" },
                },
                "api-hash": {
                    "description": "Telegram API hash.",
                    "required": true,
                    "schema": { "type": "string" },
                },
                "account-id": {
                    "description": "Telegram account phone number or Telegram bot API token.",
                    "schema": { "type": "string" },
                },
                "password": {
                    "description": "Telegram account password.",
                    "schema": { "type": "string" },
                },
            },
        };
    }

    // public
    async run () {
        var res = await new TelegramClient( {
            "apiId": process.cli.arguments[ "api-id" ],
            "apiHash": process.cli.arguments[ "api-hash" ],
        } ).createSession( {
            "accountId": process.cli.arguments[ "account-id" ],
            "password": process.cli.arguments[ "password" ],
        } );
        if ( !res.ok ) return res;

        const session = res.data;

        const client = new TelegramClient( {
            "apiId": process.cli.arguments[ "api-id" ],
            "apiHash": process.cli.arguments[ "api-hash" ],
            "session": res.data,
        } );

        res = await client.connect();
        if ( !res.ok ) return res;

        res = await client.getMe();
        if ( !res.ok ) return res;

        console.log( `
User ID: ${ res.data.id }
Username: ${ res.data.username }
Is bot: ${ res.data.bot }
Session:

${ session }
` );

        if ( process.cli.options.copy ) {
            copyToClipboard( session );

            console.log( "Session copied to the clipboard" );
        }
    }
}

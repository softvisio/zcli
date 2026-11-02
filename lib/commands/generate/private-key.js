import crypto from "node:crypto";
import { copyToClipboard } from "#core/utils";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "type": {
                    "short": "t",
                    "description": "Key type.",
                    "default": "ed25519",
                    "schema": { "enum": [ "rsa", "rsa-pss", "dsa", "ec", "ed25519", "ed448", "x25519", "x448", "dh" ] },
                },
                "size": {
                    "short": "s",
                    "description": "RSA key size (rsa).",
                    "default": 4096,
                    "schema": { "type": "integer", "minimum": 2048 },
                },
                "ec-name": {
                    "short": "e",
                    "description": "Elliptic curve name (ec).",
                    "default": "P-256",
                    "schema": { "enum": [ "P-256", "P-384", "P-521" ] },
                },
                "prime-length": {
                    "description": "Prime length in bits (dh).",
                    "default": 2048,
                    "schema": { "type": "integer", "minimum": 2048 },
                },
                "copy": {
                    "short": "c",
                    "description": "copy private key in PEM format to the clipboard",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        const keyPair = crypto.generateKeyPairSync( process.cli.options.type, {
            "modulusLength": process.cli.options.size,
            "namedCurve": process.cli.options[ "ec-name" ],
            "primeLength": process.cli.options[ "prime-length" ],
        } );

        const privateKey = keyPair.privateKey.export( {
            "type": "pkcs8",
            "format": "pem",
        } );

        console.log( privateKey.trim() );

        if ( process.cli.options.copy ) {
            copyToClipboard( privateKey );

            console.log( "\nPrivate key copied to the clipboard" );
        }
    }
}

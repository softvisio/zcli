import Passwords from "#core/crypto/passwords";
import Locale from "#core/locale";
import { copyToClipboard } from "#core/utils";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "bit-strength": {
                    "short": "s",
                    "description": "Password bit strength",
                    "default": Passwords.default.bitStrengthThreshold,
                    "schema": {
                        "type": "integer",
                        "minimum": 1,
                    },
                },
                "length": {
                    "short": "l",
                    "description": "Password length",
                    "schema": {
                        "type": "integer",
                        "minimum": 1,
                    },
                },
                "alphabet": {
                    "short": "a",
                    "description": "Password alphabet",
                    "default": Passwords.default.defaultAlphabet,
                    "schema": {
                        "enum": Passwords.alphabets.map( alphabet => alphabet.name ).sort(),
                    },
                },
                "copy": {
                    "short": "c",
                    "description": "Copy password to the clipboard",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        const password = Passwords.default.generateRandomPassword( {
            "alphabet": process.cli.options[ "alphabet" ],
            "bitStrength": process.cli.options[ "bit-strength" ],
            "length": process.cli.options[ "length" ],
        } );

        console.log( password.password );
        console.log();
        console.log( `
Length: ${ password.length } characters
Bit strength: ${ Math.floor( password.bitStrength ) } bits
`.trim() );

        for ( const [ name, { rate, interval } ] of Object.entries( password.crackTime ) ) {
            console.log( `${ name } (${ Locale.default.formatNumber( rate ) } / second): ${ Locale.default.formatRelativeDate( interval ) }` );
        }

        console.log( `Password is ${ password.isStrong
            ? "strong"
            : "weak" }` );

        if ( process.cli.options.copy ) {
            copyToClipboard( password.password );

            console.log();
            console.log( "Password copied to the clipboard" );
        }
    }
}

import PasswordHash from "#core/crypto/password-hash";
import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "options": {
                "preset": {
                    "short": "P",
                    "description": "Preset.",
                    "default": PasswordHash.defaultPreset,
                    "schema": { "enum": Object.keys( PasswordHash.presets ) },
                },
                "argon2-version": {
                    "short": "v",
                    "description": "(argon2) Algorithm version.",
                    "schema": { "enum": [ 16, 19 ] },
                },
                "memory-cost": {
                    "short": "m",
                    "description": "(argon2) Memory cost parameter in KiB.",
                    "schema": { "type": "integer", "minimum": 1, "maximum": 2 ** 32 - 1 },
                },
                "time-cost": {
                    "short": "t",
                    "description": "(argon2) Time cost parameter.",
                    "schema": { "type": "integer", "minimum": 1, "maximum": 2 ** 32 - 1 },
                },
                "parallelism": {
                    "short": "p",
                    "description": "(argon2, scrypt) Parallelism parameter.",
                    "schema": { "type": "integer", "minimum": 1, "maximum": 255 },
                },
                "cost": {
                    "short": "c",
                    "description": "(scrypt) Cost parameter.",
                    "schema": { "type": "integer", "minimum": 2 },
                },
                "block-size": {
                    "short": "b",
                    "description": "(scrypt) Block size parameter.",
                    "schema": { "type": "integer", "minimum": 2 },
                },
                "max-memory": {
                    "short": "M",
                    "description": "(scrypt) Max memory parameter.",
                    "schema": { "type": "integer", "minimum": 1 },
                },
                "iterations": {
                    "short": "i",
                    "description": "(pbkdf2) Iterations parameter.",
                    "schema": { "type": "integer", "minimum": 1 },
                },
                "salt-length": {
                    "short": "s",
                    "description": "Salt length.",
                    "schema": { "type": "integer", "minimum": 8, "maximum": 64 },
                },
                "hash-length": {
                    "short": "h",
                    "description": "Hash length.",
                    "schema": { "type": "integer", "minimum": 12, "maximum": 64 },
                },
            },
            "arguments": {
                "password": {
                    "description": "Password to hash.",
                    "required": true,
                    "schema": { "type": "string" },
                },
            },
        };
    }

    // public
    async run () {
        const passwordHash = new PasswordHash( {
                "preset": process.cli.options.preset,
                "version": process.cli.options[ "argon2-version" ],
                "memoryCost": process.cli.options[ "memory-cost" ],
                "timeCost": process.cli.options[ "time-cost" ],
                "parallelism": process.cli.options[ "parallelism" ],
                "cost": process.cli.options[ "cost" ],
                "blockSize": process.cli.options[ "block-size" ],
                "maxMemory": process.cli.options[ "max-memory" ],
                "iterations": process.cli.options[ "iterations" ],
                "saltLength": process.cli.options[ "salt-length" ],
                "hashLength": process.cli.options[ "hash-length" ],
            } ),
            res = await passwordHash.createPasswordHash( process.cli.arguments.password );

        if ( res.ok ) {
            console.log( res.data.phc.string );
        }

        return res;
    }
}

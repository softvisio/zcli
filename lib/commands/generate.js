import Command from "#lib/command";

export default class extends Command {

    // static
    static cli () {
        return {
            "commands": {
                "secret-key": {
                    "short": "s",
                    "title": "Generate secret key for AES or HMAC",
                    "module": () => new URL( "generate/secret-key.js", import.meta.url ),
                },
                "private-key": {
                    "short": "k",
                    "title": "Generate private key",
                    "module": () => new URL( "generate/private-key.js", import.meta.url ),
                },
                "uuid": {
                    "short": "u",
                    "title": "Generate UUID",
                    "module": () => new URL( "generate/uuid.js", import.meta.url ),
                },
                "telegram-session": {
                    "short": "t",
                    "title": "Create Telegram session",
                    "module": () => new URL( "generate/telegram-session.js", import.meta.url ),
                },
                "ssh": {
                    "title": "Encrypt / decrypt data with SSH private key",
                    "module": () => new URL( "generate/ssh.js", import.meta.url ),
                },
                "password": {
                    "short": "p",
                    "title": "Generate password",
                    "module": () => new URL( "generate/password.js", import.meta.url ),
                },
                "password-hash": {
                    "short": "h",
                    "title": "Create / verify password hash",
                    "module": () => new URL( "generate/password-hash.js", import.meta.url ),
                },
            },
        };
    }
}

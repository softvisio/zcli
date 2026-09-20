#!/usr/bin/env -S node

import "#core/result";
import ansi from "#core/ansi";
import CLI from "#core/cli";

const spec = {
    "title": "@softvisio/zcli",
    "commands": {
        "ls": {
            "title": "List packages in workspace",
            "module": () => new URL( "../lib/commands/ls.js", import.meta.url ),
        },
        "lint": {
            "short": "L",
            "title": "Lint sources",
            "module": () => new URL( "../lib/commands/lint.js", import.meta.url ),
        },
        "status": {
            "short": "s",
            "title": "Get package status",
            "module": () => new URL( "../lib/commands/status.js", import.meta.url ),
        },
        "log": {
            "short": "l",
            "title": "Get changelog for unreleased changes",
            "module": () => new URL( "../lib/commands/log.js", import.meta.url ),
        },
        "docker": {
            "short": "D",
            "title": "Docker tools",
            "module": () => new URL( "../lib/commands/docker.js", import.meta.url ),
        },
        "docs": {
            "short": "d",
            "title": "Documentation tools",
            "module": () => new URL( "../lib/commands/docs.js", import.meta.url ),
        },
        "package": {
            "short": "p",
            "title": "Package tools",
            "module": () => new URL( "../lib/commands/package.js", import.meta.url ),
        },
        "workspace": {
            "short": "w",
            "title": "Bulk operations with workspace",
            "module": () => new URL( "../lib/commands/workspace.js", import.meta.url ),
        },
        "generate": {
            "short": "g",
            "title": "Generate data",
            "module": () => new URL( "../lib/commands/generate.js", import.meta.url ),
        },
        "lsp": {
            "short": "r",
            "title": "Manage LSP service",
            "module": () => new URL( "../lib/commands/lsp.js", import.meta.url ),
        },
        "deb-repository": {
            "alias": "deb",
            "title": "Deb packages repository tools",
            "module": () => new URL( "../lib/commands/deb-repository.js", import.meta.url ),
        },
        "commit": {
            "title": "Git commit",
            "alias": "ci",
            "module": () => new URL( "../lib/commands/ci.js", import.meta.url ),
        },
        "git": {
            "title": "Git tools",
            "module": () => new URL( "../lib/commands/git.js", import.meta.url ),
        },
    },
};

const cli = await CLI.parse( spec );

var res;

try {
    res = result.try( await new cli.module().run(), { "allowUndefined": true } );
}
catch ( e ) {
    res = result.fromError( e );
}

if ( res.ok ) {
    process.exit( 0 );
}
else {
    console.error( ansi.error( "[E]" ), res.statusText );

    process.exit( 2 );
}

import Command from "#lib/command";
import { lintPatterns } from "#lib/lint";

export default class LintCommand extends Command {

    // static
    static cli () {
        return {
            "description": `Supported file types: javascript, typescript, json, vue, html, css, scss, less, xml, yaml, md, sh.

Ignored directories:
  - ".git" directory is always ignored;
  - "node_modules" directory is ignored if it is relative to the current directory;`,
            "options": {
                "action": {
                    "short": "a",
                    "description": "Action to perform.",
                    "default": "lint",
                    "schema": { "enum": [ "lint", "format", "compress", "obfuscate" ] },
                },
                "verbose": {
                    "short": "v",
                    "description": "Report not-modified files.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "report-ignored": {
                    "short": "i",
                    "description": "Report ignored files.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "lintignore": {
                    "negatedShort": "I",
                    "description": "Use `.lintignore`.",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
                "eslint-refactoring": {
                    "negatedShort": "R",
                    "description": "Use ESLint refactoring rules.",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
                "eslint-experimental": {
                    "short": "e",
                    "description": "Use ESLint experimental rules.",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "fix": {
                    "negatedShort": "F",
                    "description": "Fix errors.",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
                "log": {
                    "negatedShort": "L",
                    "description": "Add errors report.",
                    "default": true,
                    "schema": { "type": "boolean" },
                },
            },
            "arguments": {
                "pattern": {
                    "description": `File path or glob pattern. You can pass "-" to read files list from STDIN.`,
                    "schema": { "type": "array", "items": { "type": "string", "format": "glob-pattern" } },
                },
            },
        };
    }

    // public
    async run () {
        let patterns = process.cli.arguments.pattern;

        // no input patterns specified, lint all files, starting from the current dir and use package lint config
        if ( !patterns ) {
            patterns = [ "**" ];
        }

        // read patterns from stdin
        else if ( patterns.length === 1 && patterns[ 0 ] === "-" ) {
            patterns = await this.#readStdin();
        }

        return lintPatterns( patterns, {
            "action": process.cli.options.action,
            "cwd": "",
            "useLintignore": process.cli.options.lintignore,
            "verbose": process.cli.options.verbose,
            "reportIgnored": process.cli.options[ "report-ignored" ],
            "eslintRefactoring": process.cli.options[ "eslint-refactoring" ],
            "eslintExperimental": process.cli.options[ "eslint-experimental" ],
            "fix": process.cli.options[ "fix" ],
            "log": process.cli.options[ "log" ],
        } );
    }

    // private
    async #readStdin () {
        return new Promise( resolve => {
            const stdin = process.stdin;

            var files = "";

            stdin.on( "data", data => {
                files += data;
            } );

            stdin.on( "end", () => {
                const patterns = files.split( "\n" ).filter( file => file !== "" );

                resolve( patterns );
            } );

            stdin.setEncoding( "utf8" );
            stdin.resume();
        } );
    }
}

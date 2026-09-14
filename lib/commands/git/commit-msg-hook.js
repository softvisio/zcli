import fs from "node:fs";
import ansi from "#core/ansi";
import Commit from "#core/api/git/commit";
import Command from "#lib/command";
import Changelog from "#lib/git/changelog";

export default class extends Command {
    #commitsConfig;

    // static
    static cli () {
        return {
            "description": `# Conventional commits

Examples:

\`\`\`
# bug fix
git commit -m"fix: commit description"

# feature with scope
git commit -m"feat(core): commit description"

# breaking change feature with scope
git commit -m"feat(core)!: commit description"
\`\`\`
`,
            "arguments": {
                "path": {
                    "description": "Path to the commit message.",
                    "required": true,
                    "schema": { "type": "string" },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findGitPackage();
        if ( !pkg ) return;

        this.#commitsConfig = pkg.cliConfig?.commits;

        const types = this.#getTypes(),
            message = fs.readFileSync( process.cli.arguments.path, "utf8" ),
            isRevert = fs.existsSync( ".git/REVERT_HEAD" );

        if ( fs.existsSync( ".git/MERGE_HEAD" ) ) {
            var parentHashes = new Set( [ fs.readFileSync( ".git/ORIG_HEAD", "latin1" ).trim(), ...fs.readFileSync( ".git/MERGE_HEAD", "latin1" ).trim().split( "\n" ) ] );
        }

        const commit = new Commit( {
            message,
            parentHashes,
        } );

        // merge commit
        if ( commit.isMerge ) {

            // merge commit should have default message
            if ( !commit.hasDefaultMergeSubject ) {
                return this.#throwError( `Merge commit message should start with "Merge" keyword.` );
            }
        }

        // revert commit
        else if ( isRevert ) {
            if ( !commit.isRevert ) {
                return this.#throwError( "Revert commit message is not valid." );
            }
        }

        // commit has type
        else if ( commit.type ) {

            // commit subject should not be capitalized
            if ( /^[A-Z][ a-z]/v.test( commit.subjectText ) ) {
                return this.#throwError( "Commit message subject should not starts with capital letter." );
            }

            // commit subject should not ends with "."
            if ( commit.subjectText.endsWith( "." ) ) {
                return this.#throwError( `Commit message subject should not ends with ".".` );
            }

            const type = types.get( commit.type ),
                scopes = this.#getTypeScopes( type );

            // check strict type
            if ( pkg.cliConfig?.commits.strictType ) {

                // commit type is not valid
                if ( !type ) {
                    return this.#throwError( "Commit type is not valid.", { "types": true } );
                }
            }

            // commit has scope
            if ( commit.scope ) {

                // check strict scope
                if ( type?.strictScope ) {

                    // commit scope is not valid
                    if ( !scopes.has( commit.scope ) ) {
                        if ( scopes.size ) {
                            return this.#throwError( "Commit scope is not valid.", { "types": true } );
                        }
                        else {
                            return this.#throwError( "Commit scope is not allowed for this commit type." );
                        }
                    }
                }
            }

            // commit scope is required
            else if ( type?.requireScope && scopes.size ) {
                return this.#throwError( "Commit scope is required.", { "types": true } );
            }

            // restrict breaking changes to the production changes only
            if ( commit.isBreakingChange && type && !type.productionChange ) {
                return this.#throwError( "Breaking change flag can be set for production changes only." );
            }
        }

        // revert commit message
        else if ( commit.isRevert ) {
            if ( !isRevert ) {
                return this.#throwError( "Commit revert message should be used only for revert commits." );
            }
        }

        // commit type is required
        else if ( pkg.cliConfig?.commits.requireType ) {
            return this.#throwError( "Commit type is required.", { "types": true } );
        }
    }

    // private
    #getTypes () {
        const types = new Map();

        if ( this.#commitsConfig ) {
            for ( const [ name, type ] of Object.entries( this.#commitsConfig.types ) ) {
                if ( !type ) continue;

                type.name = name;

                types.set( name, type );
            }
        }

        return types;
    }

    #getTypeScopes ( type ) {
        const scopes = new Map( Object.entries( type?.productionChange
            ? this.#commitsConfig?.scopes || {}
            : type?.scopes || {} ).filter( ( [ key, value ] ) => value ) );

        return scopes;
    }

    #throwError ( message, { types } = {} ) {
        if ( types ) {
            const help = this.#createTypesHelp();

            console.error( help );
        }

        const statusText = `${ message }\nRefer to the documentation: ${ ansi.link( "https://www.conventionalcommits.org/en/" ) }.`;

        throw result( [ 500, statusText ] );
    }

    #createTypesHelp () {
        var markdown = "";

        const types = this.#getTypes();

        if ( types.size ) {
            markdown += "Commit types:\n";

            for ( const type of types.values() ) {
                markdown += `
- \`${ type.name }\`: ${ type.title || Changelog.getTypeTitle( type.name ) }. ${ type.description }
`;

                const scopes = this.#getTypeScopes( type );

                if ( scopes.size ) {
                    if ( type.requireScope ) {
                        markdown += "Commit scope is required. ";
                    }

                    markdown += "Allowed scopes for this commit type:\n";

                    for ( const [ name, description ] of scopes.entries() ) {
                        markdown += `
    - \`${ name }\`: ${ description }`;
                    }
                }
            }
        }

        var text = Changelog.convertMarkdownToText( markdown, { "ansi": true } );

        if ( text ) text += "\n";

        return text;
    }
}

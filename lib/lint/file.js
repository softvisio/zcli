import fs from "node:fs";
import path from "node:path";
import PrettierPluginXml from "@prettier/plugin-xml";
import editorconfig from "editorconfig";
import { ESLint as EsLint } from "eslint";
import prettier from "prettier";
import PrettierPluginPackageJson from "prettier-plugin-packagejson";
import * as PrettierPluginSh from "prettier-plugin-sh";
import ansi from "#core/ansi";
import { readConfig } from "#core/config";
import File from "#core/file";
import * as json5 from "#core/json5";
import mime from "#core/mime";
import Table from "#core/text/table";
import * as utils from "#core/utils";
import Uuid from "#core/uuid";
import Markdown from "#lib/markdown";

// NOTE: status codes:
const STATUSES = {
    "200": "OK",
    "201": "File ignored",
    "210": "Lint warnings",
    "400": "Lint errors",
    "500": "Fatal error",
};

var terser, postcss, cssnano, htmlMinifier;

const customMime = mime.clone().add( await readConfig( "#resources/mime.yaml", {
        "resolve": import.meta.url,
    } ) ),
    DEFAULT_ESLINT_CONFIG_JAVASCRIPT = "#lib/eslint/eslint.config.javascript",
    DEFAULT_ESLINT_CONFIG_VUE = "#lib/eslint/eslint.config.vue",
    DEFAULT_ESLINT_CONFIG_TYPESCRIPT = "#lib/eslint/eslint.config.typescript";

var PRETTIER_JS_PARSER = "babel",
    PRETTIER_TS_PARSER = "typescript";

try {
    var { "default": PrettierPluginOxc } = await import( "@prettier/plugin-oxc" );

    PRETTIER_JS_PARSER = "oxc";
    PRETTIER_TS_PARSER = "oxc-ts";
}
catch {}

const USE_PRETTIER_FOR_JS = false,
    TYPES = {
        "text/javascript": {
            "prettier": {
                "parser": USE_PRETTIER_FOR_JS
                    ? PRETTIER_JS_PARSER
                    : null,
            },
            "eslint": {
                "config": DEFAULT_ESLINT_CONFIG_JAVASCRIPT,
            },
            "terser": true,
        },
        "application/node": {
            "prettier": {
                "parser": USE_PRETTIER_FOR_JS
                    ? "babel"
                    : null,
            },
            "eslint": {
                "config": DEFAULT_ESLINT_CONFIG_JAVASCRIPT,
            },
            "terser": true,
        },
        "application/x-typescript": {
            "prettier": {
                "parser": USE_PRETTIER_FOR_JS
                    ? PRETTIER_TS_PARSER
                    : null,
            },
            "eslint": {
                "config": DEFAULT_ESLINT_CONFIG_TYPESCRIPT,
            },
            "terser": false,
        },
        "application/x-vue": {
            "prettier": {
                "parser": USE_PRETTIER_FOR_JS
                    ? "vue"
                    : null,
            },
            "eslint": {
                "config": DEFAULT_ESLINT_CONFIG_VUE,
            },
        },
        "application/json": {
            "prettier": {
                "parser": "json-stringify",
            },
            "json": true,
        },
        "application/json5": {
            "prettier": {
                "parser": "jsonc",
            },
            "json": true,
        },
        "text/yaml": {
            "prettier": {
                "parser": "yaml",
            },
        },
        "text/css": {
            "prettier": {
                "parser": "css",
            },
            "cssnano": true,
        },
        "text/x-scss": {
            "prettier": {
                "parser": "scss",
            },
        },
        "text/less": {
            "prettier": {
                "parser": "less",
            },
        },
        "text/markdown": {
            "prettier": {
                "parser": "markdown",
            },
        },
        "text/html": {
            "prettier": {
                "parser": "html",
            },
            "html": true,
        },
        "application/x-sh": {
            "prettier": {
                "parser": "sh",
            },
        },
        "text/x-dockerfile": {

            // NOTE: too buggy
            // "prettier": {
            //     "parser": "dockerfile",
            // },
        },
        "text/xml": {
            "prettier": {
                "parser": "xml",
            },
        },
        "application/wsdl+xml": {
            "prettier": {
                "parser": "xml",
            },
        },
        "image/svg+xml": {
            "prettier": {
                "parser": "xml",
            },
        },
        "text/x-lua": {},
        "text/x-vim": {},
        "text/plain": {},
        "text/x-peggy": {},
    };

// prepare types
for ( const [ type, spec ] of Object.entries( TYPES ) ) {
    spec.type = type;
}

const RESOURCES_ROOT = path.dirname( utils.resolve( "#resources/.prettierrc.yaml", import.meta.url ) );

const DEFAULT_PRETTIER_CONFIG = await prettier.resolveConfig( "fake-config", {
    "editorconfig": false,
    "config": RESOURCES_ROOT + "/.prettierrc.yaml",
} );

// NOTE: https://eslint.org/docs/latest/integrate/nodejs-api#parameters
const ESLINT_OPTIONS = {

    // files
    "cwd": undefined,

    // lint
    "allowInlineConfig": true,
    "stats": false,

    // cache
    "cache": false,
    "cacheLocation": undefined,
    "cacheStrategy": "metadata",
};

const CSSNANO_PRESETS = {
    "compress": [
        "default",
        {
            "discardComments": {
                "removeAll": true,
            },
        },
    ],

    "obfuscate": [
        "default",
        {
            "discardComments": {
                "removeAll": true,
            },
        },
    ],
};

const POSTCSS_CACHE = {};

const EOL = {
    "cr": "\r",
    "lf": "\n",
    "crlf": "\r\n",
};

export class LintFile {
    #file;
    #processUnsupportedTypes;
    #write;
    #cache;
    #eslintRefactoring;
    #eslintExperimental;
    #fix;
    #log;

    #cwd;
    #path;
    #fullPath;
    #useDefaults;
    #originalData;
    #data;
    #type;

    constructor ( file, { type, cwd, processUnsupportedTypes, write, eslintRefactoring = true, eslintExperimental, fix = true, log = true, cache } = {} ) {
        this.#file = File.new( file );
        this.#type = type;
        this.#cwd = cwd;
        this.#processUnsupportedTypes = Boolean( processUnsupportedTypes );
        this.#write = Boolean( write );
        this.#cache = cache || {};
        this.#eslintRefactoring = Boolean( eslintRefactoring );
        this.#eslintExperimental = Boolean( eslintExperimental );
        this.#fix = Boolean( fix );
        this.#log = Boolean( log );
    }

    // static
    static getStatusText ( status ) {
        return STATUSES[ status ];
    }

    // public
    async run ( action ) {
        if ( !this.#file.path ) {
            return result( [ 500, "File path is required" ] );
        }

        if ( path.isAbsolute( this.#file.path ) ) {
            this.#path = path.normalize( this.#file.path );
        }
        else {
            if ( !this.#cwd ) {
                return result( [ 500, "Cwd is required when file path is relative" ] );
            }

            this.#path = path.normalize( path.join( this.#cwd, this.#file.path ) );
        }

        this.#cwd = path.dirname( this.#path );

        if ( this.#write && !this.#path ) {
            return result( [ 500, "File path is required to write content" ] );
        }

        this.#fullPath = this.#path;

        // detect type
        {
            let type = this.#type;

            type ||= customMime.findByFilename( this.#fullPath )?.essence;

            if ( !type ) {
                type =
                    (
                        await customMime.findByShebang( {
                            "content": ( await this.#file.slice( 0, mime.maxShebangLength ).buffer() ).toString( "latin1" ),
                        } )
                    )?.essence || this.#file.type;
            }

            this.#type = TYPES[ type ];
        }

        // file type is not supported
        if ( !this.#type && !this.#processUnsupportedTypes ) {
            return result( [ 201, "File ignored" ], null, {
                "isIgnored": true,
            } );
        }

        // read file content
        this.#originalData = this.#data = await this.#file.text();

        // add default extension
        if ( this.#type ) {
            const extnames = customMime.get( this.#type.type )?.extnames;

            if ( extnames?.default && !extnames.has( path.extname( this.#path ) ) ) {
                this.#fullPath += extnames.default;
            }
        }

        let res;

        if ( action === "lint" ) res = await this.#lint();
        else if ( action === "format" ) res = await this.#format();
        else if ( action === "compress" ) res = await this.#compress();
        else if ( action === "obfuscate" ) res = await this.#obfuscate();

        res.meta.type = this.#type?.type;
        res.meta.isIgnored = false;

        res.meta.isFatalError ??= false;
        res.meta.hasErrors = false;
        res.meta.hasWarnings = false;

        if ( res.status >= 500 ) {
            res.meta.isFatalError = true;
        }
        else if ( res.status >= 300 ) {
            res.meta.hasErrors = true;
        }
        else if ( res.status >= 201 ) {
            res.meta.hasWarnings = true;
        }

        // data was modified
        if ( this.#data !== this.#originalData ) {
            res.meta.isModified = true;
            res.meta.bytesDelta = this.#data.length - this.#originalData.length;

            if ( this.#write ) {
                await fs.promises.writeFile( this.#path, this.#data );
            }
        }
        else {
            res.meta.isModified = false;
            res.meta.bytesDelta = 0;
        }

        res.data = this.#data;

        return res;
    }

    // private
    async #lint () {
        const configs = await this.#getConfigs( this.#cwd ),
            editorConfig = await this.#getEditorConfig( {
                "fallbackToDefault": configs.package
                    ? Boolean( configs.cli )
                    : true,
            } );

        // trim, important for javascript shebang
        if ( editorConfig ) {
            if ( editorConfig.trim ) {
                this.#data = this.#data.trim();
            }
        }

        var res;

        // markdown
        if ( this.#type?.type === "text/markdown" ) {
            res = await this.#runMarkdown( {
                configs,
                editorConfig,
            } );
        }

        // prettier
        else {
            res = await this.#runPrettier( {
                configs,
                editorConfig,
            } );
        }

        // eslint
        if ( this.#type?.eslint ) {
            res = await this.#runEslint( {
                configs,
                editorConfig,
            } );
        }

        // apply editor config
        if ( editorConfig ) {

            // replace tabs
            if ( editorConfig.indent_style === "space" ) {
                this.#replaceTabs( editorConfig.tab_width );
            }

            let eol = editorConfig.end_of_line;

            // detect EOL
            if ( !eol ) {
                if ( this.#data.includes( "\r\n" ) ) {
                    eol = "crlf";
                }
                else if ( this.#data.includes( "\r" ) ) {
                    eol = "cr";
                }
                else if ( this.#data.includes( "\n" ) ) {
                    eol = "lf";
                }
            }

            if ( eol ) {

                // replace EOL
                this.#replaceEndOfLine( eol );

                // trim trailing whitespaces
                if ( editorConfig.trim_trailing_whitespace ) {
                    this.#data = this.#data.replaceAll( new RegExp( ` +${ EOL[ eol ] }`, "g" ), EOL[ eol ] );
                }

                // trim
                if ( editorConfig.trim ) {
                    this.#data = this.#data.trim();
                }

                // insert final new line
                if ( editorConfig.insert_final_newline && this.#data.length && !this.#data.endsWith( EOL[ eol ] ) ) {
                    this.#data += EOL[ eol ];
                }
            }
        }

        return res;
    }

    async #format () {
        this.#useDefaults = true;

        return this.#lint();
    }

    async #compress () {
        if ( this.#type ) {
            if ( this.#type.terser ) {
                return await this.#runTerser( {
                    "compress": true,
                    "mangle": false,
                } );
            }
            else if ( this.#type.cssnano ) {
                return this.#runCssnano( "compress" );
            }
            else if ( this.#type.json ) {
                return this.#runJson( "compress" );
            }
            else if ( this.#type.html ) {
                return this.#runHtmlMinifier( {
                    "cleanCssOptions": {
                        "level": 1,
                    },
                    "terserOptions": {
                        "compress": true,
                        "mangle": false,
                    },
                } );
            }
        }

        return result( 200 );
    }

    async #obfuscate () {
        if ( this.#type ) {
            if ( this.#type.terser ) {
                return await this.#runTerser( {
                    "compress": true,
                    "mangle": true,
                } );
            }
            else if ( this.#type.cssnano ) {
                return this.#runCssnano( "obfuscate" );
            }
            else if ( this.#type.json ) {
                return this.#runJson( "obfuscate" );
            }
            else if ( this.#type.html ) {
                return this.#runHtmlMinifier( {
                    "cleanCssOptions": {
                        "level": 2,
                    },
                    "terserOptions": {
                        "compress": true,
                        "mangle": true,
                    },
                } );
            }
        }

        return result( 200 );
    }

    async #runPrettier ( { configs, editorConfig } ) {
        if ( !this.#type?.prettier?.parser ) return result( 200 );

        var prettierConfig;

        // use default prettier config
        if ( this.#useDefaults ) {
            prettierConfig = DEFAULT_PRETTIER_CONFIG;
        }

        // has custom prettier config
        else if ( configs.prettier ) {
            prettierConfig = await prettier.resolveConfig( this.#path, {
                "config": configs.prettier,
                "editorconfig": false,
            } );
        }

        // covered by "zcli.config.yaml"
        else if ( configs.cli ) {
            prettierConfig = DEFAULT_PRETTIER_CONFIG;
        }

        // not covered by "package.json" or ".git"
        else if ( !configs.package && !configs.git ) {
            prettierConfig = DEFAULT_PRETTIER_CONFIG;
        }

        if ( !prettierConfig ) return result( 200 );

        prettierConfig = { ...prettierConfig };

        prettierConfig.plugins ??= [];
        prettierConfig.plugins.push( PrettierPluginSh, PrettierPluginPackageJson, PrettierPluginXml );
        if ( PrettierPluginOxc ) prettierConfig.plugins.push( PrettierPluginOxc );
        prettierConfig.parser = this.#type.prettier.parser;
        prettierConfig.filepath = this.#fullPath;

        // merge prettier config with editor config
        if ( editorConfig ) {
            prettierConfig.useTabs ??= editorConfig.indent_style === "tab";
            prettierConfig.tabWidth ??= editorConfig.tab_width;
            prettierConfig.printWidth ??= editorConfig.max_line_length ?? Infinity;
            prettierConfig.endOfLine ??= editorConfig.end_of_line;
        }

        // run prettier
        try {

            // pre-parse package.json
            if ( path.basename( this.#path ) === "package.json" ) {
                const res = this.#runJson( "compress" );

                if ( !res.ok ) return res;
            }

            this.#data = await prettier.format( this.#data, prettierConfig );

            return result( 200 );
        }
        catch ( e ) {
            const diagnostic = {};

            // sh parser
            if ( e.Pos ) {
                diagnostic.message = e.message;
                diagnostic.lnum = e.Pos.Line - 1;
                diagnostic.col = e.Pos.Col - 1;
            }

            // other parser
            else {

                // diagnostic.message = ansi.remove( e.message );
                diagnostic.message = ansi.remove( e.message.split( "\n", 1 )[ 0 ] );
                diagnostic.lnum = e.loc.start.line - 1;
                diagnostic.col = e.loc.start.column - 1;
                diagnostic.source = e.cause.code;
                diagnostic.code = ansi.remove( e.codeFrame );
            }

            const res = result( [ 500, "Parsing error" ], null, {
                "isFatalError": true,
                "diagnostic": [
                    {
                        "severity": "ERROR",
                        ...diagnostic,
                    },
                ],
            } );

            return res;
        }
    }

    async #runMarkdown ( { configs, editorConfig } = {} ) {
        let skip = true;

        // use default config
        if ( this.#useDefaults ) {
            skip = false;
        }

        // has custom prettier config
        else if ( configs.prettier ) {
            skip = false;
        }

        // covered by "zcli.config.yaml"
        else if ( configs.cli ) {
            skip = false;
        }

        // not covered by "package.json" or ".git"
        else if ( !configs.package && !configs.git ) {
            skip = false;
        }

        if ( skip ) return result( 200 );

        let replaceCodeLanguage;

        if ( configs.cli ) {
            replaceCodeLanguage = true;
        }
        else {
            replaceCodeLanguage = false;
        }

        let res;

        // pre-process markdown
        const markdown = new Markdown( this.#data ),
            nodes = [];

        markdown.traverse(
            ( node, index, parent ) => {
                nodes.push( {
                    node,
                    "placeholder": null,
                    "replacement": null,
                } );
            },
            {
                "test": [ "code", "toml", "yaml" ],
            }
        );

        for ( const node of nodes ) {
            const nodeLanguage = node.node.type === "yaml"
                    ? "yaml"
                    : node.node.type === "toml"
                        ? "toml"
                        : node.node.lang,
                language = markdown.getCodeLanguage( nodeLanguage );

            // language is not supported
            if ( !language ) continue;

            // language type is not supported
            if ( !language.type ) {
                if ( replaceCodeLanguage ) {
                    node.node.lang = language.language;
                }
            }
            else {
                node.placeholder = Uuid.v4();

                if ( node.node.type === "code" ) {
                    if ( replaceCodeLanguage ) {
                        node.replacement = language.language;
                    }
                    else {
                        node.replacement = nodeLanguage;
                    }

                    node.node.lang = node.placeholder;
                }

                // lint code block
                res = await lintFile(
                    {
                        "path": "markdown-code-block",
                        "type": language.type,
                        "sources": markdown.nodeToString( node.node ),
                    },
                    {
                        "cwd": this.#cwd,
                        "log": false,
                        "cache": this.#cache,
                    }
                );

                if ( res.data ) {
                    if ( node.node.type === "code" ) {
                        node.node.value = res.data.trim();
                    }
                    else {
                        node.replacement = res.data.trim();

                        node.node.value = node.placeholder;
                    }
                }
            }
        }

        this.#data = markdown.toMarkdown();

        // prettier
        res = await this.#runPrettier( {
            configs,
            editorConfig,
        } );
        if ( !res.ok ) return res;

        // post-process markdown
        for ( const node of nodes ) {
            if ( !node.placeholder ) continue;

            this.#data = this.#data.replace( node.placeholder, node.replacement );
        }

        return result( 200 );
    }

    async #runEslint ( { configs, editorConfig, repeat } ) {
        if ( !this.#type?.eslint ) return result( 200 );

        const fullPath = this.#fullPath;

        var eslintConfig;

        // use default eslint config
        if ( this.#useDefaults ) {
            eslintConfig = true;
        }

        // custom eslint config
        else if ( configs.eslint ) {
            eslintConfig = configs.eslint;
        }

        // covered by "zcli.config.yaml"
        else if ( configs.cli ) {
            eslintConfig = true;
        }

        // not covered by "package.json" or ".git"
        else if ( !configs.package && !configs.git ) {
            eslintConfig = true;
        }

        if ( !eslintConfig ) return result( 200 );

        const options = {
            ...ESLINT_OPTIONS,
            "fix": this.#fix,
        };

        // use default config
        if ( eslintConfig === true ) {
            options.cwd = path.dirname( fullPath );

            options.overrideConfigFile = true;

            const { "default": Config } = await import( this.#type.eslint.config );

            options.overrideConfig = new Config( {
                editorConfig,
                "refactoring": this.#eslintRefactoring,
                "experimental": this.#eslintExperimental,
            } ).create();
        }

        // use custom config
        else {
            options.cwd = path.dirname( eslintConfig );

            options.overrideConfigFile = eslintConfig;
        }

        const eslint = new EsLint( options );

        // file ignored by eslint
        const ignored = await eslint.isPathIgnored( fullPath );
        if ( ignored ) return result( 200 );

        // NOTE: https://eslint.org/docs/latest/integrate/nodejs-api#-eslintlinttextcode-options
        const [ report ] = await eslint.lintText( this.#data, {
            "filePath": fullPath,
            "warnIgnored": true,
        } );

        const isFatalError = Boolean( report.fatalErrorCount ),
            hasErrors = Boolean( report.errorCount ),
            hasWarnings = Boolean( report.warningCount );

        // repeat on fatal error
        if ( !repeat && isFatalError ) {

            // repeat with the original data
            this.#data = this.#originalData;

            return this.#runEslint( {
                configs,
                editorConfig,
                "repeat": true,
            } );
        }
        else if ( report.output != null ) {
            this.#data = report.output;
        }

        // append log
        const table = new Table( {
            "width": 100,
            "columns": {
                "severity": { "title": "Severity", "width": 10, "margin": [ 1, 0 ] },
                "line": {
                    "title": "Line",
                    "width": 10,
                    "align": "end",
                    "margin": [ 0, 1 ],
                },
                "description": { "title": "Desctiption", "margin": [ 1, 0 ] },
            },
        } );

        let diagnostic = [];

        for ( const msg of report.messages.sort( ( a, b ) => b.severity - a.severity || a.line - b.line || a.column - b.column ) ) {
            let severity;

            if ( msg.severity === 1 ) {
                severity = "WARN";
            }
            else {
                severity = "ERROR";
            }

            table.write( {
                severity,
                "line": `${ msg.line }:${ msg.column }`,
                "description": this.#escapeLog( msg.ruleId + ", " + msg.message ),
            } );

            diagnostic.push( {
                "lnum": msg.line - 1,
                "col": msg.column - 1,
                "end_lnum": msg.endLine - 1,
                "end_col": msg.endColumn - 1,
                severity,
                "source": msg.ruleId,
                "message": msg.message,

                // "code": "",
            } );
        }

        table.end();

        if ( !diagnostic.length ) diagnostic = null;

        var log = table.content;

        // vue
        if ( this.#type.type === "application/x-vue" ) {
            this.#data = this.#data.replace( /^\s*<!-{2} -{5}BEGIN LINT LOG-{5}[\s\S]+?-{5}END LINT LOG-{5} -{2}>/mv, "" );

            this.#data = this.#data.trim();

            if ( this.#log && log ) {
                log = log.trim().replaceAll( /^/gmv, "<!-- " ).replaceAll( /$/gmv, " -->" );

                this.#data += "\n\n<!-- -----BEGIN LINT LOG----- -->\n";
                this.#data += log + "\n";
                this.#data += "<!-- -----END LINT LOG----- -->";
            }
        }

        // javascript
        else {
            this.#data = this.#data.replace( /^\s*\/{2} -{5}BEGIN LINT LOG-{5}[\s\S]+?-{5}END LINT LOG-{5}/mv, "" );

            this.#data = this.#data.trim();

            if ( this.#log && log ) {
                log = log.trim().replaceAll( /^/gmv, "// " );

                this.#data += "\n\n// -----BEGIN LINT LOG-----\n";
                this.#data += log + "\n";
                this.#data += "// -----END LINT LOG-----";
            }
        }

        // fatal error
        if ( isFatalError ) {
            return result( [ 500, "Parsing error" ], null, {
                "isFatalError": true,
                diagnostic,
            } );
        }

        // errors
        else if ( hasErrors ) {
            return result( [ 400, "Errors" ], null, {
                hasErrors,
                diagnostic,
            } );
        }

        // warnings
        else if ( hasWarnings ) {
            return result( [ 210, "Warnings" ], null, {
                hasWarnings,
                diagnostic,
            } );
        }

        // ok
        else {
            return result( 200, null, {
                diagnostic,
            } );
        }
    }

    async #runTerser ( options ) {
        terser ??= await import( "terser" );

        var res;

        try {
            res = await terser.minify( this.#data, options );
        }
        catch ( e ) {
            return result( [ 500, e.message ] );
        }

        if ( res.error ) {
            return result( [ 500, res.error.message ] );
        }
        else {
            this.#data = res.code;

            return result( 200 );
        }
    }

    async #runCssnano ( preset ) {
        if ( !POSTCSS_CACHE[ preset ] ) {
            postcss ??= ( await import( "postcss" ) ).default;
            cssnano ??= ( await import( "cssnano" ) ).default;

            POSTCSS_CACHE[ preset ] = postcss( [ cssnano( { "preset": CSSNANO_PRESETS[ preset ] } ) ] );
        }

        const res = await POSTCSS_CACHE[ preset ].process( this.#data, {
            "from": null,
        } );

        this.#data = res.toString();

        return result( 200 );
    }

    async #runHtmlMinifier ( { cleanCssOptions, terserOptions } = {} ) {
        htmlMinifier ??= await import( "html-minifier-terser" );

        // https://github.com/terser/html-minifier-terser?tab=readme-ov-file#options-quick-reference
        this.#data = await htmlMinifier.minify( this.#data, {
            "caseSensitive": true,
            "collapseBooleanAttributes": true,
            "collapseInlineTagWhitespace": true,
            "collapseWhitespace": true,
            "decodeEntities": true,
            "html5": true,
            "includeAutoGeneratedTags": false,
            "keepClosingSlash": true,
            "minifyCSS": cleanCssOptions,
            "minifyJS": terserOptions,
            "preventAttributesEscaping": true,
            "quoteCharacter": '"',
            "removeAttributeQuotes": false,
            "removeComments": true,
            "useShortDoctype": true,
        } );

        // htmlMinifier ??= ( await import( "@minify-html/node" ) ).default;

        // this.#data = htmlMinifier
        //     .minify( Buffer.from( this.#data ), {
        //         "do_not_minify_doctype": true,
        //         "ensure_spec_compliant_unquoted_attribute_values": true,
        //         "keep_html_and_head_opening_tags": true,
        //         "minify_css": true,
        //         "minify_js": true,
        //         "keep_spaces_between_attributes": true,
        //         "keep_comments": false,
        //         "keep_closing_tags": true,
        //         "preserve_chevron_percent_template_syntax": true,
        //     } )
        //     .toString();

        return result( 200 );
    }

    #runJson ( action, { indent } = {} ) {
        try {
            if ( action === "lint" ) {
                this.#data = JSON.stringify( json5.fromJson5( this.#data ), null, indent );
            }
            else {
                this.#data = JSON.stringify( json5.fromJson5( this.#data ) );
            }

            return result( 200 );
        }
        catch ( e ) {
            const res = result( [ 500, "Parsing error" ], null, {
                "isFatalError": true,
                "diagnostic": [
                    {
                        "lnum": e.lineNumber - 1,
                        "col": e.columnNumber - 1,
                        "severity": "ERROR",
                        "source": "SyntaxError",
                        "message": e.message,
                    },
                ],
            } );

            return res;
        }
    }

    #replaceTabs ( tabWidth ) {
        this.#data = this.#data.replaceAll( "\t", " ".repeat( tabWidth ) );
    }

    #replaceEndOfLine ( endOfLine ) {
        const eol = EOL[ endOfLine ];

        if ( !eol ) return;

        this.#data = this.#data.replaceAll( /\r\n|\r|\n/gv, eol );
    }

    async #getConfigs ( dirname ) {
        this.#cache.configs ||= {};

        const cache = this.#cache.configs;

        if ( !cache[ dirname ] ) {
            const parent = path.dirname( dirname );

            let configs;

            if ( parent === dirname ) {
                configs = {};
            }
            else {
                configs = await this.#getConfigs( parent );
            }

            var fullPath;

            // .git
            fullPath = await this.#fileExists( dirname, ".git" );

            if ( fullPath ) {
                configs.git = fullPath;
            }

            // package.json
            fullPath = await this.#fileExists( dirname, "package.json" );

            if ( fullPath ) {
                configs.package = fullPath;

                // zcli.config.yaml
                fullPath = await this.#fileExists( dirname, "zcli.config.yaml" );

                if ( fullPath ) {
                    configs.cli = fullPath;
                }
                else {
                    configs.cli = null;
                }
            }

            // prettier config
            fullPath = await this.#fileExists( dirname, [

                //
                ".prettierrc",
                ".prettierrc.json",
                ".prettierrc.yml",
                ".prettierrc.yaml",
                ".prettierrc.json5",
                ".prettierrc.js",
                "prettier.config.js",
                ".prettierrc.mjs",
                "prettier.config.mjs",
                ".prettierrc.cjs",
                "prettier.config.cjs",
                ".prettierrc.toml",
            ] );

            if ( fullPath ) {
                configs.prettier = fullPath;
            }

            // eslint config
            fullPath = await this.#fileExists( dirname, [

                //
                "/eslint.config.js",
                "/eslint.config.mjs",
                "/eslint.config.cjs",
            ] );

            if ( fullPath ) {
                configs.eslint = fullPath;
            }

            cache[ dirname ] = configs;
        }

        return { ...cache[ dirname ] };
    }

    async #fileExists ( cwd, basenames ) {
        if ( !Array.isArray( basenames ) ) basenames = [ basenames ];

        for ( const basename of basenames ) {
            const fullPath = path.join( cwd, basename );

            try {
                await fs.promises.access( fullPath );

                return fullPath;
            }
            catch {}
        }
    }

    async #getEditorConfig ( { fallbackToDefault } = {} ) {
        this.#cache.editorConfigs ||= new Map();

        // use default config
        // if ( this.#useDefaults ) {
        //     return editorconfig.parse( path.join( RESOURCES_ROOT, path.basename( this.#fullPath ) ), {
        //         "cache": this.#cache.editorConfigs,
        //         "unset": true,
        //     } );
        // }

        const config = await editorconfig.parse( this.#fullPath, {
            "cache": this.#cache.editorConfigs,
            "unset": true,
        } );

        if ( Object.keys( config ).length ) {
            return config;
        }

        // fallback to the default config
        else if ( this.#useDefaults || fallbackToDefault ) {
            return editorconfig.parse( path.join( RESOURCES_ROOT, path.basename( this.#fullPath ) ), {
                "cache": this.#cache.editorConfigs,
                "unset": true,
            } );
        }
    }

    #escapeLog ( string ) {
        if ( this.#type.type === "application/x-vue" ) {
            string = string.replaceAll( "-->", "--\\>" );
        }

        return string;
    }
}

export default async function lintFile ( file, { action = "lint", ...options } = {} ) {
    const lintFile = new LintFile( file, options );

    return lintFile.run( action );
}

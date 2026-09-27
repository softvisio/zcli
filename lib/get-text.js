import fs from "node:fs";
import path from "node:path";
import { parse as parseVueSfc } from "@vue/compiler-sfc";
import { parse as parseEspree } from "espree";
import estraverse from "estraverse";
import { parse as parseVueTemplate } from "vue-eslint-parser";
import ejs from "#core/ejs";
import PoFile from "#core/locale/po-file";
import * as yaml from "#core/yaml";

const vueTemplateParserOptions = {
        "sourceType": "module",
    },
    jsParserOpions = {
        "sourceType": "module",
        "ecmaVersion": "latest",
        "loc": true,
        "comment": true,
    },
    ejsParserOpions = {
        ...jsParserOpions,
        "sourceType": "commonjs",
    };

const EXTNAMES = new Set( [ ".js", ".mjs", ".cjs", ".vue", ".yaml", ".yml" ] );

export default class GetText {
    #absolutePath;
    #packageRelativePath;
    #relativePath;
    #poFile;

    constructor ( { absolutePath, packageRelativePath, relativePath } ) {
        this.#absolutePath = absolutePath;
        this.#packageRelativePath = packageRelativePath;
        this.#relativePath = relativePath;
    }

    // public
    extract () {
        this.#poFile = new PoFile();

        const extname = path.extname( this.#absolutePath );

        if ( !EXTNAMES.has( extname ) ) return result( 200 );

        if ( !fs.existsSync( this.#absolutePath ) ) return this.#error( `File ${ this.#absolutePath } not found` );

        const content = fs.readFileSync( this.#absolutePath, "utf8" );

        try {

            // .vue
            if ( extname === ".vue" ) {

                // .vue
                const sfc = parseVueSfc( content );

                // vue template
                if ( sfc.descriptor?.template?.content ) {
                    const start = sfc.descriptor.template.loc.start;

                    if ( start.line === 1 ) start.column -= 10;

                    this.#parse( `<template>${ sfc.descriptor.template.content }</template>`, parseVueTemplate, vueTemplateParserOptions, {
                        start,
                    } );
                }

                // vue script
                if ( sfc.descriptor?.script?.content ) {
                    const start = sfc.descriptor.script.loc.start;

                    if ( start.line === 1 ) start.column -= 8;

                    this.#parse( sfc.descriptor.script.content, parseEspree, jsParserOpions, {
                        start,
                    } );
                }
            }

            // .js, .mjs, .cjs
            else if ( extname === ".js" || extname === ".mjs" || extname === ".cjs" ) {
                this.#parse( content, parseEspree, jsParserOpions );
            }

            // .yaml
            else {
                this.#parseYaml( content );
            }
        }
        catch ( e ) {
            let res;

            if ( e instanceof result.Result ) {
                res = e;
            }
            else {
                res = this.#error( e );
            }

            return res;
        }

        return result( 200, this.#poFile );
    }

    // private
    #parse ( content, parser, options, { start } = {} ) {
        const ast = parser( content, options );

        estraverse.traverse( ast, {
            "enter": ( node, parent ) => {
                if ( node.type === "VAttribute" ) {
                    if ( node.directive !== true || node.key.name.name !== "bind" ) return estraverse.VisitorOption.Skip;
                }
                else if ( node.type === "CallExpression" ) {
                    this.#parseCallExpression( ast, node, {
                        start,
                    } );
                }
            },
            "keys": {
                "Program": [ "body", "templateBody" ],
                "VElement": [ "children", "startTag" ],
                "VText": [],
                "VStartTag": [ "attributes" ],
                "VAttribute": [ "value" ],
                "VExpressionContainer": [ "expression" ],
                "PropertyDefinition": [],
                "PrivateIdentifier": [],
                "ChainExpression": [],
            },
        } );
    }

    #parseYaml ( content ) {
        const locale = {
            "l10n": ( singular, plural, pluralNumber ) => {
                this.#poFile.addExtractedMessages( {
                    [ singular ]: {
                        "pluralId": plural,
                        "references": [ this.#relativePath ],
                    },
                } );
            },

            "l10nt": ( singular, plural, pluralNumber ) => {
                this.#poFile.addExtractedMessages( {
                    [ singular ]: {
                        "pluralId": plural,
                        "references": [ this.#relativePath ],
                    },
                } );
            },
        };

        const ejs = template => {
            this.#parseEjs( template );
        };

        yaml.fromYaml( content, { "all": true, locale, ejs } );
    }

    #parseEjs ( content, { start } = {} ) {
        const template = ejs( content );

        return this.#parse( template.code, parseEspree, ejsParserOpions, {
            start,
        } );
    }

    #error ( message, { node, start } = {} ) {
        if ( node ) {
            const { line, column } = this.#getNodeLocation( node, {
                start,
            } );

            message = `Error in the file: ${ this.#packageRelativePath }:${ line }:${ column }\n` + message;
        }
        else {
            message = `Error in the file: ${ this.#packageRelativePath }\n` + message;
        }

        return result( [ 500, message ] );
    }

    #parseCallExpression ( ast, node, { start } = {} ) {
        let method;

        if ( node.callee.type === "Identifier" ) {
            method = node.callee.name;
        }
        else if ( node.callee.type === "MemberExpression" ) {
            method = node.callee.property.name;
        }

        // at least 1 argument is required
        if ( !node.arguments?.[ 0 ] ) return;

        // ejs
        if ( method === "ejs" ) {
            const arg = node.arguments[ 0 ];

            let template;

            // string
            if ( arg.type === "Literal" ) {
                template = arg.value;
            }

            // template
            else if ( arg.type === "TemplateLiteral" ) {

                // template without params
                if ( arg.quasis.length === 1 ) {
                    template = arg.quasis.map( node => node.value.cooked ).join( "${n}" );
                }
            }

            if ( template ) {
                this.#parseEjs( template, {
                    "start": {
                        ...arg.loc.start,
                        "force": true,
                    },
                } );
            }

            return;
        }

        // not a supported function / method name
        if ( method !== "l10n" && method !== "l10nt" ) return;

        const extractedMessage = {
            "id": null,
            "pluralId": null,
            "flags": null,
            "references": null,
            "extractedComments": null,
        };

        // singular
        const singular = this.#parseMessage( node.arguments[ 0 ], {
            start,
        } );

        if ( !singular.value ) return;

        extractedMessage.id = singular.value;

        if ( singular.isTemplate ) extractedMessage.flags = [ "javascript-format" ];

        // plural
        if ( node.arguments[ 1 ] ) {
            const plural = this.#parseMessage( node.arguments[ 1 ], {
                start,
            } );

            if ( plural.value ) {
                if ( !singular.isTemplate || !plural.isTemplate ) {
                    throw this.#error( "Plural message must be msgid tagged template", {
                        node,
                        start,
                    } );
                }

                extractedMessage.pluralId = plural.value;
            }
        }

        // references
        const { line, column } = this.#getNodeLocation( node, { start } );
        extractedMessage.references = [ `${ this.#relativePath }:${ line }:${ column }` ];

        // extracted comments
        extractedMessage.extractedComments = this.#extractNodeComment( ast, node );

        this.#poFile.addExtractedMessages( {
            [ extractedMessage.id ]: extractedMessage,
        } );
    }

    #parseMessage ( node, { start } = {} ) {
        const res = {
            "value": null,
            "isTemplate": null,
        };

        // string
        if ( node.type === "Literal" ) {
            res.value = node.value;
        }

        // template
        else if ( node.type === "TemplateLiteral" ) {

            // template without params
            if ( node.quasis.length === 1 ) {
                res.value = node.quasis.map( node => node.value.cooked ).join( "${n}" );
            }

            // template with params
            else {
                throw this.#error( `Template literal with arguments must be tagged with the "msgid" tag`, {
                    node,
                    start,
                } );
            }
        }

        // tagged template
        else if ( node.type === "TaggedTemplateExpression" ) {
            if ( node.tag.name === "msgid" ) {
                res.value = node.quasi.quasis.map( node => node.value.cooked ).join( "${n}" );

                res.isTemplate = node.quasi.quasis.length > 1;
            }
            else {
                throw this.#error( `Tagged template literal must be tagged with the "msgid" tag`, {
                    node,
                    start,
                } );
            }
        }

        return res;
    }

    #extractNodeComment ( ast, node ) {
        const comments = [];

        const astComments = ast.templateBody
            ? ast.templateBody.comments
            : ast.comments;

        if ( astComments?.length ) {
            const start = node.start,
                end = node.end;

            for ( const comment of astComments ) {
                if ( comment.type !== "Block" ) continue;

                if ( comment.start < start || comment.start > end ) continue;

                const value = comment.value.trim();

                if ( value ) comments.push( value );
            }
        }

        if ( comments.length ) return [ comments.join( "\n" ) ];
    }

    #getNodeLocation ( node, { start } = {} ) {
        var { line, column } = node.loc.start;

        if ( start ) {
            if ( start.force ) {
                ( { line, column } = start );
            }
            else {
                if ( line === 1 ) {
                    column += start.column;
                }

                line += start.line - 1;
            }
        }

        return { line, column };
    }
}

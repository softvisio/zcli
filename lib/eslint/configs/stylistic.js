import eslintStylistic from "@stylistic/eslint-plugin";

const configs = {
    "default": [

        // @stylistic:recommended
        eslintStylistic.configs.recommended,

        // @stylistic:custom
        {
            "name": "@stylistic/custom",
            "rules": {
                "@stylistic/array-bracket-spacing": [ "error", "always" ],
                "@stylistic/arrow-parens": [ "error", "as-needed" ],
                "@stylistic/block-spacing": [ "error", "always" ],
                "@stylistic/brace-style": [
                    "error",
                    "stroustrup",
                    {
                        "allowSingleLine": false,
                    },
                ],
                "@stylistic/comma-dangle": [
                    "error",
                    {
                        "arrays": "always-multiline",
                        "objects": "always-multiline",
                        "imports": "always-multiline",
                        "exports": "always-multiline",
                        "functions": "never",
                    },
                ],
                "@stylistic/comma-spacing": [ "error", { "before": false, "after": true } ],
                "@stylistic/computed-property-spacing": [ "error", "always" ],
                "@stylistic/curly-newline": [
                    "error",
                    {
                        "multiline": true,
                        "minElements": 2,
                        "consistent": true,
                    },
                ],
                "@stylistic/function-paren-newline": [ "error", "multiline" ],
                "@stylistic/indent": [
                    "error",
                    4,
                    {
                        "VariableDeclarator": {
                            "var": 1,
                            "let": 1,
                            "const": 1,
                        },
                    },
                ],
                "@stylistic/indent-binary-ops": "off",
                "@stylistic/lines-around-comment": [
                    "error",
                    {
                        "beforeBlockComment": true,
                        "afterBlockComment": false,
                        "beforeLineComment": true,
                        "afterLineComment": false,
                    },
                ],
                "@stylistic/lines-between-class-members": [
                    "error",
                    {
                        "enforce": [

                            //
                            { "blankLine": "always", "prev": "*", "next": "method" },
                            { "blankLine": "always", "prev": "method", "next": "*" },
                        ],
                    },
                ],
                "@stylistic/max-statements-per-line": [ "error", { "max": 1 } ],
                "@stylistic/multiline-ternary": [ "error", "always" ],

                // "@stylistic/no-extra-parens": [ "error", "all" ], // XXX test
                "@stylistic/no-extra-semi": "error",
                "@stylistic/no-multiple-empty-lines": [
                    "error",
                    {
                        "max": 1,
                        "maxBOF": 0,
                        "maxEOF": 0,
                    },
                ],

                // XXX ugly formatting, blocking issue for prettier
                // "@stylistic/object-curly-newline": [
                //     "error", {
                //         "multiline": true,
                //         "consistent": true
                //     }
                // ],

                "@stylistic/operator-linebreak": [
                    "error",
                    "after",
                    {
                        "overrides": {
                            "?": "before",
                            ":": "before",
                        },
                    },
                ],
                "@stylistic/padded-blocks": "off", // NOTE conflicts with @stylistic/lines-around-comment
                "@stylistic/quote-props": [ "error", "always" ],
                "@stylistic/quotes": [ "error", "double", { "avoidEscape": true, "allowTemplateLiterals": "avoidEscape" } ],
                "@stylistic/semi": [ "error", "always" ],
                "@stylistic/semi-spacing": [ "error", { "before": false, "after": true } ],
                "@stylistic/space-before-function-paren": [ "error", "always" ],
                "@stylistic/space-in-parens": [ "error", "always", { "exceptions": [ "empty" ] } ],
                "@stylistic/space-infix-ops": [ "error", { "int32Hint": false } ],
                "@stylistic/spaced-comment": [ "error", "always", { "markers": [ "*" ] } ],
                "@stylistic/template-curly-spacing": [ "error", "always" ],
            },
        },
    ],
    "overrides": [

        // @stylistic:disable-legacy
        eslintStylistic.configs[ "disable-legacy" ],
    ],
};

export default Super =>
    class extends Super {

        // protected
        _createConfig () {
            const config = super._createConfig();

            config.push( ...configs.default );

            return config;
        }

        _createEditorConfig () {
            const rules = {},
                indent = this.editorConfig.indent_style === "tab"
                    ? "tab"
                    : this.editorConfig.indent_size;

            // override @stylistic/indent
            if ( indent ) {
                rules[ "@stylistic/indent" ] = [
                    "error",
                    indent,
                    {
                        "VariableDeclarator": {
                            "var": 1,
                            "let": 1,
                            "const": 1,
                        },
                    },
                ];

                // config.rules[ "@stylistic/indent-binary-ops" ] = [ "error", indent ];

                rules[ "@stylistic/jsx-indent-props" ] = [ "error", indent ];
            }

            // override @stylistic/no-tabs
            rules[ "@stylistic/no-tabs" ] = indent === "tab"
                ? "off"
                : "error";

            // override @stylistic/max-len
            if ( this.editorConfig.max_line_length ) {
                rules[ "@stylistic/max-len" ] = [
                    "error",
                    {
                        "code": this.editorConfig.max_line_length,
                        "tabWidth": this.editorConfig.tab_width,
                    },
                ];
            }

            // override @stylistic/eol-last
            rules[ "@stylistic/eol-last" ] = [ "error", this.editorConfig.insert_final_newline
                ? "always"
                : "never" ];

            // override @stylistic/no-trailing-spaces
            rules[ "@stylistic/no-trailing-spaces" ] = [
                "error",
                {
                    "skipBlankLines": !this.editorConfig.trim_trailing_whitespace,
                    "ignoreComments": !this.editorConfig.trim_trailing_whitespace,
                },
            ];

            const config = super._createEditorConfig();

            config.push( {
                "name": "stylistic editor config",
                rules,
            } );

            return config;
        }

        _createOverrides () {
            const config = super._createOverrides();

            config.push( ...configs.overrides );

            return config;
        }
    };

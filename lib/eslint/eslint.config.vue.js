import eslintVue from "eslint-plugin-vue";
import EslintConfigJavaScript from "./eslint.config.javascript.js";

const configs = {
    "default": [

        // vue:recommended
        ...eslintVue.configs[ "flat/recommended" ],

        // vue:custom
        {
            "name": "vue/custom",
            "rules": {
                // eslint-plugin-vue, https://eslint.vuejs.org/rules/
                "vue/attribute-hyphenation": [ "warn", "never" ], // for ExtJS webcomponents
                "vue/attributes-order": [ "error", { "alphabetical": true } ],
                "vue/component-definition-name-casing": [ "error", "PascalCase" ],
                "vue/component-name-in-template-casing": [ "error", "PascalCase", { "registeredComponentsOnly": true } ],
                "vue/custom-event-name-casing": [ "error", "camelCase" ],
                "vue/html-indent": [
                    "warn",
                    4,
                    {
                        "baseIndent": 1,
                    },
                ],
                "vue/html-closing-bracket-spacing": [
                    "warn",
                    {
                        "startTag": "never",
                        "endTag": "never",
                        "selfClosingTag": "never", // set to "always" to make compatible with the prettier <br />
                    },
                ],
                "vue/html-self-closing": [
                    "warn",
                    {
                        "html": {
                            "void": "always",
                            "normal": "always",
                            "component": "always",
                        },
                        "svg": "always",
                        "math": "always",
                    },
                ],
                "vue/max-attributes-per-line": [ "warn", { "singleline": 100, "multiline": 1 } ],
                "vue/multi-word-component-names": "off",
                "vue/no-reserved-component-names": [ "error", { "disallowVue3BuiltInComponents": true } ],
                "vue/prop-name-casing": [ "error", "camelCase" ],
                "vue/script-indent": "off",
                "vue/v-on-event-hyphenation": [ "error", "never", { "autofix": false } ],
            },
        },
    ],
};

export default class EslintConfigVue extends EslintConfigJavaScript {

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

        rules[ "vue/html-indent" ] = [
            "warn",
            indent,
            {
                "baseIndent": 1,
            },
        ];

        const config = super._createEditorConfig();

        config.push( {
            "name": "vue editor config",
            rules,
        } );

        return config;
    }
}

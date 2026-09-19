import eslintTypeScript from "typescript-eslint";
import EslintConfigJavaScript from "./eslint.config.javascript.js";

const configs = {
    "overrides": [

        // typescript:recommended
        ...eslintTypeScript.configs.recommended,

        {
            "name": "typescript language options",
            "languageOptions": {
                "parserOptions": {
                    "warnOnUnsupportedTypeScriptVersion": false,
                },
            },
        },
    ],
};

export default class EslintConfigTypeScript extends EslintConfigJavaScript {

    // protected
    _createOverrides () {
        const config = super._createOverrides();

        config.push( ...configs.overrides );

        return config;
    }
}

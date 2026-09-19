import eslintTypeScript from "typescript-eslint";
import EslintConfig from "./eslint.config.javascript.js";

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

export default class Config extends EslintConfig {

    // protected
    _createOverrides () {
        const config = super._createOverrides();

        config.push( ...configs.overrides );

        return config;
    }
}
